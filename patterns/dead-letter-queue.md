---
title: Dead-Letter Queue (DLQ)
tags: [reliability, messaging, fault-tolerance]
related: [retry-with-backoff, outbox, event-driven-architecture]
---

# Dead-Letter Queue (DLQ)

## What

Очередь, куда автоматически перемещаются сообщения, которые не удалось обработать после исчерпания всех повторных попыток. Изолирует «токсичные» сообщения от основного потока, не давая им блокировать последующие.

## Why

Без DLQ варианты плохие:
- **Бесконечный ретрай** — воркер застревает, пропускная способность падает.
- **Тихое игнорирование** — данные теряются молча.
- **Fail-fast** — останавливается весь pipeline.

DLQ даёт: изоляцию, observability, возможность ручного или автоматического replay.

## When to use

- Асинхронные worker'ы, которые могут получить невалидное / необрабатываемое сообщение.
- Notification pipelines, payment processing, event sourcing.
- Любой сценарий, где «потерять задачу» хуже, чем «обработать позже вручную».

**Когда НЕ использовать:**

- Очереди с порядком (FIFO), где replay меняет семантику.
- Данные с коротким TTL, где retry вообще не имеет смысла.

## How

### Метаданные сообщения в DLQ

При перемещении в DLQ брокер / воркер должен добавить:

| Поле | Назначение |
|---|---|
| `original_queue` | Откуда пришло сообщение |
| `failure_reason` | Последняя ошибка (тип + message) |
| `attempt_count` | Сколько раз пробовали |
| `first_failure_at` | Метка первой неудачи |
| `last_failure_at` | Метка последней попытки |
| `correlation_id` | Tracing ID из оригинального запроса |

### Transient vs Permanent failure

```
Transient (стоит ретраить):
  - Network timeout
  - Database temporarily unavailable
  - Downstream service 503

Permanent (в DLQ без ретрая):
  - Malformed / unparseable message
  - Schema validation failed
  - Business rule violation (e.g. unknown user_id)
  - Dependency permanently removed
```

Классификацию делает код воркера — он выбрасывает `RetryableException` или `PermanentException`.

### Replay flow

```
DLQ Inspector
    ↓ анализ failure_reason
    ↓ fix: код пофикшен / данные исправлены
    ↓ filter: выбрать подмножество
    ↓ re-enqueue → original queue (или специальный replay topic)
    ↓ monitor: retry success rate
```

Replay должен учитывать idempotency — сообщение уже могло быть частично обработано.

### Broker comparison

| Брокер | DLQ поддержка | Особенности |
|---|---|---|
| **AWS SQS** | Native (`RedrivePolicy`) | maxReceiveCount, DLQ = отдельная SQS очередь |
| **AWS SNS + SQS** | На уровне SQS subscription | DLQ на subscription |
| **Kafka** | Нет native, паттерн вручную | Retry topics (`.retry-1`, `.retry-2`) + DLQ topic; Kafka Connect имеет built-in |
| **RabbitMQ** | `x-dead-letter-exchange` | При reject/nack или TTL/overflow |
| **Google Pub/Sub** | Dead-letter topic (native) | `maxDeliveryAttempts` |
| **Azure Service Bus** | Built-in, каждая очередь имеет `/$DeadLetterQueue` | Automatic on max delivery count |

### Retention и алерты

- DLQ — не мусорная корзина. Retention должен быть **больше**, чем у основной очереди (напр. 14 дней vs 4 дня).
- Alert на `dlq_depth > 0` — ненулевой DLQ это инцидент, требующий внимания.
- Метрика: `dlq_messages_total` по причинам + `time_in_dlq`.

## Diagram

```
Producer
    │
    ▼
Main Queue ──────────────────────────────────┐
    │                                         │
    ▼                                         │ maxReceiveCount exceeded
Consumer (attempt 1–N with backoff)          │
    │                                         │
    ├─ success → ack, done                    │
    │                                         │
    └─ permanent error / exhausted ───────────▼
                                         Dead-Letter Queue
                                              │
                                         DLQ Inspector / Alert
                                              │
                                         Manual review / Replay
                                              │
                                         Re-enqueue to Main Queue
```

## Pitfalls

- **Не мониторить DLQ** — сообщения гниют незамеченными.
- **Replay без idempotency** — дублирование эффектов.
- **Слишком низкий maxReceiveCount** (напр. 1) — транзиентные ошибки сразу в DLQ.
- **DLQ самой DLQ** — некоторые брокеры требуют явно не назначать DLQ для DLQ-очереди.
- **Смешивать разные типы ошибок** в одном DLQ — сложнее сортировать при replay.

## Variations

- **Retry topics (Kafka)** — цепочка топиков `.retry-1`, `.retry-2`, каждый с задержкой через timestamp; в конце DLQ-топик. Используется в Spring Kafka, Confluent.
- **Parking lot queue** — синоним DLQ в некоторых командах; иногда подразумевает ручную обработку без автоматического replay.

## Used in case studies

- [[007-notification-service]] — DLQ для неудачных доставок push/email/SMS
- [[013-distributed-message-queue]] — DLQ как встроенная фича очереди

## References

- AWS SQS Dead-Letter Queues documentation
- Confluent Kafka Dead Letter Queue pattern
- RabbitMQ Dead Letter Exchanges
