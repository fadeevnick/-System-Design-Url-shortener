# Bottleneck-Driven Load Testing

Цель load testing - не просто проверить "выдержит ли сервис 2000 RPS".

Цель - итеративно найти текущий bottleneck, снять его минимальным изменением и повторить тот же тест.

```text
load-test EC2 -> app EC2 -> RDS PostgreSQL
```

Redis, PgBouncer, read replicas, larger RDS и horizontal scaling добавляем только после experiment, который показывает конкретную проблему.

Дорожная карта bottleneck-сценариев и связь с другими case studies описаны в [architecture_implement/labs/bottleneck-lab-roadmap.md](../../../architecture_implement/labs/bottleneck-lab-roadmap.md).

Текущая фаза `002-url-shortener`:

```text
hot-read capacity comparison for 2 EC2 + ALB + Compose

Сначала находим предельную нагрузку текущей архитектуры без Redis/cache.
После завершения hot-read переходим к cold-read, затем mixed и write-burst.

Переход к следующей архитектуре делаем только после прохождения всех
workloads на текущей.
```

## 1. Основной цикл

Каждая итерация идет одинаково:

1. Выбрать workload.
2. Выбрать rate и duration.
3. Запустить k6 с отдельной load-test EC2.
4. Собрать k6 result, app `/metrics`, app logs, CloudWatch.
5. Классифицировать bottleneck.
6. Сделать одно минимальное изменение.
7. Повторить тот же workload/rate.
8. Только если bottleneck снят - повышать нагрузку.

Главный SLO для redirect path:

```text
p95 < 300ms
errorRate < 1%
```

`dropped_iterations` записываем отдельно. Это характеристика способности
load generator поддерживать arrival rate, а не HTTP-результат backend.
Если load-test EC2, сеть или VU limit становятся bottleneck, результат
помечаем `INVALID_LOAD_GENERATOR`. Если backend HTTP SLO проходит, результат
можно использовать для оценки архитектуры, но обязательно указываем actual
RPS и количество dropped iterations.

Если `http_req_duration` или `http_req_failed` ломаются, нагрузку считаем
непройденной и выше по rate не идём, пока не объясним bottleneck.

## 2. Workloads

Тестируем сценарии отдельно:

| Workload | Что моделирует | Главный вопрос |
| --- | --- | --- |
| `hot-read` | много redirects по одной ссылке | выдерживает ли baseline повторные reads по одному `shortCode` |
| `cold-read` | redirects по многим ссылкам | как ведет себя index/query path без hot-key locality |
| `mixed` | redirects + редкие writes | мешают ли writes read path |
| `write-burst` | много `POST /shorten` | где предел write path одного PostgreSQL primary |
| `campaign-spike` | длительный hot-read | деградирует ли система со временем на production-like spike |

`campaign-spike` сейчас запускаем как длительный `hot-read`:

```text
WORKLOAD=hot-read
DURATION=10m
```

## 2.1. Текущий hot-read result

Архитектура:

```text
2 EC2 + ALB + Compose
6 url-shortener containers на каждом EC2
```

Зафиксированные результаты:

| Target rate | Actual RPS | p95 | HTTP errors | Dropped | Verdict |
| ---: | ---: | ---: | ---: | ---: | --- |
| 6000 | ~5997 | 88.7 ms | 0% | 0 | PASS |
| 10000 | ~9987 | 250.18 ms | 0% | 3496 | PASS backend / load-generator warning |
| 11000 | ~10979 | 333.07 ms | 0% | 5635 | FAILED_SLO |

На 10000 RPS backend HTTP SLO проходит. `dropped_iterations` фиксируется как
отдельный сигнал load generator и не меняет этот verdict. На 11000 RPS
нарушен `p95 < 300 ms`, поэтому этот rate не принимается.

Наблюдаемый bottleneck на 10000–11000 RPS находится ближе к application
compute path: EC2 CPU достигал 77–88%, RDS CPU оставался около 39–47%.
Перед окончательной фиксацией capacity нужно проверить `ConsumedLCUs`,
`RequestCountPerTarget`, CPU/RAM/network load-test EC2 и распределение
трафика между двумя targets.

Следующий workload: `cold-read`.

### 3.2. Cold-read результаты

Для cold-read использовались `SEED_URL_COUNT=10000`, `TARGET_P95_MS=300` и
`MAX_ERROR_RATE=0.01`. `dropped_iterations` не является backend failure
criterion; однако из-за него фактически достигнутый rate заметно ниже
запрошенного и именно фактический rate нужно использовать для capacity claim.

Для cold-read итоговый общий rate из блока `TOTAL RESULTS` нельзя напрямую
использовать как rate workload: он включает время последовательного `setup()`
с созданием 10000 ссылок. Рабочий throughput нужно считать как
`iterations / DURATION`.

| Запрошенный rate | Фактический rate | p95 | Ошибки | Dropped | Verdict |
| ---: | ---: | ---: | ---: | ---: | --- |
| 6000 | ~5002 | 76.96 ms | 0.02% | 18541 | backend SLO PASS |
| 8000 | ~5998 | 181.53 ms | 0% | 34393 | backend SLO PASS |
| 9000 | ~6646 | 215.95 ms | 0% | 61423 | backend SLO PASS |
| 10000 | ~7491 | 166.66 ms | 0% | 69991 | backend SLO PASS |
| 11000 | ~8134 | 175.30 ms | 0% | 96197 | backend SLO PASS |
| 12000 | ~8930 | 187.65 ms | 0% | 131560 | backend SLO PASS |
| 13000 | ~9511 | 221.13 ms | 0.11% | 179232 | backend SLO PASS |

Cold-read backend SLO не нарушен даже в последнем запуске, но ни один запуск
выше 6000 не доставил на backend весь запрошенный rate. Поэтому cold-read
capacity ceiling этой архитектуры пока не найден: текущий bottleneck находится
в load generator / генерации arrival-rate, а не в HTTP SLO приложения.

При запуске на 13000 k6 также сообщил о более чем 100000 уникальных time
series. В скрипте добавлен стабильный `name` tag для `/shorten` и `/:shortCode`,
чтобы динамический short code не создавал высокую cardinality метрик.

### 3.3. Результаты после изменения типов EC2

После уменьшения application hosts до `c7i.large` и использования
load-test host `m7i.large` были выполнены дополнительные прогоны.

Hot-read:

| Запрошенный rate | Фактический rate | p95 | Ошибки | Dropped | Verdict |
| ---: | ---: | ---: | ---: | ---: | --- |
| 6500 | ~6411 | 94.02 ms | 0% | 15576 | backend SLO PASS |
| 7000 | ~6502 | 528.04 ms | 0.65% | 87688 | FAILED_SLO |

В hot-read запуске использовался дефолтный `MAX_VUS=1000`; k6 сообщил
`Insufficient VUs` в обоих тестах. Поэтому границу около 6500–7000 нужно
подтвердить с достаточным лимитом VUs.

Cold-read:

| Запрошенный rate | Фактический rate | p95 | Ошибки | Dropped | Verdict |
| ---: | ---: | ---: | ---: | ---: | --- |
| 6000 | ~5893 | 143.57 ms | 0% | 19254 | backend SLO PASS |
| 7000 | ~6703 | 1.06 s | 11.71% | 53378 | FAILED_SLO |

На cold-read 7000 были массовые timeout-запросы и нарушены оба backend SLO.
Этот результат выглядит как насыщение после уменьшения application hosts,
но запуск нужно повторить после синхронизации актуального k6-скрипта:
он снова сообщил более 100000 уникальных time series, значит динамические
short codes ещё не сгруппированы стабильным `name` tag на load-test EC2.

Увеличение VUs само по себе не увеличивает RPS. Если k6 не показывает
`Insufficient VUs`, достаточно оставить умеренный запас, например
`PRE_ALLOCATED_VUS=1000` и `MAX_VUS=2000`. Слишком большой запас VUs может
добавить очередь и ухудшить latency при насыщении application hosts.

## 4. k6 commands

Hot-read:

```bash
BASE_URL=http://<app-private-ip>:3000 \
WORKLOAD=hot-read \
RATE=1000 \
DURATION=3m \
TARGET_P95_MS=300 \
MAX_ERROR_RATE=0.01 \
MAX_DROPPED_ITERATIONS=1 \
PRE_ALLOCATED_VUS=500 \
MAX_VUS=2000 \
k6 run --summary-export results-hot-read-1000.json tools/k6/url-shortener.js
```

Cold-read:

```bash
BASE_URL=http://<app-private-ip>:3000 \
WORKLOAD=cold-read \
SEED_URL_COUNT=1000 \
SETUP_TIMEOUT=10m \
RATE=1000 \
DURATION=3m \
TARGET_P95_MS=300 \
MAX_ERROR_RATE=0.01 \
MAX_DROPPED_ITERATIONS=1 \
PRE_ALLOCATED_VUS=500 \
MAX_VUS=2000 \
k6 run --summary-export results-cold-read-1000.json tools/k6/url-shortener.js
```

Mixed 99/1:

```bash
BASE_URL=http://<app-private-ip>:3000 \
WORKLOAD=mixed \
WRITE_PERCENT=1 \
RATE=1000 \
DURATION=3m \
TARGET_P95_MS=300 \
MAX_ERROR_RATE=0.01 \
MAX_DROPPED_ITERATIONS=1 \
PRE_ALLOCATED_VUS=500 \
MAX_VUS=2000 \
k6 run --summary-export results-mixed-1000.json tools/k6/url-shortener.js
```

Write burst:

```bash
BASE_URL=http://<app-private-ip>:3000 \
WORKLOAD=write-burst \
RATE=200 \
DURATION=3m \
TARGET_P95_MS=300 \
MAX_ERROR_RATE=0.01 \
MAX_DROPPED_ITERATIONS=1 \
PRE_ALLOCATED_VUS=200 \
MAX_VUS=1000 \
k6 run --summary-export results-write-burst-200.json tools/k6/url-shortener.js
```

Campaign spike:

```bash
BASE_URL=http://<app-private-ip>:3000 \
WORKLOAD=hot-read \
RATE=2000 \
DURATION=10m \
TARGET_P95_MS=300 \
MAX_ERROR_RATE=0.01 \
MAX_DROPPED_ITERATIONS=1 \
PRE_ALLOCATED_VUS=1000 \
MAX_VUS=4000 \
k6 run --summary-export results-campaign-spike-2000.json tools/k6/url-shortener.js
```

## 5. What to collect

Перед каждым test run:

```bash
sudo systemctl restart url-shortener
START_TIME=$(date -u -d '1 minute ago' +"%Y-%m-%dT%H:%M:%SZ")
```

После test run:

```bash
END_TIME=$(date -u -d '1 minute' +"%Y-%m-%dT%H:%M:%SZ")
curl http://<app-private-ip>:3000/metrics > metrics-<workload>-<rate>.txt
sudo journalctl -u url-shortener -n 300 --no-pager > logs-<workload>-<rate>.txt
```

Описание каждой app metric из `/metrics` смотри в [metrics.md](metrics.md).

RDS CloudWatch:

```bash
for metric in CPUUtilization DatabaseConnections ReadLatency ReadIOPS ReadThroughput WriteLatency WriteIOPS FreeableMemory NetworkReceiveThroughput NetworkTransmitThroughput; do
  echo "===== $metric ====="
  aws cloudwatch get-metric-statistics \
    --region eu-central-1 \
    --namespace AWS/RDS \
    --metric-name "$metric" \
    --dimensions Name=DBInstanceIdentifier,Value=<rds-instance-id> \
    --start-time "$START_TIME" \
    --end-time "$END_TIME" \
    --period 60 \
    --statistics Average Maximum
done
```

EC2 CloudWatch for app and load-test instances:

```text
CPUUtilization
NetworkIn
NetworkOut
StatusCheckFailed
```

App EC2 CloudWatch:

```bash
for metric in CPUUtilization NetworkIn NetworkOut StatusCheckFailed; do
  echo "===== app EC2: $metric ====="
  aws cloudwatch get-metric-statistics \
    --region eu-central-1 \
    --namespace AWS/EC2 \
    --metric-name "$metric" \
    --dimensions Name=InstanceId,Value=<app-ec2-instance-id> \
    --start-time "$START_TIME" \
    --end-time "$END_TIME" \
    --period 60 \
    --statistics Average Maximum
done
```

Load-test EC2 CloudWatch:

```bash
for metric in CPUUtilization NetworkIn NetworkOut StatusCheckFailed; do
  echo "===== load-test EC2: $metric ====="
  aws cloudwatch get-metric-statistics \
    --region eu-central-1 \
    --namespace AWS/EC2 \
    --metric-name "$metric" \
    --dimensions Name=InstanceId,Value=<load-test-ec2-instance-id> \
    --start-time "$START_TIME" \
    --end-time "$END_TIME" \
    --period 60 \
    --statistics Average Maximum
done
```

## 6. Result row

Для каждого запуска сохраняем одну строку:

```csv
date,version,workload,rate,duration,base_url,pg_pool_max,rds_class,app_instance,load_instance,actual_rps,p95_ms,p99_ms,max_ms,error_rate,dropped_iterations,db_reads_per_request,pool_wait_avg_ms,pool_wait_max_ms,db_query_avg_ms,db_query_max_ms,pool_active_max,pool_waiting_max,rds_cpu_max,database_connections_max,read_latency_max,read_iops_max,freeable_memory_min,app_cpu_max,load_cpu_max,verdict,bottleneck,decision,next_test
```

Вердикты:

```text
PASS
FAILED_SLO
INVALID_LOAD_GENERATOR
POOL_BOTTLENECK
RDS_CONNECTION_LIMIT
RDS_CPU_BOTTLENECK
RDS_IO_BOTTLENECK
APP_CPU_BOTTLENECK
REPEATED_DB_READ_BOTTLENECK
UNKNOWN_NEEDS_MORE_METRICS
```

## 7. Bottleneck classification

| Симптом | Bottleneck | Следующее действие |
| --- | --- | --- |
| `dropped_iterations > 0`, `Insufficient VUs`, load-test EC2 CPU высокий | load generator | увеличить load-test EC2, поднять `MAX_VUS`, или distributed k6 |
| `poolActiveMax == PG_POOL_MAX`, `poolWaitingMax > 0`, `poolWait` растет | DB connection pool | подобрать `PG_POOL_MAX`, проверить RDS connection limit |
| logs: `remaining connection slots` или `too many clients`; `DatabaseConnections` близко к лимиту | RDS connection capacity | уменьшить pool, взять больший RDS, рассмотреть PgBouncer |
| `poolWait` низкий, `dbQuery` растет, RDS CPU высокий | RDS CPU | увеличить RDS class или снизить DB reads |
| `ReadLatency`/`ReadIOPS` высокие | RDS storage/read I/O | проверить индекс/working set, RDS class/storage, cache/read replica |
| app EC2 CPU высокий, RDS нормальный | app server CPU | оптимизировать app или добавить app instance за LB |
| network throughput высокий | network bottleneck | проверить private/public path и instance network limits |
| `dbReadsPerRequest ~= 1`, hot-read ломает SLO, RDS/query/pool связаны с redirects | repeated DB reads | Redis cache-aside как следующий experiment |
| mixed хуже hot-read | writes мешают reads | оптимизировать transaction/pool, потом рассматривать async patterns |
| write-burst ломается, read нормальный | write path bottleneck | оптимизировать create path, batch/queue/id generation strategy позже |
