# Makefile to manage Docker services for fictional-bassoon

# Determine the directory where this Makefile resides
MAKEFILE_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))

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
	cd $(MAKEFILE_DIR)/../backend && docker compose up -d
	cd $(MAKEFILE_DIR)/../frontend && docker compose up -d

up-build:
	cd $(MAKEFILE_DIR)/../backend && docker compose up -d --build
	cd $(MAKEFILE_DIR)/../frontend && docker compose up -d --build

down:
	cd $(MAKEFILE_DIR)/../backend && docker compose down --remove-orphans
	cd $(MAKEFILE_DIR)/../frontend && docker compose down --remove-orphans

build:
	cd $(MAKEFILE_DIR)/../backend && docker compose build
	cd $(MAKEFILE_DIR)/../frontend && docker compose build

restart:
	cd $(MAKEFILE_DIR)/../backend && docker compose restart
	cd $(MAKEFILE_DIR)/../frontend && docker compose restart

logs:
	# This will follow logs from both projects
	docker compose -f $(MAKEFILE_DIR)/../backend/docker-compose.yaml -f $(MAKEFILE_DIR)/../frontend/docker-compose.yaml logs -f

clean:
	cd $(MAKEFILE_DIR)/../backend && docker compose down -v --remove-orphans --rmi local
	cd $(MAKEFILE_DIR)/../frontend && docker compose down -v --remove-orphans --rmi local

prune:
	docker system prune -f
	docker image prune -f