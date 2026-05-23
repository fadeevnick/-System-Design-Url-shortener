---
title: "013 — Distributed Message Queue"
tags: [messaging, kafka, rabbitmq, distributed-systems, streaming]
patterns: [log-structured-storage, event-driven-architecture, dead-letter-queue, consistent-hashing, retry-with-backoff]
difficulty: hard
---

# 013 — Distributed Message Queue

## Source

Alex Xu, *System Design Interview Vol. 2*, Chapter 4. Аналоги: Apache Kafka, RabbitMQ, AWS SQS, Google Pub/Sub, NATS JetStream.

---

## Problem

Спроектировать распределённую очередь сообщений (строим сам брокер, не используем готовый). Должна поддерживать: публикацию / подписку (pub/sub), гарантированную доставку, горизонтальное масштабирование, сохранение на диск. Аналог — Apache Kafka.

---

## Requirements

### Functional

- Producer публикует сообщения в **topic**.
- Consumer подписывается на topic и читает сообщения (pull модель).
- **Consumer groups**: несколько потребителей в группе делят партиции — каждое сообщение достаётся ровно одному из группы.
- Хранение сообщений на диске (configurable retention: по времени или по размеру).
- Гарантия порядка: в пределах партиции.
- **At-least-once delivery** по умолчанию; **exactly-once** как опция.
- DLQ: сообщения, которые не удалось обработать.

### Non-Functional

- Throughput: 1M сообщений/с (пиковый).
- Latency: p99 < 5 ms end-to-end.
- Durability: сообщение сохранено → не теряется при сбое любого одного брокера.
- Scalability: горизонтальное масштабирование добавлением брокеров.

### Scale (back-of-envelope)

| Метрика | Значение |
|---|---|
| Топиков | 1 000 |
| Партиций (avg 10 на топик) | 10 000 |
| Producers | 10 000 |
| Consumers | 10 000 |
| Пиковый throughput | 1M msg/s |
| Avg msg size | 1 KB |
| Пиковая write нагрузка | 1 GB/s |
| С репликацией ×3 | 3 GB/s disk writes |
| Retention | 2 недели |
| Storage | 1 GB/s × 86400 × 14 ≈ **1.2 PB** (raw), ~400 TB с компрессией |

→ Нужен кластер из 100+ брокеров (30 MB/s на брокер — управляемо).

---

## Solution A — Kafka-Like (Pull, Partitioned Log)

### Идея

Каждый topic разбит на партиции. Каждая партиция — append-only [[log-structured-storage|log]] на диске брокера. Consumer сам запрашивает (pull) сообщения с нужного offset. Consumer group: партиции делятся между членами группы — параллелизм без дублирования.

### Architecture

```mermaid
flowchart TD
    ZK[ZooKeeper / KRaft\nметаданные кластера]

    subgraph Brokers
        B1[Broker 1\nLeader: P0, P3]
        B2[Broker 2\nLeader: P1\nFollower: P0]
        B3[Broker 3\nLeader: P2\nFollower: P1, P3]
    end

    P[Producer\npartitioner]
    C1[Consumer 1\nGroup A]
    C2[Consumer 2\nGroup A]
    C3[Consumer 3\nGroup B]
    OS[(Offset Store\nKafka __consumer_offsets)]

    P -->|metadata: который broker = leader P0| ZK
    ZK -->>P
    P -->|produce to Broker1 P0| B1
    B1 -->|replicate| B2
    B1 -->|replicate| B3

    C1 -->|fetch P0 offset=X| B1
    C2 -->|fetch P1 offset=Y| B2
    C3 -->|fetch P0,P1,P2| B1 & B2 & B3

    C1 -->|commit offset| OS
    C2 -->|commit offset| OS
```

### Partition Assignment (Producer)

```python
def partition_for(message, num_partitions):
    if message.key:
        # Ordered delivery: same key → same partition
        return hash(message.key) % num_partitions
    else:
        # Round-robin для равномерного распределения
        return round_robin_counter.increment() % num_partitions
```

Гарантия порядка: все сообщения с одним `key` → одна партиция → строгий порядок.

### Write Path (Producer → Broker)

```
Producer SDK:
  1. Буфер (RecordAccumulator): собирает сообщения в batch
     max.linger.ms=5 (ждём 5 мс) или batch.size=16KB — что наступит раньше
  2. Отправка batch → Leader broker
  3. Leader: append to active segment (sequential write)
  4. Leader → Followers: replicate (async или sync, зависит от acks)
  5. Ответ producer:

  acks=0: fire and forget (no durability)
  acks=1: leader записал (может потеряться при crash до replic.)
  acks=all: все ISR реплики записали ← рекомендуется для durability
```

### ISR (In-Sync Replicas)

```
ISR = подмножество реплик, которые не отстают от leader
    (lag < replica.lag.time.max.ms = 10s по умолчанию)

Leader partition: track ISR set = [broker1, broker2, broker3]

Если broker3 отстаёт (network partition, GC pause):
    ISR → [broker1, broker2]

Commit: сообщение зафиксировано, когда все ISR подтвердили
    (High Watermark = min(ISR offsets))

При failover:
    ZooKeeper / KRaft обнаруживает: leader (broker1) недоступен
    → выбирает нового leader из ISR (broker2)
    → Consumer и Producer получают новый metadata
    → Reconnect к новому leader (< 30s обычно)
```

### Consumer Groups и Offset

```
Topic "orders" (3 партиции P0, P1, P2)
Consumer Group "payments-svc" (2 consumers):
    Consumer A → P0, P1
    Consumer B → P2

При добавлении Consumer C → rebalance:
    Consumer A → P0
    Consumer B → P1
    Consumer C → P2

Offset management:
    Consumer A обработал 100 сообщений из P0:
    COMMIT offset=100 → __consumer_offsets topic

    При restart Consumer A:
    FETCH committed offset for P0 → 100
    Продолжает с offset 100 (at-least-once: может быть overlap если crash перед commit)
```

### Read Path (Consumer ← Broker)

```
Consumer SDK:
  1. FetchRequest: {partition=P0, offset=100, max_bytes=1MB}
  2. Broker: sparse index lookup → file seek → read up to max_bytes
  3. Zero-copy sendfile → Consumer TCP socket
  4. Consumer processes messages
  5. Auto-commit offset (или ручной commit после обработки)

Long-poll: если нет новых данных → брокер держит connection открытым
    до fetch.max.wait.ms=500 или до появления данных
    Снижает polling overhead
```

### Exactly-Once Semantics

```
Проблема:
  Producer отправил batch → broker получил, leader записал → ack timeout
  Producer не знает, записалось ли → retry → дублирует

Решение 1: Idempotent Producer
  producer.id (PID) + sequence_number per partition
  Broker: если (PID, seq) уже видели → discard (не duplicate в log)
  → exactly-once для producer → broker (один hop)

Решение 2: Transactions (cross-partition)
  Producer:
    beginTransaction()
    send(P0, msg1)
    send(P1, msg2)
    send(__consumer_offsets, commit_offset)  ← атомарно!
    commitTransaction()

  Consumer: read_committed isolation → видит только зафиксированные транзакции
  Транзакционный координатор на брокере хранит state (ONGOING/COMMITTED/ABORTED)
  → exactly-once end-to-end (от producer до committed offset)
```

### Log Retention и Compaction

```
По умолчанию (retention.ms=604800000 = 7 дней):
    Старые сегменты удаляются целиком → O(1) cleanup

Log compaction (cleanup.policy=compact):
    Хранить последнее значение для каждого ключа
    Null value = tombstone (delete marker)
    Use case: changelog topics, CDC current state

Tiered Storage (Kafka 3.6+):
    Горячие данные (последние 1-2 часа) → local disk (fast)
    Холодные данные → S3 / GCS (cheap)
    Consumer читает из S3 при запросе старых offset'ов
```

### Pros

- Massive throughput: zero-copy, sequential I/O, batch producer.
- Гибкий replay: consumer читает с любого offset в пределах retention.
- Consumer groups — горизонтальный параллелизм без конфигурации.
- Exactly-once через idempotent producer + transactions.
- Decoupling: consumer lag виден в мониторинге, producer не блокируется.

### Cons

- Pull модель: consumer опрашивает брокер → небольшая дополнительная latency.
- Порядок только в партиции: cross-partition ordering невозможен.
- Consumer rebalance — кратковременная остановка обработки.
- Операционная сложность: ZooKeeper (или KRaft) + broker fleet.

---

## Solution B — RabbitMQ-Like (Push, Exchange Routing)

### Идея

**Exchange** принимает сообщения от producer и маршрутизирует по **binding rules** в одну или несколько **queue**. Consumer подписывается на queue, брокер **push**-ает сообщения. Подтверждение (ack) — consumer сообщает об успешной обработке.

### Exchange Types

| Тип | Маршрутизация | Use case |
|---|---|---|
| **Direct** | routing_key == binding_key | Unicast, task queue |
| **Fanout** | Все привязанные queues | Broadcast (каждая очередь получает копию) |
| **Topic** | Wildcard pattern (`logs.*.error`, `#`) | Routing по categories |
| **Headers** | По заголовкам сообщения | Сложная маршрутизация без routing_key |

### Message Flow

```
Producer → Exchange (routing_key="payment.success")
    │
    ├── Direct binding "payment.success" → Queue: notifications
    │       → Consumer: NotificationService (push, pre-fetch=10)
    │
    └── Topic binding "payment.*" → Queue: audit-log
            → Consumer: AuditService (push, pre-fetch=1)
```

### Acknowledgment

```
Consumer получает сообщение → начинает обработку
    │
    ├── Успех → basic_ack → брокер удаляет из queue
    │
    ├── Ошибка (retryable) → basic_nack(requeue=True) → обратно в queue
    │
    └── Ошибка (permanent) → basic_reject(requeue=False)
            → x-dead-letter-exchange → [[dead-letter-queue]]

prefetch_count: сколько unacked сообщений может быть у одного consumer
    = 1: максимальная fair dispatch, минимальная throughput
    = 100: высокая throughput, неравномерная нагрузка
```

### Pros

- Гибкая маршрутизация через Exchange типы.
- Push модель: минимальная latency (нет polling overhead).
- Acknowledgment → брокер знает, что сообщение обработано (строже, чем offset commit).
- Проще для task queues: round-robin без consumer groups.

### Cons

- Нет нативного replay: сообщение удалено после ack → нельзя перечитать.
- Масштаб ниже: RabbitMQ не держит Kafka-уровень throughput.
- Нет партиционирования → ordering сложнее гарантировать.
- Состояние в памяти: при restart без persistence → потери.

---

## Deep Dives

### Coordinator: ZooKeeper vs KRaft

```
Исторически Kafka использовала ZooKeeper для:
  - Хранения метаданных (кто leader, ISR, partition assignment)
  - Leader election при failover
  - Consumer group coordination

Проблемы ZooKeeper:
  - Отдельный кластер для операций
  - Controller (Kafka) кэширует ZK state → inconsistency при failover
  - Медленный old controller → new controller metadata sync (минуты при 100K партициях)

KRaft (Kafka Raft, Kafka 3.3+):
  - Метаданные хранятся в самом Kafka (специальный __cluster_metadata топик)
  - Raft consensus для election
  - Startup и failover в разы быстрее
  - Устраняет ZooKeeper как dependency
```

### Consumer Rebalance Strategies

```
Eager Rebalance (default до Kafka 2.4):
  1. ALL consumers останавливают чтение (stop-the-world)
  2. Все отзывают партиции
  3. Новый assignment
  4. Все возобновляют чтение
  Downtime: O(consumers × rebalance_timeout)

Cooperative Sticky Rebalance (Kafka 2.4+):
  1. Только затронутые партиции перемещаются
  2. Остальные consumers продолжают работу
  Downtime: минимальный (только мигрирующие партиции)

Static Group Membership:
  consumer.group.instance.id = уникальный ID
  При restart: тот же ID → тот же assignment → нет rebalance
  Use case: stateful consumers (Kafka Streams)
```

### Backpressure

```
Проблема: producer быстрее consumer → очередь растёт → OOM или latency рост

Pull модель (Kafka): естественный backpressure
  Consumer сам решает, когда fetchить
  Producer не знает о состоянии consumer (decoupled)
  Мониторинг: consumer_lag = leader_end_offset - consumer_committed_offset
  Alert: consumer_lag > threshold → масштабируй consumer group

Push модель (RabbitMQ):
  prefetch_count = N → broker не отправляет > N unacked сообщений
  Если consumer медленный → очередь растёт на broker
  Alert: queue_depth > threshold → масштабируй consumers
```

### Message Ordering в Multi-Partition Scenario

```
Проблема: нужен глобальный порядок для entity X

Неправильно: random partition → сообщения X в разных партициях → нет порядка

Правильно: partition_key = entity_id
  hash("order_123") % 10 → partition 4
  Все события order_123 → partition 4 → строгий порядок

Ограничение: один consumer per partition в группе
  → параллелизм ограничен числом партиций
  → если нужно больше параллелизма → больше партиций

Правило: число партиций >= max_consumer_instances_in_group
```

### Monitoring: Key Metrics

```
Producer:
  record-send-rate         # msg/s
  request-latency-avg      # ms (p99 важнее avg)
  record-error-rate        # доля ошибок

Broker:
  bytes-in/out-per-sec     # throughput
  under-replicated-partitions  # должно быть 0; > 0 = alarm
  isr-shrink-rate          # реплика выпала из ISR
  request-handler-avg-idle # % idle; < 20% = перегрузка

Consumer:
  consumer-lag             # отставание от leader
  fetch-rate               # запросы/с
  records-consumed-rate    # msg/s

Alert на under-replicated-partitions > 0 → возможная потеря данных при следующем failover
```

---

## Trade-offs

| Критерий | Solution A (Kafka-like) | Solution B (RabbitMQ-like) |
|---|---|---|
| Throughput | 1M+ msg/s per broker | ~50K msg/s per queue |
| Latency | 5–20 ms (batching) | 1–5 ms (push, no batching) |
| Replay | Да (по offset, в пределах retention) | Нет |
| Ordering | В пределах партиции | Нет (кроме single queue) |
| Routing | По partition key | Exchange types (rich) |
| Delivery semantics | At-least-once; exactly-once опционально | At-least-once (ack) |
| Operational complexity | Высокая (ZK/KRaft + broker cluster) | Средняя |
| **Рекомендация** | Event streaming, high throughput, replay | Task queues, сложная маршрутизация |

---

## Key Takeaways

1. **Sequential write — главная производительность**: append-only log + zero-copy sendfile = 1 GB/s+ на commodity HDD. Никаких random writes в hot path.
2. **Pull vs Push — фундаментальный выбор**: Pull (Kafka) = consumer контролирует темп + естественный backpressure; Push (RabbitMQ) = меньше latency + prefetch_count для backpressure.
3. **ISR — ключ к durability**: acks=all + ISR ≥ 2 → сообщение не теряется при падении одного брокера. `min.insync.replicas=2` — обязательный production параметр.
4. **Exactly-once требует двух компонентов**: idempotent producer (PID + sequence) + транзакции (atomic commit offset). По отдельности — not enough.
5. **Consumer lag — главная метрика здоровья**: lag растёт → consumer не справляется → нужны дополнительные инстансы (max = число партиций).

---

## Open Questions

- **Tiered Storage в production**: когда реально нужен S3 offload (retention > 7 дней) vs просто добавить дисков?
- **Schema Registry**: как управлять эволюцией схем Avro / Protobuf между producer и consumer версиями? Confluent Schema Registry + compatibility checks (BACKWARD / FORWARD / FULL).
- **Multi-tenancy**: изоляция топиков разных команд — по quotas (producer/consumer bandwidth) и ACL.
- **Cross-datacenter replication**: MirrorMaker 2 (Kafka) — репликация топиков между кластерами в разных регионах для DR.

---

## References

- Jay Kreps — *The Log: What every software engineer should know*
- Apache Kafka documentation — Producer, Consumer, Transactions
- [Kafka KRaft Mode documentation](https://kafka.apache.org/documentation/#kraft)
- RabbitMQ — Exchanges, Queues, Bindings
- Martin Kleppmann — *Designing Data-Intensive Applications*, Chapter 11
- [[log-structured-storage]]
- [[dead-letter-queue]]
- [[event-driven-architecture]]
