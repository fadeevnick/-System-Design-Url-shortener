FROM golang:1.23-alpine AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags='-s -w' -o /out/url-shortener ./cmd/url-shortener

FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=build /out/url-shortener /url-shortener
EXPOSE 3000
ENTRYPOINT ["/url-shortener"]
