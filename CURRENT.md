# CURRENT

## Focus

База знаний по архитектурам (System Design). Цель пользователя — пройти все классические темы.

## Status

**Done: 6 case studies + 15 patterns на ветке `main`.**

Последний коммит: `ba75ce3` — Add case study 006: Web Crawler.

```
ba75ce3 Add case study 006: Web Crawler (Googlebot / Common Crawl)
cf131b6 Add case study 005: News Feed (Twitter / Instagram-like)
bc95e15 Add case study 004: Chat System (WhatsApp / Slack-like)
65476a0 Add case study 003: Rate Limiter
be797f0 Add case study 002: URL Shortener (TinyURL/Bitly)
0bce545 Initialize architecture knowledge base
```

Working tree чистый.

Попытка 007 (Notification Service) была начата, но все file writes упали с internal error и не сохранились. Откатил task #2 обратно в pending.

## Next

Продолжить с **007 Notification Service**. План для него уже устоялся:

- Новые паттерны:
  - `patterns/retry-with-backoff.md` — exponential backoff, jitter (AWS full/equal/decorrelated), retry budgets, Circuit Breaker связка, max attempts, что retry / что нет.
  - `patterns/dead-letter-queue.md` — DLQ, метаданные сообщения, replay flow, retention, distinguishing transient vs permanent, broker comparison.
- `case-studies/007-notification-service.md` — Solution A (Channel-Specific Pipeline через Kafka topics) vs Solution B (Unified Worker Pool + Strategy Pattern). Покрыть: priority lanes (transactional vs marketing), throttling per user, idempotency на API, scheduling, open/click tracking, deliverability (DKIM/SPF/DMARC, warm-up), channel fallback (push fail → email).
- Обновить `README.md` (строка 007 + два паттерна в Reliability & Consistency) и `glossary.md` (Circuit Breaker, DLQ, Exponential Backoff, Jitter).

После 007 — продолжать по очереди задач (см. TaskList): 008 Distributed File Storage, 009 Search Auto-complete, 010 Video Streaming, 011 Proximity Service, 012 Payment System, 013 Distributed Message Queue, 014 Metrics Monitoring, 015 Leaderboard, 016 Distributed Cache, 017 Distributed Lock.

## Conventions (для следующей сессии)

- Каждый case study: `case-studies/NNN-name.md` со стандартным frontmatter + секции Source / Problem / Requirements / Solution A / Solution B / Trade-offs / Key Takeaways / Open Questions / References.
- Solutions сравниваются с Mermaid sequence или flowchart диаграммами.
- Каждое новое слово → wiki-link `[[name]]`, реально существующий паттерн или новый файл в `patterns/`.
- Patterns: `patterns/name.md` со структурой What / Why / When / How / Diagram / Pitfalls / Variations / Used in case studies / References.
- README обновляется (таблица Case Studies + категории паттернов).
- Glossary пополняется в алфавитном порядке.
- Коммит после каждого кейса с co-author trailer.
- Язык: смешанный (русский текст + английские термины).

## Open questions

Нет блокирующих.
