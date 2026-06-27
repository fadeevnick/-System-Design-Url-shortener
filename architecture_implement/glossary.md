# Glossary

Короткие определения базовых терминов. Пополняется с каждым новым кейсом.

## A

- **ABR (Adaptive Bitrate Streaming)** — техника доставки видео: контент закодирован в нескольких качествах, клиент динамически переключается между ними по состоянию буфера и скорости канала. Стандарты: HLS, MPEG-DASH. See [[adaptive-bitrate-streaming]].
- **AV1** — открытый видеокодек (Alliance for Open Media): примерно на 30% эффективнее H.265 при том же качестве. Используется YouTube и Netflix. Требует дорогого кодирования, но удешевляет передачу.
- **API Gateway** — единая точка входа для клиентских запросов. Отвечает за rate limiting, аутентификацию, авторизацию, метрики и маршрутизацию в downstream-сервисы.
- **At-least-once delivery** — гарантия, что сообщение будет доставлено хотя бы раз. Возможны дубли, поэтому consumer должен быть идемпотентным. См. [[idempotency-key]].

## B

- **Base62 encoding** — кодировка с алфавитом из 62 символов (`a-z`, `A-Z`, `0-9`). Используется для коротких URL и ID; 7 знаков дают `62^7 ≈ 3.5` трлн комбинаций.
- **Bloom Filter** — вероятностная структура для проверки членства в множестве. Гарантирует "точно нет", допускает "возможно есть" (false positives), не допускает false negatives.

## C

- **Cache Stampede (Thundering Herd)** — одновременный промах кэша у множества запросов при истечении TTL, из-за чего все бьют в БД. Решения: singleflight, stale-while-revalidate, probabilistic early expiration. See [[cache-stampede]].
- **Cache-Aside (Lazy loading)** — паттерн кэширования: приложение читает кэш, при промахе идёт в БД и кладёт результат в кэш. См. [[caching-strategies]].
- **Cardinality (TSDB)** — количество уникальных time series. Взрывная кардинальность (`user_id`, `request_id`) быстро убивает TSDB по памяти и индексации.
- **CAS (Content-Addressable Storage)** — схема хранения, в которой адрес объекта равен хэшу его содержимого. Даёт дедупликацию, immutability и проверку целостности. See [[content-addressable-storage]].
- **CDC (Content-Defined Chunking)** — алгоритм нарезки файла на блоки по "естественным" границам контента через rolling hash / Rabin fingerprint. Лучше fixed-size chunking для дедупликации при сдвиге.
- **Celebrity Problem** — ситуация в социальных сетях, когда пользователи с миллионами followers создают write storm при fanout-on-write. Обычно решается hybrid push/pull. См. [[fanout-strategies]].
- **Chargeback** — оспаривание транзакции покупателем через банк. Банк возвращает деньги покупателю, а продавец должен доказать правомерность списания, иначе теряет сумму и платит штраф.
- **Choreography** — стиль координации распределённой системы, где сервисы реагируют на события без центрального координатора. См. [[orchestration-vs-choreography]].
- **Circuit Breaker** — паттерн отказоустойчивости с состояниями Closed, Open и Half-Open. При повторяющихся ошибках быстро блокирует вызовы к проблемному downstream вместо ожидания таймаутов.
- **Consistent Hashing** — техника шардинга на hash ring, при которой добавление или удаление ноды затрагивает только небольшую долю ключей. См. [[consistent-hashing]].
- **Consumer Group (Kafka)** — группа consumer'ов, делящих партиции топика: каждая партиция назначается ровно одному consumer'у внутри группы. Параллелизм ограничен числом партиций.
- **Consumer Lag** — отставание consumer от конца лога: `end_offset - committed_offset`. Рост лага означает, что обработчик не успевает.
- **CQRS** — Command Query Responsibility Segregation: разделение модели записи и модели чтения.
- **Cursor-Based Pagination** — пагинация через cursor (ID, timestamp, composite key), устойчивая к новым вставкам и эффективная для глубоких страниц. См. [[pagination]].

## D

- **DAG (Directed Acyclic Graph) Pipeline** — ориентированный ациклический граф задач с зависимостями. В media/transcoding пайплайнах позволяет распараллеливать независимые этапы.
- **Dead-Letter Queue (DLQ)** — очередь для сообщений, которые не удалось обработать после исчерпания ретраев. Изолирует "токсичные" сообщения и позволяет анализировать их отдельно. See [[dead-letter-queue]].
- **Deadlock** — циклическое ожидание ресурсов, когда процессы блокируют друг друга. Смягчается lock ordering, timeout + release и retry.
- **DKIM (DomainKeys Identified Mail)** — механизм подписи email-заголовков приватным ключом домена; получатель проверяет подпись через DNS.
- **DMARC** — политика обработки писем, которые не прошли SPF и/или DKIM: `none`, `quarantine`, `reject`.
- **Double-Entry Ledger** — модель учёта, где каждая транзакция отражается как debit одного счёта и credit другого на ту же сумму. Баланс системы должен сходиться всегда. See [[double-entry-ledger]].

## E

- **Edge N-Gram** — токенизатор, который разбивает слово на префиксы: `"google" -> ["g", "go", "goo", ...]`. Используется в autocomplete поверх search index.
- **Envelope Encryption** — схема шифрования, в которой данные шифруются data key, а сам data key шифруется master key из KMS.
- **Event bus** — шина событий: брокер, через который сервисы публикуют и получают события.
- **Event-Driven Architecture (EDA)** — архитектурный стиль, в котором компоненты взаимодействуют через события на шине (Kafka, NATS, RabbitMQ). См. [[event-driven-architecture]].
- **Exponential Backoff** — стратегия ожидания между ретраями, где задержка растёт экспоненциально (`base * 2^n`). Обычно используется вместе с jitter. See [[retry-with-backoff]].

## F

- **Fail-closed** — стратегия при отказе зависимости: блокировать запрос. Подходит для критичных сценариев вроде платежей или authz.
- **Fail-open** — стратегия при отказе зависимости: пропускать запрос, как будто проверка прошла. Подходит для части не-критичных read-path сценариев.
- **Fanout-on-Read (Pull)** — модель fanout, при которой сообщение хранится один раз, а лента собирается в момент чтения. Дешёвый write, дорогой read. См. [[fanout-strategies]].
- **Fanout-on-Write (Push)** — модель fanout, при которой сообщение копируется в inbox каждого получателя при записи. Дорогой write, дешёвый read. См. [[fanout-strategies]].
- **Fencing Token** — монотонно возрастающий токен, выдаваемый lock service при каждом новом acquire. Ресурс отклоняет команды с токеном меньше либо равным уже виденному. See [[fencing-token]].
- **Fixed Window** — алгоритм rate limiting со счётчиком на фиксированных окнах времени. Прост, но допускает burst на границе окна. См. [[rate-limiting-algorithms]].
- **Four Golden Signals (Google SRE)** — базовый набор SRE-метрик: Latency, Traffic, Errors, Saturation.

## G

- **Geofencing** — триггер события при входе или выходе объекта из географического полигона или ячейки.
- **Geohash** — Base32-строка, кодирующая `(lat, lng)` через чередование бит широты и долготы. Общий префикс означает пространственную близость, но есть boundary problem. See [[geospatial-index]].
- **GIST Index** — обобщённый поисковый индекс в Postgres. Часто используется PostGIS для spatial queries.
- **Gorilla Compression** — алгоритм сжатия временных рядов: delta-of-delta для timestamp и XOR для значений. Основа многих TSDB. See [[time-series-storage]].
- **gRPC** — RPC-фреймворк поверх HTTP/2 и Protobuf. Часто используется для service-to-service коммуникации.

## H

- **Hash Ring** — структура consistent hashing, в которой и ноды, и ключи мапятся на одно числовое кольцо.
- **Hash Slot (Redis Cluster)** — один из 16384 виртуальных слотов Redis Cluster. Ключ вычисляет слот по `CRC16(key) % 16384`.
- **Haversine Formula** — формула вычисления расстояния между двумя точками на сфере по координатам `(lat, lng)`.
- **HLS (HTTP Live Streaming)** — стандарт Apple для ABR: манифест `.m3u8` плюс сегменты `.ts` / `.m4s`. See [[adaptive-bitrate-streaming]].
- **Hot Key** — ключ с непропорционально высоким трафиком, способный перегрузить один шард кэша. Смягчается L1 cache, replica reads, key splitting. См. [[cache-stampede]].

## I

- **Idempotency Key** — клиентский ключ, по которому сервер дедуплицирует повторные запросы и возвращает тот же результат вместо повторного побочного эффекта. См. [[idempotency-key]].
- **Idempotent operation** — операция, повторное выполнение которой даёт тот же конечный результат, что и однократное.
- **ISR (In-Sync Replicas)** — подмножество реплик Kafka, не отстающих от лидера. Используется для определения, достаточно ли реплик синхронизировались для надёжной записи. См. [[013-distributed-message-queue]].

## J

- **Jitter** — случайный шум, добавляемый к задержке retry, чтобы клиенты не ретраили синхронно. Варианты: Full, Equal, Decorrelated. See [[retry-with-backoff]].

## K

- **Kafka** — распределённый лог-брокер с топиками, партициями, offset-based consumption и сильным throughput на sequential I/O.

## L

- **Lease** — временное право владения ресурсом с автоматическим истечением по TTL. В distributed lock holder должен продлевать lease, пока жив.
- **Leaky Bucket** — алгоритм rate limiting / traffic shaping, в котором запросы "вытекают" из очереди с постоянной скоростью. См. [[rate-limiting-algorithms]].
- **Log-Structured Storage** — модель хранения только через append в конец файла. Даёт быстрые sequential writes и лежит в основе Kafka, WAL и LSM-подобных движков. See [[log-structured-storage]].
- **Long-Lived Connection** — persistent канал client-server, живущий минуты или часы: WebSocket, SSE, gRPC streaming. См. [[long-lived-connections]].
- **LSH (Locality Sensitive Hashing)** — способ быстро находить похожие объекты, размещая похожие fingerprint'ы в одни и те же bucket'ы. См. [[content-deduplication]].
- **LSM Tree (Log-Structured Merge Tree)** — структура key-value storage: writes попадают в MemTable, затем сбрасываются в SSTables и позже compaction-ятся по уровням.

## M

- **Materialized View** — предварительно вычисленное read-оптимизированное представление, хранящееся отдельно от источника и обновляемое по событию, расписанию или pull-механизмом. См. [[materialized-view]].
- **MinHash** — техника оценки Jaccard similarity между множествами через набор минимальных хэшей. См. [[content-deduplication]].

## N

- **Notification Service** — сервис, который получает события и доставляет их пользователям через WebSocket, push, email или SMS.

## O

- **Orchestration** — стиль координации, в котором центральный координатор вызывает сервисы в нужной последовательности. См. [[orchestration-vs-choreography]].
- **Outbox Pattern (Transactional Outbox)** — паттерн надёжной публикации событий: запись в outbox-таблицу происходит в одной транзакции с бизнес-данными, а отдельный publisher пересылает её в брокер. См. [[outbox]].

## P

- **Pagination** — постраничная выдача больших коллекций: offset, cursor или keyset. См. [[pagination]].
- **PCI DSS** — стандарт безопасности индустрии платёжных карт. Запрещает небрежное обращение с PAN и CVV; поэтому карточные данные лучше уводить сразу в PSP-hosted fields.
- **POI (Point of Interest)** — точка интереса на карте: ресторан, магазин, достопримечательность.
- **Presence** — индикатор online-статуса пользователя. Обычно реализуется через heartbeat и Redis с TTL.
- **Presigned URL** — временный URL с подписью, дающий ограниченное право на `PUT` или `GET` в object storage без выдачи клиенту постоянных credentials.
- **PSP (Payment Service Provider)** — провайдер платёжных услуг, например Stripe или Adyen. Принимает карточные данные, проводит авторизацию и settlement.
- **Pub/Sub** — модель `publish/subscribe`, в которой publisher отправляет в topic, а subscribers получают события по подписке.
- **Push vs Pull** — две модели доставки данных между системами: push инициирует отправитель, pull инициирует получатель.

## R

- **Rate Limiting** — ограничение числа запросов или событий за интервал времени для защиты от перегрузки и abuse. См. [[rate-limiting-algorithms]].
- **Read-Through** — паттерн кэширования, при котором кэш сам подтягивает данные из БД при промахе, а приложение работает только с кэшем. См. [[caching-strategies]].

## S

- **Saga** — распределённая транзакция как цепочка локальных транзакций с компенсациями при сбое. См. [[saga]].
- **Server-Sent Events (SSE)** — HTTP-протокол server-to-client push потока. Односторонний, простой, с автоматическим reconnect. См. [[long-lived-connections]].
- **Session-Stable Ranking** — при ranked feed заморозка ranking на время сессии, чтобы новые элементы не "сдвигали" страницы пользователя.
- **Sharding** — горизонтальное разбиение данных между несколькими storage-нодами по shard key.
- **SimHash** — fingerprint-техника, в которой похожие документы имеют близкие hash'и по Hamming distance. См. [[content-deduplication]].
- **Skip List** — вероятностная структура данных из нескольких уровней связных списков, дающая `O(log N)` поиск, вставку и удаление. Используется в Redis ZSET.
- **Sliding Window** — алгоритм rate limiting с подвижным окном, который лучше контролирует burst на границе окна. См. [[rate-limiting-algorithms]].
- **Snowflake ID** — 64-битный распределённый ID Twitter-стиля: timestamp + machine_id + sequence.
- **Sorted Set (ZSET)** — структура Redis: уникальные members и числовой score, отсортированные по score. Основной инструмент для лидербордов и sliding-window rate limiting. See [[sorted-set-index]].

## T

- **Ticket Server** — централизованный сервис, выдающий монотонно растущие ID, часто диапазонами. Удобен как источник sequential identifiers.
- **Token Bucket** — алгоритм rate limiting, в котором ведро содержит токены, пополняемые с постоянной скоростью. Разрешает burst до ёмкости ведра. См. [[rate-limiting-algorithms]].
- **Top-K per node (Trie)** — оптимизация trie, в которой каждый узел хранит precomputed список лучших K завершений. См. [[trie-prefix-index]].
- **Trending Query** — запрос, у которого velocity за короткое окно резко выше baseline. Часто добавляется в autocomplete через fast-path поверх основного индекса.
- **Trie (Prefix Tree)** — дерево, в котором путь от корня до узла представляет префикс строки. Даёт `O(P)` lookup по длине префикса. See [[trie-prefix-index]].

## U

- **ULID / KSUID** — sortable идентификаторы с timestamp-компонентом и случайным хвостом. Лучше классического UUID v4 для B-tree индексов.
- **URL Frontier** — двухуровневая очередь web crawler'а: front queues по приоритету и back queues по host'ам с соблюдением politeness. См. [[url-frontier]].

## V

- **Virtual Node (vnode)** — виртуальная точка на hash ring, представляющая физическую ноду много раз для выравнивания распределения ключей. См. [[consistent-hashing]].

## W

- **Webhook** — HTTP callback от одной системы к другой при возникновении события. Это push-модель доставки.
- **WebSocket** — двунаправленный протокол поверх TCP/HTTP, удобный для realtime уведомлений и interactive apps.
- **Write-Behind / Write-Back** — стратегия, при которой запись сначала попадает в кэш, а в БД уходит асинхронно, часто батчами. См. [[caching-strategies]].
- **Write-Through** — стратегия, при которой запись синхронно уходит и в кэш, и в БД. См. [[caching-strategies]].
