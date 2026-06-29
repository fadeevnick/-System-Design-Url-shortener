---
name: fencing-token
title: Fencing Token
category: consistency
aliases: [sequencer, epoch-token]
tags: [distributed-systems, concurrency, safety, locks, consistency]
related: [idempotency-key, double-entry-ledger]
---

# Fencing Token

## What

Монотонно возрастающий токен, выдаваемый сервисом блокировки при каждом успешном acquire. Клиент передаёт токен в каждый запрос к защищаемому ресурсу. Ресурс отклоняет запросы с токеном ≤ уже виденного — **stale lock holder не может навредить**.

Решает проблему, которую не решает сам distributed lock: клиент взял блокировку, завис (GC pause, network partition), блокировка истекла, другой клиент взял новую блокировку — и теперь оба думают, что держат lock.

## Why

Distributed locks с TTL не дают абсолютной гарантии взаимного исключения:

```
T=0:  Client A получает lock, fencing_token=33
T=1:  Client A начинает запись в storage
T=2:  Client A уходит в GC pause (stop-the-world)
T=15: Lock TTL истекает (10 секунд)
T=16: Client B получает lock, fencing_token=34, начинает запись
T=30: Client A просыпается из GC, продолжает запись с stale token=33

Без fencing: Client A перезапишет данные Client B → data corruption
С fencing:   Storage видит token=33 < last_seen=34 → reject Client A → safe
```

## When to use

- Любая операция write под distributed lock (файловое хранилище, БД, shared resource).
- Idempotent writes с ordering requirements.
- Leader election: лидер передаёт term/epoch в каждую команду.

**Когда НЕ нужен:**

- Read-only операции (stale read — допустимо в eventual consistency).
- Optimistic concurrency (compare-and-swap) заменяет и lock, и fencing token.

## How

### Протокол

```
1. Client → Lock Service: ACQUIRE lock_name
   Lock Service → Client: {lock_id, fencing_token=34, ttl=10s}

2. Client → Storage: WRITE data {fencing_token=34, ...}
   Storage:
     if fencing_token > last_seen_token:
         execute write
         last_seen_token = 34
         return OK
     else:
         return REJECTED (stale token)

3. При lock renewal:
   Client → Lock Service: RENEW lock_name, lock_id
   Lock Service → Client: {fencing_token=34 (same), extended_ttl}
   (токен не меняется при renewal, только при новом acquire)
```

### Реализация в хранилище

```sql
-- В таблице ресурса хранить last_fencing_token
ALTER TABLE shared_resource
  ADD COLUMN last_fencing_token BIGINT DEFAULT 0;

-- Write с проверкой fencing:
UPDATE shared_resource
SET data = $1,
    last_fencing_token = $2
WHERE id = $3
  AND last_fencing_token < $2;  -- reject if token <= current

-- Если UPDATE affected_rows = 0 → fencing rejection
```

```python
# Redis версия (Lua script — атомарность)
COMPARE_AND_WRITE = """
local current = tonumber(redis.call('GET', KEYS[1] .. ':fence') or '0')
local token = tonumber(ARGV[1])
if token > current then
    redis.call('SET', KEYS[1], ARGV[2])
    redis.call('SET', KEYS[1] .. ':fence', ARGV[1])
    return 1
else
    return 0  -- rejected: stale token
end
"""
```

### Монотонность токена

Токен должен **строго** возрастать:
- ZooKeeper: `zxid` (transaction ID) — глобально монотонный, встроен в API.
- etcd: `revision` — версия в key-value store, монотонно растёт.
- Redis / custom: счётчик `INCR lock_token_counter` — атомарный, монотонный.
- Database: `SERIAL` / sequence — монотонный per sequence.

### Связь с Leader Election

```
В Raft / Paxos:
  term / epoch / ballot number = fencing token

При смене лидера (new election):
  Новый лидер получает term=N+1
  Старый лидер (сетевой partition → воссоединился) имеет term=N
  Follower: reject любую команду с term < current_term

Это и есть fencing token — только называется "term" или "epoch"
```

## Diagram

```
Lock Service
  fencing_counter = 33 initially

T=0: Client A: ACQUIRE → fencing_token=34, TTL=10s
T=5: Client A: GC pause
T=15: TTL expired
T=16: Client B: ACQUIRE → fencing_token=35, TTL=10s
T=16: Client B: WRITE {token=35} → Storage accepts, stores max_token=35
T=30: Client A: wakes up
T=30: Client A: WRITE {token=34} → Storage: 34 < 35 → REJECTED ✓

Data integrity preserved.
```

## Pitfalls

- **Хранилище не проверяет токен** — fencing token бесполезен если storage не enforcement. Самая частая ошибка: выдаём токен, но не проверяем на стороне ресурса.
- **Токен не монотонен** — UUID или random token не гарантирует порядок → не подходит.
- **Overflow** — BIGINT (INT64): 9.2 × 10^18 значений. При 1M locks/s = 292K лет до overflow. Не проблема.
- **Distributed counter не является serial** если не используешь single-writer (Redis INCR на одной ноде, ZooKeeper zxid). Multi-node counter без consensus ≠ монотонный.

## Variations

- **Optimistic Locking / CAS**: `UPDATE ... WHERE version = $old_version` — не нужен отдельный lock service. Версия записи = fencing token. Compare-and-swap.
- **ETag / If-Match**: HTTP-уровень fencing: `PUT /resource -H "If-Match: etag_value"`. S3 использует это.
- **Vector Clock**: для multi-writer systems с partial order (нет total order). Сложнее.

## Used in case studies

- [[017-distributed-lock]] — основная защита от stale lock holders
- [[012-payment-system]] — idempotency key как partial fencing token
- [[013-distributed-message-queue]] — Kafka consumer epoch при rebalance

## References

- Martin Kleppmann — *Designing Data-Intensive Applications*, Chapter 8
- Martin Kleppmann — *How to do distributed locking* (blog post, 2016) — критика Redlock + fencing token
- ZooKeeper documentation — Sequential Ephemeral Nodes
- Google Chubby — lock service with sequencer (= fencing token)
