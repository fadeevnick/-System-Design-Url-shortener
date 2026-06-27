# STUDY PLAN

План изучения этой базы знаний по system design.

## Цель

Разобраться во всех ключевых архитектурах и паттернах так, чтобы:
- понимать, какую проблему решает каждый паттерн;
- уметь объяснить trade-offs;
- видеть, как паттерны собираются в целые системы;
- уметь спроектировать основные кейсы без подсказки.

## Принцип изучения

Не идти по case studies подряд с самого начала.

Сначала изучать базовые паттерны, потом связанные с ними case studies.
Так каждый следующий кейс будет опираться на уже знакомые идеи.

## Порядок изучения паттернов

### 1. База распределённых систем

1. [[consistent-hashing]]
2. [[id-generation]]
3. [[pagination]]
4. [[caching-strategies]]
5. [[rate-limiting-algorithms]]

### 2. Надёжность и интеграция

1. [[idempotency-key]]
2. [[retry-with-backoff]]
3. [[dead-letter-queue]]
4. [[outbox]]
5. [[event-driven-architecture]]

### 3. Координация и консистентность

1. [[saga]]
2. [[orchestration-vs-choreography]]
3. [[fencing-token]]

### 4. Частые прикладные паттерны

1. [[long-lived-connections]]
2. [[fanout-strategies]]
3. [[materialized-view]]
4. [[log-structured-storage]]

### 5. Специализированные паттерны

1. [[trie-prefix-index]]
2. [[geospatial-index]]
3. [[time-series-storage]]
4. [[sorted-set-index]]
5. [[content-deduplication]]
6. [[content-addressable-storage]]
7. [[adaptive-bitrate-streaming]]
8. [[url-frontier]]

## Порядок изучения case studies

1. [[002-url-shortener]]
2. [[003-rate-limiter]]
3. [[005-news-feed]]
4. [[007-notification-service]]
5. [[004-chat]]
6. [[009-search-autocomplete]]
7. [[011-proximity-service]]
8. [[015-leaderboard]]
9. [[006-web-crawler]]
10. [[008-distributed-file-storage]]
11. [[010-video-streaming]]
12. [[014-metrics-monitoring]]
13. [[013-distributed-message-queue]]
14. [[001-order-backend-marketplace]]
15. [[012-payment-system]]
16. [[016-distributed-cache]]
17. [[017-distributed-lock]]

## Как проходить каждый документ

Для каждого паттерна:

1. Прочитать документ.
2. Выписать:
   - какую проблему он решает;
   - почему наивный подход плох;
   - какие основные trade-offs;
   - где он применяется в case studies.
3. Объяснить паттерн своими словами без файла за 3-5 минут.

Для каждого case study:

1. Прочитать Problem и Requirements.
2. Самому попробовать придумать решение до чтения готового.
3. Прочитать предложенные решения.
4. Сравнить альтернативы:
   - latency;
   - consistency;
   - operability;
   - scalability;
   - complexity.
5. Попробовать восстановить схему системы по памяти.

## Что считать прогрессом

Не считать прогрессом просто "прочитал".

Прогресс есть, когда можешь:
- объяснить паттерн в 5-7 предложениях;
- назвать 2-3 ключевых trade-off;
- сказать, где он нужен, а где нет;
- нарисовать минимальную схему;
- защитить выбор архитектуры.

## Статусы

### Для pattern

- `not started`
- `read`
- `can explain`
- `can compare`

### Для case study

- `not started`
- `read`
- `can explain`
- `can compare alternatives`
- `can design from scratch`

## Рекомендуемый ритм

- 1-2 pattern в день
- или 1 pattern + 1 связанный case study

Раз в неделю:
- один день на повторение без чтения файлов;
- один мини self-review: объяснить 3-5 тем вслух без подсказки.

## Progress Tracker

### Patterns

| Topic | Status | Notes |
|---|---|---|
| consistent-hashing | not started | |
| id-generation | not started | |
| pagination | not started | |
| caching-strategies | not started | |
| rate-limiting-algorithms | not started | |
| idempotency-key | not started | |
| retry-with-backoff | not started | |
| dead-letter-queue | not started | |
| outbox | not started | |
| event-driven-architecture | not started | |
| saga | not started | |
| orchestration-vs-choreography | not started | |
| fencing-token | not started | |
| long-lived-connections | not started | |
| fanout-strategies | not started | |
| materialized-view | not started | |
| log-structured-storage | not started | |
| trie-prefix-index | not started | |
| geospatial-index | not started | |
| time-series-storage | not started | |
| sorted-set-index | not started | |
| content-deduplication | not started | |
| content-addressable-storage | not started | |
| adaptive-bitrate-streaming | not started | |
| url-frontier | not started | |

### Case Studies

| Case | Status | Notes |
|---|---|---|
| 002-url-shortener | not started | |
| 003-rate-limiter | not started | |
| 005-news-feed | not started | |
| 007-notification-service | not started | |
| 004-chat | not started | |
| 009-search-autocomplete | not started | |
| 011-proximity-service | not started | |
| 015-leaderboard | not started | |
| 006-web-crawler | not started | |
| 008-distributed-file-storage | not started | |
| 010-video-streaming | not started | |
| 014-metrics-monitoring | not started | |
| 013-distributed-message-queue | not started | |
| 001-order-backend-marketplace | not started | |
| 012-payment-system | not started | |
| 016-distributed-cache | not started | |
| 017-distributed-lock | not started | |

## Первый шаг

Начать с:

1. [[consistent-hashing]]
2. [[caching-strategies]]
3. [[002-url-shortener]]
4. [[003-rate-limiter]]

Если после них можешь уверенно объяснить shard key, cache-aside, TTL, hot key, redirect flow и rate limiting algorithms, значит база заложена правильно.
