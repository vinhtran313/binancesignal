$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$projectPgRoot = Join-Path $projectRoot '.tmp\postgres\extracted\pgsql'
if (Test-Path (Join-Path $projectPgRoot 'bin\pg_ctl.exe')) {
  $pgCtl = Join-Path $projectPgRoot 'bin\pg_ctl.exe'
  $dataDir = Join-Path $projectRoot '.tmp\postgres\data'
} else {
  $pgCtl = Join-Path $env:LOCALAPPDATA 'Programs\PostgreSQL\17.11\pgsql\bin\pg_ctl.exe'
  $dataDir = Join-Path $env:LOCALAPPDATA 'PostgreSQL\data-17'
}
if (!(Test-Path $pgCtl) -or !(Test-Path (Join-Path $dataDir 'PG_VERSION'))) {
  Write-Host 'The portable PostgreSQL cluster is not installed.'
  exit 0
}
& $pgCtl -D $dataDir stop -m fast
if ($LASTEXITCODE -ne 0) { throw "PostgreSQL shutdown failed ($LASTEXITCODE)." }
