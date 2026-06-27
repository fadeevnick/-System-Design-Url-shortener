name: sorted-set-index
title: Sorted Set Index
category: data
aliases: [zset-index]
tags: [data-structures, ranking, leaderboard, redis, real-time]
related: [caching-strategies, trie-prefix-index, rate-limiting-algorithms]
---

# Sorted Set Index

## What

Структура данных, хранящая уникальные элементы с числовым **score**, отсортированные по score. Каждый элемент уникален, score может повторяться (tie-breaking по lexicographic order элемента). Реализация: **Skip List** (O(log N) insert/delete/rank) + **Hash Map** (O(1) score lookup by member).

Redis ZSET — эталонная реализация. Команды: `ZADD`, `ZRANK`, `ZRANGE`, `ZRANGEBYSCORE`, `ZREVRANK`, `ZINCRBY`.

## Why

- **O(log N)** для всех операций: insert, delete, rank query, range query.
- **Rank** (`ZRANK`) возвращает позицию элемента — это нетривиально в обычных структурах.
- **Range by score** (`ZRANGEBYSCORE min max`) — найти всех в диапазоне score.
- **Atomic INCR** (`ZINCRBY`) — инкрементальное обновление score без race condition.

## When to use

- Leaderboards (рейтинги игроков, счёт, очки).
- Приоритетные очереди (score = priority или timestamp).
- Sliding window rate limiting (score = timestamp, members = request_ids).
- Top-K с динамическим score.
- Time-series event aggregation (score = unix timestamp).

**Когда НЕ использовать:**

- Нужен полнотекстовый поиск или фильтрация по нескольким полям — нет.
- Больше ~500M элементов в одном ZSET — memory constraint (Redis in-memory).
- Нужна персистентность без Redis — нужен специализированный TSDB или column store.

## How

### Redis ZSET Операции

```redis
# Добавить или обновить score игрока
ZADD leaderboard 1500 "player_alice"   → 1 (new) / 0 (updated)
ZADD leaderboard 2100 "player_bob"

# Инкрементальное обновление (атомарно, без race)
ZINCRBY leaderboard 50 "player_alice"  → 1550.0

# Топ-10 игроков (убывающий порядок) с scores
ZREVRANGE leaderboard 0 9 WITHSCORES
→ [("player_bob", 2100), ("player_alice", 1550), ...]

# Ранг игрока (0-indexed, ascending)
ZRANK leaderboard "player_alice"       → 0  (lowest score first)
ZREVRANK leaderboard "player_alice"    → 1  (rank from top, 0-based)
# Человеческий rank = ZREVRANK + 1

# Кол-во игроков с score >= 1500
ZCOUNT leaderboard 1500 +inf           → 2

# Игроки вокруг alice (rank ± 5)
alice_rank = ZREVRANK leaderboard "player_alice"  → 1
ZREVRANGE leaderboard (alice_rank-5) (alice_rank+5) WITHSCORES

# Общее число элементов
ZCARD leaderboard                      → 2
```

### Skip List Internals

Skip list — многоуровневая связная структура. Каждый узел существует на нескольких уровнях с вероятностью p (обычно 0.25). Поиск начинается с верхнего уровня → быстро пропускает ненужные элементы.

```
Score: 10   20   30   40   50   60   70   80
L3:    ──────────────────────────────────────80
L2:    ──────30──────────────────────────80
L1:    ----30------50-------------80
L0:    10---20---30---40---50---60---70---80

Поиск rank(50):
  L3: 50 < 80 → down
  L2: 50 > 30, next=80 > 50 → down
  L1: 50 > 30, next=50 → found!
  count elements before: O(log N) comparisons
```

Средняя сложность: O(log N) для insert, delete, rank, range.

### Time-Windowed Leaderboards

```
Weekly leaderboard: score = очки за эту неделю (не cumulative)

Подход 1: Отдельный ZSET per week
  ZADD leaderboard:2026-W21 500 "player_alice"
  При старте новой недели: RENAME old key → archive, новый ZSET пустой
  Expires: SET leaderboard:2026-W20 EX 2592000  (30 дней)

Подход 2: Scoring с timestamp (для rate limiting, не для leaderboard)
  ZADD sliding_window {current_timestamp} {request_id}
  ZREMRANGEBYSCORE key 0 (now - window_size)  ← удаляем старые
  ZCARD key → кол-во событий в окне

Leaderboard with TTL reset:
  Каждое воскресенье в полночь:
    RENAME leaderboard:weekly → leaderboard:weekly:2026-W21
    DEL leaderboard:weekly  (нет — начать с чистого листа)
    SET leaderboard:weekly (empty)
```

### Sorted Set + Hash для полных данных

```
ZSET хранит только (member, score):
  member = player_id (строка или число)
  score  = numeric

Полные данные (имя, аватар, уровень) — в отдельном Hash:
  HSET player:alice name "Alice" avatar_url "..." level 42

Запрос топ-10 с деталями:
  1. ZREVRANGE leaderboard 0 9 WITHSCORES → [(id_1, score_1), ...]
  2. Pipeline: HGETALL player:{id} для каждого
  3. Merge results

Не денормализуй имя в ZSET member:
  BAD: ZADD leaderboard 1550 "player_alice:Alice:42"
  → сложно обновлять имя, парсинг хрупкий
```

### Sharding при большом N

```
Один Redis ZSET: ~500M элементов → ~40 GB RAM (80B/element * 500M)
→ не помещается на одну Redis ноду

Подход 1: Hash Sharding
  shard_id = hash(player_id) % N_shards
  ZADD leaderboard:shard_{shard_id} score player_id

  Global rank: нельзя напрямую (нужно запросить все шарды)
  Top-K: ZUNIONSTORE result N leaderboard:shard_0 ... shard_N → дорого

Подход 2: Score Range Sharding
  shard_0: scores [0, 1000)
  shard_1: scores [1000, 2000)
  shard_2: scores [2000, +inf)

  Top-10: только shard_2 (highest scores)
  My rank: shard_id из score + ZCARD для высших шардов

  Проблема: hot shard если большинство игроков в одном диапазоне
  Решение: percentile-based boundaries (равномерное распределение)
```

## Diagram

```
Score Update:
  Player event → ZINCRBY leaderboard {delta} {player_id}
      O(log N), atomic, no lock needed
  
Query Top-10:
  ZREVRANGE leaderboard 0 9 WITHSCORES
  O(K log N), K=10
  → Pipeline HGETALL player:{id}
  → Response

Query "My Rank":
  ZREVRANK leaderboard {player_id}  → rank (0-based)
  ZCARD leaderboard                 → total players
  percentile = (total - rank) / total * 100
```

## Pitfalls

- **ZADD без ZINCRBY при конкурентных обновлениях**: два воркера читают score, добавляют, пишут → race condition. Используй `ZINCRBY` (атомарно).
- **ZREVRANGE 0 -1**: выгрузить весь ZSET миллионами элементов в один ответ = OOM на клиенте. Всегда пагинируй.
- **Score как float64**: не хранить деньги или целые числа, требующие точности > 2^53.
- **Ties**: одинаковый score → лексикографический порядок по member. Если нужен другой tie-break — добавь timestamp в score: `score = points * 1e12 + (MAXTIME - timestamp)`.

## Variations

- **Segment Tree / Fenwick Tree (BIT)** — для статичных или батч-обновляемых leaderboards: O(log N) update + O(log N) prefix sum для rank. Не Redis, в памяти приложения.
- **Approximate Ranking**: для миллиардов пользователей точный rank не нужен — используй гистограмму score distribution + `ZCOUNT` для оценки percentile.
- **HyperLogLog**: не для ranking, но для unique player count per leaderboard segment.

## Used in case studies

- [[015-leaderboard]] — Redis ZADD для real-time leaderboard
- [[003-rate-limiter]] — sliding window rate limiting через ZADD + ZREMRANGEBYSCORE

## References

- Redis documentation — Sorted Sets
- William Pugh — *Skip Lists: A Probabilistic Alternative to Balanced Trees* (1990)
- Redis source: `t_zset.c` — ZADD / ZRANK implementation
