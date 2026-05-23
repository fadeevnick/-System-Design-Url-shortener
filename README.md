# Architecture Knowledge Base

Личная база знаний для системного изучения архитектурных решений (System Design).

## Как устроено

- **`case-studies/`** — разборы конкретных задач. Каждый кейс самодостаточен: формулировка задачи, требования, 1–N альтернативных решений, трейд-оффы, выводы.
- **`patterns/`** — переиспользуемые архитектурные паттерны (Outbox, Saga, Idempotency Key и т.д.). Описываются один раз, case studies ссылаются.
- **`glossary.md`** — короткие определения базовых терминов.
- **`_template-case-study.md`** / **`_template-pattern.md`** — шаблоны для новых записей.

## Соглашения

- Ссылки между документами в стиле wiki: `[[outbox]]`, `[[001-order-backend-marketplace]]`.
- Диаграммы: Mermaid в fenced-блоках для полных схем, ASCII для мелких inline-потоков.
- Каждый кейс получает порядковый номер: `NNN-короткое-имя.md`.
- Frontmatter (YAML) в начале каждого файла — для тегов, источников, кросс-ссылок.
- Язык: русский в тексте, английский в названиях паттернов и терминов.

## Case Studies

| ID  | Title                                              | Domain       | Patterns                                                    |
|-----|----------------------------------------------------|--------------|-------------------------------------------------------------|
| 001 | [[001-order-backend-marketplace]] — Order Backend для маркетплейса (Amazon-like) | e-commerce   | [[outbox]], [[idempotency-key]], [[saga]], [[event-driven-architecture]], [[orchestration-vs-choreography]] |
| 002 | [[002-url-shortener]] — URL Shortener (TinyURL / Bitly) | web/storage  | [[id-generation]], [[caching-strategies]], [[consistent-hashing]] |
| 003 | [[003-rate-limiter]] — Rate Limiter | infrastructure | [[rate-limiting-algorithms]], [[caching-strategies]], [[consistent-hashing]] |
| 004 | [[004-chat]] — Chat System (WhatsApp / Slack-like) | messaging | [[long-lived-connections]], [[fanout-strategies]], [[consistent-hashing]], [[event-driven-architecture]] |
| 005 | [[005-news-feed]] — News Feed (Twitter / Instagram-like) | social | [[fanout-strategies]], [[materialized-view]], [[pagination]], [[caching-strategies]] |
| 006 | [[006-web-crawler]] — Web Crawler (Googlebot / Common Crawl) | data-pipeline | [[url-frontier]], [[content-deduplication]], [[consistent-hashing]], [[event-driven-architecture]] |
| 007 | [[007-notification-service]] — Notification Service (push / email / SMS) | messaging | [[retry-with-backoff]], [[dead-letter-queue]], [[idempotency-key]], [[rate-limiting-algorithms]], [[event-driven-architecture]] |
| 008 | [[008-distributed-file-storage]] — Distributed File Storage (Dropbox / Google Drive) | storage | [[content-addressable-storage]], [[content-deduplication]], [[consistent-hashing]], [[long-lived-connections]] |
| 009 | [[009-search-autocomplete]] — Search Autocomplete / Typeahead (Google / YouTube) | search | [[trie-prefix-index]], [[caching-strategies]], [[consistent-hashing]] |
| 010 | [[010-video-streaming]] — Video Streaming (YouTube / Netflix) | media | [[adaptive-bitrate-streaming]], [[content-addressable-storage]], [[caching-strategies]], [[event-driven-architecture]] |
| 011 | [[011-proximity-service]] — Proximity Service (Yelp / Uber) | geo | [[geospatial-index]], [[caching-strategies]], [[consistent-hashing]] |
| 012 | [[012-payment-system]] — Payment System (Stripe / Airbnb Pay) | fintech | [[double-entry-ledger]], [[idempotency-key]], [[outbox]], [[saga]], [[retry-with-backoff]] |
| 013 | [[013-distributed-message-queue]] — Distributed Message Queue (Kafka / RabbitMQ) | messaging | [[log-structured-storage]], [[dead-letter-queue]], [[event-driven-architecture]], [[consistent-hashing]] |
| 014 | [[014-metrics-monitoring]] — Metrics Monitoring & Alerting (Prometheus / Datadog) | observability | [[time-series-storage]], [[consistent-hashing]], [[event-driven-architecture]] |
| 015 | [[015-leaderboard]] — Leaderboard (Gaming / Live Scoring) | gaming | [[sorted-set-index]], [[caching-strategies]], [[consistent-hashing]], [[event-driven-architecture]] |
| 016 | [[016-distributed-cache]] — Distributed Cache (Redis Cluster Design) | infrastructure | [[cache-stampede]], [[caching-strategies]], [[consistent-hashing]] |

## Patterns

### Reliability & Consistency
- [[outbox]] — Transactional Outbox: гарантированная доставка событий в брокер.
- [[idempotency-key]] — защита от дублирующих запросов через клиентский ключ.
- [[saga]] — распределённые транзакции через локальные транзакции + компенсации.
- [[rate-limiting-algorithms]] — token bucket, leaky bucket, sliding window, fixed window.
- [[retry-with-backoff]] — exponential backoff + jitter (Full/Equal/Decorrelated), retry budgets, Circuit Breaker связка.
- [[dead-letter-queue]] — изоляция необрабатываемых сообщений, metadata, replay flow, broker comparison.
- [[double-entry-ledger]] — двойная запись, append-only, balance snapshot, reconciliation, exactly-once via idempotency.
- [[cache-stampede]] — thundering herd при истечении TTL: mutex/singleflight, probabilistic early expiration, stale-while-revalidate, L1 local tier.

### Architectural Styles
- [[event-driven-architecture]] — система, где компоненты общаются через события на шине.
- [[orchestration-vs-choreography]] — сравнение двух стилей координации сервисов.

### Communication
- [[long-lived-connections]] — WebSocket / SSE / long-polling, persistent connections at scale.
- [[fanout-strategies]] — fanout-on-write vs fanout-on-read, hybrid для celebrity-problem.

### Distributed Coordination & Scheduling
- [[url-frontier]] — two-level priority queue с politeness для distributed crawling.
- [[content-deduplication]] — Bloom Filter, SimHash / MinHash, LSH для exact и near-duplicate detection.
- [[content-addressable-storage]] — хранение блоков по SHA-256 хэшу: автоматическая дедупликация, immutability, GC.
- [[trie-prefix-index]] — trie с top-K per node для autocomplete: O(P) lookup, шардинг, batch rebuild, CDN кэширование.
- [[adaptive-bitrate-streaming]] — HLS/DASH, bitrate ladder, сегменты, ABR алгоритмы (BBA/BOLA), LL-HLS.
- [[geospatial-index]] — Geohash / QuadTree / S2: сравнение, boundary problem, Redis GEOADD, precision table.
- [[log-structured-storage]] — append-only log, segment files, zero-copy sendfile, sparse index, log compaction, LSM tree.
- [[time-series-storage]] — Gorilla compression (delta-of-delta, XOR), chunk-based TSDB, inverted index, downsampling, cardinality.
- [[sorted-set-index]] — Skip List + Hash Map: O(log N) rank/range, ZINCRBY atomic, score-range sharding, time-windowed keys.

### Data & Storage
- [[id-generation]] — стратегии генерации уникальных ID (counter, hash, snowflake, ULID).
- [[caching-strategies]] — cache-aside, read-through, write-through, refresh-ahead, инвалидация.
- [[consistent-hashing]] — шардинг через hash ring с virtual nodes.
- [[materialized-view]] — pre-computed read model, refresh strategies.
- [[pagination]] — offset / cursor / keyset, стабильность к insertions.

## Glossary

См. [[glossary]] — короткие определения для быстрого ввода в контекст.

## Как добавить новый кейс

1. Скопировать `_template-case-study.md` в `case-studies/NNN-short-name.md`.
2. Заполнить frontmatter и секции.
3. Сослаться на используемые паттерны через `[[name]]`. Если паттерн новый — создать `patterns/name.md` из `_template-pattern.md`.
4. Добавить строку в таблицу Case Studies в этом README.
5. При появлении новых терминов — пополнить `glossary.md`.
