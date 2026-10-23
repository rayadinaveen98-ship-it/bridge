#Requires -Version 5.1
# Bridge internal Windows lab launcher. Requires Node.js 22+ and Docker Desktop.
# Run: powershell -ExecutionPolicy Bypass -File .\scripts\Start-BridgeLocalLab.ps1
param()
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$private=Join-Path $root '.bridge-private-lab'
$name='bridge-lab-postgres'
Push-Location $root
try {
  foreach($tool in @('docker','node','npm.cmd')) {
    if(-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
      throw "Missing $tool. Install Node.js 22+ and start Docker Desktop."
    }
  }
  & docker info --format '{{.ServerVersion}}' | Out-Null
  if($LASTEXITCODE -ne 0) {throw 'Docker Desktop is not running.'}
  New-Item -ItemType Directory -Force -Path $private | Out-Null
  # Best effort directory ACL: generated keys must not be committed.
  if($env:USERNAME -and (Get-Command icacls -ErrorAction SilentlyContinue)){
    & icacls $private /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F" 2>$null | Out-Null
  }
  $pwFile=Join-Path $private 'lab-db-password.txt'
  if(Test-Path $pwFile) {
    $pass=(Get-Content -Raw $pwFile).Trim()
  } else {
    $bytes=New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $pass=[Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
    [System.IO.File]::WriteAllText($pwFile,$pass)
  }
  $existing=(& docker ps -a --filter "name=^/$name$" --format '{{.Names}}') -join ''
  if($LASTEXITCODE -ne 0){throw 'Unable to inspect lab containers.'}
  if(-not $existing){
    Write-Host 'Creating private lab PostgreSQL 16...'
    & docker run -d --name $name -p '127.0.0.1:55432:5432' -e 'POSTGRES_USER=bridge_lab' -e "POSTGRES_PASSWORD=$pass" -e 'POSTGRES_DB=bridge_lab' 'postgres:16' | Out-Null
    if($LASTEXITCODE -ne 0){throw 'Docker database creation failed.'}
  } else {
    & docker start $name 2>$null | Out-Null
  }
  $ready=$false
  for($i=0;$i -lt 40;$i++){
    & docker exec $name pg_isready -U bridge_lab -d bridge_lab *> $null
    if($LASTEXITCODE -eq 0){$ready=$true;break}
    Start-Sleep -Seconds 1
  }
  if(-not $ready){throw 'PostgreSQL lab not ready.'}
  $present=(& docker exec $name psql -U bridge_lab -d bridge_lab -tAc "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='bridge_lab_credentials')") -join ''
  if($LASTEXITCODE -ne 0){throw 'Cannot inspect Bridge schema.'}
  if($present.Trim() -ne 't'){
    $partial=(& docker exec $name psql -U bridge_lab -d bridge_lab -tAc "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='bridge_accounts')") -join ''
    if($partial.Trim() -eq 't'){throw 'Incomplete lab migration detected; manual review required.'}
    foreach($migration in @('0001_bridge_foundation.sql','0002_message_outbox.sql','0003_lab_credentials.sql')){
      Write-Host "Applying $migration"
      $file=Join-Path $root ("database\migrations\"+$migration)
      Get-Content -Path $file -Raw | & docker exec -i $name psql -U bridge_lab -d bridge_lab -X -v ON_ERROR_STOP=1 | Out-Null
      if($LASTEXITCODE -ne 0){throw "Lab migration failed: $migration"}
    }
  }
  & npm.cmd --prefix (Join-Path $root 'apps\api') install --no-audit --no-fund
  if($LASTEXITCODE -ne 0){throw 'Backend package setup failed.'}
  $env:BRIDGE_DATABASE_URL='postgresql://bridge_lab:'+$pass+'@127.0.0.1:55432/bridge_lab'
  $env:BRIDGE_LAB_KEY_DIR=$private
  & node (Join-Path $root 'apps\api\scripts\create_lab_accounts.mjs')
  if($LASTEXITCODE -ne 0){throw 'Internal account setup failed.'}
  $env:BRIDGE_AUTH_PUBLIC_KEY_FILE=Join-Path $private 'lab-public.pem'
  $env:BRIDGE_LAB_PRIVATE_KEY_FILE=Join-Path $private 'lab-private.pem'
  $env:BRIDGE_AUTH_ISSUER='bridge-internal-lab'
  $env:BRIDGE_AUTH_AUDIENCE='bridge-api'
  $env:BRIDGE_ALLOW_LAB_LOGIN='1'
  $env:BRIDGE_BIND_HOST='127.0.0.1'
  $env:BRIDGE_PORT='8787'
  Write-Host ''
  Write-Host 'Bridge lab is private on http://127.0.0.1:8787'
  Write-Host 'For USB Android testing, run: adb reverse tcp:8787 tcp:8787'
  Write-Host 'Sign in with tester_a and tester_b using the one-time passphrases printed above.'
  Write-Host 'Keep this terminal open while testing. Do not invite real users.'
  & node (Join-Path $root 'apps\api\src\start.mjs')
  if($LASTEXITCODE -ne 0){throw 'Bridge backend exited with an error.'}
} finally {
  Pop-Location
}
