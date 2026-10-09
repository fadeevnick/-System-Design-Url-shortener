# GitHub Actions deploy to EC2

Этот вариант деплоя запускается вручную из GitHub Actions.

Важно: git repository находится выше проекта:

```text
/home/nickf/Documents/architecture
```

Поэтому workflow лежит в корне repo:

```text
.github/workflows/url-shortener-deploy.yml
```

А команды сборки выполняются из подпапки:

```text
code/002-url-shortener
```

Он делает:

1. собирает NestJS проект;
2. создает archive с `dist`, `tools`, `docs`, `package.json`, `package-lock.json`;
3. копирует archive на EC2 по SSH;
4. на EC2 устанавливает production dependencies;
5. создает `.env` из GitHub Secrets;
6. перезапускает `systemd` service;
7. проверяет `GET /health`.

## Почему workflow manual

Workflow настроен на ручной запуск:

```yaml
on:
  workflow_dispatch:
```

Это сделано специально, чтобы push в GitHub не деплоил автоматически. Для учебного стенда безопаснее явно нажимать `Run workflow`.

## GitHub secrets

В GitHub repo открой:

```text
Settings -> Secrets and variables -> Actions -> New repository secret
```

Добавь:

| Secret | Example | Для чего |
|---|---|---|
| `EC2_HOST` | `63.177.105.125` | Public IP или DNS EC2 |
| `EC2_USER` | `ubuntu` | SSH user |
| `EC2_SSH_KEY` | full private key content | Private key для SSH |
| `PORT` | `3000` | Порт приложения |
| `BASE_URL` | `http://localhost:3000` | Base URL для стенда |
| `DATABASE_URL` | `postgres://...` | RDS connection string |
| `PG_POOL_MAX` | `10` | Размер `pg.Pool` |

`DATABASE_URL` для AWS RDS может выглядеть так:

```text
postgres://url_shortener:PASSWORD@url-shortener-db.xxxxx.eu-central-1.rds.amazonaws.com:5432/url_shortener?uselibpqcompat=true&sslmode=require
```

## EC2 prerequisites

На EC2 должны быть установлены Node.js и npm:

```bash
node -v
npm -v
```

Если их нет:

```bash
sudo apt update
sudo apt install -y curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Проверь, что пользователь `ubuntu` может выполнять `sudo systemctl`:

```bash
sudo systemctl status
```

## First deploy

В GitHub:

```text
Actions -> Deploy URL Shortener to EC2 -> Run workflow
```

После деплоя на EC2:

```bash
sudo systemctl status url-shortener
curl http://localhost:3000/health
curl http://localhost:3000/metrics
```

## Run experiments after deploy

Основные load tests запускаются не на app EC2, а на отдельной load-test EC2:

```bash
cd ~/002-url-shortener

BASE_URL=http://<app-private-ip>:3000 \
WORKLOAD=hot-read \
RATE=1000 \
DURATION=3m \
TARGET_P95_MS=300 \
MAX_ERROR_RATE=0.01 \
MAX_DROPPED_ITERATIONS=1 \
npm run experiment:k6 -- --summary-export results-hot-read-1000.json
```

## Important notes

- Не добавляй `.env` в git.
- Не коммить private key.
- Если EC2 public IP изменился, обнови `EC2_HOST`.
- Если меняешь `PG_POOL_MAX`, перезапусти workflow или обнови `.env` на EC2 и сделай `sudo systemctl restart url-shortener`.
