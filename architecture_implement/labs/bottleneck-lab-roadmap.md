# Bottleneck Lab Roadmap

Этот проект - не только URL shortener, а учебная лаборатория для системного выбора scaling patterns.

Правило:

```text
не добавляем паттерн заранее;
сначала создаем измеримый bottleneck;
потом применяем минимальное решение;
затем повторяем тот же тест и доказываем, что bottleneck снят.
```

## 1. Общий цикл

Для каждого lab:

1. Описать scenario и expected bottleneck.
2. Запустить baseline.
3. Собрать k6 result, `/metrics`, CloudWatch, logs.
4. Классифицировать bottleneck.
5. Изменить только один фактор.
6. Повторить тот же workload/rate.
7. Записать результат в `load-test-results.csv`.
8. Только после этого повышать нагрузку или переходить к следующему lab.

Основной SLO для redirect path:

```text
p95 < 300ms
errorRate < 1%
dropped_iterations < выбранного порога
```

## 2. URL Shortener Labs

### Lab 1 - PG_POOL_MAX tuning

Цель: показать ситуацию, где помогает простая настройка connection pool.

Baseline:

```text
WORKLOAD=hot-read
RATE=1500
PG_POOL_MAX=100
```

Ожидаемые симптомы:

```text
poolActiveMax == PG_POOL_MAX
poolWaitingMax высокий
poolWaitAvg растет
RDS CPU/IO низкие
errorRate = 0
```

Решение:

```text
PG_POOL_MAX=150 или 200
повторить тот же hot-read RATE=1500
```

Успех:

```text
p95 падает
dropped_iterations падают
poolWaitAvg падает
dbQueryAvg не растет сильно
RDS CPU/DatabaseConnections остаются здоровыми
```

### Lab 2 - RDS connection capacity

Цель: показать, когда больше app connections уже упираются в лимит RDS.

Как воссоздать:

```text
маленький RDS instance
слишком высокий PG_POOL_MAX
hot-read или mixed load
```

Симптомы:

```text
logs: remaining connection slots / too many clients
DatabaseConnections близко к max_connections
5xx появляются на pool.connect()
```

Решения по порядку:

```text
снизить PG_POOL_MAX
взять RDS крупнее
рассмотреть PgBouncer, если будет несколько app instances
```

Связанные case-studies:

```text
002-url-shortener
013-distributed-message-queue, как отдельная тема backpressure
016-distributed-cache, как тема connection pooling/proxy layer
```

### Lab 3 - Larger RDS instance

Цель: показать ситуацию, где bottleneck именно RDS resource capacity.

Как воссоздать:

```text
cold-read по многим shortCode
write-burst
mixed 99/1
маленький RDS instance
```

Симптомы:

```text
poolWait низкий или умеренный
dbQueryAvg/dbQueryMax растут
RDS CPU высокий или FreeableMemory низкая
ReadLatency/WriteLatency растут
```

Решение:

```text
db.t3.small -> db.t3.medium / db.m-class
повторить тот же workload/rate
```

Важно: если RDS CPU/IO низкие, larger RDS не является доказанным решением.

### Lab 4 - Redis cache-aside

Цель: показать ситуацию, где кэш - лучшее решение, потому что workload повторно читает одни и те же данные.

Baseline:

```text
WORKLOAD=hot-read или campaign-spike
dbReadsPerRequest ~= 1
один shortCode получает большую часть traffic
```

Симптомы:

```text
много повторных PostgreSQL SELECT для одного key
pool/query/RDS pressure связан с redirects
p95/p99 или cost становятся проблемой
```

Решение:

```text
Redis cache-aside:
GET shortCode from Redis
cache miss -> PostgreSQL SELECT -> Redis SET
cache hit -> redirect без PostgreSQL
```

Успех:

```text
dbReadDelta резко падает
dbReadsPerRequest << 1
p95/p99 падают на hot-read
RDS CPU/connections/query duration падают
cache hit rate высокий
```

Связанные case-studies:

```text
002-url-shortener
016-distributed-cache
003-rate-limiter, Redis as fast shared state
015-leaderboard, Redis sorted sets
```

### Lab 5 - Queue for click analytics

Цель: показать ситуацию, где очередь нужна, потому что side effect не должен быть в synchronous redirect path.

Плохой baseline:

```text
GET /:shortCode
SELECT long_url
INSERT click_event
302 redirect
```

Симптомы:

```text
redirect p95 растет из-за INSERT
write latency/WriteIOPS растут
mixed workload хуже hot-read
read path зависит от analytics write path
```

Решение:

```text
GET /:shortCode
SELECT long_url
publish click_event
302 redirect

worker:
batch insert click_event
```

Успех:

```text
redirect p95 падает
analytics lag появляется как отдельная метрика
worker throughput регулируется отдельно
```

Связанные case-studies:

```text
001-order-backend-marketplace
007-notification-service
010-video-streaming
013-distributed-message-queue
```

### Lab 6 - App EC2 vertical scaling

Цель: показать ситуацию, где bottleneck именно app CPU, а не база.

Как воссоздать:

```text
добавить CPU-heavy work в request path
например expensive validation/hash/compression/enrichment
```

Симптомы:

```text
app EC2 CPU высокий
RDS CPU/IO низкие
poolWait низкий
dbQuery нормальный
p95 растет
```

Решение:

```text
t3.small -> t3.medium / c-class
повторить тот же workload/rate
```

Успех:

```text
app CPU падает
p95/p99 падают
RDS metrics почти не меняются
```

### Lab 7 - Horizontal app scaling

Цель: показать ситуацию, где app stateless и масштабируется добавлением instances.

Симптомы:

```text
один app instance CPU высокий
RDS свободна
pool/query metrics здоровые
```

Решение:

```text
ALB -> app EC2 #1
    -> app EC2 #2
```

Что обязательно проверить после:

```text
суммарные DB connections = app_count * PG_POOL_MAX
не появился ли RDS connection bottleneck
нужно ли снижать per-instance pool
нужен ли PgBouncer
```

### Lab 8 - PgBouncer

Цель: показать, что PgBouncer нужен не для ускорения SQL, а для контроля connections.

Как воссоздать:

```text
несколько app instances
каждый держит большой pg.Pool
RDS DatabaseConnections близко к лимиту
connection errors или высокая connection churn
```

Решение:

```text
app instances -> PgBouncer -> PostgreSQL
```

Успех:

```text
DatabaseConnections на RDS ниже и стабильнее
connection errors исчезают
p95 не ухудшается
```

### Lab 9 - Read replica

Цель: показать отличие read replica от Redis.

Когда подходит:

```text
cold-read по многим shortCode
cache hit rate низкий
primary перегружен reads
writes должны оставаться на primary
допустим replication lag
```

Решение:

```text
GET redirects -> read replica
POST /shorten -> primary
```

Успех:

```text
primary CPU/read load падает
read traffic уходит на replica
write path не деградирует
```

## 3. Labs Better Demonstrated In Other Case Studies

Некоторые bottlenecks можно притянуть к URL shortener, но учебно чище показывать их на других проектах.

| Pattern / решение | Где лучше показывать | Bottleneck scenario |
| --- | --- | --- |
| Rate limiting / load shedding | `003-rate-limiter` | hot client или downstream protection |
| Fanout / materialized view | `005-news-feed` | feed read через joins слишком дорогой |
| Worker autoscaling + retry/DLQ | `007-notification-service` | provider latency/errors, queue backlog |
| CDN / object storage offload | `008-distributed-file-storage`, `010-video-streaming` | app/origin отдает большие immutable payloads |
| Async transcoding workers | `010-video-streaming` | CPU/GPU work нельзя делать в request path |
| Counter sharding | `010-video-streaming` | hot counter `views + 1` становится write bottleneck |
| Specialized index | `009-search-autocomplete`, `011-proximity-service` | SQL query shape не подходит для latency/SLO |
| Geospatial sharding | `011-proximity-service` | high-write/high-read location workload |
| Idempotency + outbox | `001-order-backend-marketplace`, `012-payment-system` | retries создают дубликаты или теряют events |
| Distributed lock | `017-distributed-lock` | конкурентная обработка одного ресурса |
| Metrics cardinality / TSDB scaling | `014-metrics-monitoring` | ingestion/query cardinality взрывает storage |
| Redis sorted set | `015-leaderboard` | live rank через SQL `ORDER BY` не держит load |

## 4. Order Of Work

Порядок для текущего URL shortener:

1. Зафиксировать текущий `hot-read` DB-only baseline: `1500 RPS PASS`, `2000 RPS FAIL`.
2. Продолжать текущий `hot-read` сценарий без Redis/cache и пробовать довести PostgreSQL-only path примерно до `5-6k RPS`.
3. На каждом шаге выбирать главный кандидат по текущим метрикам: pool tuning, larger RDS, app vertical scaling, horizontal app scaling или PgBouncer только если именно он соответствует bottleneck.
4. Если pool/backpressure остается главным симптомом - подбирать `PG_POOL_MAX` и concurrency к DB.
5. Если RDS CPU/IO/memory/query latency становятся лимитом - проводить larger RDS lab.
6. Если app CPU/event loop/network становится лимитом - проводить app EC2 vertical scaling или horizontal scaling lab.
7. Если после нескольких app instances появляется connection multiplication - проводить PgBouncer lab.
8. После hot-read DB-only фазы переходить к `cold-read`, `mixed`, `write-burst` и large-dataset labs.
9. Redis cache-aside оставить отдельным experiment после DB-only исследований, когда решение будет подтверждено метриками.
10. После URL shortener labs - переходить к отдельным case-study labs: notification queue, news feed materialization, CDN/video, autocomplete index, proximity geo.

## 5. Current State

Уже доказано:

```text
db.t3.large + single app + PG_POOL_MAX=80
hot-read 1500 RPS -> PASS
hot-read 2000 RPS -> FAIL

2000 RPS result:
p95 ~= 1.07s
errorRate = 0%
dropped_iterations = 1555
poolWaitAvg ~= 130ms
dbQueryAvg ~= 11ms
RDS CPU ~= 32%
app EC2 CPU max ~= 56%
load-test EC2 CPU max ~= 44%
```

Текущая фаза:

```text
WORKLOAD=hot-read
DB-only scale-up toward 5-6k RPS
```

Вопрос:

```text
Какие DB-only изменения реально двигают hot-read limit,
и какой следующий bottleneck появляется после каждого изменения?
```
