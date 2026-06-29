---
name: cache-stampede
title: Cache Stampede Prevention
category: reliability
aliases: [thundering-herd, dogpile]
tags: [caching, reliability, concurrency, thundering-herd]
related: [caching-strategies, retry-with-backoff, consistent-hashing]
---

# Cache Stampede Prevention

## What

**Cache stampede** (thundering herd) — ситуация, когда кэш-запись истекает (TTL) или инвалидируется, и множество конкурентных запросов одновременно обнаруживают промах, все идут в базу данных и параллельно перепрогревают кэш. Результат: кратковременная перегрузка DB, cascading latency spikes.

Отличается от [[retry-with-backoff]]: там проблема — ретраи упавшего сервиса. Здесь — нормальный cache miss под нагрузкой.

## Why

- При TTL=60s и 10K RPS: в момент истечения 10K × TTL-window запросов одновременно идут в DB.
- При популярном ключе (viral post, trending product) — могут быть тысячи concurrent readers.
- Без защиты: DB перегружается → latency растёт → ещё больше запросов накапливается → outage.

## When to use

- Любой кэш, работающий под высокой нагрузкой (> 1000 RPS на ключ).
- Вычислительно дорогие операции за кэшем (сложные SQL JOIN, ML inference).
- Viral / trending контент с непредсказуемым трафиком.

## How

### Техника 1: Mutex / Singleflight

```
При cache miss:
  1. Один поток берёт distributed lock: SET nx_{key} 1 NX EX 5
  2. Если получил lock → идёт в DB, пишет результат в кэш, снимает lock
  3. Если не получил lock → ждёт (sleep + retry) или возвращает stale значение

Проблема blocking подхода: остальные потоки ждут → latency растёт

Singleflight (Go sync.singleflight, Java Guava):
  In-process coalescing: первый запрос идёт в DB,
  все остальные запросы того же ключа ожидают результата первого
  (подписываются на future/channel)
  → DB получает 1 запрос вместо N

Distributed singleflight:
  SET key:lock placeholder NX EX 5
  → success: ты "владелец" → вычисляй → SET key result, DEL key:lock
  → failure: WAIT for key (с polling или pub/sub notify)
```

### Техника 2: Probabilistic Early Expiration (PER)

```
Идея: не ждать до TTL=0, а заранее обновлять с вероятностью,
растущей по мере приближения к истечению

Алгоритм (Vattani et al., 2015):
  current_time = now()
  expiry_time  = cache_entry.expiry
  beta = 1.0  # > 1 = более агрессивное перепрогревание

  if current_time - beta * delta * log(random()) >= expiry_time:
      recompute()  # перезапись до истечения

  где delta = время вычисления значения (сколько стоит miss)

Эффект: при TTL=60s, delta=0.1s, beta=1:
  За 5 секунд до истечения ≈ 5% запросов инициируют перепрогрев
  Stampede размазывается по времени — нет единовременного burst
```

### Техника 3: Stale-While-Revalidate

```
Кэш хранит два TTL:
  soft_ttl = 50s  (когда считать "stale", но ещё отдавать)
  hard_ttl = 60s  (когда реально удалять)

При запросе:
  age < soft_ttl:  → вернуть немедленно (fresh)
  soft_ttl ≤ age < hard_ttl:
    → вернуть stale (немедленно, низкая latency)
    → в фоне запустить recompute → обновить кэш
  age ≥ hard_ttl:  → blocking fetch от DB

HTTP: Cache-Control: max-age=50, stale-while-revalidate=10
CDN (Nginx, Cloudflare): proxy_cache_use_stale updating

Реализация в Redis:
  Хранить в value: {data, computed_at}
  При чтении: if now() - computed_at > soft_ttl: launch_background_refresh()
  Background refresh: singleflight чтобы не запускать N раз
```

### Техника 4: L1 Local Cache (In-Process)

```
Добавить локальный кэш в каждом сервис-инстансе:
  L1: Caffeine (Java) / BigCache (Go) / LRU dict (Python)
      Capacity: 1000–10000 записей
      TTL: 1–5 секунд (ultra-short, eventually consistent)
  L2: Redis Cluster
  L3: Database

При запросе:
  L1 hit → вернуть (~0.01 ms)
  L2 hit → вернуть (~1 ms), populate L1
  L2 miss → DB → populate L2 → populate L1

Эффект на stampede:
  Только 1 из N pods инстансов промахнётся по L2
  (сначала промахнётся по L1, потом проверит L2)
  Если L1 TTL=1s и 100 pods: stampede размером 100→DB вместо 10K→DB

Недостаток: eventual consistency между pods (1-5s stale window)
Не использовать для: финансовых данных, мутабельных shared state
```

## Comparison

| Техника | Latency при miss | Staleness | Сложность | Эффективность |
|---|---|---|---|---|
| Mutex / Singleflight | Высокая (wait) | Нет | Средняя | Высокая |
| Probabilistic Early Expiry | Низкая | Нет | Средняя | Высокая |
| Stale-While-Revalidate | Низкая (stale) | Да (soft_ttl) | Низкая | Высокая |
| L1 Local Cache | Очень низкая | Да (L1 TTL) | Низкая | Очень высокая |

**На практике**: комбинировать L1 local + stale-while-revalidate для большинства read-heavy сценариев.

## Diagram

```
10K concurrent requests, key expired at T=0:

Without protection:
  T=0: 10K → DB overwhelmed → p99 latency 5s

Singleflight:
  T=0: 1 request → DB (0.1s), 9999 wait
  T=0.1: all 10K served from fresh cache
  DB spike: 1 query

Stale-While-Revalidate:
  T=0: 10K → all get stale (soft_ttl=50s passed, hard_ttl=60s not)
         1 background refresh → DB
  DB spike: 1 query
  Latency: ~0 (stale served immediately)

L1 Local (100 pods, L1 TTL=2s):
  T=0: each pod's L1 expired → 100 pods hit L2 Redis
  T=0: 100 L2 misses → 100 DB queries (not 10K)
  After L2 populated: pods populate L1
  T=0.001: L2 hits for remaining requests
```

## Pitfalls

- **Lock TTL слишком малый**: если DB slow (0.5s), lock EX=0.1s → следующий поток тоже берёт lock → DB storm.
- **Stale для финансовых данных**: balance, inventory — нельзя отдавать stale. Используй mutex.
- **L1 без size limit**: утечка памяти. Всегда ограничивай Caffeine/LRU maximum size.
- **Background refresh падает**: нужен fallback — при ошибке refresh extend TTL (лучше stale, чем stampede).

## Used in case studies

- [[016-distributed-cache]] — hot key mitigation + stampede protection
- [[005-news-feed]] — fanout cache с stale-while-revalidate
- [[010-video-streaming]] — CDN stale-while-revalidate для manifest

## References

- Vattani, Chierichetti, Lowenstein — *Optimal Probabilistic Cache Stampede Prevention* (VLDB 2015)
- Go `sync.singleflight` documentation
- Nginx `proxy_cache_use_stale` documentation
- Ben Manes — Caffeine cache (Java) documentation
