---
id: 003
title: Scaling Data
tags: [foundations, sharding, partitioning, replication, routing]
next: [004-cache-basics, consistent-hashing]
---

# Scaling Data

## Зачем этот файл

Перед [[consistent-hashing]] нужно понять более общий вопрос:

> Если данных стало слишком много для одной ноды, как вообще распределить их между несколькими нодами?

Consistent hashing — только один из ответов. Сначала нужна сама проблема.

## Одна БД

Начальная схема:

```
Service -> Database
```

Она проста:
- один источник правды;
- простые транзакции;
- простой query model.

Но одна БД ограничена CPU, RAM, disk I/O, connection count и размером данных.

## Вертикальное и горизонтальное масштабирование

**Vertical scaling**:

```
Database -> bigger Database
```

Добавляем CPU, RAM, disk. Это просто, но имеет потолок.

**Horizontal scaling**:

```
Database -> DB-1 + DB-2 + DB-3
```

Разносим данные по нескольким нодам. Это сложнее, потому что теперь нужно решать, где лежит конкретная запись.

## Sharding

Sharding — разделение данных на независимые куски.

Пример:

```
user_id 1..1_000_000       -> shard-1
user_id 1_000_001..2_000_000 -> shard-2
```

Или:

```
shard = hash(user_id) % N
```

Главный вопрос sharding:

> Как по ключу понять, в какой shard идти?

Этот слой называется routing.

## Routing

```
Service -> Router -> Shard
```

Router может быть:
- в приложении;
- в отдельном proxy;
- внутри клиента БД;
- внутри самой distributed database.

Если routing ошибся, сервис ищет данные не там.

## Наивный hash sharding

Простая формула:

```
shard = hash(key) % N
```

Она хорошо распределяет ключи, пока `N` стабилен.

Проблема:

```
N = 4 -> N = 5
```

После изменения `N` большинство ключей получает новый shard. Это вызывает массовый rebalance.

Вот тут появляется [[consistent-hashing]].

## Range Sharding

Range sharding делит данные по диапазонам:

```
A-F -> shard-1
G-M -> shard-2
N-Z -> shard-3
```

Плюсы:
- удобно для range queries;
- легко читать соседние значения.

Минусы:
- hot range может перегрузить один shard;
- нужно split/merge диапазонов.

## Hash Sharding

Hash sharding распределяет ключи через hash.

Плюсы:
- обычно лучше балансирует нагрузку;
- hot ranges меньше влияют.

Минусы:
- range queries становятся сложнее;
- изменение количества shard'ов требует аккуратного rebalance.

## Replication

Sharding отвечает за размер и throughput записи.

Replication отвечает за отказоустойчивость и read scaling.

```
primary -> replica-1
        -> replica-2
```

Read можно отправлять на replica. Write обычно идёт в primary.

Trade-off:
- replica может отставать;
- read from replica может вернуть stale data.

## Partition и Replica вместе

В реальных системах они часто совмещаются:

```
partition-1: node-A primary, node-B replica
partition-2: node-B primary, node-C replica
partition-3: node-C primary, node-A replica
```

Так данные распределены по частям и каждая часть имеет копии.

## Что читать дальше

1. [[consistent-hashing]]
2. [[016-distributed-cache]]
3. [[013-distributed-message-queue]]
4. [[014-metrics-monitoring]]
