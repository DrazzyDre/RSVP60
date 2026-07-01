# RSVP60 — developer helpers.
#
# Requires `make`. On Windows use Git Bash + make, WSL, or just run the
# underlying commands shown in each recipe directly in PowerShell.
#
# Backend recipes assume you are set up per the README (venv active, deps
# installed, DATABASE_URL configured). Docker recipes need the compose plugin.
#
# Ports:  backend 8010 · frontend 3005 · postgres 5432

COMPOSE      ?= docker compose
BACKEND_DIR  := backend
FRONTEND_DIR := frontend

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

# ---- Backend ---------------------------------------------------------------
.PHONY: migrate
migrate: ## Apply Alembic migrations (targets the backend DATABASE_URL)
	cd $(BACKEND_DIR) && alembic upgrade head

.PHONY: seed
seed: ## Reset + seed the database with demo data (DESTRUCTIVE; dev only)
	cd $(BACKEND_DIR) && python -m app.seed

.PHONY: test
test: ## Run backend smoke tests against a running API (BASE_URL, default :8010)
	cd $(BACKEND_DIR) && python -m tests.smoke_test

# ---- Frontend --------------------------------------------------------------
.PHONY: fe-check
fe-check: ## Typecheck the frontend
	cd $(FRONTEND_DIR) && npm run typecheck

.PHONY: fe-build
fe-build: ## Production build of the Next.js frontend
	cd $(FRONTEND_DIR) && npm ci && npm run build

# ---- Docker ----------------------------------------------------------------
.PHONY: up
up: ## Build and start the full stack (db + backend:8010 + frontend:3005)
	$(COMPOSE) up --build

.PHONY: down
down: ## Stop the stack (keeps the database volume)
	$(COMPOSE) down

.PHONY: reset
reset: ## Stop the stack AND wipe the Postgres volume (fresh database)
	$(COMPOSE) down -v

.PHONY: seed-docker
seed-docker: ## Seed demo data inside the running backend container
	$(COMPOSE) exec backend python -m app.seed

# ---- End-to-end ------------------------------------------------------------
.PHONY: verify
verify: ## Guided local verification (Docker up + health + smoke tests)
	bash scripts/verify_local.sh
