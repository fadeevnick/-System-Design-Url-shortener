---
title: Retry with Exponential Backoff
tags: [reliability, fault-tolerance, distributed-systems]
related: [circuit-breaker, dead-letter-queue, idempotency-key]
---

# Retry with Exponential Backoff

## What

Повторная отправка запроса после неудачи с нарастающей задержкой между попытками и добавленным случайным шумом (jitter), чтобы избежать одновременного шторма повторов от многих клиентов.

## Why

Без backoff все клиенты, получившие ошибку, ретраят одновременно — перегрузка усиливается. Без jitter клиенты, запущенные в один момент, синхронизируют паузы и всё равно бьют пачками.

## When to use

- Сетевые ошибки и таймауты к внешним сервисам / БД.
- Throttling-ответы (HTTP 429, gRPC RESOURCE_EXHAUSTED).
- Транзиентные сбои брокера (Kafka rebalance, SQS temporary error).

**Когда НЕ использовать:**

- 4xx (кроме 429) — клиентские ошибки, ретрай бессмысленен.
- Неидемпотентные операции без [[idempotency-key]] — повтор создаст дубликат.
- Катастрофические сбои — лучше быстро упасть и поднять [[circuit-breaker]].

## How

### Базовая формула

```
delay(n) = base * 2^n   +   jitter
```

`n` — номер попытки (0-based), `base` — начальная пауза (напр. 100 ms), добавляем `cap` — максимальный потолок.

### AWS-варианты jitter (Peter Bailis, 2015)

| Стратегия | Формула | Поведение |
|---|---|---|
| **Full Jitter** | `random(0, min(cap, base·2ⁿ))` | Полностью случайный, самый гладкий трафик |
| **Equal Jitter** | `min(cap, base·2ⁿ)/2 + random(0, min(cap, base·2ⁿ)/2)` | Гарантирует минимальную паузу |
| **Decorrelated Jitter** | `min(cap, random(base, prev·3))` | Нет экспоненты, случайный walk |
| **No Jitter** | `min(cap, base·2ⁿ)` | Thundering herd при синхронном старте |

**Рекомендация AWS:** Full Jitter или Decorrelated для большинства случаев.

### Retry budget

Ограничивает долю ретраев от общего числа запросов (напр. не более 10% трафика — ретраи). Предотвращает каскадное усиление нагрузки при деградации downstream.

```
retry_budget = max_retry_fraction * total_rps
```

Используется в gRPC retry policy и Envoy.

### Связка с Circuit Breaker

```
Request → Circuit Breaker open? → fail-fast (no retry)
              ↓ closed/half-open
          Send → failure?
              → Retry with backoff
              → max attempts exceeded → DLQ or error
```

Circuit Breaker останавливает ретраи на уровне политики, не давая ждать таймаутов каждой попытки.

## Diagram

```
Attempt 1 ──fail──► wait 100ms + jitter
Attempt 2 ──fail──► wait 200ms + jitter
Attempt 3 ──fail──► wait 400ms + jitter
Attempt 4 ──fail──► wait 800ms + jitter  (hit cap)
Attempt 5 ──fail──► → DLQ / surface error
```

## Pitfalls

- **Не логировать каждый ретрай** как ERROR — только финальную неудачу; промежуточные — WARN/DEBUG.
- **Без idempotency key** ретрай POST создаёт дубль.
- **Слишком маленький cap** — продолжаете давить сервис с малыми паузами.
- **Ретрай на уровне нескольких слоёв** (клиент + gateway + сервис) — суммарное число попыток умножается; договоритесь, кто ретраит.

## Variations

- **Linear backoff** — `delay = base * n`; используется когда предсказуемость важнее рассеивания.
- **Fibonacci backoff** — компромисс между линейным и экспоненциальным.
- **Immediate retry once** — одна мгновенная повторная попытка перед включением backoff (gRPC default).

## Used in case studies

- [[007-notification-service]] — ретрай доставки push/email с DLQ
- [[006-web-crawler]] — ретрай HTTP-запросов к нестабильным сайтам

## References

- [AWS Architecture Blog — Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
- Google SRE Book, Chapter 22 — Addressing Cascading Failures
- gRPC retry policy spec
