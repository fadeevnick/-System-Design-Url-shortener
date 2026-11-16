# Go URL Shortener

Go implementation of the same API and PostgreSQL contract as the NestJS
implementation in the repository root.

## Local run

```bash
go run ./cmd/url-shortener
```

The service uses `DATABASE_URL` locally or `DATABASE_SECRET_ARN` on AWS,
`PORT=3000`, `BASE_URL`, `PG_POOL_MAX`, and `DB_AUTO_MIGRATE`.
