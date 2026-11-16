package observability

import (
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type timer struct {
	count int64
	sum   float64
	max   float64
}

type Metrics struct {
	mu       sync.RWMutex
	counters map[string]int64
	gauges   map[string]float64
	timers   map[string]timer
}

func NewMetrics() *Metrics {
	return &Metrics{counters: map[string]int64{}, gauges: map[string]float64{}, timers: map[string]timer{}}
}

func (m *Metrics) Increment(name string, labels map[string]string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.counters[key(name, labels)]++
}

func (m *Metrics) Observe(name string, duration time.Duration, labels map[string]string) {
	value := float64(duration) / float64(time.Millisecond)
	m.mu.Lock()
	defer m.mu.Unlock()
	current := m.timers[key(name, labels)]
	current.count++
	current.sum += value
	if value > current.max {
		current.max = value
	}
	m.timers[key(name, labels)] = current
}

func (m *Metrics) SetGauge(name string, value float64, labels map[string]string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.gauges[key(name, labels)] = value
}

func (m *Metrics) Reset() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.counters = map[string]int64{}
	m.gauges = map[string]float64{}
	m.timers = map[string]timer{}
}

func (m *Metrics) Render() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	lines := make([]string, 0, len(m.counters)+len(m.gauges)+len(m.timers)*2)
	for name, value := range m.counters {
		lines = append(lines, fmt.Sprintf("%s %d", name, value))
	}
	for name, value := range m.gauges {
		lines = append(lines, fmt.Sprintf("%s %s", name, strconv.FormatFloat(value, 'f', -1, 64)))
	}
	for name, value := range m.timers {
		if value.count == 0 {
			continue
		}
		lines = append(lines,
			fmt.Sprintf("%s_avg_ms %d", name, int64(value.sum/float64(value.count)+0.5)),
			fmt.Sprintf("%s_max_ms %d", name, int64(value.max+0.5)))
	}
	sort.Strings(lines)
	return strings.Join(lines, "\n") + "\n"
}

func (m *Metrics) HTTPMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		wrapped := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(wrapped, r)
		labels := map[string]string{"method": r.Method, "route": routeName(r), "status": strconv.Itoa(wrapped.status)}
		m.Increment("http_requests_total", labels)
		m.Observe("http_request_duration", time.Since(started), labels)
	})
}

func routeName(r *http.Request) string {
	if r.Method == http.MethodPost && r.URL.Path == "/shorten" {
		return "/shorten"
	}
	if r.Method == http.MethodGet {
		switch r.URL.Path {
		case "/health", "/metrics":
			return r.URL.Path
		default:
			return "/:shortCode"
		}
	}
	if r.URL.Path == "/metrics/reset" {
		return "/metrics/reset"
	}
	return r.URL.Path
}

func (m *Metrics) RecordPool(pool *pgxpool.Pool) {
	stat := pool.Stat()
	m.SetGauge("db_pool_active", float64(stat.AcquiredConns()), nil)
	m.SetGauge("db_pool_idle", float64(stat.IdleConns()), nil)
	m.SetGauge("db_pool_total", float64(stat.TotalConns()), nil)
	// pgxpool exposes the number of currently constructing connections but not
	// a waiting gauge. Keep the metric name available for cross-runtime reports.
	m.SetGauge("db_pool_waiting", 0, nil)
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func (w *statusWriter) Write(body []byte) (int, error) {
	return w.ResponseWriter.Write(body)
}

func key(name string, labels map[string]string) string {
	if len(labels) == 0 {
		return name
	}
	names := make([]string, 0, len(labels))
	for label := range labels {
		names = append(names, label)
	}
	sort.Strings(names)
	parts := make([]string, 0, len(names))
	for _, label := range names {
		parts = append(parts, fmt.Sprintf(`%s="%s"`, label, labels[label]))
	}
	return name + "{" + strings.Join(parts, ",") + "}"
}
