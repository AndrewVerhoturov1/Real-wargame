[CmdletBinding()]
param(
    [string]$ChromePath = (Join-Path ${env:ProgramFiles} 'Google\Chrome\Application\chrome.exe'),
    [string]$ProfilePath = (Join-Path ([System.IO.Path]::GetTempPath()) 'chrome-zworker-plus-next'),
    [ValidateRange(1, 65535)]
    [int]$CdpPort = 9223,
    [string]$StartUrl = 'https://chatgpt.com/',
    [ValidateRange(1, 120)]
    [int]$ReadyTimeoutSeconds = 30
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$renderSettleMilliseconds = 1000

function Get-CdpVersion {
    param([int]$Port)

    try {
        Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 2 -ErrorAction Stop
    }
    catch {
        $null
    }
}

$existingSession = Get-CdpVersion -Port $CdpPort
if ($null -ne $existingSession) {
    Start-Sleep -Milliseconds $renderSettleMilliseconds
    Write-Output "X_ROUTE_CHROME_READY: CDP уже доступен на порту $CdpPort. Новый Chrome не запускался."
    Write-Output "Browser: $($existingSession.Browser)"
    exit 0
}

if (-not (Test-Path -LiteralPath $ChromePath -PathType Leaf)) {
    throw "X_ROUTE_CHROME_NOT_FOUND: Chrome не найден по пути '$ChromePath'. Передайте -ChromePath с путём к chrome.exe."
}

if (-not (Test-Path -LiteralPath $ProfilePath -PathType Container)) {
    throw "X_ROUTE_PROFILE_NOT_FOUND: Закреплённый профиль не найден: '$ProfilePath'. Скрипт не создаёт и не заменяет профиль."
}

$arguments = @(
    "--remote-debugging-port=$CdpPort",
    "--user-data-dir=$ProfilePath",
    $StartUrl
)

Start-Process -FilePath $ChromePath -ArgumentList $arguments | Out-Null

$deadline = [DateTime]::UtcNow.AddSeconds($ReadyTimeoutSeconds)
do {
    Start-Sleep -Milliseconds 500
    $startedSession = Get-CdpVersion -Port $CdpPort
    if ($null -ne $startedSession) {
        Start-Sleep -Milliseconds $renderSettleMilliseconds
        Write-Output "X_ROUTE_CHROME_STARTED: Chrome запущен с закреплённым профилем; CDP доступен на порту $CdpPort."
        Write-Output "Browser: $($startedSession.Browser)"
        exit 0
    }
} while ([DateTime]::UtcNow -lt $deadline)

throw "X_ROUTE_CDP_UNAVAILABLE: Chrome был запущен, но CDP не ответил на порту $CdpPort за $ReadyTimeoutSeconds с. Закройте лишние процессы этого профиля и повторите запуск."
