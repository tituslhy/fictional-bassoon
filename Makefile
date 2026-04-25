# Makefile to manage Docker services for fictional-bassoon

COMPOSE_FILE = docker/docker-compose.yml
DOCKER_COMPOSE = docker compose -f $(COMPOSE_FILE)

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
	$(DOCKER_COMPOSE) up -d

up-build:
	$(DOCKER_COMPOSE) up -d --build

down:
	$(DOCKER_COMPOSE) down --remove-orphans

build:
	$(DOCKER_COMPOSE) build

restart:
	$(DOCKER_COMPOSE) restart

logs:
	$(DOCKER_COMPOSE) logs -f

clean:
	$(DOCKER_COMPOSE) down -v --remove-orphans --rmi local

prune:
	docker system prune -f
	docker image prune -f
