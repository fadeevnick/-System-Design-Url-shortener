package system

import (
	"encoding/json"
	"net/http"

	"github.com/example/url-shortener-go/internal/observability"
	"github.com/jackc/pgx/v5/pgxpool"
)

func Register(mux *http.ServeMux, metrics *observability.Metrics, pool *pgxpool.Pool) {
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /metrics", func(w http.ResponseWriter, _ *http.Request) {
		metrics.RecordPool(pool)
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte(metrics.Render()))
	})
	mux.HandleFunc("POST /metrics/reset", func(w http.ResponseWriter, r *http.Request) {
		expected := getenv("METRICS_RESET_TOKEN")
		if expected == "" || r.Header.Get("x-metrics-reset-token") != expected {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
			return
		}
		metrics.Reset()
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func getenv(name string) string {
	return lookupEnv(name)
}
