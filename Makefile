.PHONY: install install-backend install-frontend \
	dev dev-backend dev-frontend \
	build build-backend build-frontend \
	test test-contract \
	lint db-up db-down clean \
	docker-up docker-down docker-build

install: install-backend install-frontend

install-backend:
	cd backend && go mod download

install-frontend:
	cd frontend && pnpm install

dev: db-up
	$(MAKE) -j2 dev-backend dev-frontend

dev-backend:
	cd backend && go run main.go

dev-frontend:
	cd frontend && pnpm dev

build: build-backend build-frontend

build-backend:
	cd backend && go build -o bin/server main.go

build-frontend:
	cd frontend && pnpm build

test: test-contract

test-contract:
	cd contract && npx hardhat test

lint:
	cd frontend && pnpm lint

db-up:
	docker compose up -d postgres

db-down:
	docker compose down

# Full stack (postgres + hardhat + backend + frontend) via docker compose.
# Requires .env.docker — copy from .env.docker.example first.
docker-build:
	docker compose --env-file .env.docker build

docker-up:
	docker compose --env-file .env.docker up --build

docker-down:
	docker compose down

clean:
	rm -rf backend/bin frontend/dist
