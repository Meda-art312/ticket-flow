$ErrorActionPreference='Stop'
docker run --rm --mount "type=bind,source=$($PWD.Path),target=/work" -w /work node:24.21.0-bookworm-slim node scripts/e2e-env.mjs
if($LASTEXITCODE -ne 0){throw 'Could not prepare test environment'}
$e2eCompose=@('compose','--env-file','.env.e2e','-p','ticketflow-frontend-e2e','-f','compose.e2e.yaml')
# Only this disposable test project is reset; development projects are never targeted.
& docker @e2eCompose down --volumes --remove-orphans
if($LASTEXITCODE -ne 0){throw 'Could not reset isolated test project'}
& docker @e2eCompose up --build --wait -d web unavailable worker rabbitmq redis mailpit
if($LASTEXITCODE -ne 0){throw 'E2E startup failed'}
& docker @e2eCompose run --build --rm --no-deps seed
if($LASTEXITCODE -ne 0){throw 'E2E seed failed'}
& docker @e2eCompose run --build --rm --no-deps e2e
$result=$LASTEXITCODE
& docker @e2eCompose stop
exit $result
