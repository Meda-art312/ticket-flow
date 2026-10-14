$ErrorActionPreference='Stop'
$taskCompose=@('compose','-p','ticketflow-backend-recovery','-f','compose.test.yaml','-f','compose.recovery.yaml')
function Invoke-RecoveryDocker { & docker @taskCompose @args; if($LASTEXITCODE -ne 0){throw "Recovery Docker command failed: $LASTEXITCODE"} }
Invoke-RecoveryDocker up --build --wait -d api api2 worker rabbitmq redis mailpit
Invoke-RecoveryDocker run --build --rm --no-deps recovery npx tsx scripts/recovery.ts prepare
Invoke-RecoveryDocker stop rabbitmq
Invoke-RecoveryDocker run --rm --no-deps recovery npx tsx scripts/recovery.ts broker-down
Invoke-RecoveryDocker up --wait -d rabbitmq
Invoke-RecoveryDocker run --rm --no-deps recovery npx tsx scripts/recovery.ts broker-up
Invoke-RecoveryDocker stop redis
Invoke-RecoveryDocker run --rm --no-deps recovery npx tsx scripts/recovery.ts redis-down
Invoke-RecoveryDocker up --wait -d redis
Invoke-RecoveryDocker run --rm --no-deps recovery npx tsx scripts/recovery.ts before-restart
Invoke-RecoveryDocker restart api api2 worker postgres
Invoke-RecoveryDocker up --wait -d api api2 worker
Invoke-RecoveryDocker run --rm --no-deps recovery npx tsx scripts/recovery.ts after-restart
