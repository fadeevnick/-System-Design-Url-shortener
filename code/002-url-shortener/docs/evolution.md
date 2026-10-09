# URL Shortener Evolution

Этот проект развивается не через "сразу правильную" архитектуру, а через наблюдаемую эволюцию.

Правило: новый паттерн добавляем только после сценария, где видно, какую проблему он решает.

## 1. Baseline: API + PostgreSQL

Текущее состояние:

- NestJS API;
- один PostgreSQL, локально или Cloud SQL;
- `BIGSERIAL` генерирует числовой `id`;
- `base62(id)` становится `shortCode`;
- `GET /:shortCode` каждый раз читает PostgreSQL.

Этого достаточно для малого сервиса, MVP, внутреннего shortener или небольшой SMS-кампании.

## 2. Что измеряем перед усложнением

Перед добавлением Redis, очередей или шардинга сначала смотрим:

- сколько redirect-запросов реально приходит;
- сколько DB reads делает `GET /:shortCode`;
- какая latency у redirect path;
- сколько write-запросов создает ссылки;
- есть ли горячие short links.
- где точка давления при росте concurrency: latency, errors, DB tier или cost.

Для этого добавлены:

- `GET /health`;
- `GET /metrics`;
- `npm run experiment:load`.

Маленький тест `hot-read 1000 20` - это только sanity check. Реальное решение принимаем после step-test:

```bash
CONCURRENCY_STEPS=10,25,50,100,200 \
STEP_SECONDS=30 \
TARGET_P95_MS=300 \
npm run experiment:load -- capacity-step
```

## 3. Read-heavy scenario -> Redis cache-aside

Сценарий: интернет-магазин отправил SMS-кампанию, и тысячи пользователей переходят по одной короткой ссылке.

В baseline каждый redirect делает:

```text
API -> PostgreSQL SELECT long_url WHERE short_code = ?
```

Если ссылка горячая, БД снова и снова отдает один и тот же `long_url`.

Сначала рассматриваем простые варианты:

- увеличить Cloud SQL tier;
- добавить read replica;
- убедиться, что индекс по `short_code` используется.

Redis появляется, когда проблема именно в повторяющихся reads:

```text
API -> Redis GET short_code
cache miss -> PostgreSQL SELECT -> Redis SET
cache hit -> redirect без PostgreSQL
```

Если baseline выдерживает production-like нагрузку с нормальным `p95` и приемлемой стоимостью Cloud SQL, Redis пока не добавляем.

## 4. Click analytics scenario -> async events

Сценарий: бизнес хочет знать, сколько пользователей кликнули по ссылке из SMS.

Плохой baseline-вариант:

```text
GET /:shortCode
SELECT long_url
INSERT click_event
302 redirect
```

Redirect начинает ждать запись аналитики.

Следующее усложнение: redirect path только отправляет событие, а обработка клика происходит асинхронно.

## 5. Guessable links scenario -> random code + retry

Сценарий: короткая ссылка ведет на приватную страницу заказа.

Baseline `base62(id)` создает последовательные коды:

```text
1, 2, 3, ... -> 1, 2, 3, ...
```

Это легко перебирать.

Следующее усложнение: генерировать random base62 code и полагаться на `UNIQUE` constraint + retry при коллизии.

## 6. Storage growth scenario -> sharding discussion

Сценарий: сервис хранит миллиарды ссылок.

Перед шардингом сначала рассматриваем:

- vertical scaling;
- read replicas;
- partitioning;
- retention / expiration.

Шардинг обсуждаем только когда один managed PostgreSQL становится дорогим, ограниченным или операционно неудобным.
