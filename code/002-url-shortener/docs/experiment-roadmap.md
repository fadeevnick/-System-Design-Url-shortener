# Global Experiment Roadmap

Этот документ связывает три уровня обучения:

```text
case study → problem/pattern → matching architecture and experiment
```

`STUDY_PLAN.md` задаёт порядок изучения тем. Этот roadmap задаёт порядок
практических экспериментов. Каждый case study получает отдельный файл
`experiment-results.md` только с фактическими результатами.

## Experiment contract

Для каждой проблемы фиксируем:

| Поле | Что записываем |
| --- | --- |
| Problem | какую проблему изучаем |
| Symptom | как она проявляется в системе |
| Experiment | какой workload и какая конфигурация её проявляют |
| Pattern / solution | какое решение проверяем после baseline |
| Architecture | на какой платформе решение имеет смысл |
| Evidence | k6, app metrics, CloudWatch, logs |
| Decision | что подтвердилось и какой следующий шаг |

Workload не является отдельной независимой учебной осью. Он выбирается как
инструмент для проявления конкретной проблемы.

## URL shortener

Patterns из case study:

```text
id-generation
caching-strategies
consistent-hashing
```

| Problem | Как проявляется | Experiment | Pattern / solution | Architecture |
| --- | --- | --- | --- | --- |
| DB/index bottleneck | cold-read latency растёт на большом dataset | cold-read с индексом и без индекса | индекс, query tuning, larger RDS, read replica | EC2/ECS + RDS |
| App capacity | app CPU и p95 растут при read load | hot-read, cold-read, mixed | vertical/horizontal scaling | EC2 + ALB, ECS |
| Read/write competition | mixed хуже чистого read | mixed с разным write percentage | pool tuning, separation, async writes | ALB/ECS + PostgreSQL |
| Write path | INSERT/UPDATE и WAL становятся bottleneck | write-burst | batch, queue, worker, ID strategy | ECS/Fargate + worker |
| Repeated reads | один key постоянно читается из БД | hot-read, campaign-spike | Redis cache-aside, CDN | Redis + ECS/ALB |
| Cache stampede | concurrent miss перегружает БД | один hot key после expiration | single-flight, lock, TTL jitter | Redis + ECS |
| ID generation | counter или collision retry ограничивает writes | write-burst | range allocation, random ID, Snowflake | stateless API/workers |
| Distributed state | instances должны видеть общее состояние | failover, rebalance, node loss | Redis shared state, consistent hashing | ECS/Kubernetes + Redis |

Порядок для текущего case study:

```text
DB/index → app capacity → read/write competition → write path
→ cache-aside → cache stampede → ID generation → distributed state
```

## Case-study sequence

Практическая последовательность следует зависимостям из `STUDY_PLAN.md`:

1. `002-url-shortener` — read-heavy path, cache и distribution basics.
2. `003-rate-limiter` — shared state, Redis и distributed coordination.
3. `016-distributed-cache` — cache stampede, consistent hashing и rebalance.
4. `007-notification-service` — retry, idempotency, DLQ, outbox и workers.
5. `013-distributed-message-queue` — partitions, log storage и consumer lag.
6. `004-chat` / `005-news-feed` — long-lived connections, fanout и read models.
7. Marketplace / payments / distributed lock — transactions и consistency.
8. Specialized systems — autocomplete, geo, leaderboard, storage, crawler и metrics.

## Architecture selection rule

Не каждая архитектура запускается для каждого case study.

```text
VM/Compose
  → baseline и простота

EC2 + ALB
  → горизонтальное масштабирование stateless API

ECS on EC2 / Fargate
  → managed containers, workers и operational trade-offs

Kubernetes
  → несколько разных сервисов, long-lived connections,
    scheduling и platform operations

Serverless/event-driven
  → короткие независимые jobs, retries и burst concurrency
```

Архитектура попадает в эксперимент только тогда, когда она проверяет
конкретную проблему или operational trade-off case study.
