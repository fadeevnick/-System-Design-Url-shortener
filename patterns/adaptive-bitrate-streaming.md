---
title: Adaptive Bitrate Streaming (ABR)
tags: [video, streaming, cdn, media]
related: [caching-strategies, content-addressable-storage]
---

# Adaptive Bitrate Streaming (ABR)

## What

Техника доставки видео, при которой один и тот же контент закодирован в нескольких качествах (bitrate ladder). Видео нарезается на короткие сегменты (2–10 с). Клиент динамически переключается между качествами в зависимости от доступной пропускной способности, буфера и задержки — без перезапуска воспроизведения.

Два основных стандарта: **HLS** (Apple, HTTP Live Streaming) и **MPEG-DASH** (ISO стандарт, используется Netflix, YouTube).

## Why

- **Стабильность воспроизведения**: вместо буферизации при падении канала → переключение на более низкое качество.
- **Эффективное использование полосы**: на мобильном 360p, на TV 4K — автоматически.
- **HTTP-совместимость**: сегменты — обычные статические файлы (`.ts`, `.m4s`), раздаются CDN без специального стримингового сервера.
- **DVR / seeking**: любой сегмент доступен независимо → перемотка, выбор момента без full-download.

## When to use

- On-demand видео (Netflix, YouTube, Twitch VOD).
- Live streaming (спорт, концерты) — HLS/DASH с задержкой 2–30 с в зависимости от сегмента.
- Любой длинный медиаконтент, где нельзя гарантировать стабильный канал.

**Когда НЕ использовать:**

- Короткие клипы (< 30 с): overhead сегментации не оправдан, progressive download проще.
- Ultra-low latency (< 1 с): нужен WebRTC или RTMP, не HLS/DASH (задержка HLS = N × segment_duration).

## How

### Bitrate Ladder (типичная)

| Разрешение | Bitrate (video) | Типичное использование |
|---|---|---|
| 240p | 400 Kbps | Мобильный плохой сигнал |
| 360p | 800 Kbps | Мобильный 3G |
| 480p | 1.5 Mbps | Стандарт SD |
| 720p | 3 Mbps | HD |
| 1080p | 6 Mbps | Full HD |
| 1440p | 12 Mbps | 2K |
| 2160p (4K) | 25–50 Mbps | 4K HDR |

Netflix использует **per-title encoding**: bitrate ladder подбирается под конкретный контент (мультфильм с плоской графикой кодируется дешевле, чем экшн с детальными сценами).

### Структура HLS

```
master.m3u8  (Master Playlist)
  ├── 240p.m3u8   (Media Playlist)
  │     ├── seg_000.ts (2s)
  │     ├── seg_001.ts (2s)
  │     └── ...
  ├── 720p.m3u8
  │     ├── seg_000.ts
  │     └── ...
  └── 1080p.m3u8
        └── ...
```

**Master Playlist** (`master.m3u8`):
```
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
/hls/video123/360p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720
/hls/video123/720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080
/hls/video123/1080p.m3u8
```

**Media Playlist** (`720p.m3u8`):
```
#EXTM3U
#EXT-X-TARGETDURATION:6
#EXT-X-VERSION:3
#EXTINF:6.0,
seg_000.ts
#EXTINF:6.0,
seg_001.ts
#EXT-X-ENDLIST
```

### MPEG-DASH

Аналог HLS, но сегменты в формате `.m4s` (fMP4), манифест — `MPD` (XML). Используется Netflix (CMAF — Common Media Application Format совместим с обоими).

### ABR Алгоритмы (на клиенте)

| Алгоритм | Логика | Где используется |
|---|---|---|
| **Rate-Based (Throughput)** | измеряет скорость загрузки последних сегментов → выбирает качество ниже измеренного throughput | YouTube (базовый) |
| **BBA (Buffer-Based)** | смотрит на уровень буфера, не на пропускную способность: буфер растёт → повышаем качество, буфер падает → снижаем | Netflix (основной) |
| **BOLA (Buffer Occupancy Lyapunov Algorithm)** | формально оптимален: максимизирует utility (quality) при ограничении на buffer underrun | DASH.js reference |
| **Pensieve (ML-based)** | reinforcement learning, обученный на реальных сетевых условиях | исследовательский, не production |

На практике гибридный: throughput estimate + buffer occupancy.

### Segment Size Trade-off

| Размер сегмента | Плюсы | Минусы |
|---|---|---|
| **2 с** | Быстрое переключение качества, малая задержка live | Больше HTTP запросов, overhead |
| **6 с** | Баланс | — |
| **10 с** | Меньше запросов, лучше CDN cache hit | Медленная адаптация к изменению канала |

Netflix использует 4-секундные сегменты; YouTube — 5–10 с.

## Diagram

```
Video File (raw)
    │
    ▼
Transcoder
    ├── 240p  → [seg_000.ts, seg_001.ts, ...]
    ├── 720p  → [seg_000.ts, seg_001.ts, ...]
    └── 1080p → [seg_000.ts, seg_001.ts, ...]
    │
    ▼
Object Store (S3 / GCS)
    /videos/{id}/master.m3u8
    /videos/{id}/720p.m3u8
    /videos/{id}/720p/seg_000.ts
    ...
    │
    ▼
CDN (CloudFront / Akamai / Fastly)
    Edge node кэширует манифесты + сегменты
    │
    ▼
Client Player (hls.js / ExoPlayer / AVPlayer)
    → загружает master.m3u8
    → выбирает качество
    → загружает media playlist
    → загружает сегменты порциями (prefetch 2–3 сегмента вперёд)
    → адаптируется по буферу/скорости
```

## Pitfalls

- **Manifest кэш TTL**: манифест для live стрима должен быть с коротким TTL (< segment duration). Для VOD — длинный TTL.
- **Segment boundary alignment**: все rendition'ы должны иметь одинаковые границы сегментов — иначе переключение качества вызывает заикание.
- **DRM**: сегменты шифруются (AES-128 / Widevine / FairPlay). Ключи раздаёт отдельный Key Server, не CDN.
- **Startup latency**: первый сегмент всегда в низком качестве для быстрого старта, потом ABR поднимает.

## Variations

- **Low-Latency HLS (LL-HLS)**: Apple, сегменты делятся на части (0.3 с), задержка ~1-2 с вместо 6-30 с.
- **Low-Latency DASH (LL-DASH)**: аналог для DASH.
- **CMAF (Common Media Application Format)**: единый формат сегментов, совместимый и с HLS и с DASH — одно хранилище, два манифеста.

## Used in case studies

- [[010-video-streaming]] — основной паттерн доставки видео

## References

- Apple HLS specification (RFC 8216)
- MPEG-DASH standard (ISO/IEC 23009-1)
- Netflix Tech Blog — Per-Title Encode Optimization
- [BOLA paper](https://arxiv.org/abs/1601.06748)
- Pensieve: Neural Adaptive Video Streaming (SIGCOMM 2017)
