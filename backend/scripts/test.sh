#!/bin/sh
set -eu
docker compose -p ticketflow-backend-test -f compose.test.yaml up --build --wait -d api api2 rabbitmq redis mailpit
docker compose -p ticketflow-backend-test -f compose.test.yaml run --build --rm --no-deps test
