# STUDY

Рабочий трекер изучения базы знаний по system design.

Подробный маршрут лежит в [[STUDY_PLAN]]. Этот файл нужен для ежедневной работы: что сейчас изучается, какой статус у тем, что повторить и как понять, что тема действительно усвоена.

## Current Focus

- Active pattern: [[consistent-hashing]]
- Active case study: [[002-url-shortener]]
- Next review date: TBD

## Status Legend

Для patterns:

- `not started` — не начинал.
- `read` — прочитал один раз.
- `can explain` — могу объяснить без файла за 3-5 минут.
- `can compare` — могу назвать trade-offs, альтернативы и типичные ошибки.

Для case studies:

- `not started` — не начинал.
- `read` — прочитал один раз.
- `can explain` — могу объяснить архитектуру и основные компоненты.
- `can compare alternatives` — могу сравнить решения по latency, consistency, scalability, operability и complexity.
- `can design from scratch` — могу спроектировать систему с чистого листа без подсказки.

## Study Loop

Для каждого pattern:

1. Прочитать документ.
2. Ответить письменно или вслух: какую проблему решает, почему наивный подход плох, какие trade-offs.
3. Найти 1-3 case studies, где pattern применяется.
4. Объяснить без файла за 3-5 минут.
5. Обновить статус.

Для каждого case study:

1. Прочитать `Problem` и `Requirements`.
2. Сначала набросать своё решение без чтения готового.
3. Прочитать решения и trade-offs.
4. Восстановить схему по памяти.
5. Обновить статус.

## Patterns Tracker

| Order | Topic | Status | Notes |
|---:|---|---|---|
| 01 | [[consistent-hashing]] | not started | |
| 02 | [[id-generation]] | not started | |
| 03 | [[pagination]] | not started | |
| 04 | [[caching-strategies]] | not started | |
| 05 | [[rate-limiting-algorithms]] | not started | |
| 06 | [[idempotency-key]] | not started | |
| 07 | [[retry-with-backoff]] | not started | |
| 08 | [[dead-letter-queue]] | not started | |
| 09 | [[outbox]] | not started | |
| 10 | [[event-driven-architecture]] | not started | |
| 11 | [[saga]] | not started | |
| 12 | [[orchestration-vs-choreography]] | not started | |
| 13 | [[fencing-token]] | not started | |
| 14 | [[long-lived-connections]] | not started | |
| 15 | [[fanout-strategies]] | not started | |
| 16 | [[materialized-view]] | not started | |
| 17 | [[log-structured-storage]] | not started | |
| 18 | [[trie-prefix-index]] | not started | |
| 19 | [[geospatial-index]] | not started | |
| 20 | [[time-series-storage]] | not started | |
| 21 | [[sorted-set-index]] | not started | |
| 22 | [[content-deduplication]] | not started | |
| 23 | [[content-addressable-storage]] | not started | |
| 24 | [[adaptive-bitrate-streaming]] | not started | |
| 25 | [[url-frontier]] | not started | |
| 26 | [[cache-stampede]] | not started | |
| 27 | [[double-entry-ledger]] | not started | |

## Case Studies Tracker

| Order | Case | Status | Notes |
|---:|---|---|---|
| 01 | [[002-url-shortener]] | not started | |
| 02 | [[003-rate-limiter]] | not started | |
| 03 | [[005-news-feed]] | not started | |
| 04 | [[007-notification-service]] | not started | |
| 05 | [[004-chat]] | not started | |
| 06 | [[009-search-autocomplete]] | not started | |
| 07 | [[011-proximity-service]] | not started | |
| 08 | [[015-leaderboard]] | not started | |
| 09 | [[006-web-crawler]] | not started | |
| 10 | [[008-distributed-file-storage]] | not started | |
| 11 | [[010-video-streaming]] | not started | |
| 12 | [[014-metrics-monitoring]] | not started | |
| 13 | [[013-distributed-message-queue]] | not started | |
| 14 | [[001-order-backend-marketplace]] | not started | |
| 15 | [[012-payment-system]] | not started | |
| 16 | [[016-distributed-cache]] | not started | |
| 17 | [[017-distributed-lock]] | not started | |

## Weekly Review

Раз в неделю выбрать 3-5 тем и объяснить их без файлов.

| Date | Topics Reviewed | Result | Follow-up |
|---|---|---|---|
| TBD | | | |

## Self-Check Questions

- Какую проблему решает этот pattern?
- Почему простое решение ломается?
- Какие гарантии даёт решение, а какие не даёт?
- Где bottleneck?
- Что будет при retry, duplicate, timeout, partial failure?
- Как это мониторить?
- Какой trade-off я выбираю и почему?

## First Milestone

Закрыть первые четыре темы:

- [[consistent-hashing]]
- [[caching-strategies]]
- [[002-url-shortener]]
- [[003-rate-limiter]]

Milestone считается закрытым, когда можно без файла объяснить shard key, cache-aside, TTL, hot key, redirect flow и основные rate limiting algorithms.
