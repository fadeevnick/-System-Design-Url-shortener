package urls

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/example/url-shortener-go/internal/observability"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	pool    *pgxpool.Pool
	metrics *observability.Metrics
	baseURL string
}

func NewService(pool *pgxpool.Pool, metrics *observability.Metrics, baseURL string) *Service {
	return &Service{pool: pool, metrics: metrics, baseURL: baseURL}
}

func (s *Service) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /shorten", s.create)
	mux.HandleFunc("GET /{shortCode}", s.redirect)
}

func (s *Service) create(w http.ResponseWriter, r *http.Request) {
	var request struct {
		LongURL string `json:"longUrl"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil || !validURL(request.LongURL) {
		writeError(w, http.StatusBadRequest, "longUrl must be a valid http or https URL")
		return
	}

	ctx := r.Context()
	started := time.Now()
	client, err := s.acquire(ctx, "create_short_url")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database connection failed")
		return
	}
	defer client.Release()
	defer s.metrics.RecordPool(s.pool)

	tx, err := client.Begin(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "transaction failed")
		return
	}
	rollback := true
	defer func() {
		if rollback {
			_ = tx.Rollback(ctx)
		}
	}()

	var id int64
	if err = tx.QueryRow(ctx, "INSERT INTO urls (long_url) VALUES ($1) RETURNING id", request.LongURL).Scan(&id); err != nil {
		writeError(w, http.StatusInternalServerError, "database write failed")
		return
	}
	s.metrics.Increment("db_write_total", map[string]string{"operation": "insert_url"})

	shortCode := EncodeBase62(id)
	if err = tx.QueryRow(ctx, "UPDATE urls SET short_code = $1 WHERE id = $2 RETURNING id", shortCode, id).Scan(&id); err != nil {
		writeError(w, http.StatusInternalServerError, "database write failed")
		return
	}
	s.metrics.Increment("db_write_total", map[string]string{"operation": "update_short_code"})

	if err = tx.Commit(ctx); err != nil {
		writeError(w, http.StatusInternalServerError, "database commit failed")
		return
	}
	rollback = false
	s.metrics.Increment("db_write_total", map[string]string{"operation": "commit_create_short_url"})
	s.metrics.Observe("create_short_url_duration", time.Since(started), nil)

	writeJSON(w, http.StatusCreated, map[string]string{
		"shortCode": shortCode,
		"shortUrl":  strings.TrimRight(s.baseURL, "/") + "/" + shortCode,
		"longUrl":   request.LongURL,
	})
}

func (s *Service) redirect(w http.ResponseWriter, r *http.Request) {
	shortCode := r.PathValue("shortCode")
	started := time.Now()
	client, err := s.acquire(r.Context(), "resolve_short_code")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database connection failed")
		return
	}
	defer client.Release()
	defer s.metrics.RecordPool(s.pool)

	var longURL string
	err = client.QueryRow(r.Context(), "SELECT long_url FROM urls WHERE short_code = $1", shortCode).Scan(&longURL)
	s.metrics.Increment("db_read_total", map[string]string{"operation": "resolve_short_code"})
	s.metrics.Observe("db_query_duration", time.Since(started), map[string]string{"operation": "resolve_short_code"})
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Short URL was not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}

	http.Redirect(w, r, longURL, http.StatusFound)
}

func (s *Service) acquire(ctx context.Context, operation string) (*pgxpool.Conn, error) {
	started := time.Now()
	client, err := s.pool.Acquire(ctx)
	s.metrics.Observe("db_pool_wait_duration", time.Since(started), map[string]string{"operation": operation})
	return client, err
}

func validURL(value string) bool {
	parsed, err := url.ParseRequestURI(value)
	return err == nil && (parsed.Scheme == "http" || parsed.Scheme == "https") && parsed.Host != ""
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]any{"statusCode": status, "message": message})
}
