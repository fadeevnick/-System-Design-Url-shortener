# Production Readiness Audit

Этот проект специально сделан как учебная лаборатория для system design:

```text
API -> PostgreSQL
```

Цель - не построить production-ready Bitly сразу, а увидеть baseline, измерить конкретную проблему и только потом добавлять паттерны.

Поэтому часть вещей реализована просто и вручную. Это полезно для обучения, но в реальных production-проектах часто заменяется готовыми инструментами.

## 1. Metrics

Сейчас:

```text
src/observability/metrics.service.ts
```

Приложение хранит counters/gauges/timers в памяти процесса и отдает их через `/metrics`.

Примеры:

```text
http_requests_total
http_request_duration_avg_ms
db_pool_wait_duration_avg_ms
db_query_duration_avg_ms
db_pool_waiting_count_max_observed
```

Почему это хорошо для учебного проекта:

- видно, что именно измеряется;
- легко отделить pool wait от query duration;
- не нужна отдельная observability-инфраструктура.

Ограничения:

- метрики теряются после restart;
- метрики cumulative since process start;
- нет app-side p95/p99;
- нет histogram buckets;
- `max` может устареть после одного spike;
- несколько app instances будут иметь разные локальные метрики;
- нет Prometheus `HELP` / `TYPE`;
- нет long-term storage, dashboards и alerts.

Production-замена:

- `prom-client` для Node.js/NestJS;
- Prometheus histograms;
- Grafana dashboards;
- Alertmanager;
- OpenTelemetry Metrics;
- CloudWatch custom metrics;
- Datadog / New Relic.

Например вместо самописных:

```text
db_query_duration_avg_ms
db_query_duration_max_ms
```

в production обычно используют histogram:

```text
db_query_duration_seconds_bucket
db_query_duration_seconds_sum
db_query_duration_seconds_count
```

И считают p95:

```promql
histogram_quantile(0.95, rate(db_query_duration_seconds_bucket[5m]))
```

Когда переходить:

- нужны app-side p95/p99;
- появляется больше одного app instance;
- нужны dashboards, alerts и история.

## 2. Load Testing

Текущий основной подход:

```text
tools/k6/url-shortener.js
```

`tools/load-test.mjs` был legacy самописным Node.js load test и удален после перехода на k6.

Почему он был полезен:

- быстро проверил механику baseline;
- показал `dbReadDelta`;
- помог найти первые pressure points через `capacity-step`.

Ограничения:

- closed-loop модель: worker ждет ответ и только потом делает следующий request;
- сложно задать строгий incoming RPS;
- меньше стандартной отчетности;
- легко упереться в сам load-test script.

Production/реальная замена:

- k6;
- wrk / wrk2;
- vegeta;
- Locust;
- JMeter;
- Gatling.

Мы уже начали переход на k6:

```text
tools/k6/url-shortener.js
```

k6 с `constant-arrival-rate` лучше отвечает на вопрос:

```text
выдерживает ли redirect path 1000/1500/2000 RPS?
```

Когда переходить:

- для fixed RPS тестов - уже перешли;
- Node.js script можно оставить как quick diagnostic tool.

## 3. Database Schema And Migrations

Сейчас:

```text
src/database/database.module.ts
```

Приложение при старте выполняет:

```sql
CREATE TABLE IF NOT EXISTS urls (...);
CREATE INDEX IF NOT EXISTS urls_short_code_idx ON urls (short_code);
```

Почему это хорошо для учебного проекта:

- простой запуск;
- не нужен migration tool;
- локальная база сама инициализируется.

Ограничения:

- app startup меняет schema;
- нет версий миграций;
- нет rollback;
- сложно безопасно менять schema в production;
- несколько app instances могут одновременно выполнять DDL;
- нет reviewable migration history.

Production-замена:

- Prisma Migrate;
- TypeORM migrations;
- Knex migrations;
- `node-pg-migrate`;
- Flyway;
- Liquibase;
- Sqitch.

Когда переходить:

- появилась вторая schema migration;
- есть staging/prod окружения;
- schema changes должны идти через deploy pipeline.

## 4. Database Access

Сейчас:

```text
pg.Pool напрямую
raw SQL
ручные BEGIN / COMMIT / ROLLBACK
```

Почему это хорошо для учебного проекта:

- видно настоящий SQL;
- легко измерить `pool.connect()` и `client.query()`;
- хорошо подходит для изучения DB bottlenecks.

Ограничения:

- много ручного кода;
- нет typed query layer;
- transaction management вручную;
- нет централизованных retries, query timeouts и query logging.

Production-варианты:

- raw `pg` + строгие внутренние helpers;
- Slonik;
- Kysely;
- Drizzle;
- Prisma;
- TypeORM;
- Knex.

Важно: raw `pg` может быть production-нормальным для high-load read path. Не обязательно брать ORM. Но нужны migrations, timeouts, observability и error handling.

Когда переходить:

- появляется много таблиц и queries;
- нужны typed queries;
- domain model становится сложнее.

## 5. Connection Pooling

Сейчас:

```text
каждый app process имеет свой pg.Pool
PG_POOL_MAX управляется env
```

Почему это хорошо для учебного проекта:

- видно pool saturation;
- можно сравнивать `PG_POOL_MAX=50` и `PG_POOL_MAX=100`;
- можно увидеть connection-slot errors.

Ограничения:

- если app instances станет 5, total DB connections будет примерно `5 * PG_POOL_MAX`;
- легко выбить `max_connections` RDS;
- нет server-side pooling;
- нет transaction pooling.

Production-замена/дополнение:

- RDS Proxy;
- PgBouncer;
- Odyssey;
- managed pooler;
- careful per-instance pool sizing.

Когда переходить:

- несколько app instances;
- serverless/Lambda;
- RDS `max_connections` становится ограничением;
- connection churn высокий.

## 6. Health Checks

Сейчас:

```text
GET /health -> { status: "ok" }
```

Почему это хорошо для учебного проекта:

- просто проверить, что process жив.

Ограничения:

- не проверяет DB;
- не различает liveness и readiness;
- может вернуть `ok`, даже если PostgreSQL недоступен.

Production-замена:

- `@nestjs/terminus`;
- separate `/live` and `/ready`;
- DB readiness check;
- dependency health checks;
- ALB target health checks;
- Kubernetes probes.

Обычно:

```text
/live  -> process alive
/ready -> app can serve traffic, DB/cache reachable
```

Когда переходить:

- перед ALB/autoscaling;
- перед несколькими app instances;
- перед Kubernetes/ECS.

## 7. Validation

Сейчас:

```ts
export class CreateShortUrlDto {
  longUrl!: string;
}
```

Реальная проверка URL сделана вручную в service:

```text
assertValidUrl()
```

Почему это хорошо для учебного проекта:

- видно, что именно проверяется;
- минимум зависимостей.

Ограничения:

- нет глобального `ValidationPipe`;
- нет `class-validator` decorators;
- нет автоматической проверки shape/body;
- нет `whitelist` / `forbidNonWhitelisted`;
- нет OpenAPI schema из DTO.

Production-замена:

- `class-validator`;
- `class-transformer`;
- NestJS `ValidationPipe`;
- Zod;
- Joi;
- OpenAPI/Swagger validation.

Когда переходить:

- появляется больше DTO;
- нужен predictable bad request behavior;
- нужен Swagger/OpenAPI.

## 8. Error Handling

Сейчас:

```text
controller ловит statusFromError
неизвестные ошибки становятся 500
Nest default exception handler пишет stack trace
```

Почему это хорошо для учебного проекта:

- просто;
- достаточно для первичной диагностики.

Ограничения:

- нет централизованного exception filter;
- нет structured error response;
- нет correlation/request id;
- нет разделения user errors и internal errors;
- нет error metrics по exception type.

Production-замена:

- NestJS `ExceptionFilter`;
- structured JSON logs;
- request id / trace id;
- Sentry;
- Datadog Error Tracking;
- OpenTelemetry traces.

Когда переходить:

- нужно расследовать `500` без SSH;
- есть внешние клиенты;
- нужны стабильные error contracts.

## 9. Logging

Сейчас:

```text
Nest default logs + systemd journal
```

Почему это хорошо для учебного проекта:

- можно увидеть stack trace;
- достаточно для одного EC2.

Ограничения:

- логи не structured JSON;
- нет централизованного хранения;
- нет request id;
- нет sampling;
- неудобно искать по нескольким instances.

Production-замена:

- Pino;
- Winston;
- CloudWatch Logs;
- ELK/OpenSearch;
- Loki;
- Datadog Logs;
- OpenTelemetry Logs.

Когда переходить:

- app больше одного instance;
- нужны расследования за прошлые дни;
- появляются alerts.

## 10. Tracing

Сейчас:

```text
нет distributed tracing
```

Учебная альтернатива:

```text
мы вручную меряем pool wait и query duration
```

Production-замена:

- OpenTelemetry;
- AWS X-Ray;
- Datadog APM;
- New Relic;
- Honeycomb;
- Jaeger/Tempo.

Что даст:

```text
trace одного request:
HTTP -> controller -> service -> pg query -> response
```

Когда переходить:

- появляется cache, queue, несколько сервисов, ALB, retries;
- latency нужно объяснять на уровне одного request.

## 11. Config And Secrets

Сейчас:

```text
dotenv
process.env
ручной .env на EC2
GitHub Secrets
```

Почему это хорошо для учебного проекта:

- легко менять `DATABASE_URL` и `PG_POOL_MAX`;
- удобно для экспериментов.

Ограничения:

- нет schema validation env vars;
- нет typed config;
- легко забыть обязательный env;
- secrets лежат в `.env` на instance;
- нет rotation.

Production-замена:

- `@nestjs/config` + Joi/Zod validation;
- AWS SSM Parameter Store;
- AWS Secrets Manager;
- Doppler;
- 1Password;
- Vault;
- ECS task secrets / Kubernetes secrets.

Когда переходить:

- окружений больше одного;
- нужна secret rotation;
- надо исключить misconfig deploy.

## 12. Deployment

Сейчас:

```text
GitHub Actions -> scp tar.gz -> EC2 -> systemd restart
```

Почему это хорошо для учебного проекта:

- прозрачно;
- видно, что именно деплоится;
- хорошо для одного instance.

Ограничения:

- нет rolling deploy;
- нет blue/green;
- нет autoscaling;
- нет immutable image;
- нет health-gated rollout;
- нет automatic rollback.

Production-замена:

- Docker image + ECR;
- ECS/Fargate;
- Kubernetes;
- Elastic Beanstalk;
- CodeDeploy;
- Terraform-managed ASG + ALB;
- blue/green deployments.

Когда переходить:

- больше одного app instance;
- downtime при restart неприемлем;
- нужен rollback.

## 13. Infrastructure As Code

Сейчас:

```text
в repo есть Terraform под GCP Cloud SQL
фактический стенд сейчас AWS EC2/RDS
часть AWS infra создается вручную
```

Почему это нормально для учебного этапа:

- быстрее экспериментировать;
- можно руками менять RDS class, security groups, EC2.

Ограничения:

- AWS infra не полностью описана кодом;
- сложно воспроизвести окружение;
- возможен drift;
- неочевидно, какие security groups/subnets/RDS/EC2 нужны.

Production-замена:

- Terraform для AWS;
- Pulumi;
- AWS CDK;
- CloudFormation.

Что описать:

- VPC/subnets;
- app EC2;
- load-test EC2;
- RDS;
- security groups;
- IAM roles;
- CloudWatch alarms.

Когда переходить:

- если load-test EC2 и app EC2 будут пересоздаваться;
- если нужны повторяемые эксперименты;
- если стенд будет использоваться регулярно.

## 14. Runtime Process Management

Сейчас:

```text
systemd service
node dist/main.js
```

Почему это хорошо для учебного проекта:

- просто;
- надежно для одного EC2.

Ограничения:

- нет process clustering;
- нет container resource limits;
- нет orchestration;
- manual host management.

Production-варианты:

- systemd для маленьких single-host setups;
- PM2;
- Docker + ECS;
- Kubernetes;
- Nomad.

Для AWS production чаще выбирают:

```text
Docker image -> ECS/Fargate -> ALB -> RDS
```

## 15. API Security And Abuse Protection

Сейчас:

```text
POST /shorten публичный
нет auth
нет rate limit
нет anti-spam
нет malicious URL checks
```

Почему это нормально для учебного проекта:

- не мешает изучать read path;
- меньше посторонней логики.

Production-замена:

- rate limiting;
- API Gateway / ALB WAF;
- AWS WAF;
- captcha для public shorten;
- URL reputation checks;
- blocklist/allowlist;
- malware/phishing scanning;
- auth для internal APIs.

Когда переходить:

- перед публичным доступом в интернет;
- до любых реальных пользователей.

## 16. Redirect Behavior

Сейчас:

```text
302 redirect
long_url хранится как есть
```

Почему это хорошо для учебного проекта:

- минимальная логика;
- focus на read path.

Production-вопросы:

- 301 vs 302 semantics;
- analytics/click tracking;
- UTM preservation;
- bot filtering;
- abuse reports;
- expiration;
- custom aliases;
- domain ownership.

Production-компоненты:

- CDN/edge redirects;
- CloudFront Functions / Lambda@Edge;
- Fastly Compute;
- NGINX/OpenResty;
- Redis/cache-aside;
- analytics pipeline.

Когда переходить:

- после baseline read-path experiments;
- когда появится конкретное product requirement.

## 17. Caching

Сейчас:

```text
нет Redis
каждый redirect = SELECT PostgreSQL
```

Почему это хорошо для учебного проекта:

- baseline честный;
- можно доказать `dbReadsPerSuccessfulRequest = 1`.

Production-замена:

- Redis / ElastiCache;
- Memcached;
- in-process LRU cache;
- CDN/edge cache для redirect;
- cache-aside;
- write-through;
- refresh-ahead.

Когда переходить:

- hot-read workload ломает SLO;
- repeat reads доминируют;
- DB reads становятся дорогими;
- vertical scaling хуже/дороже cache.

## 18. ID Generation And Short Codes

Сейчас:

```text
id = PostgreSQL BIGSERIAL
short_code = base62(id)
```

Почему это хорошо для учебного проекта:

- просто;
- хорошо объясняет sequence/counter ID;
- легко связать id и short code.

Production-вопросы:

- predictable short codes;
- enumeration risk;
- custom aliases;
- multi-region ID generation;
- sharding;
- collision strategy;
- expiration/deletion;
- tenant isolation.

Production-варианты:

- random short code + collision retry;
- Hashids-like obfuscation;
- Snowflake-style ID;
- separate ID generator;
- DB sequence ranges per shard.

Когда переходить:

- важна непредсказуемость;
- появляется sharding/multi-region;
- появляются custom aliases.

## 19. Testing

Сейчас:

```text
нет полноценного unit/e2e test suite
tools/test.mjs есть как простой script
```

Почему это нормально для учебного этапа:

- быстро проверять API руками;
- меньше инфраструктуры.

Production-замена:

- Jest unit tests;
- Nest e2e tests with Supertest;
- Testcontainers PostgreSQL;
- contract tests;
- CI pipeline;
- migration tests;
- load test smoke gate.

Когда переходить:

- перед Redis/cache layer;
- перед migration tool;
- перед refactor;
- перед несколькими deployment environments.

## 20. SLO And Alerts

Сейчас SLO есть в экспериментах:

```text
p95 < 100ms
errorRate < 1%
```

Но пока нет:

- dashboards;
- alerts;
- burn-rate alerts;
- error budget;
- incident workflow.

Production-замена:

- Prometheus alert rules;
- Grafana dashboards;
- CloudWatch alarms;
- Datadog monitors;
- SLO/error budget tracking.

Когда переходить:

- тесты становятся регулярными;
- появляется staging/prod-like стенд;
- нужно быстро видеть regressions.

## Suggested Upgrade Order

Не нужно сразу заменять все учебные части production-инструментами. Для текущего проекта разумный порядок такой:

1. k6 для fixed RPS load testing.
2. Prometheus-style metrics и histograms.
3. Migration tool вместо `CREATE TABLE` on startup.
4. ValidationPipe + DTO validation.
5. Structured logs + request id.
6. Proper `/live` and `/ready`.
7. AWS Terraform для EC2/RDS/security groups/load-test EC2.
8. RDS Proxy/PgBouncer, если connections станут проблемой.
9. Redis/cache-aside, только после доказанного read-path bottleneck.
10. CI tests + e2e tests.

Самый полезный следующий upgrade после k6:

```text
Prometheus-style histograms for:
http_request_duration
db_pool_wait_duration
db_query_duration
```

Почему:

```text
сейчас app metrics дают avg/max;
для bottleneck analysis нужны app-side p95/p99;
тогда можно сравнивать k6 p95 с internal app p95.
```

