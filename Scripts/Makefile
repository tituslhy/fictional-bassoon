# Makefile to manage Docker services for fictional-bassoon

.PHONY: help up up-build down build restart logs clean prune

help:
	@echo "Usage:"
	@echo "  make up           - Start all services (detached)"
	@echo "  make up-build     - Rebuild and start all services (detached)"
	@echo "  make down         - Stop services and remove containers"
	@echo "  make build        - Rebuild all images"
	@echo "  make restart      - Restart all services"
	@echo "  make logs         - Follow logs for all services"
	@echo "  make clean        - Deep clean: stop services, remove volumes, and images"
	@echo "  make prune        - System-wide Docker cleanup"

up:
	cd ../backend && docker compose up -d
	cd ../frontend && docker compose up -d

up-build:
	cd ../backend && docker compose up -d --build
	cd ../frontend && docker compose up -d --build

down:
	cd ../backend && docker compose down --remove-orphans
	cd ../frontend && docker compose down --remove-orphans

build:
	cd ../backend && docker compose build
	cd ../frontend && docker compose build

restart:
	cd ../backend && docker compose restart
	cd ../frontend && docker compose restart

logs:
	# This will follow logs from both projects
	docker compose -f ../backend/docker-compose.yaml -f ../frontend/docker-compose.yaml logs -f

clean:
	cd ../backend && docker compose down -v --remove-orphans --rmi local
	cd ../frontend && docker compose down -v --remove-orphans --rmi local

prune:
	docker system prune -f
	docker image prune -f
