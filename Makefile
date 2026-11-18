.PHONY: up down lint test build contracts

up:
	docker compose up --build

down:
	docker compose down

lint:
	cd apps/api && uv run ruff check . && uv run ruff format --check . && uv run mypy markov_lab
	pnpm --dir apps/web lint
	pnpm --dir apps/web typecheck

test:
	cd apps/api && uv run pytest --cov=markov_lab --cov-report=term-missing
	pnpm --dir apps/web test

build:
	pnpm --dir apps/web build

contracts:
	cd apps/api && uv run python -c 'import json; from markov_lab.main import app; print(json.dumps(app.openapi(), indent=2))' > ../../packages/contracts/openapi.json
	pnpm --dir apps/web exec openapi-typescript ../../packages/contracts/openapi.json -o ../../packages/contracts/schema.ts
