---
name: pagination
category: data
aliases: [cursor-pagination, keyset-pagination]
---

# Pagination

## What

Способ постранично выдавать большие коллекции данных. Три основные стратегии: **offset/limit** (страница N), **cursor-based** (после конкретного элемента), **keyset / seek** (по индексированному ключу).

## Why / Problem it solves

`SELECT * FROM posts ORDER BY created_at DESC` на 100M записях не выгрузить за один запрос. Нужно:
- Возвращать частями («первые 50, потом следующие 50...»).
- Сохранять order при пагинации.
- Не возвращать дубликаты и не пропускать элементы при concurrent updates.
- Хорошо перформить при глубокой пагинации (страница 1000).

Выбор стратегии драматически влияет на производительность БД и UX.

## Strategies

### 1. Offset / Limit (skip-based)

Классика SQL: `LIMIT 50 OFFSET 1000`.

```sql
SELECT * FROM posts
ORDER BY created_at DESC
LIMIT 50 OFFSET 1000;
```

**+** Простота — тривиальный API: `?page=21&size=50`.
**+** Прыжок на произвольную страницу — `OFFSET 5000`.
**+** Знаем общее число страниц (отдельный COUNT).

**−** **O(offset+limit) на чтение** — БД должна сосчитать и выбросить первые `offset` строк. На странице 1000 это медленно.
**−** **Дубликаты / пропуски** при concurrent insert: новый пост сдвигает все страницы.
**−** Плохо масштабируется на large datasets.

**Когда:** небольшие таблицы (<100k), редкое использование, нужна навигация по страницам с прыжками.

### 2. Cursor-based (keyset / seek)

Клиент передаёт **cursor** (ID/timestamp последнего увиденного элемента); сервер возвращает следующие N после него.

```sql
SELECT * FROM posts
WHERE created_at < '2026-05-23T10:00:00'   -- значение из cursor
ORDER BY created_at DESC
LIMIT 50;
```

API: `GET /posts?after=<cursor>&limit=50`.

Cursor обычно — base64 от `(timestamp, id)` или просто sortable ID (ULID, Snowflake).

**+** **O(limit) на чтение** — БД делает index seek, не считает offset. Скорость не зависит от глубины.
**+** **Стабилен к insertions** — новые посты в начале не влияют на следующую страницу.
**+** Естественно мапится на «infinite scroll» UX.

**−** Нет прыжков на произвольную страницу.
**−** Нет «всего страниц N» без отдельного COUNT.
**−** Cursor должен включать **уникальное** значение (составной ключ): `(created_at, id)` — иначе пропуски при равных timestamp.

**Когда:** large datasets, infinite scroll, real-time ленты. **Default для большинства API** в production.

### 3. Keyset (variant cursor с tie-breaker)

Cursor состоит из всех колонок ORDER BY:

```sql
-- ORDER BY created_at DESC, id DESC
WHERE (created_at, id) < ('2026-05-23T10:00:00', 12345)
ORDER BY created_at DESC, id DESC
LIMIT 50;
```

Без `id` как tie-breaker — потенциально пропуск при двух записях с одинаковым `created_at`.

**+** Точный, стабильный, быстрый при правильном индексе `(created_at, id)`.

**−** Сложнее кодировать (составной cursor).

**Когда:** production-grade cursor pagination.

### 4. Relay-style (GraphQL)

Стандарт GraphQL Cursor Connections:

```graphql
posts(first: 50, after: "cursor") {
  edges {
    cursor
    node { ... }
  }
  pageInfo {
    hasNextPage
    endCursor
  }
}
```

Cursor — opaque строка (часто base64). Клиент не парсит, только пересылает обратно.

**+** Стандартизованный, инструменты (Apollo, Relay) поддерживают.
**+** Скрывает реализацию cursor от клиента.

**−** Verbose API.

## Cursor format

**Должен включать:** все поля из ORDER BY + tie-breaker (обычно PK).

Примеры:

```
# Простой (только sortable ID)
cursor = base64("01H8ABC123DEF456")  # ULID

# Composite (timestamp + id)
cursor = base64("2026-05-23T10:00:00.000Z:12345")

# Opaque JSON
cursor = base64(json.dumps({
    "created_at": "2026-05-23T10:00:00.000Z",
    "id": 12345,
    "direction": "next"
}))
```

**Не делать:**
- Plain integer offset — фактически offset pagination, теряются преимущества.
- Без tie-breaker для timestamp — risk пропусков.
- Без signing (если важно) — клиент может подделать cursor и получить чужие данные.

## Сравнительная таблица

| Стратегия      | Performance     | Стабильность к insert | Jump to page | Сложность |
|----------------|------------------|------------------------|--------------|-----------|
| Offset/Limit   | O(offset+limit) | плохая (дубли)         | **да**       | низкая    |
| Cursor (seek)  | **O(limit)**    | хорошая                | нет          | средняя   |
| Keyset         | **O(limit)**    | **отличная**           | нет          | средняя   |
| Relay (GraphQL)| O(limit)        | хорошая                | нет          | средняя   |

## Bidirectional pagination

API может поддерживать оба направления:

```
GET /posts?after=<cursor>&limit=50      # next page
GET /posts?before=<cursor>&limit=50     # previous page
```

Внутри — два cursor'а: `next_cursor` (последний элемент) и `prev_cursor` (первый элемент) страницы.

## Total count

При cursor pagination точный count часто **не предоставляется** (нерационально считать).

Альтернативы:
- `hasNextPage` boolean — самый дешёвый, достаточно для UX.
- **Approximate count** — оценка по статистике таблицы (`pg_class.reltuples` в Postgres).
- **Cached count** — пересчёт раз в N минут.
- **No count** — UX не показывает «страница 3 из 1000», только «more».

## Common pitfalls

- **Offset pagination на 1M+ записях** — БД медленно скипает. Использовать cursor.
- **Cursor без tie-breaker.** Два сообщения в одну ms → пропуск или дубль.
- **Sort колонка без индекса.** `ORDER BY created_at` без индекса → full scan. Pagination = катастрофа.
- **Cursor секретный, но не подписанный.** Клиент подменяет ID в cursor → доступ к чужим данным. Подписывать HMAC или ограничивать выборку scope ID юзера.
- **Mutable sort key.** ORDER BY `updated_at` — при апдейте записи она «прыгает», дубли/пропуски. Сортировать по immutable полю.
- **Page size без лимита.** Клиент просит `limit=10000` → OOM. Cap на сервере (обычно 100).
- **No deterministic order.** `ORDER BY` без unique tie-breaker → разный порядок при разных запросах.

## Used in case studies

- [[005-news-feed]] — cursor-based pagination на timeline endpoint (`/feed?after=<cursor>&limit=20`), стабильна к новым постам.
- [[002-url-shortener]] — pagination в admin API для просмотра URLs.

## References

- Slack Engineering — [Evolving API Pagination at Slack](https://slack.engineering/evolving-api-pagination-at-slack/).
- Markus Winand — [We need tool support for keyset pagination](https://use-the-index-luke.com/no-offset).
- Relay GraphQL — [Cursor Connections Specification](https://relay.dev/graphql/connections.htm).
