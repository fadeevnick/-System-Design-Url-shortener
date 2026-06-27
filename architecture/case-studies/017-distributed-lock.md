id: 017
title: Distributed Lock
source: Alex Xu, *System Design Interview Vol. 2*, Chapter 8. Аналоги: Redis Redlock, ZooKeeper locks, etcd lease, Google Chubby.
domain: infrastructure
tags: [distributed-systems, concurrency, locking, redis, zookeeper, etcd]
patterns: [fencing-token, idempotency-key, retry-with-backoff]
difficulty: hard
---

# 017 — Distributed Lock

## Source

Alex Xu, *System Design Interview Vol. 2*, Chapter 8. Аналоги: Redis Redlock, ZooKeeper locks, etcd lease, Google Chubby.

---

## Problem

В распределённой системе несколько процессов/нод конкурентно обращаются к одному ресурсу. Необходим механизм взаимного исключения — **distributed lock** — который:
- Гарантирует, что в каждый момент времени только один holder выполняет критическую секцию.
- Автоматически освобождается при падении holder'а (TTL/lease).
- Устойчив к network partition и clock drift.

---

## Requirements

### Functional

- `acquire(lock_name, ttl)` → lock_id + fencing_token | timeout.
- `release(lock_name, lock_id)` → OK | not_owner.
- `renew(lock_name, lock_id)` → extended_ttl | expired.
- Auto-release при падении holder'а (через TTL/lease).
- Fencing token: монотонно растущий, передаётся в защищаемый ресурс.

### Properties

По CAP/PACELC распределённые блокировки — это задача consistency:

- **Safety (mutex)**: в один момент не более одного holder'а.
- **Liveness**: lock в итоге освобождается (holder умер → TTL истёк).
- **Fault tolerance**: Lock Service остаётся доступным при отказе части нод.

*Нельзя гарантировать все три свойства одновременно в асинхронной сети.*
Выбор: безопасность (safety) важнее liveness.

### Non-Functional

- Acquire latency: p99 < 10 ms.
- Lock Service availability: 99.99%.
- Throughput: 10 000 concurrent locks.

---

## Solution A — Redis-Based Lock

### Простой вариант: Single-Node

```redis
-- Acquire:
SET lock:{name} {unique_value} NX PX {ttl_ms}
-- NX: только если не существует
-- PX: TTL в миллисекундах
-- unique_value = UUID (чтобы только владелец мог освободить)

-- Release (Lua script — атомарно):
if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
else
    return 0
end

-- Renewal:
if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("PEXPIRE", KEYS[1], ARGV[2])
else
    return 0
end
```

**Почему Lua script для release?**
```
Без Lua:
  1. GET lock → "my-uuid" ✓
  2. (другой процесс: lock TTL expired → новый holder взял lock)
  3. DEL lock → удалили чужой lock! ← race condition

Lua script: GET + DEL = атомарная операция → нет race
```

**Почему unique_value?**
```
Без unique_value:
  1. Client A держит lock
  2. TTL истёк → Client A ещё жив, думает что держит lock
  3. Client B взял lock
  4. Client A делает DEL → удалил lock Client B!

С unique_value = UUID каждого acquire:
  Client A пытается DEL → GET возвращает UUID Client B ≠ UUID Client A → 0
```

### Redlock: Multi-Node для Fault Tolerance

Проблема single-node: Redis нода упала → все lock'и недоступны.

**Redlock (Antirez, 2016)**: acquire на большинстве (N/2+1) из N независимых Redis нод.

```
N = 5 нод (независимые, без репликации между собой)
Quorum = 3

Acquire:
  t_start = now_ms()
  acquired_count = 0
  for node in redis_nodes:
      ok = node.SET(lock_name, uuid, NX, PX=ttl_ms)
      if ok: acquired_count++
  
  t_elapsed = now_ms() - t_start
  validity_time = ttl_ms - t_elapsed - clock_drift_factor
  
  if acquired_count >= 3 AND validity_time > 0:
      return Lock(uuid, fencing_token, validity_time)
  else:
      # Release partial locks
      for node in redis_nodes:
          node.eval(RELEASE_SCRIPT, lock_name, uuid)
      return TIMEOUT

Release:
  for node in redis_nodes:
      node.eval(RELEASE_SCRIPT, lock_name, uuid)
```

### Watchdog / Auto-Renewal

```python
class DistributedLock:
    def __init__(self, redis, name, ttl_ms=10000):
        self.redis = redis
        self.name = name
        self.ttl_ms = ttl_ms
        self.uuid = str(uuid4())
        self._watchdog = None

    def acquire(self, timeout_ms=5000):
        deadline = time_ms() + timeout_ms
        while time_ms() < deadline:
            ok = self.redis.set(f"lock:{self.name}", self.uuid,
                                nx=True, px=self.ttl_ms)
            if ok:
                self._start_watchdog()
                return True
            sleep(0.05)  # 50ms retry interval
        return False

    def _start_watchdog(self):
        # Background thread: продлевает lock каждые ttl/3
        def watchdog():
            while self._held:
                sleep(self.ttl_ms / 3000)
                self._renew()
        self._watchdog = Thread(target=watchdog, daemon=True)
        self._watchdog.start()

    def release(self):
        self._held = False
        self.redis.eval(RELEASE_SCRIPT, 1, f"lock:{self.name}", self.uuid)
```

Watchdog: если holder живёт дольше TTL → продлевает автоматически. Если holder умирает → поток тоже умирает → lock истекает по TTL.

### Fencing Token с Redis

```redis
-- Глобальный счётчик для fencing:
INCR lock_token_counter
→ монотонно возрастающий integer

-- Acquire возвращает:
{lock_id: uuid, fencing_token: 42, valid_for_ms: 9800}

-- Holder передаёт token в каждый write:
WRITE resource {fencing_token: 42, data: ...}
→ resource проверяет: 42 > last_seen_token → accept
```

### Pros

- Простота: Redis SET NX + Lua — понятный, малый код.
- Latency: < 1 ms (in-memory).
- Redlock: fault-tolerant при падении < N/2 нод.
- Watchdog предотвращает TTL expiry для живых holder'ов.

### Cons (Критика Redlock — Kleppmann, 2016)

```
Проблема 1: Clock drift
  Redis использует system clock для TTL.
  Если clock прыгает (NTP step correction, VM suspend/resume)
  → lock expires раньше чем ожидалось
  → два holder'а одновременно думают, что держат lock

Проблема 2: GC pause / network delay
  T=0:  Client A получает lock, fencing_token=33
  T=1:  Client A уходит в long GC pause (10 секунд)
  T=10: TTL истекает
  T=11: Client B получает lock, fencing_token=34
  T=11: Client B начинает critical section
  T=12: Client A просыпается, думает что держит lock (не знает о expiry)
  → два holder'а! Нарушение safety.

Решение: Fencing Token на стороне ресурса (см. [[fencing-token]])
  Client A с token=33 → resource отклоняет (already seen 34)
  Safety восстановлена, но только если ресурс проверяет токен.
```

Вывод: Redis lock — **не строгий** distributed mutex. Для большинства use cases (rate limiting, deduplication) достаточно. Для банковских операций, критичных writes — нужны ZooKeeper или etcd.

---

## Solution B — ZooKeeper / etcd (Consensus-Based)

### ZooKeeper Ephemeral Sequential Nodes

```
Lock protocol на ZooKeeper:

1. Создать ephemeral sequential node:
   CREATE /locks/my_lock- (EPHEMERAL SEQUENTIAL)
   → /locks/my_lock-0000000042

2. Получить список детей:
   GETCHILDREN /locks/

3. Если мой node — наименьший → я держу lock

4. Иначе: установить WATCH на предшествующий node
   (тот, чей sequence на 1 меньше моего)

5. При удалении predecessor node → просыпаемся → goto 2

Release:
  DELETE /locks/my_lock-0000000042
  → ZooKeeper уведомляет следующего в очереди

Auto-release:
  Ephemeral node → удаляется автоматически при disconnect сессии
  ZooKeeper session timeout = heartbeat timeout (3–30 s)
```

### Почему Ephemeral Sequential, а не просто один node?

```
Простой lock (один node /locks/my_lock):
  Проблема: при смерти holder'а все waiters пытаются создать node → herd effect

Sequential + watch predecessor:
  N ожидающих клиентов → каждый watches только одного предшественника
  Освобождение lock → ровно один клиент просыпается → no herd effect
  Fairness: FIFO порядок (sequential numbers)
```

### etcd Lease-Based Lock

```python
# etcd v3 с python-etcd3
import etcd3

etcd = etcd3.client()

# 1. Создать lease (TTL)
lease = etcd.lease(ttl=10)  # 10 секунд

# 2. Попытаться записать с условием (compare-and-swap)
lock_key = "/locks/my_resource"
success, _ = etcd.transaction(
    compare=[etcd.transactions.create(lock_key) == 0],  # ключ не существует
    success=[etcd.transactions.put(lock_key, "holder_id", lease=lease)],
    failure=[]
)

if success:
    # Держим lock, продлеваем lease
    def keep_alive():
        while holding:
            etcd.refresh_lease(lease)
            sleep(3)

# 3. Release
etcd.revoke_lease(lease)  # lease expiry → key deleted automatically
```

**etcd vs ZooKeeper:**

| | ZooKeeper | etcd |
|---|---|---|
| Consensus | ZAB (ZooKeeper Atomic Broadcast) | Raft |
| API | Tree (znodes) | Flat KV |
| Watch | Один event (не streaming) | Streaming watch |
| Lease | Session timeout (coarse) | Per-key TTL (fine-grained) |
| Language | Java | Go |
| K8s | Old coordination | Native (etcd = K8s backbone) |

### Fencing Token в ZooKeeper

```
ZooKeeper zxid (transaction ID) — глобально монотонный счётчик.
Каждая транзакция в ZooKeeper имеет уникальный zxid.

При создании lock node:
  stat = zk.create("/locks/my_lock-", ephemeral=True, sequence=True)
  fencing_token = stat.czxid  # Creation transaction ID — монотонный

Holder передаёт czxid в каждый write к ресурсу.
Google Chubby называет это "sequencer" — то же самое.
```

### Pros

- **Строгая гарантия**: ZAB / Raft = linearizable. Нет проблем с clock drift.
- Ephemeral node = автоматическое освобождение при смерти клиента.
- Fairness (ZK sequential nodes = FIFO queue).
- Встроенный watch / notification.

### Cons

- Latency: 5–20 ms (consensus round-trip vs < 1 ms Redis).
- Operational сложность: ZooKeeper/etcd кластер требует 3–5 нод и ухода.
- ZooKeeper: session timeout → осторожно с JVM GC pauses.
- etcd: рекомендуется ≤ 8 GB данных; не для хранения, только для coordination.

---

## Deep Dives

### Lock Granularity

```
Слишком крупный lock (lock entire table):
  lock("payments")  → всё стоит пока один клиент в critical section
  Throughput: 1 критическая секция за раз → масштабируется плохо

Слишком мелкий lock (lock per field):
  lock("payment:123:status")  → много lock'ов → overhead
  Deadlock risk: A держит lock X, ждёт Y; B держит Y, ждёт X

Правило: lock на entity level (payment:123), не на таблицу и не на поля
  lock("payment:123")  → только один поток обрабатывает payment 123
  Другие payment ID → параллельно
```

### Deadlock Prevention

```
Deadlock: A ждёт B, B ждёт A (circular dependency)

Prevention 1: Lock ordering
  Всегда acquire locks в одном порядке:
  lock_ids_sorted = sorted([lock_a, lock_b])
  for lock_id in lock_ids_sorted:
      acquire(lock_id)
  → circular dependency невозможна

Prevention 2: Timeout + retry
  acquire(lock, timeout=100ms) → если timeout → release все → retry
  Deadlock → liveness через timeout

Prevention 3: Avoid holding multiple locks
  Architectural: спроектировать так, чтобы одна операция = один lock
```

### Reentrant Locks

```
Reentrant: один и тот же holder может acquire тот же lock повторно

Реализация:
  lock value = {holder_id, reentrant_count}
  
  Acquire:
    current = GET lock:name
    if current.holder_id == my_id:
        INCR lock:name:count  → reentrant acquire
    elif current == nil:
        SET lock:name {my_id, count=1} NX PX ttl
    else:
        wait / fail

  Release:
    if GET lock:name:count > 1:
        DECR lock:name:count  → уменьшаем глубину
    else:
        DEL lock:name  → полное освобождение

Use case: рекурсивные алгоритмы, когда один сервис
вызывает сам себя через общий ресурс
```

### Когда НЕ использовать Distributed Lock

```
Distributed lock — дорогой инструмент. Часто есть лучшие альтернативы:

1. Optimistic Concurrency (CAS):
   Вместо lock: CHECK-AND-SET
   UPDATE payments SET status='processing', version=version+1
   WHERE id=123 AND version=42 AND status='pending'
   → если affected_rows=0: кто-то обогнал → retry
   Лучше когда: конкуренция низкая, операция идемпотентна

2. Idempotency Key:
   Дублирование запроса → идемпотентный результат
   Не нужен lock, нужна дедупликация ([[idempotency-key]])
   Лучше когда: проблема — дублирование, не race condition

3. Queue Serialization:
   Вместо concurrent access → сериализовать через очередь
   Один worker на partition → нет конкуренции на данном entity
   Kafka: все события order:123 → одна партиция → один consumer
   Лучше когда: write-heavy, high contention, ordered processing важен

4. CRDT (Conflict-free Replicated Data Type):
   Структуры данных, конфликты которых разрешаются автоматически
   (counters, sets, maps с defined merge semantics)
   Лучше когда: eventual consistency допустима, нет strong ordering

Lock нужен когда:
  - Критическая секция НЕ идемпотентна (без идемпотентности CAS не помогает)
  - Нужна эксклюзивность для внешнего ресурса (API, legacy DB)
  - Leader election (один лидер в кластере)
```

### Leader Election as Distributed Lock

```
Leader election = специальный случай distributed lock:
  lock_name = "leader"
  Кто держит lock → лидер

Дополнительно:
  - Lock value = leader's address (другие ноды могут найти лидера)
  - Fencing token = term/epoch
  - При смене лидера: новый epoch → старые команды rejected

Примеры:
  ZooKeeper: Kafka controller election, HBase master election
  etcd: Kubernetes controller-manager, scheduler election
  Redis: простые single-DC leader election
```

### Fairness и Starvation

```
Unfair lock (Redis SET NX + retry):
  Все waiters опрашивают (polling) с random jitter
  Возможно starvation: один клиент всегда успевает быстрее

Fair lock (ZooKeeper sequential):
  FIFO очередь: кто первый создал node → первый получит lock
  Нет starvation, гарантирован прогресс

Для большинства use cases unfair lock достаточен.
Fair lock нужен для: scheduling jobs, job queue fairness.
```

---

## Trade-offs

| Критерий | Redis (Redlock) | ZooKeeper | etcd |
|---|---|---|---|
| Latency | < 1 ms | 5–20 ms | 5–10 ms |
| Safety guarantee | Weak (clock drift) | Strong (ZAB) | Strong (Raft) |
| Fault tolerance | N/2+1 Redis nodes | 3–5 ZK nodes | 3–5 etcd nodes |
| Fencing token | Manual (INCR counter) | Built-in (zxid) | Built-in (revision) |
| Operational cost | Low (Redis уже есть) | High (ZK cluster) | Medium (K8s имеет etcd) |
| Fairness | No (poll-based) | Yes (FIFO) | No (CAS-based) |
| **Рекомендация** | Soft mutual exclusion, деduplication | Strong coordination, leader election | K8s environments, lease-based |

---

## Key Takeaways

1. **Distributed lock с TTL ≠ строгий mutex**: GC pause + TTL expiry = два holder'а одновременно. [[fencing-token]] на стороне ресурса — единственное надёжное решение.
2. **Watchdog обязателен для долгих операций**: holder, живущий дольше TTL, должен продлевать lock. Без watchdog — lock истекает, другой клиент входит в critical section.
3. **Redis lock — soft guarantee, ZooKeeper/etcd — hard guarantee**: для deduplication, rate limiting, кэш прогрева — Redis достаточен. Для leader election, финансовых операций — нужен consensus.
4. **Часто lock не нужен**: optimistic concurrency (CAS), idempotency key, queue serialization решают 80% задач без distributed lock overhead.
5. **Deadlock prevention через ordering**: если нужны несколько locks — всегда в одном порядке. Лучше: архитектурно избегать multiple locks в одной операции.

---

## Open Questions

- **Distributed lock vs database SELECT FOR UPDATE**: Postgres advisory locks (`pg_try_advisory_lock`) — простая альтернатива для систем уже на Postgres. Нет отдельного сервиса, но привязка к DB.
- **Session-based ZK lock и JVM GC**: ZooKeeper session timeout = 30s по умолчанию. JVM GC pause > 30s → session expired → lock released пока holder жив. Решение: низкий GC pause (G1GC tuning) или перейти на etcd.
- **Lock contention monitoring**: `lock_wait_time_ms`, `lock_contention_rate` — без этих метрик неизвестно, является ли lock bottleneck'ом.

---

## References

- Alex Xu, *System Design Interview Vol. 2*, Chapter 8
- Martin Kleppmann — *How to do distributed locking* (2016) — критика Redlock
- Antirez — *Is Redlock safe?* (2016) — ответ Kleppmann
- Martin Kleppmann — *Designing Data-Intensive Applications*, Chapter 8
- Apache ZooKeeper — Recipes: Distributed Lock
- etcd documentation — Distributed locks
- Google Chubby — *The Chubby lock service for loosely-coupled distributed systems* (2006)
- [[fencing-token]]
- [[idempotency-key]]
- [[retry-with-backoff]]
