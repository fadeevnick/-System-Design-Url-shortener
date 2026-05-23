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

## Patterns

### Reliability & Consistency
- [[outbox]] — Transactional Outbox: гарантированная доставка событий в брокер.
- [[idempotency-key]] — защита от дублирующих запросов через клиентский ключ.
- [[saga]] — распределённые транзакции через локальные транзакции + компенсации.

### Architectural Styles
- [[event-driven-architecture]] — система, где компоненты общаются через события на шине.
- [[orchestration-vs-choreography]] — сравнение двух стилей координации сервисов.

### Data & Storage
- [[id-generation]] — стратегии генерации уникальных ID (counter, hash, snowflake, ULID).
- [[caching-strategies]] — cache-aside, read-through, write-through, refresh-ahead, инвалидация.
- [[consistent-hashing]] — шардинг через hash ring с virtual nodes.

## Glossary

См. [[glossary]] — короткие определения для быстрого ввода в контекст.

## Как добавить новый кейс

1. Скопировать `_template-case-study.md` в `case-studies/NNN-short-name.md`.
2. Заполнить frontmatter и секции.
3. Сослаться на используемые паттерны через `[[name]]`. Если паттерн новый — создать `patterns/name.md` из `_template-pattern.md`.
4. Добавить строку в таблицу Case Studies в этом README.
5. При появлении новых терминов — пополнить `glossary.md`.
