# Glossary

Короткие определения базовых терминов. Пополняется с каждым новым кейсом.

## A

- **API Gateway** — единая точка входа для клиентских запросов. Отвечает за rate limiting, аутентификацию, авторизацию, метрики, маршрутизацию в downstream-сервисы.
- **At-least-once delivery** — гарантия, что сообщение будет доставлено хотя бы раз (возможны дубли). Требует [[idempotency-key]] на consumer-стороне.

## B

- **Base62 encoding** — кодировка с алфавитом из 62 символов (a–z, A–Z, 0–9). Используется для коротких URL и ID; 7 знаков = 62^7 ≈ 3.5 трлн комбинаций.
- **Bloom Filter** — вероятностная структура для проверки членства в множестве. Гарантирует «точно нет», допускает «возможно есть» (false positives). Без false negatives.

## C

- **Cache-Aside (Lazy loading)** — паттерн кэширования: приложение читает кэш, при промахе идёт в БД и кладёт в кэш. См. [[caching-strategies]].
- **Choreography** — стиль координации в распределённой системе, где сервисы реагируют на события без центрального координатора. См. [[orchestration-vs-choreography]].
- **Consistent Hashing** — техника шардинга на основе hash ring, при которой добавление/удаление ноды затрагивает лишь ~1/N ключей. См. [[consistent-hashing]].
- **CQRS** — Command Query Responsibility Segregation: разделение модели для чтения и записи.

## E

- **Event-Driven Architecture (EDA)** — архитектурный стиль, в котором компоненты общаются через события на шине (Kafka, NATS, RabbitMQ). См. [[event-driven-architecture]].
- **Event bus** — шина событий: брокер, через который сервисы публикуют и подписываются на события.

## F

- **Fail-closed** — стратегия при отказе зависимости: блокировать запрос. Используется для критичных операций (платежи). Trade-off: сбой зависимости = outage.
- **Fail-open** — стратегия при отказе зависимости: пропускать запрос как будто проверка прошла. Default для не-критичных read-paths.
- **Fanout-on-Read (Pull)** — модель fanout: сообщение хранится один раз, получатель «собирает» ленту при чтении. Дешёвый write, дорогой read. См. [[fanout-strategies]].
- **Fanout-on-Write (Push)** — модель fanout: сообщение копируется в inbox каждого получателя при отправке. Дорогой write, дешёвый read. См. [[fanout-strategies]].
- **Fixed Window** — алгоритм rate limiting со счётчиком на фиксированных временных окнах. Прост, но допускает burst на границе. См. [[rate-limiting-algorithms]].

## G

- **gRPC** — RPC-фреймворк поверх HTTP/2 с Protobuf. Стандарт для service-to-service внутри инфраструктуры.

## H

- **Hash Ring** — структура для consistent hashing: ключи и ноды мапятся в одно числовое кольцо (0..2^32-1).

## I

- **Idempotency Key** — клиентский ключ, по которому сервер дедуплицирует повторные запросы. См. [[idempotency-key]].
- **Idempotent operation** — операция, повторное выполнение которой даёт тот же результат, что и однократное.

## K

- **Kafka** — распределённый лог-брокер. Хранит события в партиционированных топиках, поддерживает потребителей с offset-ом. Часто используется как event bus.

## L

- **Leaky Bucket** — алгоритм rate limiting / traffic shaping: запросы стоят в очереди и обрабатываются с constant rate. Сглаживает burst. См. [[rate-limiting-algorithms]].
- **Long-Lived Connection** — persistent двунаправленный канал client ↔ server, удерживающийся минутами/часами (WebSocket, SSE, gRPC streaming). См. [[long-lived-connections]].

## N

- **Notification Service** — сервис, который подписывается на события и доставляет их клиентам (WebSocket, push, email).

## O

- **Orchestration** — стиль координации с центральным координатором, который последовательно вызывает сервисы. См. [[orchestration-vs-choreography]].
- **Outbox Pattern (Transactional Outbox)** — паттерн надёжной публикации событий: запись в outbox-таблицу в одной транзакции с бизнес-данными, отдельный publisher вычитывает и шлёт в брокер. См. [[outbox]].

## P

- **Presence** — индикатор online-статуса пользователя. Реализуется обычно через Redis с TTL и heartbeat.
- **Pub/Sub** — модель «publish/subscribe»: publisher отправляет в topic, subscribers подписаны на topic. Развязывает sender и receiver.
- **Push vs Pull** — модель доставки данных между системами. Push: отправитель инициирует доставку (webhook). Pull: получатель сам запрашивает данные (polling).

## R

- **Rate Limiting** — ограничение количества запросов / событий за интервал времени. Защита от перегрузки и abuse. См. [[rate-limiting-algorithms]].
- **Read-Through** — паттерн кэширования: кэш сам подтягивает данные из БД при промахе, приложение видит только кэш. См. [[caching-strategies]].

## S

- **Saga** — распределённая транзакция, представленная как последовательность локальных транзакций с компенсирующими действиями при сбое. См. [[saga]].
- **Server-Sent Events (SSE)** — HTTP-протокол server-to-client push потока (одностороний). Простой формат, автореконнект. См. [[long-lived-connections]].
- **Sharding** — горизонтальное разбиение данных между несколькими storage-нодами по ключу.
- **Sliding Window** — алгоритм rate limiting с динамическим окном (log или counter), без burst-проблем на границе. См. [[rate-limiting-algorithms]].
- **Snowflake ID** — 64-битный распределённый ID Twitter: timestamp + machine_id + sequence. Sortable по времени, не требует координации после раздачи machine_id.

## T

- **Ticket Server** — централизованный сервис, выдающий монотонно растущие ID (часто диапазонами). Используется для генерации sequential ID без auto-increment в БД.
- **Token Bucket** — алгоритм rate limiting: ведро с токенами, refill at rate R, capacity C. Разрешает burst до C, ограничивает average. Default для API. См. [[rate-limiting-algorithms]].
- **TTL (Time-To-Live)** — срок жизни записи в кэше или БД, после которого она удаляется или считается невалидной.

## U

- **ULID / KSUID** — 128-битный sortable идентификатор: timestamp + random. Drop-in replacement для UUID v4, лучше для индексов БД.

## V

- **Virtual Node (vnode)** — точка в hash ring, представляющая одну физическую ноду много раз (обычно 100–200) для равномерности распределения. См. [[consistent-hashing]].

## W

- **Webhook** — HTTP-callback от одной системы к другой при возникновении события. Push-модель доставки.
- **WebSocket** — двунаправленный протокол поверх TCP/HTTP. Часто используется для real-time нотификаций клиенту.

## Write-* (кэш)

- **Write-Through** — синхронная запись в кэш и БД одновременно. См. [[caching-strategies]].
- **Write-Behind / Write-Back** — асинхронная запись в БД из кэша (батчинг). См. [[caching-strategies]].
