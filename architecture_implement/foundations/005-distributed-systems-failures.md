---
id: 005
title: Distributed Systems Failures
tags: [foundations, failures, reliability, distributed-systems]
next: [idempotency-key, retry-with-backoff, dead-letter-queue]
---

# Distributed Systems Failures

## Зачем этот файл

В одной программе ошибки часто очевидны: функция вернула exception.

В распределённой системе всё сложнее:

```
Service A -> network -> Service B
```

Если ответа нет, A не всегда знает, что произошло:
- B не получил запрос;
- B получил запрос и упал;
- B выполнил запрос, но ответ потерялся;
- сеть просто медленная.

Именно отсюда появляются [[retry-with-backoff]], [[idempotency-key]], [[dead-letter-queue]], [[outbox]].

## Partial Failure

Partial failure — часть системы работает, часть нет.

```
API alive
Database alive
Payment provider timeout
Queue lagging
```

Снаружи система выглядит "частично сломанной", а не полностью выключенной.

## Timeout

Timeout нужен, потому что в сети нельзя ждать бесконечно.

```
Service A -> Service B
wait 2 seconds
if no response: timeout
```

Но timeout не означает, что B ничего не сделал.

Это ключевая мысль.

## Retry

Retry помогает при временных сбоях.

```
try request
timeout
try again
```

Но retry может создать дубликат.

Пример:

```
POST /payments
timeout
retry POST /payments
```

Если первый запрос уже списал деньги, второй может списать повторно.

Для этого нужен [[idempotency-key]].

## Retry Storm

Если много клиентов одновременно ретраят без задержки, они усиливают перегрузку.

```
Service B slow
1000 clients timeout
1000 clients retry immediately
Service B becomes worse
```

Для этого нужен [[retry-with-backoff]] и jitter.

## Duplicate Message

В брокерах часто гарантия at-least-once:

```
message delivered at least once
```

Это значит, что consumer может получить одно и то же сообщение два раза.

Consumer должен быть идемпотентным.

## Poison Message

Poison message — сообщение, которое всегда ломает обработчик.

Если его бесконечно ретраить, очередь застрянет.

Для этого нужен [[dead-letter-queue]].

## Dual Write

Dual write — попытка сделать две независимые записи:

```
1. write to DB
2. publish to broker
```

Если сервис упал между шагами, БД уже изменилась, а событие не ушло.

Для этого нужен [[outbox]].

## Что читать дальше

1. [[idempotency-key]]
2. [[retry-with-backoff]]
3. [[dead-letter-queue]]
4. [[outbox]]
5. [[007-notification-service]]
