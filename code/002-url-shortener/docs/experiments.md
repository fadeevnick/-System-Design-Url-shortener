# Experiments

Текущий основной способ нагрузочного тестирования - k6 на отдельной load-test EC2.

Подробный protocol:

```text
docs/load-testing.md
```

Почему так:

```text
load-test EC2 -> app EC2 -> RDS PostgreSQL
```

Так load generator не конкурирует с NestJS app за CPU/network, а тест отвечает на конкретный вопрос:

```text
какой bottleneck появляется при росте нагрузки?
```

## Главная логика

Не просто проверяем "выдержит ли сервис 2000 RPS".

Идем циклом:

1. выбираем workload;
2. задаем fixed RPS через k6;
3. собираем k6 result, `/metrics`, CloudWatch и logs;
4. классифицируем bottleneck;
5. меняем одну вещь;
6. повторяем тот же тест;
7. только потом повышаем нагрузку.

## Workloads

Основные сценарии:

```text
hot-read
cold-read
mixed
write-burst
campaign-spike
```

Пример hot-read:

```bash
BASE_URL=http://<app-private-ip>:3000 \
WORKLOAD=hot-read \
RATE=1000 \
DURATION=3m \
TARGET_P95_MS=300 \
MAX_ERROR_RATE=0.01 \
MAX_DROPPED_ITERATIONS=1 \
PRE_ALLOCATED_VUS=1000 \
MAX_VUS=4000 \
npm run experiment:k6 -- --summary-export results-hot-read-1000.json
```

## Что читать после теста

App metrics:

```bash
curl http://<app-private-ip>:3000/metrics
```

Описание метрик:

```text
docs/metrics.md
```

Protocol интерпретации:

```text
docs/load-testing.md
```
