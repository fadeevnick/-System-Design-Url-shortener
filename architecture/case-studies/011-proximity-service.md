id: 011
title: Proximity Service (Yelp / Uber)
source: Alex Xu, *System Design Interview Vol. 2*, Chapter 1. Аналоги: Yelp (поиск мест), Uber/Lyft (поиск водителей), Google Maps (ближайшие заправки).
domain: geo
tags: [geo, location, proximity, geohash, quadtree, real-time]
patterns: [geospatial-index, caching-strategies, consistent-hashing, rate-limiting-algorithms]
difficulty: medium
---

# 011 — Proximity Service (Yelp / Uber)

## Source

Alex Xu, *System Design Interview Vol. 2*, Chapter 1. Аналоги: Yelp (поиск мест), Uber/Lyft (поиск водителей), Google Maps (ближайшие заправки).

---

## Problem

Два разных сценария на одной концептуальной базе:

**Yelp-like (статичные объекты)**: пользователь открывает приложение → видит рестораны / магазины в радиусе 1–5 км. Объекты не перемещаются (бизнес не едет). Read-heavy, low write frequency.

**Uber-like (динамические объекты)**: пользователь заказывает такси → система находит ближайших свободных водителей. Водители непрерывно обновляют координаты каждые 4 секунды. High read + very high write.

---

## Requirements

### Functional (Yelp-like)

- Поиск POI (places of interest) в радиусе R (500 м / 1 км / 5 км) от пользователя.
- Фильтры: категория (ресторан, аптека, ...), рейтинг, часы работы.
- Страница места: фото, описание, отзывы, контакты.
- Добавление нового бизнеса (асинхронная верификация).

### Functional (Uber-like)

- Найти N ближайших свободных водителей.
- Водитель обновляет локацию каждые 4 секунды.
- Статус водителя: available / on_trip / offline.
- Матчинг: ближайший доступный водитель получает заказ.

### Non-Functional

- Latency поиска: p99 < 200 ms.
- High availability: 99.99%.
- Eventual consistency позиций водителей: задержка ≤ 4 с (один цикл обновления).
- Yelp: read >> write (10 000:1). Uber: reads ~1:1 с writes на peak.

### Scale (back-of-envelope)

**Yelp:**

| Метрика | Значение |
|---|---|
| Businesses | 200M |
| DAU | 100M |
| Search RPS (avg) | ~5 000 |
| Search RPS (peak ×5) | ~25 000 |
| Business update RPS | ~10 (rarely changes) |

**Uber:**

| Метрика | Значение |
|---|---|
| Active drivers | 1M |
| Location update/driver | каждые 4 с |
| Location update RPS | **250 000 writes/s** |
| Active riders searching | 10M |
| Search RPS | ~100 000 |

---

## Solution A — Geohash + Redis (Yelp-like)

### Идея

Каждый бизнес индексируется по geohash precision 6 (ячейки ~1.2 × 0.6 km). В Redis — `SET geo:{geohash6}` → {business_id set}. Поиск: вычислить geohash для координат пользователя + получить 8 соседей → объединить множества → отфильтровать по расстоянию и критериям.

### Architecture

```mermaid
flowchart TD
    App["Mobile / Web Client"]

    subgraph Read Path
        APIGW[API Gateway]
        SearchSvc[Search Service\nstateless]
        GeoRedis[Redis Cluster\nGeohash Sets]
        BusinessCache[Redis Cache\nbusiness metadata]
        BusinessDB[(Business DB\nPostgres)]
    end

    subgraph Write Path
        AdminAPI[Business API]
        Validator[Async Validator\nmoderation]
        IndexWorker[Index Worker\nKafka consumer]
    end

    App -->|GET /search?lat=&lng=&radius=| APIGW
    APIGW --> SearchSvc
    SearchSvc -->|get_cells(lat,lng,radius)| SearchSvc
    SearchSvc -->|SUNIONSTORE / pipeline SMEMBERS| GeoRedis
    GeoRedis -->|candidate business_ids| SearchSvc
    SearchSvc -->|batch GET metadata| BusinessCache
    BusinessCache -->|cache miss| BusinessDB
    SearchSvc -->|haversine filter + sort| App

    AdminAPI --> Validator
    Validator -->|approved| IndexWorker
    IndexWorker -->|SADD geo:{hash6} {id}| GeoRedis
    IndexWorker -->|INSERT| BusinessDB
```

### Search Flow

```python
def search_nearby(lat, lng, radius_km):
    # 1. Определяем нужную точность geohash по радиусу
    precision = geohash_precision_for_radius(radius_km)
    # radius <= 0.5 km → precision 7; <= 5 km → precision 6; <= 20 km → precision 5

    # 2. Geohash текущей позиции
    center_hash = geohash.encode(lat, lng, precision)

    # 3. Текущая ячейка + 8 соседей
    cells = [center_hash] + geohash.neighbors(center_hash)  # 9 ячеек

    # 4. Redis pipeline: batch SMEMBERS для каждой ячейки
    pipe = redis.pipeline()
    for cell in cells:
        pipe.smembers(f"geo:{cell}")
    results = pipe.execute()  # список множеств business_id

    # 5. Объединение кандидатов
    candidate_ids = set().union(*results)  # ~100–1000 id

    # 6. Загрузка метаданных (из кэша или DB)
    businesses = batch_get_metadata(candidate_ids)

    # 7. Точная фильтрация по расстоянию и критериям
    nearby = [
        b for b in businesses
        if haversine(lat, lng, b.lat, b.lng) <= radius_km
        and matches_filters(b, filters)
    ]

    # 8. Сортировка: по расстоянию (default) или рейтингу
    return sorted(nearby, key=lambda b: haversine(lat, lng, b.lat, b.lng))
```

### Geohash Precision vs Radius

```
Radius ≤ 0.5 km  →  precision 7 (150×150 m ячейки)
Radius ≤ 2 km   →  precision 6 (1.2×0.6 km)
Radius ≤ 20 km  →  precision 5 (5×5 km)
Radius ≤ 150 km →  precision 4 (39×20 km)

Правило: ячейка должна быть меньше radius/2,
чтобы соседей было достаточно для покрытия.
```

### Business DB Schema

```sql
CREATE TABLE businesses (
    id          UUID PRIMARY KEY,
    name        TEXT NOT NULL,
    category    TEXT,
    lat         DOUBLE PRECISION,
    lng         DOUBLE PRECISION,
    geohash6    CHAR(6),          -- индекс для прямых geo queries
    geohash7    CHAR(7),
    rating      NUMERIC(2,1),
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ
);

CREATE INDEX idx_businesses_geohash6 ON businesses(geohash6);
-- B-tree по строке: все бизнесы с prefix работают за O(log N)
-- Альтернатива без Redis: WHERE geohash6 IN ('ucfv0j', 'ucfv0n', ...)

CREATE TABLE business_hours (
    business_id UUID REFERENCES businesses,
    day_of_week SMALLINT,
    open_time   TIME,
    close_time  TIME
);
```

### Caching Strategy

```
Business metadata:
    Redis Cache: business:{id} → JSON (TTL 3600 s)
    Eviction: LRU
    Cache hit rate: ~90% (популярные заведения — hot keys)

Geo sets:
    Redis держит все geohash sets in memory
    Размер: 200M бизнесов × 6 bytes (id) × avg 1 geohash = ~1.2 GB — умещается

Popular search results:
    Cache ключ: search:{geohash6}:{radius}:{filters_hash}
    TTL: 60 s (бизнесы редко меняются)
    Cache-Control на API: max-age=60
```

### Pros

- Простая реализация: Redis SADD / SMEMBERS / pipeline.
- Горизонтально масштабируется: Redis Cluster шардирует geo ключи по hash.
- Boundary problem решён запросом 9 ячеек.
- Metadata cache снимает нагрузку с Postgres.

### Cons

- Ручное управление индексом при обновлении координат бизнеса (SREM + SADD).
- Нет нативной поддержки полигонов (city boundary, district).
- Геохэш-ячейки прямоугольные — для округлых радиусов нужен Haversine postfilter.

---

## Solution B — PostGIS (SQL Geospatial)

### Идея

Postgres с расширением PostGIS хранит координаты в колонке типа `GEOGRAPHY`. Spatial index (GIST / R-tree) позволяет выполнять geo-запросы напрямую. Нет Redis geo layer, нет ручного geohash — всё в SQL.

### Query

```sql
-- Бизнесы в радиусе 1 km от точки (55.752, 37.617)
SELECT id, name, rating,
       ST_Distance(location::geography,
                   ST_MakePoint(37.617, 55.752)::geography) AS dist_m
FROM businesses
WHERE ST_DWithin(
    location::geography,
    ST_MakePoint(37.617, 55.752)::geography,
    1000  -- метры
)
AND category = 'restaurant'
AND is_active = TRUE
ORDER BY dist_m
LIMIT 20;

-- Индекс:
CREATE INDEX idx_businesses_location ON businesses USING GIST(location);
```

### Pros

- Нет дополнительной инфраструктуры.
- Нативная поддержка полигонов, пересечений, геофенсинга.
- ACID — данные и геоиндекс всегда консистентны.
- Fuzzy radius, ST_Within polygon, ST_Intersects — из коробки.

### Cons

- Масштаб: PostGIS на одной ноде держит ~50K RPS geo queries; 25K RPS Yelp — ок, но Uber 100K+ — нет.
- Read replicas помогают, но шардинг PostGIS сложен.
- Нет built-in кэширования: каждый запрос идёт в DB.

---

## Uber-like: Dynamic Location Service

Проблема Uber кардинально сложнее Yelp: 250K writes/s позиций водителей.

### Architecture

```mermaid
flowchart TD
    Driver["Driver App"]
    LocationAPI[Location Service\nstateless, high write]
    LocationStream[Kafka\nlocation-updates]
    LocationStore[Redis Cluster\ndriver locations]
    SearchSvc[Search Service\nfind nearest drivers]
    RiderApp["Rider App"]

    Driver -->|POST /location {lat,lng,status} every 4s| LocationAPI
    LocationAPI -->|GEOADD drivers_geo lng lat driver_id| LocationStore
    LocationAPI -->|produce event| LocationStream
    LocationStream -->|consumer: analytics, ML| AnalyticsDB[(Clickhouse\nlocation history)]

    RiderApp -->|GET /drivers/nearby| SearchSvc
    SearchSvc -->|GEOSEARCH drivers_geo BYRADIUS 5km| LocationStore
    LocationStore -->|[driver_id, distance]| SearchSvc
    SearchSvc --> RiderApp
```

### Redis Geo для Driver Locations

```
Driver update (every 4 seconds):
    GEOADD drivers_geo {lng} {lat} {driver_id}
    HSET driver:{id} status available last_seen {timestamp}

Rider search (find 10 nearest available drivers within 5 km):
    GEOSEARCH drivers_geo
        FROMMEMBER rider_{rider_id}
        BYRADIUS 5 km
        ASC
        COUNT 50        # больше чем нужно — фильтруем по status

    → [driver_1 (0.3 km), driver_2 (0.8 km), ...]
    → batch HGETALL driver:{id} → filter status=available
    → top 10

GEOADD: O(log N) per update → 250K/s нагрузка = управляема на Redis Cluster
```

### Driver Status TTL

```
Водитель уходит offline (приложение закрыто):
    Нет обновлений > 30 с → считать offline

Реализация: HSET driver:{id} last_seen {timestamp}
Background job каждые 10 с:
    SCAN driver:* → filter last_seen > 30 s ago → HSET status offline

Или: каждый GEOADD сопровождается EXPIRE driver:{id} 30
    Отсутствие в Redis = offline (но GEOADD запись остаётся!)
    → нужен explicit GEOREM при timeout
```

### Sharding Driver Location по Region

250K writes/s на одну Redis ноду — много (Redis single thread, ~100K ops/s max). Шардинг:

```
Partition by geo region (страна / крупный регион):
    drivers_geo:us_east   → Redis node 1
    drivers_geo:us_west   → Redis node 2
    drivers_geo:eu        → Redis node 3
    ...

Search Service знает, к какой ноде идти по координатам пользователя.
Граничные случаи (рядом с границей региона) → запрос к 2 нодам.

Альтернатива: Redis Cluster с hash tags:
    GEOADD {city:nyc}:drivers_geo ...
    → cluster маршрутизирует по hash({city:nyc})
```

### Location History (для аналитики / ML)

```
Kafka topic "location-updates" → Clickhouse:
    (driver_id, lat, lng, timestamp, trip_id, speed, heading)

Use cases:
    - ETA prediction (ML модель на реальных маршрутах)
    - Fraud detection (водитель GPS-спуфинг?)
    - Heatmaps по городу
    - Surge pricing zones

Retention: raw → 30 дней, агрегированные треки → 1 год
```

---

## Deep Dives

### Radius Selection и Precision

```
Yelp: пользователь выбирает радиус явно (500 м / 1 / 5 / 20 км)
    → geohash precision по таблице

Uber: радиус динамический — начинаем с 1 км, если < 3 drivers → expand до 3 км → до 7 км
    Redis GEOSEARCH BYRADIUS легко менять параметр:
    for radius in [1, 3, 7, 15]:
        results = geo_search(lat, lng, radius)
        if len(results) >= MIN_DRIVERS:
            break
```

### Геофенсинг (Geofencing)

```
Use case: уведомить водителя, когда въехал в аэропорт (специальная зона).

Airport polygon → список geohash ячеек, покрывающих полигон

On location update:
    new_hash = geohash(lat, lng, precision=7)
    IF new_hash IN airport_geohashes AND prev_hash NOT IN airport_geohashes:
        publish event: driver_entered_airport_zone

Альтернатива: ST_Within(point, polygon) в PostGIS (точнее, но медленнее)
```

### Denormalized vs Normalized Business Data

```
Нормализованный подход (Postgres):
    businesses → business_hours → categories → photos → reviews

При поиске нужны: name, category, rating, distance, is_open_now, thumbnail
→ 5 joins per result × 1000 results = дорого

Denormalized read model (Redis / Elasticsearch):
    business:{id} = {name, category, rating, geohash, hours_json, thumb_url}
    → 1 HGETALL per business, нет joins
    Обновляется через event от Postgres (Outbox / CDC)
```

### Business Updates: CDC Pipeline

```
Admin обновил часы работы в Postgres:

Debezium CDC → Kafka "business-changes" topic
    → Business Index Worker:
        1. Обновить Redis hash: HSET business:{id} hours_json {...}
        2. Если координаты изменились:
            SREM geo:{old_geohash6} {id}
            SADD geo:{new_geohash6} {id}
            HSET business:{id} geohash6 {new}
        3. Обновить Elasticsearch (для full-text search)
```

---

## Trade-offs

| Критерий | Geohash + Redis | PostGIS |
|---|---|---|
| Latency | < 5 ms (in-memory) | 20–100 ms |
| Throughput | Высокий (Redis Cluster) | Ограничен DB connections |
| Сложность | Средняя (ручной индекс) | Низкая (SQL) |
| Полигоны / геофенсинг | Approximation | Точный (ST_Within) |
| Dynamic locations (Uber) | Отлично (GEOADD O(log N)) | Плохо (continuous UPDATE) |
| Sharding | Redis Cluster / по region | Сложный (Citus / manual) |
| **Рекомендация** | Высокий масштаб, dynamic | Небольшой трафик, сложная гео-логика |

---

## Key Takeaways

1. **Boundary problem — всегда запрашивай 9 ячеек**: текущая + 8 соседей. Ресторан в 50 м через границу geohash иначе не найдётся.
2. **Haversine postfilter обязателен**: geohash-ячейки прямоугольные, запрос по радиусу = круг. Кандидаты из 9 ячеек — superset, нужна точная фильтрация.
3. **Uber и Yelp — разные задачи**: статичные объекты → Geohash + кэш; динамические локации → Redis GEOADD, TTL, stateless Location Service.
4. **250K writes/s на Redis — шардируй по региону**: один Redis в single-thread режиме не справится; hash tag sharding или explicit region partitioning.
5. **Денормализованная read model**: joins для каждого из 1000 кандидатов убьют Postgres. Redis Hash или ES document с pre-computed полями — правильный подход.

---

## Open Questions

- **ETA и routing**: поиск ближайшего водителя — это proximity, но назначение учитывает ETA (время в пути), не прямое расстояние. Нужен routing engine (OSRM, Google Maps API).
- **Surge pricing zones**: полигоны высокого спроса → геофенсинг на основе спроса/предложения в реальном времени.
- **Indoor positioning**: GPS не работает в торговых центрах → Wi-Fi triangulation / Bluetooth beacons. Другой стек полностью.

---

## References

- Alex Xu, *System Design Interview Vol. 2*, Chapter 1
- [Uber Engineering — H3: Uber's Hexagonal Hierarchical Spatial Index](https://www.uber.com/blog/h3/)
- [Yelp Engineering — Geosearch at Yelp](https://engineeringblog.yelp.com/)
- Redis GEODATA commands — GEOADD, GEOSEARCH
- PostGIS documentation — ST_DWithin, ST_Distance
- [[geospatial-index]]
- [[caching-strategies]]
- [[consistent-hashing]]
