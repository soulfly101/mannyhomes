# Shortcuts for local development. Run `make` to list them.
.DEFAULT_GOAL := help
COMPOSE := docker compose

.PHONY: help setup up down logs build test test-backend test-frontend lint db-shell migrate create-admin legacy

help: ## List the commands
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-15s %s\n", $$1, $$2}'

setup: ## Create .env files from the examples (keeps existing ones)
	@test -f .env || cp .env.example .env
	@test -f backend/.env || cp backend/.env.example backend/.env
	@test -f frontend/.env || cp frontend/.env.example frontend/.env
	@echo ".env files ready"

up: setup ## Start MySQL, backend and frontend in the background
	$(COMPOSE) up -d --build
	@echo "Frontend: http://localhost:5173  API: http://localhost:8000/api/health"

down: ## Stop everything
	$(COMPOSE) down

logs: ## Follow the logs of all services
	$(COMPOSE) logs -f

build: ## Rebuild the images
	$(COMPOSE) build

test: test-backend test-frontend ## Run all tests

test-backend: ## Run backend tests (needs `make up`, uses the real MySQL)
	$(COMPOSE) exec backend pytest

test-frontend: ## Run frontend tests
	$(COMPOSE) exec frontend npm test

lint: ## Lint the backend and typecheck the frontend
	$(COMPOSE) exec backend ruff check
	$(COMPOSE) exec frontend npm run lint

db-shell: ## Open a MySQL prompt
	$(COMPOSE) exec db sh -c 'mysql -u"$$MYSQL_USER" -p"$$MYSQL_PASSWORD" "$$MYSQL_DATABASE"'

migrate: ## Apply database migrations
	$(COMPOSE) exec backend alembic upgrade head

create-admin: ## Create an admin account (asks for details and a password)
	@read -p "Admin email: " email; read -p "Full name: " name; read -p "Phone (e.g. 0241234567): " phone; \
	$(COMPOSE) exec backend python -m app.cli create-user --role admin --email "$$email" --name "$$name" --phone "$$phone"

legacy: ## Run the old Next.js app on :3000 (start its database first: npm --prefix legacy run db)
	npm --prefix legacy run dev
