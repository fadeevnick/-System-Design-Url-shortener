# Load Testing Protocol

Цель load testing - не "дать побольше нагрузки", а проверить конкретную гипотезу:

```text
Выдержит ли redirect path заданный RPS при p95 < 100ms и errorRate < 1%?
```

Для URL shortener сначала тестируем baseline architecture:

```text
load-test EC2 -> app EC2 -> RDS PostgreSQL
```

Redis не добавляем, пока experiment не покажет конкретную проблему read path.

## 1. Цель

Основная цель перед cache-aside:

```text
redirect path выдерживает 2000 RPS при p95 < 100ms и errorRate < 1%.
```

Если baseline проходит цель, усложнение не нужно.

Если baseline не проходит, фиксируем почему:

```text
pool wait
DB query duration
RDS CPU/connections/read latency/IOPS
app EC2 CPU/network
client/load-generator saturation
```

## 2. Workload

Тестируем разные сценарии отдельно:

| Workload | Что моделирует | Почему важно |
| --- | --- | --- |
| `hot-read` | много redirects по одной ссылке | SMS/push campaign, cache-friendly workload |
| `cold-read` | redirects по многим ссылкам | cache хуже помогает, DB/index path важнее |
| `mixed` | reads + редкие writes | обычный product traffic |
| `write-burst` | много `POST /shorten` | проверка write path |
| `campaign-spike` | длительный hot-read spike | production-like всплеск |

## 3. Где запускать

Учебный quick check можно запускать локально или на app EC2.

Более правильный тест:

```text
отдельная load-test EC2 в той же VPC/AZ
BASE_URL=http://<app-private-ip>:3000
```

Так load generator не конкурирует с NestJS app за CPU/network.

Security groups:

```text
app EC2 inbound TCP 3000 from load-test EC2 security group
RDS inbound TCP 5432 from app EC2 security group
```

## 4. k6: fixed RPS

Установить k6 на load-test EC2:

```bash
sudo gpg -k
curl -s https://dl.k6.io/key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/k6-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt update
sudo apt install -y k6
```

Hot-read на 2000 RPS:

```bash
BASE_URL=http://<app-private-ip>:3000 \
WORKLOAD=hot-read \
RATE=2000 \
DURATION=5m \
TARGET_P95_MS=100 \
MAX_ERROR_RATE=0.01 \
PRE_ALLOCATED_VUS=300 \
MAX_VUS=1000 \
k6 run tools/k6/url-shortener.js
```

Cold-read:

```bash
BASE_URL=http://<app-private-ip>:3000 \
WORKLOAD=cold-read \
SEED_URL_COUNT=1000 \
RATE=2000 \
DURATION=5m \
k6 run tools/k6/url-shortener.js
```

Mixed 99/1:

```bash
BASE_URL=http://<app-private-ip>:3000 \
WORKLOAD=mixed \
WRITE_PERCENT=1 \
RATE=2000 \
DURATION=5m \
k6 run tools/k6/url-shortener.js
```

Write burst:

```bash
BASE_URL=http://<app-private-ip>:3000 \
WORKLOAD=write-burst \
RATE=200 \
DURATION=3m \
k6 run tools/k6/url-shortener.js
```

## 5. Что собирать

Перед тестом:

```bash
START_TIME=$(date -u -d '1 minute ago' +"%Y-%m-%dT%H:%M:%SZ")
```

После теста:

```bash
END_TIME=$(date -u -d '1 minute' +"%Y-%m-%dT%H:%M:%SZ")
```

App metrics:

```bash
curl http://<app-private-ip>:3000/metrics
```

RDS CloudWatch:

```bash
for metric in CPUUtilization DatabaseConnections ReadLatency ReadIOPS ReadThroughput FreeableMemory NetworkReceiveThroughput NetworkTransmitThroughput; do
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

App logs:

```bash
sudo journalctl -u url-shortener -n 200 --no-pager
```

## 6. Как читать

Сначала k6:

```text
http_req_duration p(95)
http_req_duration p(99)
http_req_failed
checks
http_reqs
```

Потом app `/metrics`:

```text
db_pool_wait_duration
db_query_duration
db_pool_active_count_max_observed
db_pool_waiting_count_max_observed
db_read_total
```

Потом CloudWatch:

```text
RDS CPUUtilization
DatabaseConnections
ReadLatency
ReadIOPS
FreeableMemory
Network throughput
```

Интерпретация:

| Симптом | Вероятный вывод |
| --- | --- |
| `p95` растет, `db_pool_wait_duration` растет | мало DB connections в app pool |
| `p95` растет, pool wait низкий, `db_query_duration` растет | bottleneck после получения connection: RDS/query/network |
| `DatabaseConnections` близко к лимиту, есть connection errors | pool слишком большой для RDS instance |
| RDS CPU высокий | DB CPU bottleneck |
| ReadLatency/ReadIOPS высокие | storage/read I/O bottleneck |
| app EC2 CPU высокий | app server bottleneck |
| k6 CPU высокий | load generator стал bottleneck, нужен больше instance или distributed load |

## 7. Решение

Решение принимаем только после сравнения:

```text
client-side k6 result
app /metrics
RDS CloudWatch
app logs
```

Для hot-read workload Redis cache-aside становится обоснованным, если baseline не проходит SLO и видно:

```text
dbReadsPerSuccessfulRequest ~= 1
повторные reads по одному shortCode
p95/p99 ломаются на read path
RDS/query path или pool saturation связаны с redirect traffic
```
