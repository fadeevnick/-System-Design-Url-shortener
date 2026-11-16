package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/example/url-shortener-go/internal/config"
	"github.com/example/url-shortener-go/internal/database"
	"github.com/example/url-shortener-go/internal/observability"
	"github.com/example/url-shortener-go/internal/system"
	"github.com/example/url-shortener-go/internal/urls"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cfg, err := config.Load(ctx)
	if err != nil {
		log.Fatal(err)
	}

	metrics := observability.NewMetrics()
	pool, err := database.Open(ctx, cfg, metrics)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	if cfg.AutoMigrate {
		if err := database.EnsureSchema(ctx, pool); err != nil {
			log.Fatal(err)
		}
	}

	service := urls.NewService(pool, metrics, cfg.BaseURL)
	mux := http.NewServeMux()
	service.Register(mux)
	system.Register(mux, metrics, pool)

	server := &http.Server{
		Addr:              cfg.ListenAddress,
		Handler:           metrics.HTTPMiddleware(mux),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       65 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()

	log.Printf("go url-shortener listening on %s", cfg.ListenAddress)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
