---
id: 002
title: Read / Write Path
tags: [foundations, read-path, write-path, latency]
next: [003-scaling-data, 004-cache-basics]
---

# Read / Write Path

## Зачем этот файл

Архитектуру проще понимать через путь запроса. Почти любой кейс можно разложить на два потока:

- **read path** — как система читает данные;
- **write path** — как система меняет данные.

Проблемы latency, consistency, cache invalidation, queues и retries становятся понятнее, когда видно, где именно они появляются.

## Read Path

Простой read:

```
Client -> API -> Service -> Database -> Service -> API -> Client
```

Пример:

```
GET /users/123
```

Сервис идёт в БД, получает пользователя и возвращает ответ.

## Где появляется latency

Каждый переход стоит времени:

```
Client -> API          network
API -> Service         routing / auth / validation
Service -> Database    query latency
Database -> Service    result transfer
```

Если БД отвечает за 80 ms, а весь запрос должен уложиться в 100 ms, БД уже стала главным ограничением.

## Write Path

Простой write:

```
Client -> API -> Service -> Database
```

Пример:

```
POST /orders
```

Важный момент: write обычно сложнее read, потому что нужно думать о durability и consistency.

Если сервис ответил `200 OK`, пользователь ожидает, что изменение не потеряется.

## Read-heavy и Write-heavy

**Read-heavy** система читает намного чаще, чем пишет.

Примеры:
- URL shortener resolve path;
- product catalog;
- public profile;
- video metadata.

Обычно помогает cache.

**Write-heavy** система много пишет.

Примеры:
- metrics ingestion;
- chat messages;
- logs;
- payment events.

Обычно нужны batching, partitioning, append-only log, queue.

## Синхронная и асинхронная работа

Синхронный путь:

```
Client waits -> Service does all work -> Response
```

Плюс: проще понять результат.

Минус: пользователь ждёт всю цепочку.

Асинхронный путь:

```
Client -> Service -> Queue -> Worker
Client <- accepted
```

Плюс: ответ быстрее, фоновые задачи можно ретраить.

Минус: появляется eventual consistency: работа ещё не завершена, хотя запрос уже принят.

## Типичная эволюция системы

Сначала:

```
Client -> API -> DB
```

Потом read становится дорогим:

```
Client -> API -> Cache -> DB
```

Потом write запускает тяжёлую работу:

```
Client -> API -> DB -> Queue -> Worker
```

Потом данных много:

```
Client -> API -> Shard Router -> DB Shard
```

Потом нужны события между сервисами:

```
Service -> Outbox -> Broker -> Consumer
```

## Что читать дальше

1. [[004-cache-basics]]
2. [[003-scaling-data]]
3. [[caching-strategies]]
4. [[event-driven-architecture]]
