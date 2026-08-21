[CmdletBinding()]
param(
    [ValidatePattern('^XROUTE-[A-Za-z0-9-]+$')]
    [string]$RequestId = ('XROUTE-{0}-{1}' -f [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss'), [guid]::NewGuid().ToString('N').Substring(0, 6)),
    [ValidatePattern('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')]
    [string]$Repository = 'AndrewVerhoturov1/Real-wargame',
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$TaskSummary,
    [string]$TaskInstructions = '',
    [Parameter(Mandatory)]
    [ValidateSet('report_only', 'product_change')]
    [string]$TaskType,
    [ValidateNotNullOrEmpty()]
    [string]$BaseBranch = 'real-wargame-preview',
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._/-]*$')]
    [string]$ReportBranch = 'x-route-reports',
    [string]$PublishedContextMarkdown = 'Нет дополнительного опубликованного контекста.',
    [string]$RequiredSkillsManifestMarkdown = 'Нет дополнительных навыков.',
    [string]$ProjectName = 'X-auto',
    [ValidateRange(1, 65535)]
    [int]$CdpPort = 9223,
    [ValidateRange(5, 3600)]
    [int]$ResponseTimeoutSeconds = 1800,
    [ValidateRange(1, 120)]
    [int]$UiTimeoutSeconds = 60,
    [ValidateRange(20, 300)]
    [int]$ReportLinkTimeoutSeconds = 120,
    [Parameter(DontShow)]
    [ValidateRange(0, 1)]
    [int]$SafetyRetryAttempt = 0,
    [switch]$ProbeOnly,
    [switch]$ResumeExistingDraft,
    [switch]$UseDomClickFallback
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$maxSafetyRetries = 1
$safetyRetryDelaySeconds = 10
$uiSettleMilliseconds = 750
$assistantRenderSettleMilliseconds = 2000

$effectiveTaskInstructions = if ([string]::IsNullOrWhiteSpace($TaskInstructions)) { $TaskSummary } else { $TaskInstructions }
$legacyTaskInstructionPatterns = @(
    @{ Pattern = '(?im)^\s*BEGIN\s+XROUTE-'; Name = 'BEGIN XROUTE' },
    @{ Pattern = '(?im)^\s*END\s+XROUTE-'; Name = 'END XROUTE' },
    @{ Pattern = '(?im)^\s*status:\s*(?:success|blocked)\s*$'; Name = 'status: success/blocked' },
    @{ Pattern = '(?i)docs/reports/x-route/'; Name = 'путь отчёта docs/reports/x-route/' },
    @{ Pattern = '(?i)report_commit_sha'; Name = 'report_commit_sha' },
    @{ Pattern = '(?im)^\s*(?:##\s*)?Кратко для пользователя\s*$'; Name = 'заголовок «Кратко для пользователя»' },
    @{ Pattern = '(?im)^\s*(?:##\s*)?Полный отчёт\s*$'; Name = 'заголовок «Полный отчёт»' }
)
$legacyInstructionFound = $false
foreach ($legacy in $legacyTaskInstructionPatterns) {
    if ($effectiveTaskInstructions -match $legacy.Pattern) {
        $legacyInstructionFound = $true
        Write-Warning "X_ROUTE_TASK_INSTRUCTIONS_LEGACY_FORMAT: Обнаружен $($legacy.Name). Вложенный договор будет сокращён до краткой сути задачи; формат доставки задаёт канонический шаблон."
    }
}
if ($legacyInstructionFound) {
    $effectiveTaskInstructions = $TaskSummary
    Write-Warning 'X_ROUTE_TASK_INSTRUCTIONS_COMPACTED: Встроенный старый договор исключён из отправляемого текста; сохранена только краткая суть задачи и канонический договор скрипта.'
}

$promptBuilder = Join-Path $PSScriptRoot 'New-X-Route-Prompt.ps1'
if (-not (Test-Path -LiteralPath $promptBuilder -PathType Leaf)) {
    throw "X_ROUTE_PROMPT_BUILDER_MISSING: Не найден обязательный генератор '$promptBuilder'."
}
$PromptText = & $promptBuilder -RequestId $RequestId -Repository $Repository -TaskSummary $TaskSummary -TaskInstructions $effectiveTaskInstructions -TaskType $TaskType -BaseBranch $BaseBranch -ReportBranch $ReportBranch -PublishedContextMarkdown $PublishedContextMarkdown -RequiredSkillsManifestMarkdown $RequiredSkillsManifestMarkdown
if ([string]::IsNullOrWhiteSpace($PromptText)) {
    throw 'X_ROUTE_PROMPT_BUILDER_EMPTY: Канонический X-промпт не был сформирован.'
}
$firstPromptLine = @($PromptText -split "\r?\n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -First 1)
if ($firstPromptLine.Count -ne 1 -or $firstPromptLine[0].Trim() -ne '@GitHub') {
    throw 'X_ROUTE_GITHUB_DIRECTIVE_MISSING: Канонический промпт должен начинаться с отдельной строки @GitHub.'
}
if ($PromptText -notmatch '(?is)ОБЯЗАТЕЛЬНОЕ ПРАВИЛО.*?первая фактическая операция.*?GitHub-инструмент') {
    throw 'X_ROUTE_GITHUB_FIRST_ACTION_CONTRACT_MISSING: В каноническом промпте нет обязательного первого вызова GitHub-инструмента.'
}

$reportOnlyLock = $null
if ($TaskType -eq 'report_only') {
    $lockPath = Join-Path (Join-Path $PSScriptRoot 'runs') '.x-route-reports.lock'
    try {
        $reportOnlyLock = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
        $lockText = "request_id=$RequestId`nstarted_utc=$([DateTime]::UtcNow.ToString('o'))`n"
        $lockBytes = [System.Text.Encoding]::UTF8.GetBytes($lockText)
        $reportOnlyLock.SetLength(0)
        $reportOnlyLock.Write($lockBytes, 0, $lockBytes.Length)
        $reportOnlyLock.Flush()
    }
    catch {
        throw "X_ROUTE_REPORT_ONLY_RUN_ACTIVE: Постоянная ветка '$ReportBranch' уже занята другим локальным X-запуском."
    }
}

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
        [double]$Y,
        [int]$Modifiers = 0
    )

    $base = @{ x = $X; y = $Y; button = 'left'; clickCount = 1; modifiers = $Modifiers }
    Invoke-CdpCommand -Socket $Socket -Method 'Input.dispatchMouseEvent' -Params ($base + @{ type = 'mouseMoved' }) | Out-Null
    Invoke-CdpCommand -Socket $Socket -Method 'Input.dispatchMouseEvent' -Params ($base + @{ type = 'mousePressed'; buttons = 1 }) | Out-Null
    Invoke-CdpCommand -Socket $socket -Method 'Input.dispatchMouseEvent' -Params ($base + @{ type = 'mouseReleased'; buttons = 0 }) | Out-Null
}

function Confirm-XRouteReportLink {
    param(
        [System.Net.WebSockets.ClientWebSocket]$Socket,
        [int]$Port,
        [string]$ExpectedRequestId,
        [string]$ExpectedRepository,
        [int]$TimeoutSeconds
    )

    $linkState = Invoke-CdpEvaluate -Socket $Socket -Expression @"
(() => {
  const visible = (element) => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
  const point = (element) => {
    if (!element || !visible(element)) return null;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  };
  const assistants = [...document.querySelectorAll('[data-message-author-role="assistant"]')].filter(visible);
  const lastAssistant = assistants.length ? assistants[assistants.length - 1] : null;
  const links = lastAssistant ? [...lastAssistant.querySelectorAll('a')].filter(visible) : [];
  const link = links.length === 1 ? links[0] : null;
  return { link: point(link), linkCount: links.length };
})()
"@
    if ($null -eq $linkState.link) {
        throw "X_ROUTE_CHAT_REPORT_LINK_NOT_CLICKABLE: В последнем ответе ожидается ровно одна видимая ссылка отчёта, найдено $($linkState.linkCount)."
    }

    Invoke-CdpCommand -Socket $Socket -Method 'Page.bringToFront' | Out-Null
    # После возврата фокуса Chrome принимает нативный ввод не мгновенно.
    # Короткая пауза предотвращает потерю единственного разрешённого клика.
    Start-Sleep -Milliseconds 500
    $existingTargetIds = @(Get-CdpTargets -Port $Port | ForEach-Object { $_.id })
    # ChatGPT открывает свой видимый диалог «Внешний сайт» только после
    # обычного клика. Ctrl+клик обходил этот маршрут и не создавал вкладку.
    Invoke-VisibleClick -Socket $Socket -X $linkState.link.x -Y $linkState.link.y

    $externalConfirmationExpression = @"
(() => {
  const visible = (element) => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
  const text = (element) => ((element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || '').replace(/\s+/g, ' ').trim());
  const bodyText = document.body ? document.body.innerText : '';
  const confirmationVisible = /Внешний сайт|External site/i.test(bodyText);
  const control = confirmationVisible ? [...document.querySelectorAll('a, button')].find((element) => visible(element) && /^(Открыть ссылку|Open link)$/i.test(text(element))) : null;
  if (!control) return { confirmationVisible, control: null };
  const rect = control.getBoundingClientRect();
  return { confirmationVisible, control: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } };
})()
"@

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    $githubTarget = $null
    $externalLinkOpened = $false
    do {
        Start-Sleep -Milliseconds 250
        $githubTarget = Get-CdpTargets -Port $Port | Where-Object {
            $_.type -eq 'page' -and $_.id -notin $existingTargetIds -and $_.url -match '^https://github\.com/' -and $_.webSocketDebuggerUrl
        } | Select-Object -First 1
        if ($null -eq $githubTarget -and -not $externalLinkOpened) {
            $externalConfirmation = Invoke-CdpEvaluate -Socket $Socket -Expression $externalConfirmationExpression
            if ($null -ne $externalConfirmation.control) {
                Invoke-VisibleClick -Socket $Socket -X $externalConfirmation.control.x -Y $externalConfirmation.control.y
                $externalLinkOpened = $true
            }
        }
    } while ($null -eq $githubTarget -and [DateTime]::UtcNow -lt $deadline)

    if ($null -eq $githubTarget) {
        throw 'X_ROUTE_CHAT_REPORT_LINK_OPEN_UNVERIFIABLE: Видимая ссылка не открыла отдельную вкладку GitHub.'
    }

    $githubSocket = Connect-CdpSocket -WebSocketUrl $githubTarget.webSocketDebuggerUrl
    try {
        Invoke-CdpCommand -Socket $githubSocket -Method 'Page.bringToFront' | Out-Null
        $inspectionExpression = @"
(() => {
  const expectedTitle = 'Отчёт X-маршрута: $ExpectedRequestId';
  const headings = [...document.querySelectorAll('h1')].map((heading) => (heading.innerText || heading.textContent || '').replace(/\s+/g, ' ').trim());
  return { url: location.href, headings, reportTitleVisible: headings.includes(expectedTitle) };
})()
"@
        $expectedPath = [regex]::Escape("docs/reports/x-route/$ExpectedRequestId.md")
        $expectedUrlPattern = '^https://github\.com/' + [regex]::Escape($ExpectedRepository) + '/blob/[0-9a-f]{40}/' + $expectedPath + '$'
        $inspectionDeadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
        $inspection = $null
        $reportConfirmed = $false
        do {
            $inspection = Invoke-CdpEvaluate -Socket $githubSocket -Expression $inspectionExpression
            $reportConfirmed = $inspection.url -match $expectedUrlPattern -and $inspection.reportTitleVisible
            if (-not $reportConfirmed) {
                Start-Sleep -Milliseconds 250
            }
        } while (-not $reportConfirmed -and [DateTime]::UtcNow -lt $inspectionDeadline)
        if (-not $reportConfirmed) {
            throw "X_ROUTE_REPORT_LINK_INVALID: Открытая вкладка не подтвердила постоянный отчёт $ExpectedRequestId."
        }

        $closeResult = Invoke-CdpCommand -Socket $githubSocket -Method 'Target.closeTarget' -Params @{ targetId = $githubTarget.id }
        $closeSucceeded = $closeResult.PSObject.Properties['success']
        if ($null -eq $closeSucceeded -or -not [bool]$closeSucceeded.Value) {
            throw "X_ROUTE_REPORT_LINK_CLOSE_UNVERIFIABLE: CDP не подтвердил закрытие проверочной GitHub-вкладки $($githubTarget.id)."
        }

        $closeDeadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
        $targetStillOpen = $null
        do {
            Start-Sleep -Milliseconds 250
            $targetStillOpen = Get-CdpTargets -Port $Port | Where-Object { $_.id -eq $githubTarget.id } | Select-Object -First 1
        } while ($null -ne $targetStillOpen -and [DateTime]::UtcNow -lt $closeDeadline)
        if ($null -ne $targetStillOpen) {
            throw "X_ROUTE_REPORT_LINK_CLOSE_UNVERIFIABLE: Проверочная GitHub-вкладка $($githubTarget.id) осталась открыта после команды CDP."
        }

        Invoke-CdpCommand -Socket $Socket -Method 'Page.bringToFront' | Out-Null
        [pscustomobject]@{
            RequestId = $ExpectedRequestId
            Url = $inspection.url
            TargetId = $githubTarget.id
            Heading = "Отчёт X-маршрута: $ExpectedRequestId"
            Closed = $true
        }
    }
    finally {
        $githubSocket.Dispose()
    }
}

function Write-XRouteReport {
    param(
        [ValidateSet('success', 'blocked', 'partial', 'failed')]
        [string]$Status,
        [string]$AssistantResponse,
        [string]$Reason,
        [bool]$ReportLinkVerified = $false,
        [string]$ReportLinkUrl = 'не подтверждена'
    )

    if ($Status -eq 'success' -and -not $ReportLinkVerified) {
        throw 'X_ROUTE_SUCCESS_REQUIRES_REPORT_LINK_VERIFICATION: Успешный локальный итог невозможен до проверки и закрытия вкладки отчёта.'
    }

    $writer = Join-Path $PSScriptRoot 'Write-X-Route-Report.ps1'
    $checks = @('Прямой CDP: использован', 'Видимый проект X-auto: подтверждён', 'Отправка: ровно одна попытка')
    if ($Status -eq 'success') {
        $checks += 'Терминальный маркер: найден в последнем ответе'
    }
    $notChecked = @('GitHub-проверка: не запускалась в этом локальном тесте по прямому указанию пользователя не использовать OpenCode')
    $risks = @('Промпт после нажатия отправки не повторяется автоматически; при неопределённом состоянии требуется ручная диагностика.')
    $verification = 'Не запускалась: это локальный безопасный тест транспорта. В полноценном X-маршруте после содержательного результата обязательна ровно одна OpenCode-опосредованная GitHub-проверка.'

    $existingReport = Join-Path (Join-Path $PSScriptRoot 'runs') "$RequestId.md"
    if ($ResumeExistingDraft -and (Test-Path -LiteralPath $existingReport -PathType Leaf)) {
        $recovery = @"

## Продолжение безопасной отправки

- Итог продолжения: $Status
- Причина: $Reason
- Ответ внешнего ассистента:

$AssistantResponse
"@
        Add-Content -LiteralPath $existingReport -Value $recovery -Encoding utf8
        Write-Output "X_ROUTE_REPORT_RECOVERY_APPENDED: $existingReport"
        return
    }

    & $writer -RequestId $RequestId -Status $Status -TaskSummary $Reason -AssistantResponseMarkdown $AssistantResponse -VerificationMarkdown $verification -Repository 'not applicable (browser transport smoke)' -Branch 'none' -CommitSha 'none' -PullRequest 'none' -ChangedFiles @() -ChecksRun $checks -NotChecked $notChecked -Risks $risks
}

function Stop-XRoute {
    param(
        [string]$Code,
        [string]$Reason,
        [string]$AssistantResponse = 'Нет ответа: отправка не была подтверждена.'
    )

    Write-XRouteReport -Status 'blocked' -AssistantResponse $AssistantResponse -Reason $Reason
    throw "${Code}: $Reason"
}

$projectUrlPattern = '^https://chatgpt\.com/g/g-p-[^/]+/project(?:[/?#]|$)'
$requestIdJson = $RequestId | ConvertTo-Json -Compress
$repositoryJson = $Repository | ConvertTo-Json -Compress
$reportPathJson = ("docs/reports/x-route/$RequestId.md") | ConvertTo-Json -Compress
$promptJson = $PromptText | ConvertTo-Json -Compress
$projectJson = $ProjectName | ConvertTo-Json -Compress
$stateExpression = @"
(() => {
  const projectName = $projectJson;
  const requestId = $requestIdJson;
  const repository = $repositoryJson;
  const reportPath = $reportPathJson;
  const promptText = $promptJson;
  const visible = (element) => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
  const point = (element) => {
    if (!element || !visible(element)) return null;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  };
  const text = (element) => ((element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || '').replace(/\s+/g, ' ').trim());
  const projectComposerNames = ['New chat in ' + projectName, 'Новый чат в ' + projectName];
  const composer = [...document.querySelectorAll('div.ProseMirror[contenteditable="true"], textarea, [contenteditable="true"]')].find((element) => visible(element) && projectComposerNames.includes(text(element))) || null;
  const composerText = composer ? (composer.innerText || composer.value || '') : '';
  const normalize = (value) => value.replace(/\r/g, '').replace(/\n{2,}/g, '\n').trim();
  const strictComposerMatch = normalize(composerText).includes(normalize(promptText));
  const composerHasRequestId = composerText.includes(requestId);
  const composerHasTerminalEnd = composerText.includes('END ' + requestId);
  const composerHasReportPath = composerText.includes('docs/reports/x-route/' + requestId + '.md');
  const composerMatchesSubmissionContract = composerHasRequestId && composerHasTerminalEnd && composerHasReportPath;
  const sendCandidates = [...document.querySelectorAll('button')].filter(visible).filter((button) => {
    const descriptor = (button.dataset.testid || '') + ' ' + text(button);
    return button.dataset.testid === 'send-button' || /send prompt|send message|отправить (промпт|запрос|сообщение|подсказку)/i.test(descriptor);
  });
  const send = sendCandidates.find((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true') || null;
  const bodyText = document.body ? document.body.innerText : '';
  const assistants = [...document.querySelectorAll('[data-message-author-role="assistant"]')].filter(visible);
  const lastAssistantElement = assistants.length ? assistants[assistants.length - 1] : null;
  const lastAssistant = lastAssistantElement ? lastAssistantElement.innerText.trim() : '';
  const assistantLinks = lastAssistantElement ? [...lastAssistantElement.querySelectorAll('a')].filter(visible) : [];
  const assistantLinkHrefs = assistantLinks.map((link) => link.href || link.getAttribute('href') || '').filter(Boolean);
  const assistantHasReportLink = assistantLinkHrefs.some((href) => href.includes('github.com/' + repository + '/blob/') && href.includes('/' + reportPath));
  const assistantRequestsSafetyRetry = lastAssistantElement ? /<!--\s*X_ROUTE_RETRY:\s*safety_write_block\s*-->/i.test(lastAssistantElement.innerHTML) : false;
  return {
    url: location.href,
    loginRequired: /\b(log in|sign up)\b|войти|регистрация/i.test(bodyText),
    challenge: /one moment|verify you are human|challenge|провер.{0,12}человек/i.test(bodyText),
    projectPage: /^\/g\/g-p-[^/]+\/project\/?$/.test(location.pathname),
    composer: point(composer),
    composerContainsPrompt: strictComposerMatch || composerMatchesSubmissionContract,
    strictComposerMatch,
    composerHasText: composerText.trim().length > 0,
    composerTextLength: composerText.length,
    composerHasRequestId,
    composerHasTerminalEnd,
    composerHasReportPath,
    composerFocused: document.activeElement === composer,
    send: point(send),
    assistantResponse: lastAssistant,
    assistantMarkup: lastAssistantElement ? lastAssistantElement.innerHTML : '',
    assistantLinkCount: assistantLinks.length,
    assistantHasReportLink,
    assistantRequestsSafetyRetry,
    markerFound: lastAssistant.includes('END ' + requestId),
    projectName
  };
})()
"@

$domClickExpression = @"
(() => {
  const visible = (element) => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
  const text = (element) => ((element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || '').replace(/\s+/g, ' ').trim());
  const projectName = $projectJson;
  const projectComposerNames = ['New chat in ' + projectName, 'Новый чат в ' + projectName];
  const composer = [...document.querySelectorAll('div.ProseMirror[contenteditable="true"], textarea, [contenteditable="true"]')].find((element) => visible(element) && projectComposerNames.includes(text(element))) || null;
  const send = [...document.querySelectorAll('button')].filter(visible).find((button) => {
    const descriptor = (button.dataset.testid || '') + ' ' + text(button);
    return !button.disabled && button.getAttribute('aria-disabled') !== 'true' && (button.dataset.testid === 'send-button' || /send prompt|send message|отправить (промпт|запрос|сообщение|подсказку)/i.test(descriptor));
  });
  if (!send) return { clicked: false };
  send.click();
  return { clicked: true, dataTestId: send.dataset.testid || '', ariaLabel: send.getAttribute('aria-label') || '', title: send.getAttribute('title') || '' };
})()
"@

$focusComposerExpression = @"
(() => {
  const visible = (element) => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
  const text = (element) => ((element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || '').replace(/\s+/g, ' ').trim());
  const projectName = $projectJson;
  const projectComposerNames = ['New chat in ' + projectName, 'Новый чат в ' + projectName];
  const composer = [...document.querySelectorAll('div.ProseMirror[contenteditable="true"], textarea, [contenteditable="true"]')].find((element) => visible(element) && projectComposerNames.includes(text(element))) || null;
  if (!composer) return { focused: false };
  composer.focus();
  return { focused: document.activeElement === composer };
})()
"@

$reportPath = Join-Path (Join-Path $PSScriptRoot 'runs') "$RequestId.md"
if ((Test-Path -LiteralPath $reportPath -PathType Leaf) -and -not $ResumeExistingDraft) {
    throw "X_ROUTE_REPORT_EXISTS: Отчёт '$reportPath' уже существует. Для новой отправки нужен новый request id."
}
if ($ResumeExistingDraft -and -not (Test-Path -LiteralPath $reportPath -PathType Leaf)) {
    throw "X_ROUTE_RESUME_REPORT_NOT_FOUND: Нельзя продолжить черновик без исходного отчёта '$reportPath'."
}

try {
    & (Join-Path $PSScriptRoot 'Open-X-Auto-Chat.ps1') -ProjectName $ProjectName -CdpPort $CdpPort -UiTimeoutSeconds $UiTimeoutSeconds | Write-Output
    Start-Sleep -Milliseconds $uiSettleMilliseconds
}
catch {
    Write-XRouteReport -Status 'blocked' -AssistantResponse 'Нет ответа: подготовка проекта X-auto не завершилась.' -Reason $_.Exception.Message
    throw
}

$target = Get-CdpTargets -Port $CdpPort | Where-Object {
    $_.type -eq 'page' -and $_.url -match $projectUrlPattern -and $_.title -like "*$ProjectName*" -and $_.webSocketDebuggerUrl
} | Select-Object -First 1
if ($null -eq $target) {
    Stop-XRoute -Code 'X_ROUTE_PROJECT_PAGE_NOT_READY' -Reason "Страница проекта '$ProjectName' не найдена после подготовки. Текст не отправлялся."
}

$socket = Connect-CdpSocket -WebSocketUrl $target.webSocketDebuggerUrl
try {
    Invoke-CdpCommand -Socket $socket -Method 'Page.bringToFront' | Out-Null
    Start-Sleep -Milliseconds $uiSettleMilliseconds
    $state = Invoke-CdpEvaluate -Socket $socket -Expression $stateExpression
    if ($state.loginRequired) {
        Stop-XRoute -Code 'X_ROUTE_SESSION_EXPIRED_OR_REVOKED' -Reason 'В видимом окне требуется вход. Скрипт не вводит учётные данные.'
    }
    if ($state.challenge) {
        Stop-XRoute -Code 'X_ROUTE_CHALLENGE_VISIBLE' -Reason 'В видимом окне обнаружена проверка. Пройдите её вручную и повторите запуск.'
    }
    if (-not $state.projectPage -or $null -eq $state.composer) {
        Stop-XRoute -Code 'X_ROUTE_CHAT_NOT_READY' -Reason 'Страница X-auto или видимое поле ввода не подтверждены. Текст не отправлялся.'
    }
    if ($ProbeOnly) {
        Write-Output "X_ROUTE_SEND_PROBE_READY: composerTextLength=$($state.composerTextLength); strictComposerMatch=$($state.strictComposerMatch); composerContainsPrompt=$($state.composerContainsPrompt); composerHasRequestId=$($state.composerHasRequestId); composerHasTerminalEnd=$($state.composerHasTerminalEnd); composerHasReportPath=$($state.composerHasReportPath); composerFocused=$($state.composerFocused); sendReady=$($null -ne $state.send)"
        return
    }
    if ($ResumeExistingDraft -and -not $state.composerContainsPrompt) {
        Stop-XRoute -Code 'X_ROUTE_DRAFT_MISMATCH' -Reason 'Черновик не совпадает с исходным промптом. Скрипт не нажимал отправку.'
    }
    if (-not $ResumeExistingDraft -and $state.composerHasText) {
        Stop-XRoute -Code 'X_ROUTE_COMPOSER_NOT_EMPTY' -Reason "В поле уже есть черновик длиной $($state.composerTextLength) символов. Скрипт не добавлял и не отправлял новый промпт."
    }
    if (-not $ResumeExistingDraft) {
        Invoke-VisibleClick -Socket $socket -X $state.composer.x -Y $state.composer.y
        $state = Invoke-CdpEvaluate -Socket $socket -Expression $stateExpression
        if (-not $state.composerFocused) {
            Invoke-CdpEvaluate -Socket $socket -Expression $focusComposerExpression | Out-Null
            $state = Invoke-CdpEvaluate -Socket $socket -Expression $stateExpression
        }
        if (-not $state.composerFocused) {
            Stop-XRoute -Code 'X_ROUTE_COMPOSER_FOCUS_UNCONFIRMED' -Reason 'Видимое поле X-auto не получило фокус. Текст не вставлялся.'
        }
        Invoke-CdpCommand -Socket $socket -Method 'Input.insertText' -Params @{ text = $PromptText } | Out-Null

        $typedDeadline = [DateTime]::UtcNow.AddSeconds($UiTimeoutSeconds)
        do {
            Start-Sleep -Milliseconds 200
            $state = Invoke-CdpEvaluate -Socket $socket -Expression $stateExpression
        } while ((-not $state.composerContainsPrompt -or $null -eq $state.send) -and [DateTime]::UtcNow -lt $typedDeadline)

        if (-not $state.composerContainsPrompt) {
            Stop-XRoute -Code 'X_ROUTE_PROMPT_NOT_INSERTED' -Reason "CDP Input.insertText не подтвердил текст в видимом поле (длина=$($state.composerTextLength), фокус=$($state.composerFocused)). Отправка не выполнялась."
        }
    }
    if ($null -eq $state.send) {
        Stop-XRoute -Code 'X_ROUTE_SEND_CONTROL_NOT_READY' -Reason 'Текст введён, но активная видимая кнопка отправки не найдена. Повторной отправки не будет.'
    }

    if ($UseDomClickFallback) {
        if (-not $ResumeExistingDraft) {
            Stop-XRoute -Code 'X_ROUTE_FALLBACK_REQUIRES_RESUME' -Reason 'Запасной клик разрешён только для уже совпадающего черновика после неподтверждённой первой попытки.'
        }
        $domClick = Invoke-CdpEvaluate -Socket $socket -Expression $domClickExpression
        if (-not $domClick.clicked) {
            Stop-XRoute -Code 'X_ROUTE_SEND_CONTROL_NOT_READY' -Reason 'Для запасного клика активная видимая кнопка отправки не найдена. Повторной отправки не будет.'
        }
        Write-Output 'X_ROUTE_DOM_CLICK_FALLBACK_USED: verified visible send control'
    }
    else {
        Invoke-VisibleClick -Socket $socket -X $state.send.x -Y $state.send.y
    }
    $submissionDeadline = [DateTime]::UtcNow.AddSeconds($UiTimeoutSeconds)
    do {
        Start-Sleep -Milliseconds 200
        $state = Invoke-CdpEvaluate -Socket $socket -Expression $stateExpression
    } while ($state.composerContainsPrompt -and [DateTime]::UtcNow -lt $submissionDeadline)

    if ($state.composerContainsPrompt) {
        Stop-XRoute -Code 'X_ROUTE_SUBMISSION_UNCONFIRMED' -Reason 'После единственного нажатия кнопки текст остался в поле. Повторной отправки не будет.'
    }

    Write-Output "X_ROUTE_PROMPT_SUBMITTED: $RequestId"
    $responseDeadline = [DateTime]::UtcNow.AddSeconds($ResponseTimeoutSeconds)
    $responseMarkerObserved = $false
    $responseSuccessMarkerObserved = $false
    $lastAssistantSignature = $null
    $assistantStableSince = $null
    $assistantSettleMilliseconds = 1500
    $successLinkDeadline = $null
    $responseRenderSettleUntil = $null
    do {
        Start-Sleep -Milliseconds 500
        $state = Invoke-CdpEvaluate -Socket $socket -Expression $stateExpression
        if ($state.markerFound) {
            $responseMarkerObserved = $true
            $responseSuccessMarkerObserved = $state.assistantResponse -match '(?im)^status:\s*success\s*$'
            if ($responseSuccessMarkerObserved) {
                if ($null -eq $responseRenderSettleUntil) {
                    $responseRenderSettleUntil = [DateTime]::UtcNow.AddMilliseconds($assistantRenderSettleMilliseconds)
                }
                if ([DateTime]::UtcNow -lt $responseRenderSettleUntil) {
                    continue
                }
                if ($null -eq $successLinkDeadline) {
                    $successLinkDeadline = [DateTime]::UtcNow.AddSeconds($ReportLinkTimeoutSeconds)
                }
                $assistantSignature = "{0}`n{1}" -f $state.assistantResponse, $state.assistantMarkup
                if ($assistantSignature -ne $lastAssistantSignature) {
                    $lastAssistantSignature = $assistantSignature
                    $assistantStableSince = [DateTime]::UtcNow
                }
                $assistantStableLongEnough = $null -ne $assistantStableSince -and ([DateTime]::UtcNow - $assistantStableSince).TotalMilliseconds -ge $assistantSettleMilliseconds
                if (-not $state.assistantHasReportLink -or -not $assistantStableLongEnough) {
                    if ([DateTime]::UtcNow -ge $successLinkDeadline) {
                        break
                    }
                    continue
                }
            }
            $completionValidator = Join-Path $PSScriptRoot 'Test-X-Route-Completion.ps1'
            try {
                $completionResult = @(& $completionValidator -RequestId $RequestId -Repository $Repository -AssistantResponse $state.assistantResponse -AssistantMarkup $state.assistantMarkup)
                $completionResult | Write-Output
            }
            catch {
                Write-XRouteReport -Status 'partial' -AssistantResponse $state.assistantResponse -Reason "Локальная проверка ответа не завершилась: $($_.Exception.Message)"
                throw "X_ROUTE_COMPLETION_CONTRACT_INVALID: $($_.Exception.Message)"
            }
            if ($completionResult -contains "X_ROUTE_COMPLETION_BLOCKED: $RequestId" -and $state.assistantRequestsSafetyRetry -and $SafetyRetryAttempt -lt $maxSafetyRetries) {
                Write-XRouteReport -Status 'partial' -AssistantResponse $state.assistantResponse -Reason 'Модель явно указала, что запись остановила система безопасности OpenAI до выполнения записи. Запускается одна повторная попытка в новом чате.'
                throw 'X_ROUTE_SAFETY_WRITE_RETRY_REQUESTED: модель запросила повтор после остановки записи системой безопасности OpenAI.'
            }
            if ($completionResult -contains "X_ROUTE_COMPLETION_BLOCKED: $RequestId") {
                Stop-XRoute -Code 'X_ROUTE_COMPLETION_BLOCKED' -Reason 'Внешний ассистент вернул status: blocked. GitHub-доставка не подтверждена.' -AssistantResponse $state.assistantResponse
            }
            try {
                Start-Sleep -Milliseconds $uiSettleMilliseconds
                $reportLinkVerification = Confirm-XRouteReportLink -Socket $socket -Port $CdpPort -ExpectedRequestId $RequestId -ExpectedRepository $Repository -TimeoutSeconds $ReportLinkTimeoutSeconds
            }
            catch {
                Write-XRouteReport -Status 'partial' -AssistantResponse $state.assistantResponse -Reason $_.Exception.Message
                throw
            }
            if ($null -eq $reportLinkVerification -or -not $reportLinkVerification.Closed -or [string]::IsNullOrWhiteSpace($reportLinkVerification.Url)) {
                Write-XRouteReport -Status 'partial' -AssistantResponse $state.assistantResponse -Reason 'X_ROUTE_REPORT_LINK_VERIFICATION_STATE_INVALID: CDP не вернул подтверждение точной ссылки и её закрытия.'
                throw 'X_ROUTE_REPORT_LINK_VERIFICATION_STATE_INVALID: CDP не вернул подтверждение точной ссылки и её закрытия.'
            }
            Write-Output "X_ROUTE_REPORT_LINK_CONFIRMED: $RequestId"
            Write-Output "X_ROUTE_REPORT_LINK_CLOSED: $RequestId"
            Write-XRouteReport -Status 'success' -AssistantResponse $state.assistantResponse -Reason 'Безопасный локальный тест: текст отправлен единожды через CDP, терминальный маркер получен в последнем ответе, ссылка отчёта подтверждена и её вкладка закрыта.' -ReportLinkVerified $true -ReportLinkUrl $reportLinkVerification.Url
            Write-Output "X_ROUTE_COMPLETED: $RequestId"
            Write-Output "Report: $reportPath"
            return
        }
    } while ([DateTime]::UtcNow -lt $responseDeadline)

    if ($responseSuccessMarkerObserved) {
        Write-XRouteReport -Status 'partial' -AssistantResponse $state.assistantResponse -Reason 'Внешний X вернул status: success, но HTML-ссылка на отчёт не появилась или не стабилизировалась в отведённое время. Повторная отправка запрещена.'
        throw 'X_ROUTE_REPORT_LINK_NOT_RENDERED: Внешний X завершился успешно, но ссылка отчёта не успела стать доступной для проверки.'
    }
    Stop-XRoute -Code 'X_ROUTE_RESPONSE_TIMEOUT' -Reason "За $ResponseTimeoutSeconds секунд не получен терминальный маркер в последнем ответе. Промпт повторно не отправлялся." -AssistantResponse $state.assistantResponse
}
catch {
    $errorMessage = $_.Exception.Message
    if ($errorMessage -match '^X_ROUTE_SAFETY_WRITE_RETRY_REQUESTED:' -and $SafetyRetryAttempt -lt $maxSafetyRetries) {
        if ($null -ne $socket) {
            $socket.Dispose()
            $socket = $null
        }
        if ($null -ne $reportOnlyLock) {
            $reportOnlyLock.Dispose()
            $reportOnlyLock = $null
        }
        $retryRequestId = 'XROUTE-{0}-{1}' -f [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss'), [guid]::NewGuid().ToString('N').Substring(0, 6)
        $retryTaskInstructions = @"
Это автоматический повтор после явного сигнала модели о том, что запись была
остановлена системой безопасности OpenAI до выполнения. Предыдущая попытка
имела идентификатор $RequestId. Перед новой записью сначала проверь GitHub и
убедись, что предыдущая попытка не оставила частичных изменений; если они уже
есть, не дублируй их и сообщи об этом.
"@
        Write-Output "X_ROUTE_SAFETY_RETRY_REQUESTED: $RequestId"
        Write-Output "X_ROUTE_SAFETY_RETRY_WAIT_SECONDS: $safetyRetryDelaySeconds"
        Start-Sleep -Seconds $safetyRetryDelaySeconds
        Write-Output "X_ROUTE_SAFETY_RETRY_NEW_CHAT: $retryRequestId"
        $retryParameters = @{
            RequestId = $retryRequestId
            Repository = $Repository
            TaskSummary = $TaskSummary
            TaskInstructions = $retryTaskInstructions
            TaskType = $TaskType
            BaseBranch = $BaseBranch
            ReportBranch = $ReportBranch
            PublishedContextMarkdown = $PublishedContextMarkdown
            RequiredSkillsManifestMarkdown = $RequiredSkillsManifestMarkdown
            ProjectName = $ProjectName
            CdpPort = $CdpPort
            ResponseTimeoutSeconds = $ResponseTimeoutSeconds
            UiTimeoutSeconds = $UiTimeoutSeconds
            ReportLinkTimeoutSeconds = $ReportLinkTimeoutSeconds
            SafetyRetryAttempt = $SafetyRetryAttempt + 1
        }
        & $PSCommandPath @retryParameters
        return
    }
    if ($_.Exception.Message -notmatch '^X_ROUTE_') {
        try {
            Write-XRouteReport -Status 'failed' -AssistantResponse 'Нет подтверждённого ответа из-за ошибки транспорта.' -Reason $_.Exception.Message
        }
        catch {
            Write-Error $_.Exception.Message
        }
    }
    throw
}
finally {
    if ($null -ne $socket) {
        $socket.Dispose()
    }
    if ($null -ne $reportOnlyLock) {
        $reportOnlyLock.Dispose()
    }
}
