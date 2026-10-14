$ErrorActionPreference = 'Stop'
docker compose -p ticketflow-backend-test -f compose.test.yaml up --build --wait -d api api2 rabbitmq redis mailpit
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
docker compose -p ticketflow-backend-test -f compose.test.yaml run --build --rm --no-deps test
exit $LASTEXITCODE
