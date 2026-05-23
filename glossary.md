# Glossary

Короткие определения базовых терминов. Пополняется с каждым новым кейсом.

## A

- **ABR (Adaptive Bitrate Streaming)** — техника доставки видео: контент закодирован в N качествах, клиент динамически переключается между ними по состоянию буфера / скорости канала. Стандарты: HLS, MPEG-DASH. See [[adaptive-bitrate-streaming]].
- **AV1** — открытый видеокодек (Alliance for Open Media): ~30% эффективнее H.265 при том же качестве. Используется YouTube, Netflix. Требует дорогого кодирования, но дешевле передачи.
- **API Gateway** — единая точка входа для клиентских запросов. Отвечает за rate limiting, аутентификацию, авторизацию, метрики, маршрутизацию в downstream-сервисы.
- **At-least-once delivery** — гарантия, что сообщение будет доставлено хотя бы раз (возможны дубли). Требует [[idempotency-key]] на consumer-стороне.

## B

- **Base62 encoding** — кодировка с алфавитом из 62 символов (a–z, A–Z, 0–9). Используется для коротких URL и ID; 7 знаков = 62^7 ≈ 3.5 трлн комбинаций.
- **Bloom Filter** — вероятностная структура для проверки членства в множестве. Гарантирует «точно нет», допускает «возможно есть» (false positives). Без false negatives.

## C

- **CAS (Content-Addressable Storage)**
- **Chargeback** — оспаривание транзакции покупателем через банк. Банк возвращает деньги покупателю; продавец должен предоставить доказательства (delivery proof, order confirmation) или теряет сумму + штраф. — схема хранения, в которой адрес объекта = SHA-256 его содержимого. Автоматическая дедупликация, immutability, integrity check. See [[content-addressable-storage]].
- **CDC (Content-Defined Chunking)** — алгоритм нарезки файла на блоки по «природным» границам контента (rolling hash / Rabin), устойчив к сдвигу. Лучшая дедупликация, чем fixed-size.
- **Circuit Breaker** — паттерн отказоустойчивости: автомат с тремя состояниями (Closed → Open → Half-Open). В Open-состоянии вызовы к сбойному downstream блокируются немедленно (fail-fast), без ожидания таймаута. Связан с [[retry-with-backoff]].
- **Consumer Group (Kafka)** — группа consumer'ов, делящих партиции топика: каждая партиция достаётся ровно одному consumer'у в группе. Параллелизм = число партиций. Разные группы читают независимо.
- **Consumer Lag** — отставание consumer от leader: `end_offset - committed_offset`. Ключевая метрика здоровья Kafka pipeline; рост лага = consumer не справляется.
- **Cache-Aside (Lazy loading)** — паттерн кэширования: приложение читает кэш, при промахе идёт в БД и кладёт в кэш. См. [[caching-strategies]].
- **Celebrity Problem** — feature социальных сетей: пользователи с миллионами followers создают write storm при fanout-on-write. Решается hybrid push/pull. См. [[fanout-strategies]].
- **Cursor-Based Pagination** — пагинация через cursor (ID/timestamp последнего элемента), стабильна к insertions и быстра при глубоких страницах. См. [[pagination]].
- **Choreography** — стиль координации в распределённой системе, где сервисы реагируют на события без центрального координатора. См. [[orchestration-vs-choreography]].
- **Consistent Hashing** — техника шардинга на основе hash ring, при которой добавление/удаление ноды затрагивает лишь ~1/N ключей. См. [[consistent-hashing]].
- **CQRS** — Command Query Responsibility Segregation: разделение модели для чтения и записи.

## D

- **DAG (Directed Acyclic Graph) Pipeline**
- **Double-Entry Ledger** — каждая транзакция = debit одного счёта + credit другого на равную сумму. Append-only. Баланс = SUM. Нарушение balance invariant = ошибка. See [[double-entry-ledger]]. — ориентированный граф без циклов, описывающий зависимости задач. В transcoding: split → [transcode_240p, transcode_720p, ...] → merge. Задачи без зависимостей выполняются параллельно.
- **Dead-Letter Queue (DLQ)** — очередь для сообщений, которые не удалось обработать после исчерпания ретраев. Изолирует «токсичные» сообщения, позволяет анализировать и делать replay. See [[dead-letter-queue]].
- **DKIM (DomainKeys Identified Mail)** — механизм подписи email-заголовков приватным ключом домена; получатель проверяет через DNS. Часть email deliverability трiade: SPF + DKIM + DMARC.
- **DMARC** — политика обработки писем, не прошедших SPF/DKIM: `none`, `quarantine`, `reject`. Публикуется как DNS TXT запись.

## E

- **Edge N-Gram** — токенизатор, разбивающий слово на префиксы: "google" → ["g","go","goo","goog","googl","google"]. Используется в Elasticsearch для autocomplete через обычный term query.
- **Envelope Encryption** — паттерн шифрования: данные зашифрованы data key (DEK), сам DEK зашифрован key-encryption key (KEK) из KMS. Позволяет ротировать KEK без перешифровки данных.
- **Event-Driven Architecture (EDA)** — архитектурный стиль, в котором компоненты общаются через события на шине (Kafka, NATS, RabbitMQ). См. [[event-driven-architecture]].
- **Event bus** — шина событий: брокер, через который сервисы публикуют и подписываются на события.
- **Exponential Backoff** — стратегия ожидания между повторными попытками: задержка удваивается с каждой попыткой (`base * 2^n`). Применяется вместе с jitter для рассеивания нагрузки. See [[retry-with-backoff]].

## F

- **Fail-closed** — стратегия при отказе зависимости: блокировать запрос. Используется для критичных операций (платежи). Trade-off: сбой зависимости = outage.
- **Fail-open** — стратегия при отказе зависимости: пропускать запрос как будто проверка прошла. Default для не-критичных read-paths.
- **Fanout-on-Read (Pull)** — модель fanout: сообщение хранится один раз, получатель «собирает» ленту при чтении. Дешёвый write, дорогой read. См. [[fanout-strategies]].
- **Fanout-on-Write (Push)** — модель fanout: сообщение копируется в inbox каждого получателя при отправке. Дорогой write, дешёвый read. См. [[fanout-strategies]].
- **Fixed Window** — алгоритм rate limiting со счётчиком на фиксированных временных окнах. Прост, но допускает burst на границе. См. [[rate-limiting-algorithms]].

## G

- **Geohash** — Base32-строка, кодирующая (lat, lng) через чередование бит широты и долготы. Общий префикс = близкие ячейки. Boundary problem: точки через границу имеют разный префикс → нужны 8 соседей. See [[geospatial-index]].
- **Geofencing** — триггер события при входе/выходе объекта из географического полигона или ячейки (набора geohash).
- **GIST Index** — обобщённый поисковый индекс в Postgres. Используется PostGIS для spatial queries (ST_DWithin, ST_Within).
- **gRPC**
 — RPC-фреймворк поверх HTTP/2 с Protobuf. Стандарт для service-to-service внутри инфраструктуры.

## H

- **Haversine Formula** — формула вычисления расстояния между двумя точками на сфере по (lat, lng). Точна для Земли; на малых расстояниях (<100 km) евклидово приближение допустимо.
- **Hash Ring**
- **HLS (HTTP Live Streaming)** — стандарт Apple для ABR: манифест `.m3u8` + сегменты `.ts` / `.m4s`. Совместим с любым HTTP/CDN. See [[adaptive-bitrate-streaming]].



 — структура для consistent hashing: ключи и ноды мапятся в одно числовое кольцо (0..2^32-1).

## I

- **Idempotency Key**
- **ISR (In-Sync Replicas)** — подмножество реплик Kafka, не отстающих от лидера. Сообщение считается зафиксированным, когда все ISR подтвердили запись. Уменьшение ISR = риск потери данных. See [[013-distributed-message-queue]]. — клиентский ключ, по которому сервер дедуплицирует повторные запросы. См. [[idempotency-key]].
- **Idempotent operation** — операция, повторное выполнение которой даёт тот же результат, что и однократное.

## J

- **Jitter** — случайный шум, добавляемый к задержке retry, чтобы клиенты не ретраили синхронно («thundering herd»). Варианты: Full, Equal, Decorrelated. See [[retry-with-backoff]].

## K

- **Kafka** — распределённый лог-брокер. Хранит события в партиционированных топиках, поддерживает потребителей с offset-ом. Часто используется как event bus.

## L

- **Leaky Bucket**
- **Log-Structured Storage** — хранение данных только через append в конец файла. Sequential writes быстрее random в 100×. Основа Kafka, WAL, LSM tree. See [[log-structured-storage]].
- **LSM Tree (Log-Structured Merge Tree)** — структура для key-value storage: writes → MemTable → SSTables (L0→L1→...). Compaction мёрджит уровни. Используется в RocksDB, Cassandra, LevelDB. — алгоритм rate limiting / traffic shaping: запросы стоят в очереди и обрабатываются с constant rate. Сглаживает burst. См. [[rate-limiting-algorithms]].
- **Long-Lived Connection** — persistent двунаправленный канал client ↔ server, удерживающийся минутами/часами (WebSocket, SSE, gRPC streaming). См. [[long-lived-connections]].
- **LSH (Locality Sensitive Hashing)** — техника для быстрого поиска близких объектов: похожие fingerprint'ы попадают в один bucket. См. [[content-deduplication]].

## M

- **Materialized View** — pre-computed read-оптимизированное представление данных, хранится отдельно от источника, обновляется push/pull/scheduled. См. [[materialized-view]].
- **MinHash** — техника оценки Jaccard similarity между set'ами через K min-hash значений. Используется для near-duplicate detection. См. [[content-deduplication]].

## N

- **Notification Service** — сервис, который подписывается на события и доставляет их клиентам (WebSocket, push, email).

## O

- **Orchestration** — стиль координации с центральным координатором, который последовательно вызывает сервисы. См. [[orchestration-vs-choreography]].
- **Outbox Pattern (Transactional Outbox)** — паттерн надёжной публикации событий: запись в outbox-таблицу в одной транзакции с бизнес-данными, отдельный publisher вычитывает и шлёт в брокер. См. [[outbox]].

## P

- **Pagination**
- **PCI DSS** — Payment Card Industry Data Security Standard. Запрещает хранить PAN (полный номер карты) и CVV на своих серверах. Решение: PSP hosted fields / iframe — карточные данные не попадают в наш код.
- **POI (Point of Interest)**
- **PSP (Payment Service Provider)** — провайдер платёжных услуг (Stripe, Adyen, Braintree). Принимает карточные данные, проводит авторизацию, переводит деньги. — точка интереса на карте: ресторан, магазин, достопримечательность. Единица данных в Yelp-подобных системах.
- **Presigned URL** — временный URL с HMAC-подписью, дающий право на конкретную операцию (PUT/GET) в Object Store (S3) без раскрытия credentials клиенту. TTL обычно 15 минут — 1 час. — постраничная выдача больших коллекций (offset / cursor / keyset). См. [[pagination]].
- **Presence** — индикатор online-статуса пользователя. Реализуется обычно через Redis с TTL и heartbeat.
- **Pub/Sub** — модель «publish/subscribe»: publisher отправляет в topic, subscribers подписаны на topic. Развязывает sender и receiver.
- **Push vs Pull** — модель доставки данных между системами. Push: отправитель инициирует доставку (webhook). Pull: получатель сам запрашивает данные (polling).

## R

- **Rate Limiting** — ограничение количества запросов / событий за интервал времени. Защита от перегрузки и abuse. См. [[rate-limiting-algorithms]].
- **Read-Through** — паттерн кэширования: кэш сам подтягивает данные из БД при промахе, приложение видит только кэш. См. [[caching-strategies]].

## S

- **Saga** — распределённая транзакция, представленная как последовательность локальных транзакций с компенсирующими действиями при сбое. См. [[saga]].
- **Server-Sent Events (SSE)** — HTTP-протокол server-to-client push потока (одностороний). Простой формат, автореконнект. См. [[long-lived-connections]].
- **Session-Stable Ranking** — при ranked feed заморозка ranking на сессию, чтобы новые items не сдвигали страницы при пагинации.
- **SimHash** — fingerprint техника (Google): документ → 64-битный hash; близкие документы → близкие hash'и по Hamming distance. См. [[content-deduplication]].
- **Sharding** — горизонтальное разбиение данных между несколькими storage-нодами по ключу.
- **Sliding Window** — алгоритм rate limiting с динамическим окном (log или counter), без burst-проблем на границе. См. [[rate-limiting-algorithms]].
- **Snowflake ID** — 64-битный распределённый ID Twitter: timestamp + machine_id + sequence. Sortable по времени, не требует координации после раздачи machine_id.

## T

- **Ticket Server**
- **Trie (Prefix Tree)** — дерево, где путь от корня до узла — префикс ключа. Все ключи с общим префиксом разделяют путь. O(P) lookup, P = длина префикса. See [[trie-prefix-index]].
- **Top-K per node (Trie)** — оптимизация: каждый узел trie pre-computed хранит K наиболее релевантных завершений. Запрос = обход префикса + O(1) возврат списка.
- **Trending Query** — запрос, velocity которого (count за последние 5 мин / baseline) резко выросла. Добавляется в suggestions через fast-path поверх основного trie ranking. — централизованный сервис, выдающий монотонно растущие ID (часто диапазонами). Используется для генерации sequential ID без auto-increment в БД.
- **Token Bucket** — алгоритм rate limiting: ведро с токенами, refill at rate R, capacity C. Разрешает burst до C, ограничивает average. Default для API. См. [[rate-limiting-algorithms]].
- **TTL (Time-To-Live)** — срок жизни записи в кэше или БД, после которого она удаляется или считается невалидной.

## U

- **ULID / KSUID** — 128-битный sortable идентификатор: timestamp + random. Drop-in replacement для UUID v4, лучше для индексов БД.
- **URL Frontier** — двухуровневая очередь в web crawler'е (front queues по приоритету + back queues per host) с politeness constraint. См. [[url-frontier]].

## V

- **Virtual Node (vnode)** — точка в hash ring, представляющая одну физическую ноду много раз (обычно 100–200) для равномерности распределения. См. [[consistent-hashing]].

## W

- **Webhook** — HTTP-callback от одной системы к другой при возникновении события. Push-модель доставки.
- **WebSocket** — двунаправленный протокол поверх TCP/HTTP. Часто используется для real-time нотификаций клиенту.

## Write-* (кэш)

- **Write-Through** — синхронная запись в кэш и БД одновременно. См. [[caching-strategies]].
- **Write-Behind / Write-Back** — асинхронная запись в БД из кэша (батчинг). См. [[caching-strategies]].
