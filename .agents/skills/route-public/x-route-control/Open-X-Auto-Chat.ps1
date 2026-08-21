[CmdletBinding()]
param(
    [string]$ProjectName = 'X-auto',
    [ValidateRange(1, 65535)]
    [int]$CdpPort = 9223,
    [ValidateRange(1, 120)]
    [int]$UiTimeoutSeconds = 60
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$renderSettleMilliseconds = 750

function Get-CdpTargets {
    param([int]$Port)

    try {
        $rawTargets = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/json/list" -TimeoutSec 2 -ErrorAction Stop
        @($rawTargets.Content | ConvertFrom-Json)
    }
    catch {
        throw "X_ROUTE_CDP_UNAVAILABLE: CDP не отвечает на порту $Port. Сначала запустите Run-X-Chrome.ps1."
    }
}

function Get-CdpVersion {
    param([int]$Port)

    try {
        Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 2 -ErrorAction Stop
    }
    catch {
        throw "X_ROUTE_CDP_UNAVAILABLE: CDP не отвечает на порту $Port. Сначала запустите Run-X-Chrome.ps1."
    }
}

function Connect-CdpSocket {
    param([string]$WebSocketUrl)

    $socket = [System.Net.WebSockets.ClientWebSocket]::new()
    [void]$socket.ConnectAsync([Uri]$WebSocketUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    $socket
}

function Receive-CdpMessage {
    param([System.Net.WebSockets.ClientWebSocket]$Socket)

    $buffer = New-Object byte[] 65536
    $stream = [System.IO.MemoryStream]::new()
    try {
        do {
            $segment = [ArraySegment[byte]]::new($buffer)
            $received = $Socket.ReceiveAsync($segment, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
            if ($received.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
                throw 'CDP закрыл WebSocket-соединение.'
            }
            $stream.Write($buffer, 0, $received.Count)
        } while (-not $received.EndOfMessage)

        [Text.Encoding]::UTF8.GetString($stream.ToArray()) | ConvertFrom-Json
    }
    finally {
        $stream.Dispose()
    }
}

$script:CdpRequestId = 0
function Invoke-CdpCommand {
    param(
        [System.Net.WebSockets.ClientWebSocket]$Socket,
        [string]$Method,
        [hashtable]$Params = @{}
    )

    $script:CdpRequestId++
    $requestId = $script:CdpRequestId
    $payload = @{ id = $requestId; method = $Method; params = $Params } | ConvertTo-Json -Compress -Depth 12
    $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
    $segment = [ArraySegment[byte]]::new($bytes)
    [void]$Socket.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()

    do {
        $response = Receive-CdpMessage -Socket $Socket
        $responseId = $response.PSObject.Properties['id']
    } while ($null -eq $responseId -or [int]$responseId.Value -ne $requestId)

    $responseError = $response.PSObject.Properties['error']
    if ($null -ne $responseError) {
        throw "CDP $Method завершился ошибкой: $($responseError.Value.message)"
    }
    $response.result
}

function Invoke-CdpEvaluate {
    param(
        [System.Net.WebSockets.ClientWebSocket]$Socket,
        [string]$Expression
    )

    $result = Invoke-CdpCommand -Socket $Socket -Method 'Runtime.evaluate' -Params @{
        expression = $Expression
        returnByValue = $true
        awaitPromise = $false
        userGesture = $true
    }
    $exceptionDetails = $result.PSObject.Properties['exceptionDetails']
    if ($null -ne $exceptionDetails) {
        throw "Не удалось прочитать видимое состояние ChatGPT: $($exceptionDetails.Value.text)"
    }
    $result.result.value
}

function Invoke-VisibleClick {
    param(
        [System.Net.WebSockets.ClientWebSocket]$Socket,
        [double]$X,
        [double]$Y
    )

    $base = @{ x = $X; y = $Y; button = 'left'; clickCount = 1 }
    Invoke-CdpCommand -Socket $Socket -Method 'Input.dispatchMouseEvent' -Params ($base + @{ type = 'mouseMoved' }) | Out-Null
    Invoke-CdpCommand -Socket $Socket -Method 'Input.dispatchMouseEvent' -Params ($base + @{ type = 'mousePressed'; buttons = 1 }) | Out-Null
    Invoke-CdpCommand -Socket $Socket -Method 'Input.dispatchMouseEvent' -Params ($base + @{ type = 'mouseReleased'; buttons = 0 }) | Out-Null
}

$projectJson = $ProjectName | ConvertTo-Json -Compress
$uiExpression = @"
(() => {
  const projectName = $projectJson;
  const isVisible = (element) => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
  const label = (element) => ((element.getAttribute('aria-label') || element.textContent || '').replace(/\s+/g, ' ').trim());
  const point = (element) => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  };
  const candidates = [...document.querySelectorAll('a, button, [role="button"], div')].filter(isVisible);
  const project = candidates.find((element) => label(element) === projectName) || null;
  const bodyText = document.body ? document.body.innerText : '';
  return {
    url: location.href,
    title: document.title,
    loginRequired: /\b(log in|sign up)\b|войти|регистрация/i.test(bodyText),
    challenge: /one moment|verify you are human|challenge|провер.{0,12}человек/i.test(bodyText),
    composerReady: Boolean(document.querySelector('div.ProseMirror[contenteditable="true"], textarea, [contenteditable="true"]')),
    projectFound: Boolean(project),
    projectPoint: point(project),
    projectPage: /^\/g\/g-p-[^/]+\/project\/?$/.test(location.pathname)
  };
})()
"@

$openProjectExpression = @"
(() => {
  const projectName = $projectJson;
  const isVisible = (element) => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
  const label = (element) => ((element.getAttribute('aria-label') || element.textContent || '').replace(/\s+/g, ' ').trim());
  const source = [...document.querySelectorAll('a, button, [role="button"], div')].filter(isVisible).find((element) => label(element) === projectName);
  const projectHomeLabel = /^(open project home|открыть главную страницу проекта)$/i;
  let container = source;
  let projectHome = null;
  while (container && container !== document.body && !projectHome) {
    projectHome = [...container.querySelectorAll('button')].filter(isVisible).find((element) => projectHomeLabel.test(label(element))) || null;
    container = container.parentElement;
  }
  const target = projectHome || (source && (source.closest('a, button, [role="button"]') || source));
  if (!target || typeof target.click !== 'function') return false;
  target.click();
  return true;
})()
"@

Start-Sleep -Milliseconds $renderSettleMilliseconds
$targets = Get-CdpTargets -Port $CdpPort
$projectUrlPattern = '^https://chatgpt\.com/g/g-p-[^/]+/project(?:[/?#]|$)'
$target = $targets | Where-Object {
    $_.type -eq 'page' -and $_.url -match $projectUrlPattern -and $_.title -like "*$ProjectName*" -and $_.webSocketDebuggerUrl
} | Select-Object -First 1
if ($null -eq $target) {
    $target = $targets | Where-Object {
    $_.type -eq 'page' -and $_.url -match '^https://chatgpt\.com(?:/|$)' -and $_.webSocketDebuggerUrl
    } | Select-Object -First 1
}
if ($null -eq $target) {
    $browserVersion = Get-CdpVersion -Port $CdpPort
    if ([string]::IsNullOrWhiteSpace($browserVersion.webSocketDebuggerUrl)) {
        throw 'X_ROUTE_CHATGPT_TAB_NOT_FOUND: CDP не вернул адрес управления браузером для создания видимой вкладки ChatGPT.'
    }

    $browserSocket = Connect-CdpSocket -WebSocketUrl $browserVersion.webSocketDebuggerUrl
    try {
        Invoke-CdpCommand -Socket $browserSocket -Method 'Target.createTarget' -Params @{ url = 'https://chatgpt.com/' } | Out-Null
    }
    finally {
        $browserSocket.Dispose()
    }

    $deadline = [DateTime]::UtcNow.AddSeconds($UiTimeoutSeconds)
    do {
        Start-Sleep -Milliseconds 250
        $targets = Get-CdpTargets -Port $CdpPort
        $target = $targets | Where-Object {
            $_.type -eq 'page' -and $_.url -match '^https://chatgpt\.com(?:/|$)' -and $_.webSocketDebuggerUrl
        } | Select-Object -First 1
    } while ($null -eq $target -and [DateTime]::UtcNow -lt $deadline)

    if ($null -eq $target) {
        throw 'X_ROUTE_CHATGPT_TAB_NOT_FOUND: Не удалось подтвердить созданную видимую вкладку chatgpt.com.'
    }
}

$socket = Connect-CdpSocket -WebSocketUrl $target.webSocketDebuggerUrl
try {
    Invoke-CdpCommand -Socket $socket -Method 'Page.bringToFront' | Out-Null
    Start-Sleep -Milliseconds $renderSettleMilliseconds
    $state = Invoke-CdpEvaluate -Socket $socket -Expression $uiExpression
    if ($state.loginRequired) {
        throw 'X_ROUTE_SESSION_EXPIRED_OR_REVOKED: В видимом окне требуется вход. Скрипт не вводит учётные данные.'
    }
    if ($state.challenge) {
        throw 'X_ROUTE_CHALLENGE_VISIBLE: В видимом окне обнаружена проверка. Пройдите её вручную и повторите запуск.'
    }
    if ($state.projectPage) {
        $composerDeadline = [DateTime]::UtcNow.AddSeconds($UiTimeoutSeconds)
        do {
            if ($state.composerReady -or $state.loginRequired -or $state.challenge) {
                break
            }
            Start-Sleep -Milliseconds 250
            $state = Invoke-CdpEvaluate -Socket $socket -Expression $uiExpression
        } while ([DateTime]::UtcNow -lt $composerDeadline)
        if ($state.loginRequired) {
            throw 'X_ROUTE_SESSION_EXPIRED_OR_REVOKED: На странице проекта требуется вход. Скрипт не вводит учётные данные.'
        }
        if ($state.challenge) {
            throw 'X_ROUTE_CHALLENGE_VISIBLE: На странице проекта обнаружена проверка. Пройдите её вручную и повторите запуск.'
        }
        if (-not $state.composerReady) {
            throw 'X_ROUTE_CHAT_NOT_READY: Страница проекта открыта, но рабочее поле не подтверждено. Никакой текст не отправлялся.'
        }
        Write-Output "X_ROUTE_X_AUTO_CHAT_READY: Пустой чат готов в проекте '$ProjectName'. Сообщения не отправлялись."
        Write-Output "Chat URL: $($state.url)"
        return
    }
    $projectDeadline = [DateTime]::UtcNow.AddSeconds($UiTimeoutSeconds)
    do {
        if ($state.projectFound -or $state.loginRequired -or $state.challenge) {
            break
        }
        Start-Sleep -Milliseconds 250
        $state = Invoke-CdpEvaluate -Socket $socket -Expression $uiExpression
    } while ([DateTime]::UtcNow -lt $projectDeadline)
    if ($state.loginRequired) {
        throw 'X_ROUTE_SESSION_EXPIRED_OR_REVOKED: В видимом окне требуется вход. Скрипт не вводит учётные данные.'
    }
    if ($state.challenge) {
        throw 'X_ROUTE_CHALLENGE_VISIBLE: В видимом окне обнаружена проверка. Пройдите её вручную и повторите запуск.'
    }
    if (-not $state.projectFound -or $null -eq $state.projectPoint) {
        throw "X_ROUTE_PROJECT_NOT_FOUND: Проект '$ProjectName' не найден среди видимых элементов. Создайте или откройте его вручную один раз; скрипт ничего не создаёт."
    }

    $projectClickAccepted = Invoke-CdpEvaluate -Socket $socket -Expression $openProjectExpression
    if (-not $projectClickAccepted) {
        throw "X_ROUTE_PROJECT_NOT_FOUND: Не удалось активировать видимый проект '$ProjectName'. Скрипт не создавал чат вне проекта."
    }

    $deadline = [DateTime]::UtcNow.AddSeconds($UiTimeoutSeconds)
    $projectTarget = $null
    do {
        Start-Sleep -Milliseconds 250
        $projectTarget = Get-CdpTargets -Port $CdpPort | Where-Object {
            $_.type -eq 'page' -and $_.url -match $projectUrlPattern -and $_.title -like "*$ProjectName*" -and $_.webSocketDebuggerUrl
        } | Select-Object -First 1
    } while ($null -eq $projectTarget -and [DateTime]::UtcNow -lt $deadline)

    if ($null -eq $projectTarget) {
        throw "X_ROUTE_PROJECT_PAGE_NOT_READY: После выбора '$ProjectName' не открылась страница проекта. Скрипт остановился, чтобы не создать чат вне проекта."
    }

    if ($projectTarget.webSocketDebuggerUrl -ne $target.webSocketDebuggerUrl) {
        $socket.Dispose()
        $socket = Connect-CdpSocket -WebSocketUrl $projectTarget.webSocketDebuggerUrl
    }
    Invoke-CdpCommand -Socket $socket -Method 'Page.bringToFront' | Out-Null
    Start-Sleep -Milliseconds $renderSettleMilliseconds
    $state = Invoke-CdpEvaluate -Socket $socket -Expression $uiExpression

    if ($state.loginRequired) {
        throw 'X_ROUTE_SESSION_EXPIRED_OR_REVOKED: После открытия проекта требуется вход. Скрипт не вводит учётные данные.'
    }
    if ($state.challenge) {
        throw 'X_ROUTE_CHALLENGE_VISIBLE: После открытия проекта обнаружена проверка. Пройдите её вручную и повторите запуск.'
    }
    if (-not $state.projectPage) {
        throw "X_ROUTE_PROJECT_PAGE_NOT_READY: После выбора '$ProjectName' не открылась страница проекта. Скрипт остановился, чтобы не создать чат вне проекта."
    }
    $composerDeadline = [DateTime]::UtcNow.AddSeconds($UiTimeoutSeconds)
    do {
        if ($state.composerReady -or $state.loginRequired -or $state.challenge) {
            break
        }
        Start-Sleep -Milliseconds 250
        $state = Invoke-CdpEvaluate -Socket $socket -Expression $uiExpression
    } while ([DateTime]::UtcNow -lt $composerDeadline)
    if (-not $state.composerReady) {
        throw 'X_ROUTE_CHAT_NOT_READY: Страница проекта открыта, но рабочее поле не подтверждено. Никакой текст не отправлялся.'
    }

    Write-Output "X_ROUTE_X_AUTO_CHAT_READY: Пустой чат готов в проекте '$ProjectName'. Сообщения не отправлялись."
    Write-Output "Chat URL: $($state.url)"
}
finally {
    if ($null -ne $socket) {
        $socket.Dispose()
    }
}
