---
id: 004
title: Cache Basics
tags: [foundations, cache, latency, database]
next: [caching-strategies, cache-stampede]
---

# Cache Basics

## Зачем этот файл

Перед [[caching-strategies]] нужно понять, зачем кэш вообще появляется.

Кэш — это быстрый слой рядом с приложением, где хранятся часто используемые данные, чтобы не ходить каждый раз в более дорогую БД или внешний сервис.

## Базовая схема

Без кэша:

```
Client -> API -> Database
```

С кэшем:

```
Client -> API -> Cache -> Database
```

## Cache Hit и Cache Miss

**Cache hit**:

```
API -> Cache: есть value
API <- Cache: value
```

БД не трогаем. Запрос быстрый.

**Cache miss**:

```
API -> Cache: нет value
API -> Database: прочитать value
API -> Cache: сохранить value
```

Запрос медленнее, но следующие запросы будут быстрее.

## Почему кэш помогает

Кэш обычно:
- хранит данные в памяти;
- отвечает быстрее БД;
- выдерживает больше read throughput;
- снимает повторяющиеся чтения с БД.

Кэш особенно полезен, когда данные read-heavy:

```
100 writes/sec
100_000 reads/sec
```

## TTL

TTL — время жизни записи в кэше.

```
SET user:123 value TTL=300s
```

После 300 секунд запись считается устаревшей или удаляется.

TTL нужен, потому что данные в БД могут измениться, а кэш иначе будет хранить старое значение бесконечно.

## Stale Data

Stale data — устаревшее значение в кэше.

Пример:

```
DB: user name = "Alice"
Cache: user name = "Alicia"
```

Это главная цена кэширования: система становится быстрее, но нужно думать о свежести данных.

## Hot Key

Hot key — один ключ, который читают слишком часто.

```
product:black-friday-main
celebrity:user:42
video:top-1
```

Даже если есть кэш, один hot key может перегрузить одну cache-ноду.

Это отдельная проблема: [[consistent-hashing]] распределяет разные ключи, но не дробит один конкретный hot key.

## Single Cache и Distributed Cache

Один кэш:

```
API -> Redis
```

Простая модель, но есть предел по памяти и throughput.

Distributed cache:

```
API -> Redis-1 / Redis-2 / Redis-3
```

Теперь возникает вопрос:

> Как понять, в какой Redis идти за `user:123`?

Один простой ответ:

```
hash(key) % N
```

Более устойчивый при изменении набора нод ответ: [[consistent-hashing]].

## Что читать дальше

1. [[caching-strategies]]
2. [[cache-stampede]]
3. [[consistent-hashing]]
4. [[002-url-shortener]]
5. [[003-rate-limiter]]
