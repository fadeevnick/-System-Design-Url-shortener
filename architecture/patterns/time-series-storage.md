---
name: time-series-storage
title: Time-Series Storage (TSDB)
category: data
aliases: [tsdb]
tags: [monitoring, metrics, storage, compression, time-series]
related: [log-structured-storage, caching-strategies]
---

# Time-Series Storage (TSDB)

## What

Специализированная база данных для хранения последовательностей числовых значений с метками времени: `(timestamp, value, labels)`. Оптимизирована под append-only writes, range queries по времени и агрегации (avg, sum, max, rate) на больших временных диапазонах.

Примеры: Prometheus TSDB, InfluxDB, TimescaleDB, VictoriaMetrics, Thanos, Cortex.

## Why

- **Обычные БД неэффективны**: в реляционной таблице метрик — 1 строка на sample → 100M строк/день, slow range queries, нет сжатия временного паттерна.
- **Временные данные предсказуемы**: timestamps монотонно растут → delta encoding. Значения изменяются постепенно → XOR/delta дают 90%+ сжатие.
- **Query patterns специфичны**: почти всегда `WHERE time BETWEEN t1 AND t2` + `GROUP BY labels`. Columnar storage по time-series идеален.

## When to use

- Инфраструктурный мониторинг (CPU, memory, network, latency).
- Бизнес-метрики (RPM, conversion rate, revenue per minute).
- IoT sensor data.
- APM traces → metrics aggregation.

## How

### Data Model

```
Time Series = уникальная комбинация metric name + labels

{__name__="http_requests_total", method="GET", status="200", service="api"}
    timestamp=1716000000, value=42315
    timestamp=1716000015, value=42341
    ...

{__name__="http_requests_total", method="POST", status="500", service="api"}
    timestamp=1716000000, value=12
    ...
```

Каждая уникальная комбинация labels = отдельный **time series** (отдельный stream данных).

### Gorilla Compression (Facebook, 2015)

Prometheus и большинство TSDB используют алгоритм из статьи Facebook.

**Timestamp compression (delta-of-delta)**:

```
Raw timestamps (unix epoch seconds):
  1716000000, 1716000015, 1716000030, 1716000045, ...

Delta (разница):
  15, 15, 15, 15, ...  (interval = 15s, почти всегда одинаковый)

Delta-of-delta (разница дельт):
  0, 0, 0, 0, ...       ← почти всегда 0!

Кодирование: 0 = 1 бит. Небольшое отклонение = ~6 бит. Большое = ~32 бит.
Типичный результат: 1.37 бит на timestamp вместо 64 бит (47× сжатие)
```

**Value compression (XOR encoding)**:

```
Raw values (float64):
  42315.0, 42341.0, 42368.0, ...

XOR с предыдущим значением:
  v1 XOR v2 = небольшое число (leading zeros = общие биты)

Если значение не изменилось: XOR = 0 → 1 бит
Если изменилось незначительно: кодируем только значимые биты
Если изменилось сильно: полные 64 бит

Типичный результат: ~3.5 байт на sample вместо 16 байт (timestamp + value)
```

### Chunk-Based Storage (Prometheus)

```
Series: {service="api", method="GET"}

┌──────────────────────────────────────────────┐
│ Chunk 0: [t=0 .. t=2h)  → compressed bytes  │
│ Chunk 1: [t=2h .. t=4h) → compressed bytes  │
│ Chunk 2: [t=4h .. now)  → HEAD (in-memory)  │
└──────────────────────────────────────────────┘

Chunks хранятся в файлах на диске (chunks/ директория).
HEAD chunk: последние 2 часа — в памяти для быстрой записи.
После 2h: HEAD → immutable chunk → flush to disk.

Размер: ~1-2 bytes per sample (с Gorilla) vs 16 bytes raw
→ 1M samples/s = ~1-2 MB/s compressed (vs 16 MB/s raw)
```

### Inverted Index (Series Lookup)

Поиск: "все series с `service="api"` AND `method="GET"`":

```
Label index:
  service=api     → [series_id_1, series_id_4, series_id_7, ...]
  method=GET      → [series_id_1, series_id_2, series_id_5, ...]

Intersection → [series_id_1]
→ lookup chunks for series_id_1
→ decompress, return samples
```

Prometheus хранит inverted index в файле `index` (постоянный) и в памяти (HEAD block).

### Downsampling

Raw data (15s scrape interval) быстро растёт. Агрегация по времени:

```
Raw:   every 15s  → retention 2 weeks
5m:    avg/max/min of 20 raw points → retention 3 months
1h:    avg/max/min of 12 × 5m points → retention 1 year
1d:    avg/max/min of 24 × 1h points → retention 5 years

Storage savings: 1 year raw × 1M series × ~2B/sample × (86400/15) =
  ~4 TB/year raw → ~200 GB с downsampling (20×)

Thanos / Cortex / VictoriaMetrics делают downsampling автоматически.
Prometheus сам по себе — только raw.
```

### Cardinality

**Cardinality** = количество уникальных time series = произведение мощностей labels.

```
Безопасно:
  service (10) × method (5) × status (10) = 500 series

Взрывная кардинальность:
  user_id (10M) × endpoint (1000) = 10 BILLION series
  → TSDB OOM за минуты

Правило: НИКОГДА не использовать высокоуникальные значения как labels:
  ❌ user_id, request_id, session_id, IP-адрес
  ✓ service, method, status_code, region, cluster

Признак проблемы: SELECT count(DISTINCT series) взлетает при деплое
  → "cardinality explosion"
```

## Diagram

```
Scraper → raw samples (timestamp, value, labels)
    │
    ▼
HEAD Block (in-memory, last 2h)
    │ flush every 2h
    ▼
Immutable Chunk Files (disk)
    │ compaction (merge overlapping blocks)
    ▼
Compressed Block Files (2h – N days)
    │ upload to S3 (long-term storage: Thanos)
    ▼
Object Store (S3 / GCS)
    Query: Thanos Store Gateway reads from S3
```

## Pitfalls

- **Cardinality explosion** (см. выше) — убивает любой TSDB.
- **Staleness**: series, которые перестали скрейпиться, остаются в памяти. Нужен stale marker.
- **Out-of-order samples**: большинство TSDB не любят. Prometheus принимает с небольшим out-of-order окном (2 мин).
- **Long retention на одном узле**: Prometheus не для long-term; нужны Thanos / Cortex / VictoriaMetrics.

## Variations

- **InfluxDB** — push-based, tag model аналогичен; собственный TSM (Time-Structured Merge) engine.
- **TimescaleDB** — PostgreSQL extension: гипертаблицы (chunks по времени), native SQL, более гибкая схема.
- **VictoriaMetrics** — Prometheus-compatible, лучше сжатие и cardinality handling, проще в операции.
- **OpenTSDB** — HBase-based, масштабируется на десятки миллиардов series (Twitter).

## Used in case studies

- [[014-metrics-monitoring]] — основа хранения метрик

## References

- Facebook — *Gorilla: A Fast, Scalable, In-Memory Time Series Database* (VLDB 2015)
- Prometheus TSDB documentation
- [Thanos architecture](https://thanos.io/tip/thanos/architecture.md)
- Björn Rabenstein — *Writing a Time Series Database from Scratch*
