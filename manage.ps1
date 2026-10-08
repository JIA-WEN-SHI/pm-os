param([ValidateSet('start', 'stop', 'restart', 'status')][string]$Action = 'status')
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$runDir = Join-Path $root '.run'
$logDir = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $runDir, $logDir | Out-Null
$env:PYTHONUTF8 = '1'
$env:NEXT_TELEMETRY_DISABLED = '1'

$services = @(
    @{
        Name = 'backend'; Exe = Join-Path $root '.venv\Scripts\python.exe'
        Runner = Join-Path $root 'agno_app.py'; Args = ''; Cwd = $root
        Port = 7777; Health = 'http://127.0.0.1:7777/health'
    },
    @{
        Name = 'ui'; Exe = (Get-Command node.exe).Source
        Runner = Join-Path $root 'agent-ui\node_modules\next\dist\bin\next'
        Args = 'start --hostname 127.0.0.1 --port 3000'
        Cwd = Join-Path $root 'agent-ui'; Port = 3000; Health = 'http://127.0.0.1:3000'
    }
)

function Get-OwnedProcess($service) {
    $statePath = Join-Path $runDir ($service.Name + '.json')
    if (!(Test-Path -LiteralPath $statePath)) { return $null }
    $state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($state.Id)"
    if ($process -and $process.CommandLine -and
        $process.CommandLine.Contains($service.Runner) -and
        $process.ExecutablePath -eq $state.Exe -and
        $process.CreationDate.ToUniversalTime().Ticks.ToString() -eq $state.Created) {
        return $process
    }
    return $null
}

function Test-Service($service) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $service.Health -TimeoutSec 3
        return $response.StatusCode -eq 200
    } catch { return $false }
}

function Stop-ServiceProcess($service) {
    $process = Get-OwnedProcess $service
    if ($process) {
        Stop-Process -Id $process.ProcessId
        Wait-Process -Id $process.ProcessId -Timeout 10 -ErrorAction SilentlyContinue
        Write-Host ($service.Name + ' stopped')
    }
    $statePath = Join-Path $runDir ($service.Name + '.json')
    if (Test-Path -LiteralPath $statePath) { Remove-Item -LiteralPath $statePath }
}

function Start-ServiceProcess($service) {
    $process = Get-OwnedProcess $service
    if (!$process) {
        if (!(Test-Path -LiteralPath $service.Runner)) {
            throw "Missing $($service.Runner). Follow README.md installation steps."
        }
        $listener = Get-NetTCPConnection -State Listen -LocalPort $service.Port -ErrorAction SilentlyContinue
        if ($listener) { throw "Port $($service.Port) is occupied by another process; nothing was stopped." }
        $arguments = '"' + $service.Runner + '" ' + $service.Args
        $launched = Start-Process -FilePath $service.Exe -ArgumentList $arguments `
            -WorkingDirectory $service.Cwd -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $logDir ($service.Name + '.out.log')) `
            -RedirectStandardError (Join-Path $logDir ($service.Name + '.err.log'))
        $started = Get-CimInstance Win32_Process -Filter "ProcessId = $($launched.Id)"
        if (!$started) { throw "$($service.Name) exited. See logs/." }
        @{
            Id = $started.ProcessId; Exe = $started.ExecutablePath
            Created = $started.CreationDate.ToUniversalTime().Ticks.ToString()
        } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runDir ($service.Name + '.json'))
    }
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if (!(Get-OwnedProcess $service)) { throw "$($service.Name) exited. See logs/." }
        if (Test-Service $service) {
            Write-Host ($service.Name + ' ready: ' + $service.Health)
            return
        }
        Start-Sleep -Milliseconds 500
    }
    throw "$($service.Name) did not become healthy. See logs/."
}

if ($Action -in @('stop', 'restart')) {
    Stop-ServiceProcess $services[1]
    Stop-ServiceProcess $services[0]
}
if ($Action -in @('start', 'restart')) {
    if (!(Test-Path -LiteralPath (Join-Path $root '.env'))) {
        Copy-Item -LiteralPath (Join-Path $root '.env.example') -Destination (Join-Path $root '.env')
    }
    if (!(Test-Path -LiteralPath (Join-Path $root 'agent-ui\.next\BUILD_ID'))) {
        throw 'UI production build is missing. Run npm.cmd run build in agent-ui first.'
    }
    foreach ($service in $services) { Start-ServiceProcess $service }
    Write-Host 'Open http://localhost:3000. Model calls require a valid key in .env.'
}
if ($Action -eq 'status') {
    foreach ($service in $services) {
        $owned = [bool](Get-OwnedProcess $service)
        $healthy = Test-Service $service
        Write-Host "$($service.Name): managed=$owned healthy=$healthy $($service.Health)"
    }
}
