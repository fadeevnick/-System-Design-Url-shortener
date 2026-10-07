# Experiments

Цель experiments - не доказать заранее, что Redis или другой паттерн нужен.

Цель - понять, при какой нагрузке простая архитектура перестает быть достаточной, и какой именно ресурс становится проблемой.

Если `npm run experiment:load -- hot-read 1000 20` прошел нормально, это ожидаемо. Такой тест слишком маленький. Он показывает только механику:

```text
redirect -> PostgreSQL read
```

Он не обязан создавать боль.

## Как выглядит нормальный experiment

У каждого experiment должны быть:

- сценарий из реального продукта;
- целевой SLO, например `p95 redirect < 100ms`;
- рост нагрузки по шагам;
- измерение `RPS`, `p50/p95/p99`, `errorRate`, `dbReadDelta`;
- вывод: оставляем baseline, делаем vertical scaling, добавляем read replica, Redis или другой паттерн.

Важное правило:

```text
Если baseline выдержал нагрузку, паттерн не нужен.
```

Паттерн появляется только когда есть понятная причина: latency, cost, DB capacity, availability или security.

## Start API

```bash
npm run start:dev
```

Проверка:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/metrics
```

## Capacity step: найти точку давления

Это главный experiment перед Redis.

Он берет одну горячую ссылку и постепенно увеличивает concurrency:

```bash
CONCURRENCY_STEPS=10,25,50,100,200 \
STEP_SECONDS=30 \
TARGET_P95_MS=100 \
npm run experiment:load -- capacity-step
```

Что смотреть:

```text
rps
p95Ms
p99Ms
errorRatePct
dbReadDelta
dbReadsPerRequest
```

Интерпретация:

- если `p95Ms` низкий, `errorRatePct = 0`, а DB tier дешевый - Redis пока не нужен;
- если `p95Ms` растет вместе с concurrency - redirect path упирается во внешний dependency;
- если `dbReadsPerRequest ≈ 1` - каждый redirect ходит в PostgreSQL;
- если нагрузка в основном по одной и той же ссылке - Redis может убрать почти все повторные DB reads.

Этот experiment честнее, чем `1000 20`, потому что он ищет границу, а не просто проверяет happy path.

## Campaign spike: production-like read spike

Сценарий: интернет-магазин отправил SMS/push-кампанию, и пользователи массово переходят по одной ссылке.

```bash
CONCURRENCY=200 \
DURATION_SECONDS=120 \
TARGET_P95_MS=100 \
npm run experiment:load -- campaign-spike
```

Это duration-based test: он работает заданное время и показывает, сколько RPS система реально выдержала.

После теста результат покажет:

```text
dbReadDelta
estimatedMonthlyDbReads
cacheThoughtExperiment.avoidableDbReads
```

Смысл:

```text
baseline: 1 redirect = 1 PostgreSQL read
cache-aside для hot link: много redirects = примерно 1 PostgreSQL read + Redis hits
```

Если `avoidableDbReads` большое, Redis начинает иметь практический смысл.

## Small hot read: только механика

Много переходов по одной короткой ссылке:

```bash
npm run experiment:load -- hot-read 1000 20
```

Этот сценарий маленький. Он нужен только для быстрой проверки:

```text
1 shortCode
1000 redirects
1000 PostgreSQL reads
```

Если он прошел нормально, это не аргумент против Redis и не аргумент за Redis. Это просто baseline sanity check.

## Write burst

Много созданий коротких ссылок:

```bash
npm run experiment:load -- write-burst 500 10
```

Смысл сценария:

```text
500 POST /shorten
500 INSERT
500 UPDATE short_code
```

Так видно, что baseline write path завязан на один PostgreSQL primary.

## Mixed load

Один write примерно на сто reads:

```bash
npm run experiment:load -- mixed 1000 20
```

Смысл сценария:

```text
read-heavy workload
redirect path важнее write path
```

Это ближе к классическому URL shortener: ссылок создают меньше, чем по ним переходят.

## Как читать результат

После любого experiment можно дополнительно посмотреть cumulative metrics:

```bash
curl http://localhost:3000/metrics
```

Но основной результат теперь печатает сам скрипт:

```text
rps
p50Ms
p95Ms
p99Ms
errorRatePct
dbReadDelta
dbReadsPerSuccessfulRequest
estimatedMonthlyDbReads
bottleneckDiagnostics.poolWaitAvgMs
bottleneckDiagnostics.dbQueryAvgMs
bottleneckDiagnostics.poolMaxConfigured
bottleneckDiagnostics.poolActiveMaxObserved
bottleneckDiagnostics.poolWaitingMaxObserved
cacheThoughtExperiment.avoidableDbReads
```

Для диагностики bottleneck смотри дополнительные метрики приложения:

```text
db_pool_wait_duration{operation="resolve_short_code"}_avg_ms
db_pool_wait_duration{operation="resolve_short_code"}_max_ms
db_query_duration{operation="resolve_short_code"}_avg_ms
db_query_duration{operation="resolve_short_code"}_max_ms
db_pool_max_configured
db_pool_total_count
db_pool_idle_count
db_pool_active_count
db_pool_waiting_count
db_pool_total_count_max_observed
db_pool_active_count_max_observed
db_pool_waiting_count_max_observed
```

Интерпретация:

- `dbReadsPerSuccessfulRequest ≈ 1` означает, что read traffic напрямую грузит PostgreSQL;
- высокий `p95Ms` важнее среднего latency;
- `errorRatePct > 1` означает, что система уже не просто медленная, а нестабильная;
- `avoidableDbReads` показывает, сколько PostgreSQL reads мог бы убрать Redis на hot-read workload.
- если `db_pool_wait_duration` растет, запросы ждут свободное DB-соединение;
- если `db_query_duration` растет, тормозит сам DB path: PostgreSQL, RDS, network или query execution;
- если `db_pool_waiting_count_max_observed` больше 0 под нагрузкой, pool стал очередью хотя бы на пике;
- если `db_pool_active_count_max_observed` упирается в `db_pool_max_configured`, приложение реально использует весь pool.

По умолчанию `pg.Pool` использует `max=10`. Можно проверить другой размер pool:

```bash
PG_POOL_MAX=50 npm run start
```

Если после увеличения pool `db_pool_wait_duration` падает, а `p95` улучшается, bottleneck был в очереди connection pool. Если `db_query_duration` и RDS CPU/latency растут, bottleneck ближе к PostgreSQL/RDS.
<<<<<<< HEAD

## Диагностика PG_POOL_MAX

Для честного сравнения перезапускай приложение перед каждым вариантом `PG_POOL_MAX`, чтобы cumulative metrics начинались заново:

```bash
PG_POOL_MAX=10 npm run start
```

В другом терминале:

```bash
CONCURRENCY_STEPS=10,25,50,100,200 \
STEP_SECONDS=30 \
TARGET_P95_MS=100 \
BASE_URL=http://localhost:3000 \
npm run experiment:load -- capacity-step
```

Повтори тот же тест для:

```bash
PG_POOL_MAX=50 npm run start
PG_POOL_MAX=100 npm run start
```

Сравнивай по каждой строке `capacity-step summary`:

```text
concurrency
rps
p95Ms
p99Ms
poolWaitAvgMs
dbQueryAvgMs
poolActiveMax
poolWaitingMax
```

Как читать:

- `PG_POOL_MAX=10`: если `poolWaitingMax > 0`, `poolActiveMax ≈ 10`, `poolWaitAvgMs` высокий, а `dbQueryAvgMs` низкий, узкое место в маленьком pool.
- `PG_POOL_MAX=50`: если `poolWaitAvgMs` падает и `p95` улучшается, увеличение pool помогло.
- `PG_POOL_MAX=100`: если `poolWaitAvgMs` почти не падает, а `dbQueryAvgMs` и `p95/p99` растут, больше соединений уже давят на RDS/CPU/network/query path.
- Если `poolWaitingMax = 0`, но `dbQueryAvgMs` высокий, запросы не ждут pool: время уходит после получения соединения.
- Если `rps` не растет при увеличении pool, а latency растет, pool не является главным bottleneck.
=======
>>>>>>> 94c08b02aedee8f47ad8f94a47542473c8db6e52

## Когда Redis реально нужен

Redis cache-aside имеет смысл, если одновременно выполняется несколько условий:

- workload read-heavy;
- много повторных reads по одним и тем же `shortCode`;
- `p95` или стоимость PostgreSQL reads становятся проблемой;
- vertical scaling Cloud SQL дороже или хуже, чем добавить cache;
- допустимо, что cache временно содержит старое значение до TTL.

Если ссылки в основном читаются один раз, Redis почти не поможет.

Если bottleneck в writes, Redis для redirect path тоже не решит проблему.

## Важное ограничение

Маленький тест не доказывает, что паттерн нужен.

Большой тест тоже не всегда доказывает, что паттерн нужен: возможно, достаточно поднять Cloud SQL tier.

Правильная логика такая:

1. Локальный experiment показывает механизм.
2. Production-сценарий задает реальные числа.
3. Сначала рассматриваем vertical scaling.
4. Потом выбираем паттерн, если он дешевле, надежнее или лучше соответствует workload.
