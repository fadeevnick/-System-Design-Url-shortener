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
- [docs/experiments.md](docs/experiments.md) — как запускать baseline experiments.

Полезные endpoints:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/metrics
```

Главный нагрузочный сценарий перед добавлением Redis:

```bash
CONCURRENCY_STEPS=10,25,50,100,200 \
STEP_SECONDS=30 \
TARGET_P95_MS=100 \
npm run experiment:load -- capacity-step
```

## PostgreSQL в GCP

Для деплоя PostgreSQL в GCP через Terraform смотри:

[infra/terraform/README.md](infra/terraform/README.md)

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
