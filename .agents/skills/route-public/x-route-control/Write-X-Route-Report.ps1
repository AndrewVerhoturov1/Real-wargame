[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^XROUTE-[A-Za-z0-9-]+$')]
    [string]$RequestId,
    [Parameter(Mandatory)]
    [ValidateSet('success', 'blocked', 'partial', 'failed')]
    [string]$Status,
    [Parameter(Mandatory)]
    [string]$TaskSummary,
    [Parameter(Mandatory)]
    [string]$AssistantResponseMarkdown,
    [Parameter(Mandatory)]
    [string]$VerificationMarkdown,
    [string]$Repository = 'not reported',
    [string]$Branch = 'not reported',
    [string]$CommitSha = 'not reported',
    [string]$PullRequest = 'none',
    [string[]]$ChangedFiles = @(),
    [string[]]$ChecksRun = @(),
    [string[]]$NotChecked = @(),
    [string[]]$Risks = @(),
    [bool]$ReportLinkVerified = $false,
    [string]$ReportLinkUrl = 'не подтверждена',
    [string]$OutputDirectory = (Join-Path $PSScriptRoot 'runs')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($Status -eq 'success' -and -not $ReportLinkVerified) {
    throw 'X_ROUTE_SUCCESS_REQUIRES_REPORT_LINK_VERIFICATION: Успешный локальный итог невозможен до проверки и закрытия вкладки отчёта.'
}

function ConvertTo-MarkdownList {
    param([string[]]$Items)

    if ($null -eq $Items -or $Items.Count -eq 0) {
        return '- none'
    }
    (($Items | ForEach-Object { "- $_" }) -join [Environment]::NewLine)
}

if (-not (Test-Path -LiteralPath $OutputDirectory -PathType Container)) {
    if ($PSCmdlet.ShouldProcess($OutputDirectory, 'Создать каталог отчётов X-маршрута')) {
        New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
    }
    else {
        return
    }
}

$reportPath = Join-Path $OutputDirectory "$RequestId.md"
if (Test-Path -LiteralPath $reportPath -PathType Leaf) {
    throw "X_ROUTE_REPORT_EXISTS: Отчёт '$reportPath' уже существует. Используйте новый request id; существующий отчёт не перезаписывается."
}

$report = @"
# Локальный журнал транспорта X-маршрута: $RequestId

## Итог

- Статус: $Status
- Репозиторий: $Repository
- Ветка: $Branch
- Точный коммит: $CommitSha
- Pull Request: $PullRequest

## Задача

$TaskSummary

## Изменённые файлы

$(ConvertTo-MarkdownList -Items $ChangedFiles)

## Выполненные проверки

$(ConvertTo-MarkdownList -Items $ChecksRun)

## Проверка ссылки на полный отчёт

- Подтверждена CDP: $ReportLinkVerified
- Точный адрес: $ReportLinkUrl
- Проверочная вкладка: закрыта только после подтверждения адреса и заголовка

## Что не проверялось

$(ConvertTo-MarkdownList -Items $NotChecked)

## Риски и замечания

$(ConvertTo-MarkdownList -Items $Risks)

## Наблюдённый ответ внешнего ассистента

$AssistantResponseMarkdown

## Независимая проверка GitHub

$VerificationMarkdown

## Назначение и границы безопасности

- В отчёт не добавляются cookies, пароли, токены, содержимое `.env` и другие секреты.
- GitHub-факты подтверждаются только отдельным OpenCode-опосредованным проходом.
- Этот файл — локальный технический журнал CDP-транспорта. Он не заменяет
  пользовательский отчёт `docs/reports/x-route/XROUTE-<id>.md` в GitHub и не
  является основной ссылкой в итоговом сообщении X.
"@

if ($PSCmdlet.ShouldProcess($reportPath, 'Записать подробный отчёт X-маршрута')) {
    Set-Content -LiteralPath $reportPath -Value $report -Encoding utf8 -NoNewline
    Write-Output "X_ROUTE_REPORT_WRITTEN: $reportPath"
}
