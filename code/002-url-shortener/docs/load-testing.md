# Load Testing Runbook

Этот файл описывает методику запуска и сбора данных. Фактические результаты
находятся в [experiment-results.md](experiment-results.md).

## SLO

Для backend workload:

```text
http_req_duration{phase:workload}: p95 < 300ms
http_req_failed{phase:workload}: rate < 1%
```

`dropped_iterations` записываем отдельно. Это сигнал о способности load
generator поддержать arrival rate, но не самостоятельный backend failure.
Если VU limit, CPU или memory load generator мешают доставить нагрузку,
фиксируем это как `INVALID_LOAD_GENERATOR` или как отдельное предупреждение.

## Workloads

| Workload | Что проверяет | Проблема |
| --- | --- | --- |
| `hot-read` | повторные redirects одного key | app capacity, repeated reads, cache candidate |
| `cold-read` | redirects по большому набору keys | DB/index/query path |
| `mixed` | reads плюс writes | read/write competition |
| `write-burst` | поток `POST /shorten` | write path, ID generation, PostgreSQL capacity |
| `campaign-spike` | длительный hot-read | degradation over time |

Для cold-read `setup()` последовательно создаёт seed URLs. Seed-запросы не
смешиваем с workload verdict; рабочий rate считаем по workload iterations.

## Standard command

```bash
BASE_URL=$ALB_BASE_URL \
WORKLOAD=hot-read \
RATE=6000 \
DURATION=3m \
TARGET_P95_MS=300 \
MAX_ERROR_RATE=0.01 \
PRE_ALLOCATED_VUS=1000 \
MAX_VUS=3000 \
k6 run \
  --summary-export results-<workload>-<rate>.json \
  tools/k6/url-shortener.js
```

Cold-read:

```bash
BASE_URL=$ALB_BASE_URL \
WORKLOAD=cold-read \
SEED_URL_COUNT=10000 \
SETUP_TIMEOUT=10m \
RATE=6000 \
DURATION=3m \
TARGET_P95_MS=300 \
MAX_ERROR_RATE=0.01 \
PRE_ALLOCATED_VUS=1000 \
MAX_VUS=6000 \
k6 run \
  --summary-export results-cold-read-6000.json \
  tools/k6/url-shortener.js
```

Mixed 99/1:

```bash
BASE_URL=$ALB_BASE_URL \
WORKLOAD=mixed \
WRITE_PERCENT=1 \
RATE=6000 \
DURATION=5m \
TARGET_P95_MS=300 \
MAX_ERROR_RATE=0.01 \
PRE_ALLOCATED_VUS=1000 \
MAX_VUS=3000 \
k6 run \
  --summary-export results-mixed-6000.json \
  tools/k6/url-shortener.js
```

## Before and after each run

1. Restore the intended database state and verify indexes.
2. Confirm the application image/version and instance configuration.
3. Record app EC2, load-test EC2 and RDS instance IDs.
4. Reset or record application metrics.
5. Run k6 for the selected workload and rate.
6. Save the k6 summary, `/metrics`, logs and CloudWatch data.

App metrics:

```text
http_request_duration
db_read_total
db_write_total
db_pool_wait_duration
db_query_duration
db_pool_active_count_max_observed
db_pool_waiting_count_max_observed
```

CloudWatch:

```text
RDS: CPUUtilization, DatabaseConnections, ReadLatency, ReadIOPS,
     WriteLatency, WriteIOPS, FreeableMemory, Network*
App EC2: CPUUtilization, NetworkIn, NetworkOut, StatusCheckFailed
Load-test EC2: CPUUtilization, NetworkIn, NetworkOut, StatusCheckFailed
ALB: RequestCount, TargetResponseTime, HTTPCode_Target_5XX_Count
```

## Result classification

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

Каждый запуск и вывод по проблеме записываем в
[experiment-results.md](experiment-results.md), а не в этот runbook.
