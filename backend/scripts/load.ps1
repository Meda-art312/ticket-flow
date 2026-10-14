$ErrorActionPreference='Stop'
$taskLoadCompose=@('compose','-p','ticketflow-backend-load','-f','compose.test.yaml','-f','compose.recovery.yaml','-f','compose.load.yaml')
function Invoke-LoadDocker { & docker @taskLoadCompose @args; if($LASTEXITCODE -ne 0){throw "Load Docker command failed: $LASTEXITCODE"} }
Invoke-LoadDocker up --build --wait -d api worker rabbitmq redis mailpit
Invoke-LoadDocker run --build --rm --no-deps prepare-load
Invoke-LoadDocker --env-file artifacts/load.env --profile load run --rm benchmark
