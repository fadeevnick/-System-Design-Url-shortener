# CURRENT

## Focus

База знаний по архитектурам (System Design). Цель пользователя — пройти все классические темы.

## Status

**ВСЕ 17 КЕЙСОВ ЗАВЕРШЕНЫ.**

Последний коммит: `063f90f` — Add case study 017: Distributed Lock.

```
063f90f Add case study 017: Distributed Lock (Redis Redlock / ZooKeeper / etcd)
32aaf64 Add case study 016: Distributed Cache (Redis Cluster Design)
7e53bbe Add case study 015: Leaderboard (Gaming / Live Scoring)
fc8eec9 Add case study 014: Metrics Monitoring & Alerting (Prometheus / Datadog)
2218c51 Add case study 013: Distributed Message Queue (Kafka / RabbitMQ)
```

**Итог:**
- 17 case studies (001–017)
- 27 patterns
- glossary 95 терминов
- README с полными таблицами

## Status: COMPLETE

Все запланированные кейсы завершены. База знаний по system design готова.

## Conventions (для следующей сессии)

- Каждый case study: `case-studies/NNN-name.md` с frontmatter `id/title/source/domain/patterns/tags/difficulty` + секции Source / Problem / Requirements / Solution A / Solution B / Trade-offs / Key Takeaways / Open Questions / References.
- Solutions сравниваются с Mermaid sequence или flowchart диаграммами.
- Каждое новое слово → wiki-link на реально существующий документ, например `[[outbox]]`, либо новый файл в `patterns/`.
- Patterns: `patterns/name.md` с frontmatter `name/title/category/aliases/tags/related` и секциями What / Why / When / How / Diagram / Pitfalls / Variations / Used in case studies / References.
- README обновляется (таблица Case Studies + категории паттернов).
- Glossary пополняется в алфавитном порядке.
- Коммит после каждого кейса с co-author trailer.
- Язык: смешанный (русский текст + английские термины).

## Open questions

Нет блокирующих.
