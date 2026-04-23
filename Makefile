# Makefile to manage Docker services for fictional-bassoon

.PHONY: help all test up up-build down build restart logs clean prune

help:
	@echo "Usage:"
	@echo "  make all          - Alias to build (default target)"
	@echo "  make test         - Run tests (placeholder)"
	@echo "  make up           - Start all services (detached)"
	@echo "  make up-build     - Rebuild and start all services (detached)"
	@echo "  make down         - Stop services and remove containers"
	@echo "  make build        - Rebuild all images"
	@echo "  make restart      - Restart all services"
	@echo "  make logs         - Follow logs for all services"
	@echo "  make clean        - Deep clean: stop services, remove volumes, and images"
	@echo "  make prune        - System-wide Docker cleanup"

all: build

test:
	@echo "Test target placeholder - exits successfully"
	@exit 0

up:
	cd "backend" && docker compose up -d
	cd "frontend" && docker compose up -d

up-build:
	cd "backend" && docker compose up -d --build
	cd "frontend" && docker compose up -d --build

down:
	cd "backend" && docker compose down --remove-orphans
	cd "frontend" && docker compose down --remove-orphans

build:
	cd "backend" && docker compose build
	cd "frontend" && docker compose build

restart:
	cd "backend" && docker compose restart
	cd "frontend" && docker compose restart

logs:
	@echo "Streaming logs from backend and frontend services..."
	@(cd "backend" && docker compose logs -f) & \
	(cd "frontend" && docker compose logs -f) & \
	wait

clean:
	cd "backend" && docker compose down -v --remove-orphans --rmi local
	cd "frontend" && docker compose down -v --remove-orphans --rmi local

prune:
	docker system prune -f
	docker image prune -f