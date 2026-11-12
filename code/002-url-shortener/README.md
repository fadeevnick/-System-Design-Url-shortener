# 002 URL Shortener

Минимальная реализация простейшей архитектуры:

- NestJS API instance;
- один PostgreSQL;
- ID генерирует сам Postgres через `BIGSERIAL`;
- `short_code` получается через `base62(id)`;
- без Redis, CDN, шардинга и отдельного ID generator.

## Запуск

```bash
cp .env.example .env
docker compose up -d
npm install
npm run start:dev
```

API будет доступен на `http://localhost:3000`.

## Evolution lab

Этот пример развивается по шагам: сначала простая архитектура, потом каждое усложнение добавляется только после сценария, который показывает проблему.

- [docs/evolution.md](docs/evolution.md) — порядок усложнения архитектуры.
- [docs/load-testing.md](docs/load-testing.md) — bottleneck-driven protocol для k6 и отдельной load-test EC2.
- [docs/metrics.md](docs/metrics.md) — что означает каждая метрика из `/metrics`.
- [docs/production-readiness-audit.md](docs/production-readiness-audit.md) — какие части проекта учебные и чем их заменяют в production.

Полезные endpoints:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/metrics
```

Главный нагрузочный сценарий перед добавлением Redis запускается через k6 с отдельной load-test EC2:

```bash
BASE_URL=http://<app-private-ip>:3000 \
WORKLOAD=hot-read \
RATE=1000 \
DURATION=3m \
TARGET_P95_MS=300 \
MAX_ERROR_RATE=0.01 \
MAX_DROPPED_ITERATIONS=1 \
npm run experiment:k6 -- --summary-export results-hot-read-1000.json
```

## Deploy to AWS EC2

Terraform создаёт backend, общую AWS platform-инфраструктуру, application
stack и отдельный load-test host. Ansible устанавливает Docker и запускает
Compose deployment на EC2:

[infra/ansible/README.md](infra/ansible/README.md)

Terraform backend bootstrap and AWS lifecycle stacks:

- [infra/terraform/bootstrap/aws](infra/terraform/bootstrap/aws)
- [infra/terraform/aws-platform](infra/terraform/aws-platform)
- [infra/terraform/load-test-aws](infra/terraform/load-test-aws)
- [infra/terraform/compose-ec2](infra/terraform/compose-ec2)
- [infra/terraform/compose-ec2-alb](infra/terraform/compose-ec2-alb)

## Создать короткую ссылку

```bash
curl -X POST http://localhost:3000/shorten \
  -H 'Content-Type: application/json' \
  -d '{"longUrl":"https://shop.example.com/orders/923847293847?token=abc&utm_source=sms&utm_campaign=pickup_ready"}'
```

Пример ответа:

```json
{
  "shortCode": "1",
  "shortUrl": "http://localhost:3000/1",
  "longUrl": "https://shop.example.com/orders/923847293847?token=abc&utm_source=sms&utm_campaign=pickup_ready"
}
```

## Перейти по короткой ссылке

```bash
curl -i http://localhost:3000/1
```

Ответ будет `302 Found` с header `Location: <longUrl>`.

## Таблица

Приложение само создает таблицу при старте:

```sql
CREATE TABLE urls (
    id BIGSERIAL PRIMARY KEY,
    short_code TEXT UNIQUE,
    long_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Это учебный пример. В production миграции лучше выносить в отдельный migration tool.
