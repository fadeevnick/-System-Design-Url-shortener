---
name: id-generation
category: data
aliases: [unique-id, distributed-id]
---

# ID Generation Strategies

## What

Способы генерации уникальных идентификаторов для записей в распределённой системе: какие свойства гарантируются (уникальность, ordering, distributed-friendly), и какой ценой.

## Why / Problem it solves

В одной БД auto-increment работает — счётчик в одной транзакционной системе. В распределённой системе появляются вопросы:
- Как сгенерировать ID, гарантированно уникальный между N инстансами?
- Должен ли он быть **sortable** (по времени)?
- Можно ли его **угадать**?
- Нужна ли **координация** между нодами при генерации?
- Какой **размер** допустим в индексах БД?

Выбор стратегии — компромисс между этими свойствами.

## Strategies

### 1. Auto-increment Counter (single source)

`SERIAL` / `AUTO_INCREMENT` в одной БД, либо атомарный `INCR` в Redis, либо отдельный Ticket Server.

- **Размер:** малый (4–8 байт).
- **Sortable:** да (sequential).
- **Координация:** один источник правды → bottleneck.
- **Угадываемость:** высокая (раскрывает темп роста).
- **Когда:** маленький / средний masштаб, не страшна угадываемость.

### 2. Ticket Server / Range-based

Worker обращается к центральному сервису, получает диапазон (например, IDs `1_000_000..1_001_000`) и раздаёт локально. При исчерпании — берёт следующий диапазон.

- **Размер:** малый.
- **Sortable:** локально да, глобально — не строго.
- **Координация:** редкая (только за новым range), не bottleneck.
- **Угадываемость:** высокая.
- **Когда:** хочется sequential ID без single point of contention.

### 3. UUID v4 (random)

128 бит случайных данных. Коллизия математически невозможна.

- **Размер:** 16 байт (36 символов в строке) — раздувает индексы.
- **Sortable:** нет (нет временной составляющей).
- **Координация:** не нужна.
- **Угадываемость:** нет.
- **Когда:** distributed-системы, не критичен размер и ordering.

### 4. UUID v7 / KSUID / ULID (time-sortable)

128 бит = timestamp (~48 бит) + случайность. Sortable по времени.

- **Размер:** 16 байт.
- **Sortable:** **да** (по времени создания) — критично для индексов БД (insert в конец B-tree).
- **Координация:** не нужна.
- **Угадываемость:** низкая (random-часть).
- **Когда:** distributed + хочется sequential locality в индексах. **Современный default** для большинства случаев.

### 5. Snowflake ID (Twitter)

64-битный ID:

```
0 [41 бит timestamp] [10 бит machine_id] [12 бит sequence]
```

- 41 бит ms timestamp от эпохи ≈ 69 лет.
- 10 бит machine_id → до 1024 нод.
- 12 бит sequence → 4096 ID на машину в одну ms.

**Свойства:**
- **Размер:** 8 байт (вмещается в `BIGINT`).
- **Sortable:** да.
- **Координация:** только на старте (раздача machine_id).
- **Угадываемость:** средняя (timestamp читается).
- **Когда:** очень большой scale, нужен компактный sortable ID. Используют Twitter, Discord, Instagram (Sharded ID).

**Pitfalls:**
- Clock skew между нодами → ID не строго sortable.
- Reset timestamp (NTP перевёл назад) → потенциальные коллизии (нужен monotonic clock или wait).

### 6. Hash-based

Берём хэш от содержимого (MD5/SHA-1 от URL + соли), берём первые N байт.

- **Размер:** настраиваемый.
- **Sortable:** нет.
- **Координация:** не нужна.
- **Коллизии:** возможны, требуется retry или check.
- **Когда:** content-addressable storage (Git), URL Shortener.

### 7. Random + Collision Retry

`random(N base62-chars)`, проверка существования в БД, retry при коллизии.

- При 62^7 ≈ 3.5 трлн комбинаций коллизии крайне редки до миллиардов записей.
- Bloom Filter перед БД ускоряет negative checks.
- **Когда:** URL Shortener, коротких токенов.

## Base62 encoding

Базовая 62-символьная азбука: `a-z` (26) + `A-Z` (26) + `0-9` (10) = **62 символа**. Используется для коротких URL и ID:

- 6 символов → 62^6 = 56.8 млрд комбинаций.
- 7 символов → 62^7 = 3.52 трлн комбинаций.
- 8 символов → 62^8 = 218 трлн.

Алгоритм: целое число → деление с остатком по 62 → собрать строку из символов алфавита.

```
encode(125):
  125 / 62 = 2 остаток 1 → 'b'  (индекс 1)
  2 / 62 = 0 остаток 2   → 'c'  (индекс 2)
  → "cb"
```

Аналогично base58 (Bitcoin) — исключают `0`, `O`, `I`, `l` для читаемости.

## Сравнительная таблица

| Strategy            | Size  | Sortable | Coordination | Guessable | Distributed |
|---------------------|-------|----------|--------------|-----------|-------------|
| Auto-increment      | 4–8 B | yes      | single source| **yes**   | no          |
| Ticket / Range      | 4–8 B | locally  | rare         | yes       | yes         |
| UUID v4             | 16 B  | no       | none         | no        | yes         |
| UUID v7 / ULID      | 16 B  | **yes**  | none         | low       | yes         |
| Snowflake           | 8 B   | yes      | startup only | medium    | yes         |
| Hash (content)      | varies| no       | none         | no        | yes         |
| Random + retry      | varies| no       | DB check     | no        | yes         |

## Common pitfalls

- **UUID v4 в primary key.** Случайные UUID разрушают locality в B-tree индексах → INSERT становится дорогим. Использовать **UUID v7 / ULID** для PK.
- **Snowflake clock skew.** Без NTP+monotonic clock — коллизии или нарушение sortable-инварианта.
- **Counter overflow.** 32-bit counter при 1k writes/sec заканчивается за ~50 дней.
- **Sequential ID = leak.** Если ID в публичном URL — можно итерироваться по чужим данным.
- **Ticket Server SPOF.** Без репликации центральный counter становится bottleneck/SPOF.

## Variations

- **Sharded counters** (Instagram) — отдельный counter per shard, сочетается с Snowflake-подобной структурой.
- **HiLo algorithm** (Hibernate) — variant Ticket Server: worker берёт high-часть, низ генерит локально.
- **DB sequence per shard** — каждый шард имеет независимый sequence + shard_id в ID.

## Used in case studies

- [[002-url-shortener]] — Solution A использует counter + Base62, Solution B — random + collision retry.

## References

- Twitter Engineering — [Announcing Snowflake](https://blog.twitter.com/engineering/en_us/a/2010/announcing-snowflake) (2010).
- Instagram Engineering — [Sharding & IDs at Instagram](https://instagram-engineering.com/sharding-ids-at-instagram-1cf5a71e5a5c).
- ULID spec — https://github.com/ulid/spec.
- RFC 9562 — UUID v6/v7/v8.
