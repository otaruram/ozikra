# Multi-stage production build for OZIK-SENTINEL Golang Backend
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Install security and build certificates
RUN apk add --no-cache git ca-certificates tzdata

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /app/server ./cmd/server

# Minimal production runtime image
FROM alpine:3.20

WORKDIR /app

RUN apk --no-cache add ca-certificates tzdata
COPY --from=builder /app/server /app/server

# Default to 8080, dynamically overridable by Render PORT env
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/healthz || exit 1

ENTRYPOINT ["/app/server"]
