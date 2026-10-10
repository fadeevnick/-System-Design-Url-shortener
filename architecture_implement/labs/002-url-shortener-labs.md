# 002 URL Shortener Labs

Связанный case study: [[002-url-shortener]]

Связанный код: `code/002-url-shortener`

Цель: пройти эволюцию URL shortener от простой схемы `API -> PostgreSQL` до более сложных решений только через измеримые bottlenecks.

## Baseline

Текущая архитектура:

```text
Client -> NestJS API -> PostgreSQL
```

Read path:

```text
GET /:shortCode
SELECT long_url FROM urls WHERE short_code = ?
302 redirect
```

Write path:

```text
POST /shorten
INSERT long_url -> BIGSERIAL id
base62(id)
UPDATE short_code
```

Baseline constraints:

```text
без Redis
без queue
без PgBouncer
без read replica
один app instance
один RDS PostgreSQL primary
```

Main SLO:

```text
redirect p95 < 300ms
errorRate < 1%
dropped_iterations ниже выбранного порога
```

## Measurement Stack

Load generator:

```text
отдельная EC2 в той же VPC/AZ
k6 constant-arrival-rate
BASE_URL=http://<app-private-ip>:3000
```

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
RDS: CPUUtilization, DatabaseConnections, ReadLatency, ReadIOPS, WriteLatency, WriteIOPS, FreeableMemory, Network*
App EC2: CPUUtilization, NetworkIn, NetworkOut, StatusCheckFailed
Load-test EC2: CPUUtilization, NetworkIn, NetworkOut, StatusCheckFailed
```

Result table:

```text
code/002-url-shortener/docs/load-test-results.csv
```

## Lab 1 - Connection Pool Tuning

Question:

```text
Может ли простое увеличение PG_POOL_MAX снять pool queue на hot-read?
```

Baseline run:

```text
WORKLOAD=hot-read
RATE=1500
DURATION=3m
PG_POOL_MAX=100
```

Observed state:

```text
p95 > 300ms
errorRate = 0
poolActiveMax = 100
poolWaitingMax высокий
poolWaitAvg высокий
RDS CPU/IO низкие
load-test EC2 CPU низкий
```

Bottleneck classification:

```text
POOL_BOTTLENECK
```

Next controlled change:

```text
PG_POOL_MAX=150
повторить тот же WORKLOAD=hot-read RATE=1500 DURATION=3m
```

Success criteria:

```text
p95 < 300ms
dropped_iterations ниже порога
poolWaitAvg падает
poolWaitingMax падает
dbQueryAvg не растет сильно
RDS CPU/DatabaseConnections остаются здоровыми
```

If success:

```text
засчитать PG_POOL_MAX tuning как достаточное решение для текущего bottleneck;
повысить RATE до 2000 и искать следующий bottleneck.
```

If failure:

```text
если poolWait падает, но dbQueryAvg растет -> DB/query path bottleneck;
если connection errors -> RDS connection capacity bottleneck;
если app CPU растет -> app EC2 bottleneck.
```

## Lab 2 - RDS Connection Capacity

Question:

```text
Когда увеличение pool перестает помогать и упирается в лимит connections?
```

How to create:

```text
маленький RDS instance
PG_POOL_MAX слишком высокий для этого instance
hot-read или mixed workload
```

Expected symptoms:

```text
logs: remaining connection slots are reserved
или logs: too many clients
5xx на pool.connect()
DatabaseConnections близко к max_connections
```

Decision order:

```text
1. уменьшить PG_POOL_MAX до здорового значения;
2. взять RDS крупнее, если connection capacity реально мала;
3. рассмотреть PgBouncer, если появятся несколько app instances или connection churn.
```

What this lab teaches:

```text
больше connections не всегда лучше;
pool size должен соответствовать RDS capacity;
connection errors - это другой bottleneck, не Redis problem.
```

## Lab 3 - Larger RDS Instance

Question:

```text
Когда надо брать более мощный RDS, а не менять app/pool/cache?
```

Best workloads:

```text
cold-read
mixed
write-burst
```

Expected symptoms:

```text
poolWait низкий или умеренный
dbQueryAvg/dbQueryMax растут
RDS CPU высокий
или ReadLatency/WriteLatency растут
или FreeableMemory низкая
```

Controlled change:

```text
db.t3.small -> db.t3.medium или db.m-class
повторить тот же workload/rate
```

Success criteria:

```text
dbQueryAvg падает
p95/p99 падают
RDS CPU/memory/latency улучшаются
app metrics не показывают другой bottleneck
```

Anti-pattern:

```text
не брать RDS крупнее, если RDS CPU/IO/memory свободны,
а latency объясняется pool queue или app CPU.
```

## Lab 4 - Redis Cache-Aside

Question:

```text
Когда Redis является лучшим решением, а не просто модным паттерном?
```

Best workloads:

```text
hot-read
campaign-spike
```

Baseline symptoms:

```text
dbReadsPerRequest ~= 1
один shortCode получает большую часть traffic
много повторных PostgreSQL SELECT одного long_url
pool/query/RDS pressure связан с redirects
p95/p99 или cost становятся проблемой
```

Controlled change:

```text
cache-aside:
GET Redis shortCode
cache miss -> PostgreSQL SELECT -> Redis SET
cache hit -> redirect
```

New metrics to add:

```text
cache_hit_total
cache_miss_total
cache_hit_rate
cache_get_duration
cache_set_duration
```

Success criteria:

```text
dbReadDelta резко падает
dbReadsPerRequest << 1
cache hit rate высокий
p95/p99 падают на hot-read
RDS DatabaseConnections/query duration/CPU падают
```

Failure modes to test later:

```text
Redis unavailable -> fallback to PostgreSQL
cold cache -> temporary DB storm
TTL expiry under load -> cache stampede
hot key -> Redis single-key pressure
```

Related patterns:

```text
[[caching-strategies]]
[[cache-stampede]]
[[consistent-hashing]]
```

## Lab 5 - Queue For Click Analytics

Question:

```text
Когда очередь нужна, потому что side effect не должен быть в redirect path?
```

Bad baseline:

```text
GET /:shortCode
SELECT long_url
INSERT click_event
302 redirect
```

Expected symptoms:

```text
redirect p95 растет
write latency/WriteIOPS растут
mixed workload хуже hot-read
read path зависит от analytics write path
```

Controlled change:

```text
GET /:shortCode
SELECT long_url
publish click_event
302 redirect

worker:
batch insert click_event
```

New metrics to add:

```text
click_event_publish_total
click_event_publish_duration
click_event_queue_lag
click_event_worker_processed_total
click_event_worker_failed_total
```

Success criteria:

```text
redirect p95 падает
analytics writes больше не блокируют redirect
queue lag измеряется отдельно
worker throughput регулируется отдельно
```

Related patterns:

```text
[[event-driven-architecture]]
[[retry-with-backoff]]
[[dead-letter-queue]]
[[outbox]]
```

## Lab 6 - App EC2 Vertical Scaling

Question:

```text
Когда надо брать более мощный app EC2?
```

How to create:

```text
добавить CPU-heavy работу в request path
например expensive validation, hashing, compression или enrichment
```

Expected symptoms:

```text
app EC2 CPU высокий
RDS CPU/IO низкие
poolWait низкий
dbQuery нормальный
p95 растет
```

Controlled change:

```text
t3.small -> t3.medium или c-class
повторить тот же workload/rate
```

Success criteria:

```text
app CPU падает
p95/p99 падают
RDS metrics почти не меняются
```

Anti-pattern:

```text
не масштабировать app vertically, если bottleneck в RDS или DB pool.
```

## Lab 7 - Horizontal App Scaling

Question:

```text
Когда app stateless и лучше масштабируется количеством instances?
```

Expected symptoms:

```text
один app instance CPU высокий
RDS свободна
pool/query metrics здоровые
```

Controlled change:

```text
ALB -> app EC2 #1
    -> app EC2 #2
```

Success criteria:

```text
traffic распределяется между instances
per-instance CPU падает
p95/p99 падают
RDS остается здоровой
```

Important follow-up:

```text
total DB connections = app_count * PG_POOL_MAX
```

Если после horizontal scaling появляется RDS connection pressure, следующий lab - PgBouncer или smaller per-instance pool.

## Lab 8 - PgBouncer

Question:

```text
Когда нужен connection pooler между app fleet и PostgreSQL?
```

Expected symptoms:

```text
несколько app instances
каждый держит большой pg.Pool
RDS DatabaseConnections близко к лимиту
connection errors или connection churn
```

Controlled change:

```text
app instances -> PgBouncer -> PostgreSQL
```

Success criteria:

```text
DatabaseConnections на RDS ниже и стабильнее
connection errors исчезают
p95 не ухудшается
```

Important distinction:

```text
PgBouncer контролирует connections,
но не делает медленный SQL быстрым.
```

## Lab 9 - Read Replica

Question:

```text
Когда read replica лучше Redis cache?
```

Best workload:

```text
cold-read по многим shortCode
низкая повторяемость ключей
primary перегружен reads
writes должны оставаться на primary
допустим replication lag
```

Controlled change:

```text
GET redirects -> read replica
POST /shorten -> primary
```

Success criteria:

```text
primary read load падает
read traffic уходит на replica
write path не деградирует
replication lag приемлемый
```

Anti-pattern:

```text
для hot-read по одному key Redis обычно эффективнее read replica.
```

## Recommended Order

1. Завершить `PG_POOL_MAX` lab на `hot-read RATE=1500`.
2. Повторить `RATE=1500` с `PG_POOL_MAX=150`.
3. Если помогает - повысить hot-read до `RATE=2000`.
4. Если появляется RDS resource bottleneck - провести larger RDS lab.
5. Если repeated DB reads остаются главным источником pressure - добавить Redis cache-aside.
6. После read path добавить click analytics и показать queue lab.
7. После single app показать horizontal app scaling и PgBouncer lab.
8. После этого перейти к другим case-study labs.

## Current State

Already observed:

```text
db.t3.small + PG_POOL_MAX=100
hot-read 500 RPS -> PASS
hot-read 1000 RPS -> PASS with note
hot-read 1500 RPS -> POOL_BOTTLENECK
```

Next experiment:

```text
WORKLOAD=hot-read
RATE=1500
DURATION=3m
TARGET_P95_MS=300
PG_POOL_MAX=150
```

Question:

```text
Поможет ли увеличение pool снять очередь без роста dbQueryAvg/RDS pressure?
```
