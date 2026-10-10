# Bottleneck Labs

Практическая часть базы знаний: для каждого case study описываем не только финальную архитектуру, а путь эволюции через измеримые bottlenecks.

Главная идея:

```text
baseline -> load test -> bottleneck -> одно изменение -> repeat -> следующий bottleneck
```

## Documents

| File | Purpose |
| --- | --- |
| [bottleneck-lab-roadmap.md](bottleneck-lab-roadmap.md) | Общая карта bottleneck-сценариев и scaling decisions по всем case studies. |
| [002-url-shortener-labs.md](002-url-shortener-labs.md) | Детальная дорожная карта экспериментов для URL shortener. |

## Lab Format

Каждый per-case-study lab должен отвечать на вопросы:

```text
какой baseline строим;
какой workload запускаем;
какой bottleneck ожидаем;
какие метрики подтверждают bottleneck;
какое одно изменение делаем;
как доказываем, что изменение помогло;
какой следующий bottleneck ищем.
```

## When To Add A New Lab File

Новый файл стоит создавать, когда case study может показать отдельный класс решений:

```text
cache
queue
worker fleet
read replica
horizontal app scaling
vertical DB scaling
rate limiting
materialized read model
specialized index
CDN/object storage
sharding
distributed lock
```

Не нужно писать все labs заранее. Сначала пишем те, которые реально будем проходить и тестировать.
