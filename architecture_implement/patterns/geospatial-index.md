---
name: geospatial-index
title: Geospatial Index
category: data
aliases: [geohash, quadtree, s2]
tags: [geo, location, search, spatial, indexing]
related: [caching-strategies, consistent-hashing]
---

# Geospatial Index

## Wha

Структура данных для эффективного поиска объектов по географическим координатам: "найди все X в радиусе R от точки (lat, lng)". Наивный подход — полный скан всех записей с вычислением расстояния — не масштабируется. Геопространственные индексы сводят geo-поиск к задаче поиска по строке/числу.

Три основных подхода: **Geohash**, **QuadTree**, **S2 (Google)**.

## Why

- Расстояние между двумя точками на сфере (Haversine formula) дорого считать для миллионов записей.
- Геопространственный индекс сужает кандидатов до соседних ячеек → небольшой набор → точный расчёт расстояния.
- Стандартные B-tree индексы не работают для 2D координат: lat и lng независимы, joint index неэффективен.

## When to use

- Поиск ближайших объектов: рестораны, водители, магазины, достопримечательности.
- Геофенсинг: событие при входе/выходе из полигона.
- Агрегация по регионам (карты плотности, heatmap).

## How

---

### Geohash

Base32-строка, кодирующая (lat, lng) через чередование бит широты и долготы.

**Принцип**: рекурсивно делим карту пополам, добавляем бит (0 — левая/нижняя половина, 1 — правая/верхняя). Чередуем: нечётные биты — долгота, чётные — широта. Результат кодируем в Base32.

**Таблица точности**:

| Длина Geohash | Размер ячейки (ш × в) | Примерное использование |
|---|---|---|
| 1 | 5000 × 5000 km | Континент |
| 2 | 1250 × 625 km | Страна |
| 3 | 156 × 156 km | Регион |
| 4 | 39 × 20 km | Город |
| 5 | 5 × 5 km | Район |
| 6 | 1.2 × 0.6 km | Квартал |
| 7 | 150 × 150 m | Улица |
| 8 | 38 × 19 m | Здание |
| 9 | 5 × 5 m | Точная позиция |

**Пример**: Москва, Кремль → `ucfv0j` (geohash 6)

**Ключевое свойство**: общий префикс → близкие ячейки. `ucfv0j` и `ucfv0n` — соседи.

**Boundary problem** — главный недостаток:

```
Граница между ячейками w и x:
    w = 1000...
    x = 0111...

Точки по обе стороны границы имеют разный prefix — соседи
в реальности, но не видят друг друга при prefix-search.

Решение: запрашивать не только текущую ячейку, но и
8 соседей: N, NE, E, SE, S, SW, W, NW.

Все geohash библиотеки имеют neighbor(hash, direction) функцию.
```

**Redis GEOADD / GEOSEARCH** — использует Geohash внутри:
```redis
GEOADD restaurants 37.617 55.752 "Cafe Pushkin"
GEOSEARCH restaurants FROMMEMBER "user_loc" BYRADIUS 1 km ASC COUNT 10
```

---

### QuadTree

Рекурсивное дерево, делящее 2D пространство на 4 квадранта (NW, NE, SW, SE). Лист = квадрант с ≤ K объектами (напр. K=100). При превышении — split.

```
Root (весь мир)
  ├─ NW (Европа + Африка)
  │    ├─ NW (Западная Европа)
  │    │    ├─ [leaf: 87 объектов]
  │    │    └─ NE → split...
  │    └─ ...
  └─ NE (Азия)
       └─ ...
```

**Плюсы**:
- Адаптивная точность: плотные городские районы → глубокое дерево; океан → 1 лист.
- Естественный range query.
- In-memory структура, быстрый lookup O(log N).

**Минусы**:
- Динамические объекты: перемещение объекта = delete + re-insert (нужна балансировка).
- Сложнее имплементировать, чем Geohash + Redis.
- Шардинг сложнее: дерево не делится так просто как строки.

---

### S2 (Google)

Сферическая геометрия: поверхность Земли проецируется на куб, каждая грань разбивается на ячейки по Hilbert curve. Ячейки на любом уровне (0–30) имеют почти одинаковую площадь (в отличие от Geohash, где полярные ячейки уже).

```
S2 cell levels:
  Level 0: 85M km² (1/6 Земли)
  Level 10: ~86 km²
  Level 13: ~1.27 km² (Yelp radius)
  Level 15: ~0.079 km²
  Level 20: ~0.077 km²
  Level 30: ~1 cm²
```

**Плюсы**:
- Корректная геометрия на сфере (нет искажений у полюсов).
- Hilbert curve: пространственная локальность гарантирована (близкие ячейки → близкие числа).
- Используется в Google Maps, Uber H3 (альтернатива), Foursquare.

**Минусы**:
- Сложнее концептуально.
- Нет нативной поддержки в большинстве стандартных БД (нужна библиотека).

---

### Сравнение

| Критерий | Geohash | QuadTree | S2 |
|---|---|---|---|
| Тип | Строка (Base32) | Дерево в памяти | 64-bit integer |
| Boundary problem | Да (нужны 8 соседей) | Нет | Нет |
| Адаптивная точность | Нет (фиксированная длина) | Да | Да |
| Динамические объекты | Плохо (GEOADD + GEODEL) | Средне (rebalance) | Хорошо |
| DB поддержка | Redis GEODATA, PostgreSQL | — | BigQuery GIS |
| Простота impl | Высокая | Средняя | Низкая |
| **Когда использовать** | Статичные POI, Redis | In-memory geo search | Сферические запросы, Uber-масштаб |

---

## Diagram

```
Yelp scenario: find restaurants near (55.75, 37.62) within 1 km

1. Encode location: geohash("55.75, 37.62", precision=7) → "ucfv0jh"
2. Find neighbors:  ["ucfv0jh", "ucfv0jj", "ucfv0jn", ...] (9 cells)
3. Redis SMEMBERS geo:ucfv0jh → [rest_1, rest_4, rest_9, ...]
          SMEMBERS geo:ucfv0jj → [rest_2, rest_7, ...]
          ... (pipeline, parallel)
4. Load restaurant metadata for candidates
5. Haversine filter: keep distance <= 1000 m
6. Return sorted by distance (or rating)
```

## Pitfalls

- **Precision слишком крупная** → слишком много кандидатов; слишком мелкая → boundary problem хуже, сосед оказывается в соседней ячейке.
- **Не учитывать 8 соседей** → ресторан в 50 м от границы ячейки не найдётся.
- **Haversine vs Euclidean**: на малых расстояниях (< 100 km) евклидово приближение допустимо, но Haversine правильнее.
- **Индекс не обновляется** при перемещении объекта: нужен atomic delete+insert.

## Variations

- **R-Tree** — PostgreSQL/PostGIS использует R-tree для spatial index. Хорошо для полигонов и сложных форм.
- **H3 (Uber)** — гексагональная решётка вместо квадратной: более равномерный охват, лучше для routing. Open source.
- **Hilbert Curve Index** — 1D сортировка, сохраняющая 2D локальность; используется в S2 и BigQuery.

## Used in case studies

- [[011-proximity-service]] — Geohash для Yelp-like, S2/QuadTree для Uber-like

## References

- [Geohash.org](http://geohash.org) — interactive visualization
- [Google S2 Geometry Library](http://s2geometry.io)
- [Uber H3](https://h3geo.org)
- PostGIS documentation — Spatial Indexing
- Redis GEODATA commands documentation
