$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot '.env'
$pgBin = Join-Path $env:LOCALAPPDATA 'Programs\PostgreSQL\17.11\pgsql\bin'
$dataDir = Join-Path $env:LOCALAPPDATA 'PostgreSQL\data-17'
$logFile = Join-Path $env:LOCALAPPDATA 'PostgreSQL\postgresql.log'

foreach ($tool in @('initdb.exe', 'pg_ctl.exe', 'psql.exe', 'createdb.exe')) {
  if (!(Test-Path (Join-Path $pgBin $tool))) { throw "Missing $tool in $pgBin. Install PostgreSQL 17.11 Windows binaries first." }
}

$databaseLine = Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
$databaseUrl = ($databaseLine -replace '^DATABASE_URL=', '').Trim().Trim('"').Trim("'")
if ($databaseUrl -notmatch '^postgres(?:ql)?://([A-Za-z_][A-Za-z0-9_]*):[^@]*@localhost(?::(\d+))?/([A-Za-z_][A-Za-z0-9_]*)(?:\?.*)?$') {
  throw 'DATABASE_URL must point to localhost and use simple PostgreSQL role/database names.'
}
$dbUser = $Matches[1]
$port = if ($Matches[2]) { [int]$Matches[2] } else { 5432 }
$dbName = $Matches[3]

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dataDir) | Out-Null
if (!(Test-Path (Join-Path $dataDir 'PG_VERSION'))) {
  & (Join-Path $pgBin 'initdb.exe') -D $dataDir -U postgres --auth=trust --encoding=UTF8
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL cluster initialization failed ($LASTEXITCODE)." }
}

& (Join-Path $pgBin 'pg_ctl.exe') -D $dataDir status *> $null
$clusterRunning = $LASTEXITCODE -eq 0
$listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
if (!$clusterRunning -and $listener) { throw "Port $port is already used by another process." }
if (!$clusterRunning) {
  & (Join-Path $pgBin 'pg_ctl.exe') -D $dataDir -l $logFile -o "-p $port -h 127.0.0.1" start
  if ($LASTEXITCODE -ne 0) { Get-Content -LiteralPath $logFile -Tail 30 -ErrorAction SilentlyContinue; throw 'PostgreSQL did not start.' }
}

$psql = Join-Path $pgBin 'psql.exe'
$roleExists = (& $psql -w -h 127.0.0.1 -p $port -U postgres -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='$dbUser'") -join ''
if ($roleExists.Trim() -ne '1') {
  & $psql -w -h 127.0.0.1 -p $port -U postgres -d postgres -c "CREATE ROLE $dbUser LOGIN"
  if ($LASTEXITCODE -ne 0) { throw "Could not create role $dbUser." }
}
$databaseExists = (& $psql -w -h 127.0.0.1 -p $port -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$dbName'") -join ''
if ($databaseExists.Trim() -ne '1') {
  & (Join-Path $pgBin 'createdb.exe') -h 127.0.0.1 -p $port -U postgres -O $dbUser $dbName
  if ($LASTEXITCODE -ne 0) { throw "Could not create database $dbName." }
}
& $psql -w -h 127.0.0.1 -p $port -U postgres -d $dbName -c "GRANT ALL ON SCHEMA public TO $dbUser" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not grant access to the application schema.' }
Write-Host "PostgreSQL is ready on 127.0.0.1:$port (database: $dbName)."
