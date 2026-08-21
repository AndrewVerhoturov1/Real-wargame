[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^XROUTE-[A-Za-z0-9-]+$')]
    [string]$RequestId,
    [Parameter(Mandatory)]
    [ValidatePattern('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')]
    [string]$Repository,
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$AssistantResponse,
    [string]$AssistantMarkup = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$trimmedResponse = $AssistantResponse.Trim()
$markerPattern = "(?ms)^BEGIN $([regex]::Escape($RequestId))\s*$.*?^END $([regex]::Escape($RequestId))\s*$"
$marker = [regex]::Match($trimmedResponse, $markerPattern)
if (-not $marker.Success) {
    throw "X_ROUTE_COMPLETION_MARKER_MISSING: Нет полного завершающего блока для $RequestId."
}
if ($marker.Index + $marker.Length -ne $trimmedResponse.Length) {
    throw "X_ROUTE_COMPLETION_MARKER_NOT_FINAL: После END $RequestId найден дополнительный текст."
}

$successLines = @("BEGIN $RequestId", 'status: success', "END $RequestId")
$blockedLines = @("BEGIN $RequestId", 'status: blocked', "END $RequestId")
$markerLines = @($marker.Value.Trim() -split "\r?\n" | ForEach-Object { $_.Trim() } | Where-Object { $_.Length -gt 0 })
if (($markerLines -join "`n") -eq ($blockedLines -join "`n")) {
    $blockedExplanation = $trimmedResponse.Substring(0, $marker.Index).Trim()
    if ([string]::IsNullOrWhiteSpace($blockedExplanation)) {
        throw 'X_ROUTE_BLOCKED_EXPLANATION_MISSING: Перед blocked-маркером нужно кратко и понятным языком назвать фактическую причину остановки.'
    }
    if ($blockedExplanation -notmatch '(?im)^(?:##\s*)?Кратко для пользователя\s*$') {
        throw 'X_ROUTE_BLOCKED_EXPLANATION_FORMAT_INVALID: Причина блокировки должна находиться в блоке «Кратко для пользователя».'
    }
    $githubFailureEvidence = @(
        '(?i)GitHub.{0,120}(?:ошиб|недоступ|отказ|access|error|не найден|not found|permission|timeout|401|403|404)',
        '(?i)(?:ошиб|недоступ|отказ|не найден|not found|permission|timeout|401|403|404).{0,120}GitHub',
        '(?i)(?:инструмент|tool).{0,120}(?:вернул|ответил|ошиб|недоступ|error|unavailable)',
        '(?i)(?:HTTP|код ответа|status code).{0,80}(?:401|403|404|5\d\d|ошиб|error)'
    )
    $safetyRetrySignal = $AssistantMarkup -match '(?is)<!--\s*X_ROUTE_RETRY:\s*safety_write_block\s*-->'
    if (@($githubFailureEvidence | Where-Object { $blockedExplanation -match $_ }).Count -eq 0 -and -not $safetyRetrySignal) {
        throw 'X_ROUTE_BLOCKED_EVIDENCE_MISSING: blocked нельзя принять без фактической ошибки GitHub-инструмента; отсутствие попытки или предположение о недоступности не являются блокировкой.'
    }
    if ($safetyRetrySignal) {
        Write-Output "X_ROUTE_RETRY_SIGNAL: $RequestId"
    }
    Write-Output "X_ROUTE_COMPLETION_BLOCKED: $RequestId"
    return
}
if (($markerLines -join "`n") -ne ($successLines -join "`n")) {
    throw 'X_ROUTE_COMPLETION_MARKER_FIELDS_INVALID: В успешном маркере разрешены только BEGIN, status: success и END.'
}

$requiredHeadings = @('Кратко для пользователя', 'Полный отчёт')
$headings = @([regex]::Matches($trimmedResponse, '(?m)^(?:##\s*)?(Кратко для пользователя|Полный отчёт)\s*$') | ForEach-Object { $_.Groups[1].Value })
if ($headings.Count -ne 2 -or @($requiredHeadings | Where-Object { $headings -notcontains $_ }).Count -gt 0) {
    throw 'X_ROUTE_CHAT_BLOCKS_INVALID: Успешный ответ обязан состоять из блоков «Кратко для пользователя» и «Полный отчёт».'
}
if ($trimmedResponse -match '(?m)^(?:##\s*)?Служебная часть X\s*$') {
    throw 'X_ROUTE_CHAT_SERVICE_BLOCK_VISIBLE: Служебная часть должна быть только в полном отчёте.'
}

$reportSection = [regex]::Match($trimmedResponse, "(?ms)^(?:##\s*)?Полный отчёт\s*$\s*(?<content>.*?)^BEGIN $([regex]::Escape($RequestId))\s*$")
if (-not $reportSection.Success -or [string]::IsNullOrWhiteSpace($reportSection.Groups['content'].Value)) {
    throw 'X_ROUTE_CHAT_REPORT_LINK_MISSING: Во втором блоке нужна ссылка на постоянный отчёт.'
}
$expectedReportUrlPattern = '^https://github\.com/' + [regex]::Escape($Repository) + '/blob/[0-9a-f]{40}/docs/reports/x-route/' + [regex]::Escape($RequestId) + '\.md$'
$declaredUrls = @()
foreach ($match in [regex]::Matches($reportSection.Groups['content'].Value, '\]\((?<url>[^\)]+)\)')) {
    $declaredUrls += $match.Groups['url'].Value
}
foreach ($match in [regex]::Matches($AssistantMarkup, '<a\b[^>]*\bhref\s*=\s*["''](?<url>[^"'']+)["'']', [Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
    $declaredUrls += [System.Net.WebUtility]::HtmlDecode($match.Groups['url'].Value)
}
if (-not @($declaredUrls | Where-Object { $_ -match $expectedReportUrlPattern })) {
    throw 'X_ROUTE_CHAT_REPORT_LINK_FORMAT_INVALID: Нужна точная Markdown-ссылка GitHub на отчёт в неизменяемом коммите.'
}

Write-Output "X_ROUTE_CHAT_REPORT_LINK_DECLARED: $RequestId"
Write-Output "X_ROUTE_COMPLETION_CONTRACT_VALID: $RequestId"
