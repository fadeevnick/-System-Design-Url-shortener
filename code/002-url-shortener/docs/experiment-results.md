# URL Shortener Experiment Results

Этот файл содержит только фактические результаты экспериментов. Методика
запуска k6 и сборки метрик находится в [load-testing.md](load-testing.md).

## Current configuration

```text
2 × c7i.large + ALB + Compose
6 url-shortener containers на каждом app EC2
load-test EC2: m7i.large
RDS PostgreSQL shared platform dependency
```

Backend SLO:

```text
redirect p95 < 300ms
http_req_failed < 1%
```

`dropped_iterations` фиксируется отдельно. Если он вызван VU limit или
ресурсами load generator, это не считается backend failure.

## Summary by problem

| Problem | Status | Current conclusion | Next step |
| --- | --- | --- | --- |
| DB/index bottleneck | confirmed | без индекса cold-read ломается даже на низком target rate | восстановить индекс, продолжить mixed |
| App capacity | observed | hot-read 6500 проходит, 7000 нарушает p95 | использовать текущую конфигурацию как baseline |
| Read/write competition | confirmed | при 5500 RPS 15% writes проходит, 25% нарушает p95 и даёт script exceptions | mixed 20% writes |
| Write path | not tested | — | write-burst |
| Repeated reads | baseline measured | hot-read создаёт повторные DB reads | Redis cache-aside experiment |
| Cache stampede | not tested | — | Redis expiration/miss storm |
| ID generation | not isolated | текущая схема BIGSERIAL + base62 | write-burst и alternative ID strategy |
| Distributed state | not tested | — | Redis scaling/failover или consistent hashing |

## Experiments

### EXP-001 — Hot-read app capacity

| Target | Actual RPS | p95 | Errors | Verdict |
| ---: | ---: | ---: | ---: | --- |
| 6500 | ~6411 | 94.02 ms | 0% | PASS |
| 7000 | ~6502 | 528.04 ms | 0.65% | FAILED_SLO |

Evidence: p95 превышает 300 ms на 7000 target; error rate остаётся ниже 1%.
В обоих запусках k6 использовал дефолтный `MAX_VUS=1000`, поэтому dropped
фиксируется как отдельный load-generator signal.

Decision: текущая конфигурация даёт baseline около 6500 hot-read target.

### EXP-002 — Cold-read capacity

| Target | Workload RPS | p95 | Errors | Verdict |
| ---: | ---: | ---: | ---: | --- |
| 6000 | ~5893 | 143.57 ms | 0% | PASS |
| 7000 | ~6703 | 1.06 s | 11.71% | FAILED_SLO |

Workload rate считается по завершившимся итерациям за 180 секунд; общий k6
rate включает последовательный `setup()` с созданием 10000 ссылок.

Decision: cold-read 6000 проходит, cold-read 7000 не проходит оба backend SLO.

### EXP-003 — Index versus no-index

Dataset: таблица `urls` заполнена до 1 млн строк.

| State | Target | Workload RPS | p95 | Errors | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| Index | 6000 | ~4588 | 92.49 ms | 0% | PASS; generator warning |
| No index | 1000 | ~30 | 54.15 s | 0% | FAILED_SLO |
| No index | 500 | ~29 | 54.84 s | 0% | FAILED_SLO |
| No index | 100 | ~29 | 55.66 s | 0% | FAILED_SLO |

Evidence: при отсутствии обоих индексов PostgreSQL выполняет sequential scan;
k6 достигает `MAX_VUS=2000`, а workload throughput падает примерно до 30 RPS.

Decision: индекс по `short_code` является обязательной частью baseline.
No-index experiment завершён; индексы нужно восстановить перед следующими
workloads.

### EXP-004 — Mixed read/write competition

Configuration:

```text
WORKLOAD=mixed
WRITE_PERCENT=1
TARGET RATE=6000
DURATION=5m
```

| Target | Workload RPS | p95 | Errors | Dropped | Verdict |
| ---: | ---: | ---: | ---: | ---: | --- |
| 6000 | ~5965 | 256.2 ms | 0% | 10338 | PASS |
| 6500 | ~6365 | 1.25 s | 0% | 20805 | FAILED_SLO |
| 6000 / 5% writes | ~5905 | 492.27 ms | ~0% | 16462 | FAILED_SLO |
| 5500 / 5% writes | ~5440 | 218.94 ms | 0% | 10487 | PASS |
| 5500 / 10% writes | ~5443 | 237.16 ms | ~0.0001% | 10009 | PASS; 1 POST anomaly |
| 5500 / 15% writes | ~5431 | 277.99 ms | 0% | 11528 | PASS |
| 5500 / 25% writes | ~5412 | 522.69 ms | ~0.02% | 14725 | FAILED_SLO |

Infrastructure observations:

```text
app EC2 CPU average: 40–54%
app EC2 CPU maximum/p99: ~98% on both instances
RDS CPU average: ~30%
RDS CPU maximum/p99: ~52%
```

Evidence: mixed 6000 почти доставил целевой rate и прошёл оба HTTP SLO. При
6500 фактический workload rate составил ~6365 RPS, error rate остался 0%, но
p95 вырос до 1.25 s.

Application EC2 уже имеют CPU spikes до ~98%, тогда как RDS сохраняет заметный
запас. Рост latency происходит без роста HTTP error rate.

Для mixed с 5% writes app EC2 показали 57% average и 95% maximum/p99 CPU,
RDS — 37% average и 60% maximum/p99 CPU. Error rate остался практически
нулевым, но p95 вырос до 492.27 ms.

При target 5500 и 5% writes workload rate составил ~5440 RPS, p95 — 218.94 ms,
error rate — 0%. App EC2 показали 30% average и 93% maximum/p99 CPU, RDS —
23% average и 50% maximum/p99 CPU.

При target 5500 и 10% writes workload rate составил ~5443 RPS, p95 — 237.16 ms,
error rate — около 0.0001%: один `POST /shorten` завершился ошибкой и вызвал
script exception из 979996 iterations. App EC2 показали 53% average и 91%
maximum/p99 CPU, RDS — 26% average и 57% maximum/p99 CPU.

При target 5500 и 15% writes workload rate составил ~5431 RPS, p95 — 277.99 ms,
error rate — 0%. App EC2 показали 55% average и 93% maximum/p99 CPU, RDS —
30% average и 63% maximum/p99 CPU.

При target 5500 и 25% writes workload rate составил ~5412 RPS, p95 — 522.69 ms.
Всего было 175 failed checks: 37 для `POST /shorten` и 138 для redirect.
App EC2 показали 21% average и 94% maximum/p99 CPU, RDS — 39% average и
75% maximum/p99 CPU. Для окончательной классификации нужно дополнительно
сопоставить этот запуск с WriteIOPS, db query duration и pool wait.

Decision: `READ_WRITE_COMPETITION` с выраженным application CPU pressure — при 5% writes mixed capacity находится между
target 5500 и 6000 RPS. При 10% writes target 5500 проходит SLO, но единичную
POST anomaly нужно проверить. При 15% writes target 5500 также проходит, но
p95 уже близок к порогу. При 25% writes SLO нарушен; граница находится между
15% и 25%. Следующий controlled run — 5500 RPS с 20% writes.

## Next experiments

### EXP-005 — Mixed write-percentage sweep

Сначала фиксируем общий workload rate и меняем только долю writes:

| Run | Total rate | `WRITE_PERCENT` | Purpose |
| --- | ---: | ---: | --- |
| A | 6000 | 1% | уже выполнен |
| B | 6000 | 5% | выполнен, FAILED_SLO |
| C | 6000 | 2–3% | отложено до определения rate boundary для 5% |
| D | 5500 | 10% | выполнен, PASS с одной POST anomaly |
| E | 5500 | 15% | выполнен, PASS |
| F | 5500 | 20% | следующий запуск |
| G | 5500 | 25% | выполнен, FAILED_SLO |
| H | 5500 | 50% | mixed с равными долями |

Для каждого запуска фиксируем p95, error rate, workload rate, dropped
iterations, app CPU, RDS CPU, WriteIOPS, db query duration и pool wait.

После этого можно повторить несколько ключевых percentages на rate 6500,
если это необходимо для capacity boundary.

### EXP-006 — Write path capacity

```text
WORKLOAD=write-burst
```

Проверяем PostgreSQL primary, `INSERT + UPDATE`, sequence/base62 и connection
pool.

### EXP-007 — Redis cache-aside

Добавляется только после фиксации DB-only baseline. Основные workloads:
`hot-read`, `campaign-spike` и cache stampede.
