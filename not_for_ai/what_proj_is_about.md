объясни мне структуру проекта и за что отвечает каждый файл


• Это не приложение, а база знаний по system design. Структура проекта делится на 3 смысловых слоя: индекс
  и правила, case-studies с разбором задач, patterns с переиспользуемыми архитектурными паттернами.

  Корень

  - README.md:1 — главный индекс проекта: что это за база, как она устроена, список всех case studies и
  patterns, правила добавления новых материалов.
  - CURRENT.md:1 — оперативный статус базы: текущее состояние, счётчики, редакционные соглашения для
  следующей сессии.
  - _template-case-study.md:1 — шаблон для нового кейса: frontmatter, разделы, формат trade-offs и
  references.
  - _template-pattern.md:1 — шаблон для нового паттерна: what/why/when/how/pitfalls/variations.
  - glossary.md:1 — словарь базовых терминов, на который опираются кейсы и паттерны.
  - .agents/ — служебная директория среды, не часть самой knowledge base.
  - .codex/ — служебная директория среды, не часть самой knowledge base.

  Case Studies

  - case-studies/001-order-backend-marketplace.md:1 — backend заказов для маркетплейса: orchestration vs
  event-driven, outbox, saga.
  - case-studies/002-url-shortener.md:1 — short URL сервис: генерация ID, редиректы, read-heavy storage.
  - case-studies/003-rate-limiter.md:1 — rate limiter: token bucket, sliding window, distributed counters.
  - case-studies/004-chat.md:1 — чат-система: realtime delivery, websocket, fanout, presence.
  - case-studies/005-news-feed.md:1 — лента новостей: fanout-on-write vs fanout-on-read, materialized view,
  pagination.
  - case-studies/006-web-crawler.md:1 — распределённый crawler: frontier, deduplication, politeness.
  - case-studies/007-notification-service.md:1 — мультиканальные уведомления: push/email/SMS, retries, DLQ,
  throttling.
  - case-studies/008-distributed-file-storage.md:1 — облачное файловое хранилище: sync, versioning,
  deduplication, chunking.
  - case-studies/009-search-autocomplete.md:1 — search suggestions: trie, ranking, hot queries, caching.
  - case-studies/010-video-streaming.md:1 — видеостриминг: upload, transcoding, CDN, adaptive bitrate.
  - case-studies/011-proximity-service.md:1 — геопоиск ближайших объектов: geohash/quadtree/S2, static vs
  moving objects.
  - case-studies/012-payment-system.md:1 — платёжная система: PSP, ledger, reconciliation, refunds,
  idempotency.
  - case-studies/013-distributed-message-queue.md:1 — брокер сообщений: partitioned log, consumer groups,
  retention, delivery semantics.
  - case-studies/014-metrics-monitoring.md:1 — мониторинг и алертинг: ingestion, TSDB, queries, alert
  pipeline.
  - case-studies/015-leaderboard.md:1 — лидерборд: Redis ZSET, rank queries, resets, sharding.
  - case-studies/016-distributed-cache.md:1 — распределённый кэш: replication, eviction, warming, hot keys,
  stampede.
  - case-studies/017-distributed-lock.md:1 — distributed lock: Redis lock, Redlock critique, ZooKeeper/
  etcd, fencing token.

  Patterns

  - patterns/outbox.md:1 — надёжная публикация событий из БД в брокер.
  - patterns/idempotency-key.md:1 — защита от повторных запросов и дублей.
  - patterns/saga.md:1 — distributed transactions через локальные шаги и компенсации.
  - patterns/rate-limiting-algorithms.md:1 — token bucket, leaky bucket, fixed/sliding window.
  - patterns/retry-with-backoff.md:1 — retry policy с backoff и jitter.
  - patterns/dead-letter-queue.md:1 — изоляция необрабатываемых сообщений.
  - patterns/double-entry-ledger.md:1 — денежный учёт через двойную запись.
  - patterns/cache-stampede.md:1 — защита от thundering herd при истечении TTL.
  - patterns/fencing-token.md:1 — защита от stale lock holders.
  - patterns/event-driven-architecture.md:1 — взаимодействие сервисов через события.
  - patterns/orchestration-vs-choreography.md:1 — сравнение двух стилей координации.
  - patterns/long-lived-connections.md:1 — WebSocket, SSE, persistent connections.
  - patterns/fanout-strategies.md:1 — push/pull fanout для сообщений и лент.
  - patterns/url-frontier.md:1 — scheduler очередей для crawler.
  - patterns/content-deduplication.md:1 — exact и near-duplicate detection.
  - patterns/content-addressable-storage.md:1 — хранение объектов по hash content.
  - patterns/trie-prefix-index.md:1 — trie для autocomplete.
  - patterns/adaptive-bitrate-streaming.md:1 — HLS/DASH и ABR-алгоритмы.
  - patterns/geospatial-index.md:1 — Geohash, QuadTree, S2 и spatial lookups.
  - patterns/log-structured-storage.md:1 — append-only log, сегменты, compaction.
  - patterns/time-series-storage.md:1 — хранение метрик и временных рядов.
  - patterns/sorted-set-index.md:1 — rank/range индекс на ZSET-подобной структуре.
  - patterns/id-generation.md:1 — counter, snowflake, ULID и другие стратегии ID.
  - patterns/caching-strategies.md:1 — cache-aside, read-through, write-through, invalidation.
  - patterns/consistent-hashing.md:1 — распределение ключей по ring/vnodes.
  - patterns/materialized-view.md:1 — precomputed read models.
  - patterns/pagination.md:1 — offset, cursor, keyset pagination.

  Если упростить до одной схемы, проект работает так: README говорит, что есть в базе, CURRENT фиксирует её
  текущее состояние, case-studies показывают как проектировать целые системы, patterns объясняют из каких
  архитектурных кирпичей они собраны, а glossary помогает быстро расшифровывать термины.

  Если хотите, следующим сообщением могу сделать ещё более полезную вещь: построить вам карту зависимостей
  проекта — какие case studies завязаны на какие patterns и какие паттерны здесь центральные.


› я хочу разобраться во всех этих архитектурах и паттернах. с чего мне начать? и как отслеживать прогресс?


• Начать стоит не с кейсов подряд, а с базовых паттернов, потому что case studies постоянно на них
  опираются. Если пойти сразу в 012 payment или 017 distributed lock, будет перегрузка.

  Порядок
  Иди в таком порядке:

  1. База распределённых систем:
     consistent-hashing, id-generation, pagination, caching-strategies, rate-limiting-algorithms

  2. Надёжность и интеграция:
     idempotency-key, retry-with-backoff, dead-letter-queue, outbox, event-driven-architecture

  3. Координация и консистентность:
     saga, orchestration-vs-choreography, fencing-token

  4. Частые прикладные паттерны:
     long-lived-connections, fanout-strategies, materialized-view, log-structured-storage

  5. Специализированные паттерны:
     trie-prefix-index, geospatial-index, time-series-storage, sorted-set-index, content-deduplication,
     content-addressable-storage, adaptive-bitrate-streaming, url-frontier

  После этого переходи к кейсам примерно так:

  1. 002-url-shortener
  2. 003-rate-limiter
  3. 005-news-feed
  4. 007-notification-service
  5. 004-chat
  6. 009-search-autocomplete
  7. 011-proximity-service
  8. 015-leaderboard
  9. 006-web-crawler
  10. 008-distributed-file-storage
  11. 010-video-streaming
  12. 014-metrics-monitoring
  13. 013-distributed-message-queue
  14. 001-order-backend-marketplace
  15. 012-payment-system
  16. 016-distributed-cache
  17. 017-distributed-lock

  Такой порядок идёт от простого к более “системному” и снижает количество незнакомых идей на страницу.

  Как учить
  На каждый документ используй один и тот же цикл:

  1. Прочитай glossary, если встретил незнакомые термины.
  2. Прочитай 1 pattern.
  3. Своими словами ответь:
     что решает,
     почему наивный подход плох,
     какие trade-offs.

  4. Только потом иди в case study, где этот pattern применяется.
  5. В конце попробуй без текста восстановить схему системы на бумаге или в заметке.

  Если не можешь за 3-5 минут объяснить паттерн без файла, значит он ещё не закрепился.

  Как отслеживать прогресс
  Самый практичный способ: завести простую таблицу статусов прямо в отдельном STUDY.md или даже в заметках.

  Для каждого pattern и case study держи 4 состояния:

  - not started
  - read
  - can explain
  - can compare alternatives

  Для кейсов добавь ещё один критерий:

  - can design from scratch

  Пример строки:
  outbox | read | can explain | can name pitfalls
  012-payment-system | read | can explain | can compare PSP vs wallet | can design from scratch

  Что считать реальным прогрессом
  Прогресс есть, когда ты можешь без текста:

  - объяснить паттерн в 5-7 предложениях;
  - назвать 2-3 trade-off;
  - сказать, в каких кейсах он нужен;
  - нарисовать минимальную схему;
  - ответить, почему выбрал это решение, а не соседнее.

  Не считай “прочитал” прогрессом. Считай прогрессом только “могу воспроизвести и защитить выбор”.

  Ритм
  Оптимальный темп:

  - 1-2 pattern в день, или
  - 1 pattern + 1 связанный case study.

  Пример хорошей недели:

  - день 1: caching-strategies + consistent-hashing
  - день 2: rate-limiting-algorithms + 003-rate-limiter
  - день 3: idempotency-key + retry-with-backoff
  - день 4: outbox + event-driven-architecture
  - день 5: 007-notification-service
  - день 6: повторение без файлов
  - день 7: мини-интервью самому себе

  Если хотите, следующим сообщением я могу собрать вам готовый учебный маршрут на 4 недели прямо по этому
  репозиторию.
