# Infrastructure Evolution Roadmap

Этот документ описывает отдельную учебную трассу по эксплуатации систем.
Он дополняет `bottleneck-lab-roadmap.md`: там мы ищем bottleneck внутри
системы, здесь сравниваем способы доставки, запуска и масштабирования сервисов.

Главное правило:

```text
не выбираем платформу потому, что она популярная;
выбираем ее, когда workload и operational problem делают ее полезной.
```

## 0. Какие варианты действительно стоит изучить

Одной честной таблицы популярности здесь нет: Docker, Kubernetes, ECS, PaaS
и serverless отвечают на разные вопросы. В Stack Overflow Developer Survey
2024 Docker использовался 59% профессиональных разработчиков, а CNCF в survey
2025 сообщает, что 82% организаций, использующих containers, запускают
Kubernetes в production. Docker часто означает упаковку и локальную разработку,
а Kubernetes - production control plane для части container workloads.

Источники: [Stack Overflow Survey](https://survey.stackoverflow.co/2024/technology?src_trk=em67a9ae5f6a0715.260153331341684772),
[CNCF Annual Survey 2025](https://www.cncf.io/announcements/2026/01/20/kubernetes-established-as-the-de-facto-operating-system-for-ai-as-production-use-hits-82-in-2025-cncf-annual-cloud-native-survey/).

Для нашего проекта достаточно изучить пять основных моделей:

| Модель | Где уместна | Что изучаем |
| --- | --- | --- |
| VM + systemd или Docker Compose | маленький сервис, dev/staging, небольшой production | простота и single-host failure |
| PaaS | обычный web/API без управления hosts | managed deploy, health checks, scaling |
| Managed containers | несколько сервисов или workers без Kubernetes | images, tasks, service scaling |
| Managed Kubernetes | много сервисов и команд | scheduling, HPA, service discovery |
| Serverless/event-driven | короткие stateless requests и async jobs | pay-per-use, concurrency, retries |

Остальные технологии являются деталями этих моделей:

```text
ALB/Nginx - ingress/load balancing;
GitHub Actions/Argo CD - delivery mechanism;
Terraform/CDK - infrastructure as code;
ECR/Docker Hub - image registry;
RDS/Redis/S3/OpenSearch - managed dependencies.
```

Практический default обычно выглядит так:

```text
простое приложение -> VM/PaaS;
containerized приложение -> managed containers;
много сервисов и platform team -> Kubernetes;
короткие независимые операции -> serverless;
данные и state -> managed AWS services.
```

## 1. Как будем сравнивать платформы

Для каждого case study проходим один и тот же цикл:

1. Собрать минимальный baseline на простой платформе.
2. Определить workload, SLO и ожидаемый bottleneck.
3. Замерить application, infrastructure и deployment metrics.
4. Внести одно инфраструктурное изменение.
5. Повторить тот же тест.
6. Сравнить latency, throughput, reliability, cost и operational effort.
7. Зафиксировать, какой новый bottleneck появился.

Кроме runtime-метрик, для платформы измеряем:

```text
deployment_time
rollback_time
time_to_recover
capacity_change_time
number_of_manual_steps
monthly_cost_for_lab_environment
```

Runtime-метрики остаются общими для всех проектов:

```text
p50/p95/p99
RPS или jobs/sec
error rate
dropped work / rejected requests
CPU, memory, network
connection count
queue depth и queue age
```

## 2. Целевая последовательность платформ

### Phase 0 - Общий delivery contract

До миграции между платформами каждый сервис должен иметь:

```text
health endpoint
metrics endpoint
structured logs
graceful shutdown
config через environment/secret reference
repeatable load test
rollback procedure
```

Измеряем не только “работает ли запрос”, но и может ли сервис безопасно
перезапуститься, обновиться и вернуться на предыдущую версию.

### Phase 1 - Один EC2 и systemd

Это исходная точка для небольших сервисов.

```text
client -> EC2 -> process manager -> app
```

Что изучаем:

```text
process lifecycle
logs и restart policy
ручное обновление
single-instance failure
CPU/memory/network limits
```

Главное ограничение: deployment и capacity change зависят от одной машины.

### Phase 2 - EC2 + ALB + Auto Scaling Group

Это следующий шаг для `002-url-shortener` и основной текущий маршрут.

```text
client -> ALB -> ASG(app instances) -> RDS
                         |
                    CI/CD pipeline
```

Сначала оставляем приложение DB-only и проверяем, что инфраструктурная
репликация не меняет бизнес-логику:

```text
2 app instances
PG_POOL_MAX=20 или 40 на instance
тот же RDS
hot-read через ALB
```

Для deployment используем repeatable bootstrap, Docker image и CI/CD pipeline.
Главный предмет этого этапа - не конкретный deploy tool, а эксплуатация
нескольких VM за ALB и поведение системы при rolling update.

Чему учимся:

```text
горизонтальное масштабирование app layer
connection multiplication к RDS
draining connections перед остановкой instance
zero/minimal-downtime deployment
rollback без ручного SSH на каждую машину
```

Почему это место для URL shortener: текущие тесты уже показали разницу между
одним локальным pool и двумя app instances, поэтому инфраструктурная гипотеза
имеет измеряемую основу.

### Phase 3 - Elastic Beanstalk

Лучший кандидат: `001-order-backend-marketplace` в упрощенном виде или
небольшой HTTP API, выделенный из него.

```text
client -> Elastic Beanstalk environment -> RDS/SQS
```

Проверяем:

```text
насколько быстро получить ALB, instances, health checks и rolling deploy;
какие настройки платформа скрывает;
как выглядят logs, environment variables, scaling и rollback;
где заканчивается удобство PaaS.
```

В Beanstalk не стоит моделировать всю платежную или event-driven систему.
Сначала используем его для web tier, а worker и broker оставляем отдельными
компонентами. Это показывает сильную сторону Beanstalk: быстрый managed путь
для обычного web application, но не универсальную замену всей архитектуре.

### Phase 4 - Managed containers: ECS/Fargate + ECR

Лучший кандидат: `007-notification-service`.

```text
API service -> SQS -> ECS/Fargate workers -> email/SMS/push provider
                         |
                         +-> DLQ
```

Что тестируем:

```text
API latency не зависит от медленного provider;
worker count масштабируется по queue depth;
retries не создают дубликаты;
DLQ принимает permanent failures;
deploy новой версии не теряет messages.
```

После Fargate можно повторить worker layer на ECS с EC2 capacity provider и
Spot instances. Это даст честное сравнение:

```text
Fargate: меньше управления nodes, обычно дороже за постоянную нагрузку;
ECS on EC2: больше контроля и плотности размещения, больше node operations.
```

### Phase 5 - Serverless и event-driven вариант

Лучшие кандидаты: asynchronous часть `007-notification-service`,
`012-payment-system` reconciliation или небольшой video job.

```text
API -> SQS/EventBridge -> Lambda -> provider/storage
```

Изучаем concurrency limits, cold starts, retry/DLQ semantics, idempotency и
стоимость при idle и burst workload. Lambda не заменяет ECS или Kubernetes для
долгоживущих процессов, WebSocket-соединений и постоянно работающих consumers.

### Phase 6 - Batch/Spot для массовых workers

Лучший кандидат: `006-web-crawler`.

```text
frontier -> queue -> crawler workers -> object storage/index
```

Сравниваем ECS workers с AWS Batch/Spot-подходом на workload, где:

```text
работа длительная и прерываемая;
нагрузка приходит волнами;
важнее стоимость и throughput, чем latency одного job;
нужны retries и checkpointing.
```

Это отдельный класс масштабирования: не “сколько RPS выдерживает API”, а
“сколько jobs/sec обрабатываем при ограниченном бюджете”.

### Phase 7 - Managed Kubernetes: EKS

Лучший кандидат: `004-chat` или `005-news-feed`.

Kubernetes появляется здесь, когда уже есть несколько независимых workload'ов:

```text
gateway/API
connection или feed service
background workers
cache/event bus
metrics/observability
```

Сначала используем EKS, а stateful dependencies оставляем managed:

```text
RDS, ElastiCache, MSK/SQS, S3 и CloudWatch/managed observability.
```

Тестируем:

```text
Deployment и rolling update
readiness/liveness probes
HPA по CPU и custom metric
service discovery
Ingress/LoadBalancer
pod disruption и rescheduling
secrets/config maps
```

Важно: EKS добавляем не потому, что Kubernetes “лучше ECS”, а чтобы изучить
оркестрацию большого числа разных сервисов и workload profiles.

### Phase 8 - Kubernetes на IaaS без managed control plane

Лучший кандидат: `013-distributed-message-queue`.

Это advanced lab, где можно осмысленно изучать:

```text
control plane и worker nodes на EC2;
etcd/consensus;
StatefulSet;
persistent volumes и EBS;
broker placement и replication;
node failure;
upgrade и disaster recovery.
```

Практический порядок:

1. Сначала поднять небольшой Kafka-like/RabbitMQ-like кластер на EC2 вручную.
2. Затем перенести broker workload в self-managed Kubernetes.
3. Сравнить отказ ноды, восстановление данных, latency и operational effort.
4. Сопоставить результат с managed вариантом, например MSK или Amazon MQ.

Не используем self-managed Kubernetes для URL shortener: там стоимость
операционной сложности будет выше учебной пользы.

### Phase 9 - Specialized managed platforms

После базовых платформ выбираем сервис под физику workload:

| Case study | Основной managed вариант | Что изучаем |
| --- | --- | --- |
| `010-video-streaming` | S3 + MediaConvert + CloudFront | object storage, async transcoding, CDN |
| `009-search-autocomplete` | OpenSearch или специализированный index | query/index trade-offs |
| `011-proximity-service` | ElastiCache/Redis Geo или PostGIS | geo index, hot keys, read latency |
| `015-leaderboard` | ElastiCache Redis sorted sets | real-time ranking и sharding |
| `014-metrics-monitoring` | CloudWatch + Prometheus/Grafana | cardinality, retention, alerting |
| `012-payment-system` | ECS/Step Functions/SQS | idempotency, saga, reconciliation |
| `008-distributed-file-storage` | S3/EFS/EBS comparison | durability, throughput, metadata path |

Здесь главный вопрос уже не “какой оркестратор выбрать”, а “не пытаемся ли
мы решить специализированную задачу обычным web tier”.

## 3. Матрица case studies

| Case study | Старт | Основная инфраструктурная ветка | Главный bottleneck |
| --- | --- | --- | --- |
| `002-url-shortener` | EC2/systemd | Docker Compose/EC2 -> ECS/Fargate -> EKS comparison | DB pool, RDS, app capacity, deployment |
| `001-order-backend-marketplace` | Beanstalk web tier | ECS + SQS + saga workers | downstream latency, retries, idempotency |
| `003-rate-limiter` | EC2 API | Redis managed vs local sharding | shared state и hot key latency |
| `004-chat` | ECS service | EKS для connection/fanout services | long-lived connections, fanout |
| `005-news-feed` | ECS API/worker | EKS или ECS + materialization workers | fanout и read model freshness |
| `006-web-crawler` | ECS workers | Batch/Spot | queue backlog, cost/job, retries |
| `007-notification-service` | ECS/Fargate | ECS EC2 capacity provider | queue age, provider failures, DLQ |
| `008-distributed-file-storage` | EC2 + EBS | S3/EFS/CDN comparison | storage throughput и metadata |
| `009-search-autocomplete` | ECS API | OpenSearch/managed index | query latency и index rebuild |
| `010-video-streaming` | EC2 prototype | S3/MediaConvert/CloudFront | origin bandwidth, transcoding |
| `011-proximity-service` | ECS API | Redis Geo vs PostGIS | geo query latency, hot regions |
| `012-payment-system` | ECS API | SQS/Step Functions/ECS workers | external PSP, retries, reconciliation |
| `013-distributed-message-queue` | EC2 brokers | self-managed K8s -> managed broker | replication, disk, recovery |
| `014-metrics-monitoring` | EC2 Prometheus | EKS/Thanos/managed metrics | cardinality, retention, query cost |
| `015-leaderboard` | ECS API | Redis sorted sets/sharding | rank update throughput |
| `016-distributed-cache` | single Redis EC2 | ElastiCache/Redis Cluster | hot keys, resharding, failover |
| `017-distributed-lock` | single Redis | Redis HA vs etcd/ZooKeeper | correctness under failure |

## 4. Сжатый практический маршрут

Чтобы не тестировать все подряд, оставляем основной маршрут:

```text
1. Docker Compose для локального и reproducible single-host environment.
2. EC2 + systemd/Compose как простой VM baseline.
3. Beanstalk как PaaS для простого web API.
4. ECS/Fargate как managed container platform.
5. Lambda + SQS для коротких asynchronous jobs.
6. EKS как production orchestration platform.
```

ECS on EC2, Batch/Spot и self-managed Kubernetes изучаем только там, где они
отвечают отдельному вопросу:

```text
ECS on EC2 - плотность и стоимость container fleet;
Batch/Spot - дешевые прерываемые jobs;
self-managed Kubernetes - цена контроля над control plane и stateful nodes.
```

## 5. Что реально будем делать первым

### Сейчас: завершить DB-only ветку URL shortener

Порядок сохраняем таким:

```text
hot-read 1500 PASS
hot-read 2000 FAIL на одном app
2 app instances через ALB -> повторный 2000 RPS
затем DB-only эксперименты до примерно 5-6k RPS
```

Redis, queue и Kubernetes в этот эксперимент не добавляем. Иначе мы потеряем
причинно-следственную связь между изменением и bottleneck.

### Следующий инфраструктурный шаг для URL shortener

После текущего baseline:

1. Оформить текущий EC2 + ALB/ASG baseline как repeatable Docker Compose/CI
   deployment.
2. Измерить deployment time, rollback time и ошибки во время обновления.
3. Сделать отдельный ECS/Fargate вариант того же приложения, не смешивая его
   с текущим EC2 baseline.
4. Сравнить EC2/Compose и ECS по latency, capacity, cost и operations.

### После URL shortener

Рекомендуемый порядок:

```text
002 url shortener -> EC2/Compose -> ECS/Fargate -> EKS comparison
001 order backend -> Elastic Beanstalk
007 notification -> ECS/Fargate + SQS
006 web crawler -> ECS workers или Batch/Spot
004 chat или 005 news feed -> EKS
013 distributed message queue -> self-managed Kubernetes on EC2
010 video streaming -> S3 + MediaConvert + CloudFront
009 search autocomplete -> OpenSearch
015/016/017 -> Redis/ElastiCache и managed alternatives
```

Остальные проекты затем используют специализированные AWS services, где это
соответствует workload.

## 6. Definition of Done для каждой платформы

Платформа считается изученной только если есть:

```text
architecture diagram
repeatable deploy command или workflow
health/readiness проверка
load test и baseline result
failure experiment
rollback или recovery procedure
metrics dashboard/queries
cost и operational trade-off
короткий вывод: когда платформу выбирать, а когда нет
```

Итоговая цель проекта не “попробовать все AWS-сервисы”, а научиться видеть
границу применимости каждого уровня:

```text
Compose/VM -> PaaS -> managed containers -> serverless jobs -> Kubernetes ->
specialized managed service.
```
