# STUDY PLAN

План изучения базы знаний по system design от общего к частному.

## Цель

Разобраться во всех ключевых архитектурах и паттернах так, чтобы:
- понимать, какую исходную проблему решает каждый паттерн;
- уметь объяснить простое решение и почему оно ломается;
- видеть, как паттерны собираются в целые системы;
- уметь спроектировать основные case studies без подсказки.

## Главный принцип

Не начинать со специализированных паттернов и не брать case study, если его зависимости ещё не пройдены.

Правильная учебная цепочка:

```
базовая сущность -> базовая проблема -> простое решение -> проблема простого решения -> паттерн -> case study
```

Например:

```
key -> shard -> hash(key) % N -> rebalance при изменении N -> [[consistent-hashing]]
```

## Stage 0: Foundations

Сначала пройти вводные документы. Они объясняют общий язык и проблемы, которые позже решают паттерны.

1. [[001-system-design-basics]]
2. [[002-read-write-path]]
3. [[004-cache-basics]]
4. [[003-scaling-data]]
5. [[005-distributed-systems-failures]]

После этого должны быть понятны:
- что такое client, API, service, database, cache, queue, worker;
- чем read path отличается от write path;
- зачем появляется cache;
- зачем появляются sharding и replication;
- почему distributed systems дают timeouts, duplicates и partial failures.

## Stage 1: Basic Data Access

Паттерны для чтения, кэширования, постраничной выдачи и генерации ID. В текущей базе нет простого case study, который закрепляет только этот stage без distribution, поэтому stage можно пройти теоретически.

1. [[caching-strategies]]
2. [[cache-stampede]]
3. [[pagination]]
4. [[id-generation]]

Ключевые вопросы:
- что такое cache hit и cache miss;
- почему stale data неизбежна при кэшировании;
- чем cache-aside отличается от write-through;
- почему offset pagination плохо работает на больших данных;
- чем sequential ID, random ID, UUID/ULID и Snowflake отличаются по trade-offs.

## Stage 2: Distribution Basics

Теперь можно изучать распределение данных и нагрузки по нескольким нодам.

1. [[consistent-hashing]]
2. [[rate-limiting-algorithms]]
3. [[materialized-view]]

Кейсы для закрепления:

1. [[002-url-shortener]]
2. [[003-rate-limiter]]
3. [[016-distributed-cache]]

Почему эти кейсы здесь:
- [[002-url-shortener]] требует [[id-generation]], [[caching-strategies]], [[consistent-hashing]].
- [[003-rate-limiter]] требует [[rate-limiting-algorithms]], [[caching-strategies]], [[consistent-hashing]].
- [[016-distributed-cache]] требует [[cache-stampede]], [[caching-strategies]], [[consistent-hashing]].

## Stage 3: Reliability and Async Delivery

Паттерны для отказов, повторов, дублей, гарантированной доставки и асинхронных систем.

1. [[idempotency-key]]
2. [[retry-with-backoff]]
3. [[dead-letter-queue]]
4. [[outbox]]
5. [[event-driven-architecture]]
6. [[log-structured-storage]]

Кейсы для закрепления:

1. [[007-notification-service]]
2. [[013-distributed-message-queue]]

Почему эти кейсы здесь:
- [[007-notification-service]] требует retry, DLQ, idempotency, rate limiting и event-driven thinking.
- [[013-distributed-message-queue]] требует log-structured storage, event-driven architecture, DLQ, consistent hashing и retry.

## Stage 4: Communication, Realtime and Feeds

Паттерны для realtime-соединений, fanout и read models.

1. [[long-lived-connections]]
2. [[fanout-strategies]]

Кейсы для закрепления:

1. [[004-chat]]
2. [[005-news-feed]]

Почему эти кейсы здесь:
- [[004-chat]] требует long-lived connections, fanout, consistent hashing и event-driven architecture.
- [[005-news-feed]] требует fanout, materialized view, pagination, caching и consistent hashing.

## Stage 5: Consistency and Business Transactions

Сложные темы: распределённые транзакции, бизнес-инварианты, координация и защита от stale actors.

1. [[saga]]
2. [[orchestration-vs-choreography]]
3. [[double-entry-ledger]]
4. [[fencing-token]]

Кейсы для закрепления:

1. [[001-order-backend-marketplace]]
2. [[012-payment-system]]
3. [[017-distributed-lock]]

Почему эти кейсы здесь:
- [[001-order-backend-marketplace]] требует outbox, idempotency, saga, event-driven architecture и orchestration/choreography.
- [[012-payment-system]] требует double-entry ledger, idempotency, outbox, saga, retry и DLQ.
- [[017-distributed-lock]] требует fencing token, idempotency и retry.

## Stage 6: Specialized Domains

Специализированные паттерны под конкретные домены.

1. [[trie-prefix-index]]
2. [[geospatial-index]]
3. [[sorted-set-index]]
4. [[content-deduplication]]
5. [[content-addressable-storage]]
6. [[adaptive-bitrate-streaming]]
7. [[url-frontier]]
8. [[time-series-storage]]

Кейсы для закрепления:

1. [[009-search-autocomplete]]
2. [[011-proximity-service]]
3. [[015-leaderboard]]
4. [[008-distributed-file-storage]]
5. [[010-video-streaming]]
6. [[006-web-crawler]]
7. [[014-metrics-monitoring]]

Почему эти кейсы здесь:
- [[009-search-autocomplete]] требует trie, caching, consistent hashing и rate limiting.
- [[011-proximity-service]] требует geospatial index, caching, consistent hashing и rate limiting.
- [[015-leaderboard]] требует sorted set index, caching, consistent hashing и event-driven architecture.
- [[008-distributed-file-storage]] требует content-addressable storage, deduplication, consistent hashing, event-driven architecture и long-lived connections.
- [[010-video-streaming]] требует adaptive bitrate streaming, content-addressable storage, caching, event-driven architecture и consistent hashing.
- [[006-web-crawler]] требует URL frontier, content deduplication, consistent hashing и event-driven architecture.
- [[014-metrics-monitoring]] требует time-series storage, consistent hashing, event-driven architecture и rate limiting.

## Полный порядок case studies

1. [[002-url-shortener]]
2. [[003-rate-limiter]]
3. [[016-distributed-cache]]
4. [[007-notification-service]]
5. [[013-distributed-message-queue]]
6. [[004-chat]]
7. [[005-news-feed]]
8. [[001-order-backend-marketplace]]
9. [[012-payment-system]]
10. [[017-distributed-lock]]
11. [[009-search-autocomplete]]
12. [[011-proximity-service]]
13. [[015-leaderboard]]
14. [[008-distributed-file-storage]]
15. [[010-video-streaming]]
16. [[006-web-crawler]]
17. [[014-metrics-monitoring]]

## Как проходить foundation

Для каждого foundation-документа:

1. Выписать 5-7 базовых терминов.
2. Нарисовать самую простую схему из документа.
3. Ответить: "какая проблема появляется, если система растёт?"
4. Перейти по разделу "Что читать дальше".

## Как проходить pattern

Для каждого паттерна:

1. Сначала назвать исходную проблему без паттерна.
2. Описать простое решение.
3. Объяснить, где простое решение ломается.
4. Только потом объяснить сам паттерн.
5. Назвать trade-offs и ситуации, где паттерн не нужен.

## Как проходить case study

Для каждого case study:

1. Прочитать Problem и Requirements.
2. Самому предложить простое решение.
3. Найти, где оно ломается.
4. Прочитать предложенные решения.
5. Сравнить альтернативы по latency, consistency, operability, scalability, complexity.
6. Восстановить схему системы по памяти.

## Что считать прогрессом

Не считать прогрессом просто "прочитал".

Прогресс есть, когда можешь:
- объяснить тему в 5-7 предложениях;
- назвать простое решение и его проблему;
- назвать 2-3 ключевых trade-off;
- сказать, где паттерн нужен, а где нет;
- нарисовать минимальную схему;
- защитить выбор архитектуры.

## Статусы

Для foundations:

- `not started`
- `read`
- `can explain`
- `can apply`

Для patterns:

- `not started`
- `read`
- `can explain`
- `can compare`

Для case studies:

- `not started`
- `read`
- `can explain`
- `can compare alternatives`
- `can design from scratch`

## Рекомендуемый ритм

- 1 foundation или 1 pattern в день;
- после 2-3 foundation/pattern — 1 связанный case study;
- раз в неделю: повторение без чтения файлов и мини self-review.

## Progress Tracker

### Foundations

| Topic | Status | Notes |
|---|---|---|
| 001-system-design-basics | read | |
| 002-read-write-path | read | |
| 004-cache-basics | not started | |
| 003-scaling-data | not started | |
| 005-distributed-systems-failures | not started | |

### Patterns

| Topic | Status | Notes |
|---|---|---|
| caching-strategies | not started | |
| cache-stampede | not started | |
| pagination | not started | |
| id-generation | not started | |
| consistent-hashing | not started | |
| rate-limiting-algorithms | not started | |
| materialized-view | not started | |
| idempotency-key | not started | |
| retry-with-backoff | not started | |
| dead-letter-queue | not started | |
| outbox | not started | |
| event-driven-architecture | not started | |
| log-structured-storage | not started | |
| long-lived-connections | not started | |
| fanout-strategies | not started | |
| saga | not started | |
| orchestration-vs-choreography | not started | |
| double-entry-ledger | not started | |
| fencing-token | not started | |
| trie-prefix-index | not started | |
| geospatial-index | not started | |
| sorted-set-index | not started | |
| content-deduplication | not started | |
| content-addressable-storage | not started | |
| adaptive-bitrate-streaming | not started | |
| url-frontier | not started | |
| time-series-storage | not started | |

### Case Studies

| Case | Status | Notes |
|---|---|---|
| 002-url-shortener | not started | |
| 003-rate-limiter | not started | |
| 016-distributed-cache | not started | |
| 007-notification-service | not started | |
| 013-distributed-message-queue | not started | |
| 004-chat | not started | |
| 005-news-feed | not started | |
| 001-order-backend-marketplace | not started | |
| 012-payment-system | not started | |
| 017-distributed-lock | not started | |
| 009-search-autocomplete | not started | |
| 011-proximity-service | not started | |
| 015-leaderboard | not started | |
| 008-distributed-file-storage | not started | |
| 010-video-streaming | not started | |
| 006-web-crawler | not started | |
| 014-metrics-monitoring | not started | |

## Первый шаг

Продолжить с:

1. [[004-cache-basics]]
2. [[caching-strategies]]
3. [[cache-stampede]]
4. [[pagination]]
5. [[id-generation]]

После этого перейти к:

1. [[003-scaling-data]]
2. [[consistent-hashing]]
3. [[002-url-shortener]]
