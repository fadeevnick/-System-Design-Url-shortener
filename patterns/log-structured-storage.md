---
title: Log-Structured Storage
tags: [storage, performance, kafka, databases, append-only]
related: [event-driven-architecture, dead-letter-queue, content-addressable-storage]
---

# Log-Structured Storage

## What

Подход к хранению данных, при котором все записи добавляются только в конец (append-only log). Никаких random writes. Чтение — по offset. Используется в Kafka (message log), Cassandra / RocksDB (LSM tree), PostgreSQL WAL, LMDB.

Ключевое свойство: **sequential writes** многократно быстрее random writes на любом типе носителя (HDD: 100× быстрее; NVMe SSD: 5–10×).

## Why

- **Sequential I/O**: современные HDD дают 200 MB/s sequential vs 1 MB/s random (100×). SSD тоже выигрывает.
- **OS Page Cache**: sequential reads = prefetching. Kafka вообще не читает данные в JVM heap — OS page cache делает всё.
- **Immutability**: append-only = нет проблем с concurrent writers (один appender, много readers по offset).
- **Replication-friendly**: логи легко реплицировать: follower просит "дай мне с offset X" → leader отдаёт поток.

## When to use

- Message brokers (Kafka, Pulsar, NATS JetStream).
- Write-ahead log (WAL) в любой ACID БД.
- LSM-tree хранилища (Cassandra, RocksDB, LevelDB).
- Event sourcing store.
- Time-series данные (метрики, логи).

**Когда НЕ использовать:**

- Частые random reads по ключу без индекса — нужен B-tree.
- Малый объём данных — overhead сегментации не нужен.

## How

### Структура партиционированного лога

```
Topic "orders" → 3 партиции

Partition 0:
  segment_000.log   [offset 0 .. 999 999]
  segment_001.log   [offset 1 000 000 .. 1 999 999]
  segment_002.log   [offset 2 000 000 .. current]  ← active segment

  segment_000.index [sparse index: offset → file position]
  segment_000.timeindex [timestamp → offset]
```

Каждое сообщение имеет:
```
[offset: 8B] [timestamp: 8B] [size: 4B] [crc32: 4B] [payload: N bytes]
```

**Active segment** — открыт для записи. Все остальные — immutable, могут быть read-only mmap.

### Zero-Copy Read (sendfile)

Обычный read path:
```
Disk → OS Page Cache → Kernel Buffer → User Space (JVM) → Kernel Socket Buffer → Network
         (4 copies, 2 context switches)
```

Zero-copy с `sendfile(2)`:
```
Disk → OS Page Cache → Network (via DMA)
         (0 copies to user space, 1 context switch)
```

Kafka использует `FileChannel.transferTo()` (Java NIO) → OS `sendfile`. Это главная причина, почему Kafka держит 1 GB/s+ на commodity hardware.

### Segment Rollover

```
Условия создания нового сегмента:
  1. Размер активного сегмента > log.segment.bytes (default 1 GB)
  2. Время с создания сегмента > log.roll.hours (default 7 дней)

При rollover:
  old segment → close, flush, fsync
  new segment → open (empty)

Retention cleanup (background):
  log.retention.bytes: удалять старые сегменты если суммарный размер > X
  log.retention.ms:    удалять сегменты старше T

Удаление: целыми сегментами (не побайтово) → дешевое O(1) rm
```

### Sparse Index

Индексировать каждый байт — дорого. Sparse index: каждые N байт (default 4096) → запись {offset, file_position}.

```
Lookup для offset 1 500 042:
  1. Binary search в segment_001.index: найти ближайший offset ≤ 1 500 042
  2. Seek to file_position
  3. Linear scan forward до нужного offset
  4. Вернуть payload

Весь index помещается в память (~10 MB для 1 GB сегмента → 0.01%)
```

### Log Compaction

Альтернатива retention-by-time/size: **log compaction** — хранить последнее значение для каждого ключа, удалять устаревшие.

```
До compaction:
  [offset=0, key=user_1, val={"name":"Alice"}]
  [offset=1, key=user_2, val={"name":"Bob"}]
  [offset=2, key=user_1, val={"name":"Alicia"}]  ← новее
  [offset=3, key=user_2, val=null]               ← tombstone (delete)

После compaction:
  [offset=2, key=user_1, val={"name":"Alicia"}]
  (user_2 удалён через tombstone)
```

Используется для: changelog topics (Kafka Streams state), CDC (Debezium snapshot), event sourcing current state.

### LSM Tree (Log-Structured Merge Tree)

Расширение идеи лога для key-value storage (RocksDB, Cassandra):

```
Writes → MemTable (sorted in RAM)
    │ flush when full
    ↓
SSTable L0 (sorted, immutable, on disk)
    │ merge when too many L0
    ↓
SSTable L1 → L2 → ... (larger, more sorted)

Compaction: фоновый процесс мёрджит SSTables, удаляет tombstones

Read path: MemTable → L0 → L1 → ... (Bloom filter per SSTable)
```

Bloom filter на каждом SSTable: O(1) проверка «ключ точно отсутствует» → не читать SSTable если ключ точно не там.

## Diagram

```
Producer
  │
  ▼ append
Partition Log (active segment)
  ┌─────────────────────────────────────────────────┐
  │ off=0 │ off=1 │ off=2 │ ... │ off=N (current)  │
  └─────────────────────────────────────────────────┘
                                          ↑ write position

Consumer A (offset=5):
  read [5..N] → sequential read, zero-copy

Consumer B (offset=100):
  read [100..N] → sparse index → seek → sequential

Replication:
  Follower: "give me since offset X"
  Leader: sequential read from offset X → send stream
  → Follower appends to its own log
```

## Pitfalls

- **fsync на каждое сообщение** — catastrophic performance. Kafka буферизирует и fsync по batch или timeout (`log.flush.interval.ms`). Допустимо: OS page cache + replication = durability.
- **Неограниченный рост** — нужна retention policy (time или size). Без неё диск кончится.
- **Compaction и availability** — во время compaction возможны latency spikes. Нужно rate-limiting для compaction I/O.
- **Random read по ключу** — лог не для этого. Нужен отдельный индекс (Kafka → consumer reads sequentially; для random lookup → внешний KV store).

## Variations

- **Kafka / Pulsar / NATS JetStream** — message broker на основе лога.
- **PostgreSQL WAL** — write-ahead log для crash recovery и репликации.
- **SQLite WAL mode** — append-only WAL для concurrent readers.
- **Apache Parquet** — колоночный формат, immutable файлы на S3 (аналитика).

## Used in case studies

- [[013-distributed-message-queue]] — основа архитектуры Kafka-like брокера

## References

- Jay Kreps — *The Log: What every software engineer should know* (LinkedIn Engineering Blog)
- Apache Kafka — Log Compaction documentation
- LevelDB/RocksDB — LSM Tree implementation
- Patrick O'Neil et al. — *The Log-Structured Merge-Tree (LSM-Tree)* (1996)
