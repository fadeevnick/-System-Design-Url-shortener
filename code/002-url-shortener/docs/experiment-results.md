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
| Read/write competition | not tested | — | mixed 1% writes |
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

## Next experiments

### EXP-004 — Mixed read/write competition

```text
WORKLOAD=mixed
WRITE_PERCENT=1
RATE=6000 → 7000
```

Проверяем, ухудшают ли транзакции `POST /shorten` redirect path.

### EXP-005 — Write path capacity

```text
WORKLOAD=write-burst
```

Проверяем PostgreSQL primary, `INSERT + UPDATE`, sequence/base62 и connection
pool.

### EXP-006 — Redis cache-aside

Добавляется только после фиксации DB-only baseline. Основные workloads:
`hot-read`, `campaign-spike` и cache stampede.
