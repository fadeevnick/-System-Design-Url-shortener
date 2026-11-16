package observability

import "net/http"

var _ http.ResponseWriter = (*statusWriter)(nil)
