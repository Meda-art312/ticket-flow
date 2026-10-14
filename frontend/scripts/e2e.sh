#!/bin/sh
set -eu
docker run --rm --mount "type=bind,source=$(pwd),target=/work" -w /work node:24.21.0-bookworm-slim node scripts/e2e-env.mjs
docker compose --env-file .env.e2e -p ticketflow-frontend-e2e -f compose.e2e.yaml down --volumes --remove-orphans
docker compose --env-file .env.e2e -p ticketflow-frontend-e2e -f compose.e2e.yaml up --build --wait -d web unavailable worker rabbitmq redis mailpit
docker compose --env-file .env.e2e -p ticketflow-frontend-e2e -f compose.e2e.yaml run --build --rm --no-deps seed
result=0
docker compose --env-file .env.e2e -p ticketflow-frontend-e2e -f compose.e2e.yaml run --build --rm --no-deps e2e || result=$?
docker compose --env-file .env.e2e -p ticketflow-frontend-e2e -f compose.e2e.yaml stop
exit "$result"
