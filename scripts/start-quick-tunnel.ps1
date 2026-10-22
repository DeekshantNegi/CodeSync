$ErrorActionPreference = 'Stop'

$cloudflaredCommand = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflaredCommand) {
    throw 'cloudflared was not found on PATH. Install cloudflared, then open a new PowerShell window.'
}

$frontendPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'frontend'
$logId = [guid]::NewGuid().ToString('N')
$stdoutPath = Join-Path $env:TEMP "codesync-cloudflared-$logId.out.log"
$stderrPath = Join-Path $env:TEMP "codesync-cloudflared-$logId.err.log"
$tunnelProcess = $null

try {
    $tunnelProcess = Start-Process `
        -FilePath $cloudflaredCommand.Source `
        -ArgumentList @('tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:5173') `
        -RedirectStandardOutput $stdoutPath `
        -RedirectStandardError $stderrPath `
        -PassThru

    $publicUrl = $null
    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline) {
        if ($tunnelProcess.HasExited) {
            break
        }

        $tunnelOutput = ''
        if (Test-Path $stdoutPath) {
            $tunnelOutput += Get-Content $stdoutPath -Raw
        }
        if (Test-Path $stderrPath) {
            $tunnelOutput += "`n" + (Get-Content $stderrPath -Raw)
        }

        $urlMatch = [regex]::Match($tunnelOutput, 'https://[a-z0-9-]+\.trycloudflare\.com')
        if ($urlMatch.Success) {
            $publicUrl = $urlMatch.Value
            break
        }
        Start-Sleep -Milliseconds 500
    }

    if (-not $publicUrl) {
        if (Test-Path $stdoutPath) {
            Get-Content $stdoutPath
        }
        if (Test-Path $stderrPath) {
            Get-Content $stderrPath
        }
        throw 'cloudflared did not provide a Quick Tunnel URL within 60 seconds.'
    }

    $env:VITE_ALLOWED_HOST = ([uri]$publicUrl).Host
    Write-Host "Quick Tunnel URL: $publicUrl"
    Write-Host 'Starting the frontend. Press Ctrl+C to stop the frontend and tunnel.'

    Push-Location $frontendPath
    try {
        & npm.cmd run dev -- --host 127.0.0.1
        if ($LASTEXITCODE -ne 0) {
            throw "Vite exited with code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}
finally {
    Remove-Item Env:VITE_ALLOWED_HOST -ErrorAction SilentlyContinue
    if ($tunnelProcess -and -not $tunnelProcess.HasExited) {
        Stop-Process -Id $tunnelProcess.Id -Force
    }
    Remove-Item $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
}
