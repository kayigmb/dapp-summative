FROM golang:1.25-alpine AS deps
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

FROM golang:1.25-alpine AS build
WORKDIR /app
COPY --from=deps /go/pkg/mod /go/pkg/mod
COPY . .
RUN CGO_ENABLED=0 go build -o /out/server main.go

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=build /out/server /server
EXPOSE 5001
ENTRYPOINT ["/server"]
