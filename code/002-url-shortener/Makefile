.PHONY: test-nestjs build-nestjs test-go build-go

test-nestjs:
	cd implementations/nestjs && npm run build

build-nestjs:
	docker build -t url-shortener:nestjs -f implementations/nestjs/Dockerfile implementations/nestjs

test-go:
	cd implementations/go && GOCACHE=$${GOCACHE:-/tmp/url-shortener-go-cache} go test ./...

build-go:
	docker build -t url-shortener:go -f implementations/go/Dockerfile implementations/go
