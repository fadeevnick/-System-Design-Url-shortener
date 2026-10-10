# Bottleneck-Driven Load Testing

Цель load testing - не просто проверить "выдержит ли сервис 2000 RPS".

Цель - итеративно найти текущий bottleneck, снять его минимальным изменением и повторить тот же тест.

```text
load-test EC2 -> app EC2 -> RDS PostgreSQL
```

Redis, PgBouncer, read replicas, larger RDS и horizontal scaling добавляем только после experiment, который показывает конкретную проблему.

Дорожная карта bottleneck-сценариев и связь с другими case studies описаны в [architecture_implement/labs/bottleneck-lab-roadmap.md](../../../architecture_implement/labs/bottleneck-lab-roadmap.md).

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
dropped_iterations ~= 0
```

Если SLO ломается, не идем выше по RPS. Сначала объясняем почему.

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

## 3. Базовая матрица

Перед серией зафиксируй окружение:

```text
git commit
app EC2 instance type
load-test EC2 instance type
RDS instance class
PG_POOL_MAX
DATABASE_URL target
BASE_URL private/public
```

Default для backend capacity:

```text
BASE_URL=http://<app-private-ip>:3000
RDS=db.t3.small
PG_POOL_MAX=100
load generator=отдельная EC2 в той же VPC/AZ
```

Для каждого workload идем ступенями:

```text
RATE=500
RATE=1000
RATE=1500
RATE=2000
RATE=2500, только если 2000 проходит
```

Рекомендуемая длительность:

```text
capacity steps: 3m
target confirmation: 5m
campaign-spike: 10m
```

## 4. k6 commands

Sanity:

```bash
BASE_URL=http://<app-private-ip>:3000 \
WORKLOAD=hot-read \
RATE=100 \
DURATION=1m \
TARGET_P95_MS=300 \
MAX_ERROR_RATE=0.01 \
MAX_DROPPED_ITERATIONS=1 \
PRE_ALLOCATED_VUS=50 \
MAX_VUS=200 \
k6 run --summary-export results-hot-read-100.json tools/k6/url-shortener.js
```

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

## 8. Decision rules

Изменение делаем только после доказанного bottleneck.

RDS connection limit:

```text
1. подобрать PG_POOL_MAX;
2. взять больший RDS instance;
3. рассмотреть PgBouncer, если много app instances или connection churn.
```

App EC2 CPU:

```text
1. проверить, что load generator не bottleneck;
2. взять больший app EC2;
3. добавить второй app instance + Load Balancer;
4. оптимизировать hot path.
```

Repeated DB reads на hot-read:

```text
1. доказать dbReadsPerRequest ~= 1;
2. доказать, что pool/query/RDS pressure связан с redirects;
3. добавить Redis cache-aside отдельным experiment;
4. сравнить до/после по p95, p99, dbReadDelta, RDS metrics.
```

RDS CPU/IO на cold-read:

```text
1. проверить index/query plan;
2. увеличить RDS class;
3. рассмотреть read replica;
4. cache использовать только если workload имеет повторяемость.
```

После любого изменения повторяем тот же workload/rate, где система ломалась. Если bottleneck снят, повышаем нагрузку.

## 9. Current baseline interpretation

Уже наблюдали:

```text
db.t3.small + PG_POOL_MAX=100
concurrency=200
p95 ~= 160ms
errorRate = 0
poolWaitAvg низкий
dbQueryAvg ~= 31ms
dbReadsPerRequest = 1
```

Это означает:

```text
connection errors сняты larger RDS;
увеличение pool сняло часть pool queue;
baseline все еще платит PostgreSQL read на каждый redirect;
следующие тесты должны найти, где именно read path станет bottleneck при fixed RPS.
```
