package database

import (
	"context"
	"fmt"
	"strings"

	"github.com/example/url-shortener-go/internal/config"
	"github.com/example/url-shortener-go/internal/observability"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func Open(ctx context.Context, cfg config.Config, metrics *observability.Metrics) (*pgxpool.Pool, error) {
	poolConfig, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database URL: %w", err)
	}
	poolConfig.MaxConns = cfg.PoolMax
	poolConfig.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		return nil
	}

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, fmt.Errorf("open database pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}
	_ = metrics
	return pool, nil
}

func EnsureSchema(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, strings.TrimSpace(`
CREATE TABLE IF NOT EXISTS urls (
  id BIGSERIAL PRIMARY KEY,
  short_code TEXT UNIQUE,
  long_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`))
	if err != nil {
		return fmt.Errorf("ensure urls table: %w", err)
	}
	return nil
}
