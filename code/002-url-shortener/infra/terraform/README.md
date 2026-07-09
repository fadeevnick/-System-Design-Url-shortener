# Deploy PostgreSQL to GCP with Terraform

Этот Terraform-код создает managed PostgreSQL в GCP Cloud SQL для URL shortener.

Он создает:

- Cloud SQL PostgreSQL instance;
- database `url_shortener`;
- user `url_shortener`;
- случайный password для user;
- public IPv4 access с allowlist из `authorized_networks`;
- output `database_url` для `.env` приложения.

По умолчанию используется Cloud SQL edition `ENTERPRISE`, потому что маленький учебный tier `db-f1-micro` не подходит для `ENTERPRISE_PLUS`.

## Prerequisites

1. В GCP должен быть включен billing.
2. В проекте должен быть включен Cloud SQL Admin API.
3. Локально должен быть установлен Terraform.
4. Google provider должен получить credentials. Для локальной разработки проще всего:

```bash
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

## Setup

```bash
cd /home/nickf/Documents/architecture/code/002-url-shortener/infra/terraform
cp terraform.tfvars.example terraform.tfvars
```

Заполни `terraform.tfvars`:

```hcl
gcp_project = "your-project-id"

authorized_networks = [
  {
    name  = "local-dev"
    value = "YOUR_PUBLIC_IP/32"
  }
]
```

## Deploy

```bash
terraform init
terraform plan
terraform apply
```

Получить connection string:

```bash
terraform output -raw database_url
```

Password в этой строке URL-encoded, потому что random password может содержать символы вроде `/`, `?`, `#` или `@`.

Подставь его в `.env` приложения:

```bash
DATABASE_URL=postgres://url_shortener:<password>@<public-ip>:5432/url_shortener
```

## Destroy

```bash
terraform destroy
```

Если хочешь защитить базу от случайного удаления, поставь:

```hcl
deletion_protection = true
```

## Why Terraform

Для Cloud SQL мы создаем managed cloud resources, а не настраиваем сервер по SSH. Terraform лучше подходит для этого, потому что:

- хранит state;
- показывает diff через `terraform plan`;
- умеет обновлять существующие cloud resources;
- удобнее удаляет всю инфраструктуру через `terraform destroy`;
- outputs можно напрямую использовать в `.env` приложения.
