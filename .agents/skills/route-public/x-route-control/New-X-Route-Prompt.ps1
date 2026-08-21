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
    [ValidatePattern('^docs/reports/x-route$')]
    [string]$ReportDirectory = 'docs/reports/x-route'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($TaskInstructions)) {
    $TaskInstructions = $TaskSummary
}

$reportPath = "$ReportDirectory/$RequestId.md"
$repositoryUrl = "https://github.com/$Repository"

if ($TaskType -eq 'report_only') {
    $deliveryInstructions = @"
Режим только ответа: проверь доступ, используй постоянную ветку '$ReportBranch'
(создай её один раз от '$BaseBranch' при отсутствии), создай только '$reportPath'
и сделай один коммит. Получи SHA только после коммита и сформируй ссылку.
Не меняй продуктовые файлы, не создавай временную ветку, PR или второй коммит.
Отсутствие SHA заранее не является блокировкой. blocked допустим только после
фактической ошибки доступа/инструмента или нарушения явного ограничения; назови
в отчёте начатый шаг и реальную причину.
"@
}
else {
    $deliveryInstructions = @"
Режим изменения продукта: первым действием через GitHub прочитай '$Repository'
и точный HEAD '$BaseBranch', затем создай ровно одну ветку
'feature/YYYYMMDD-...'. Внеси только нужную правку, добавь '$reportPath' в ту
же ветку, создай один PR в '$BaseBranch' и затем добавь отчёт отдельным
финальным коммитом. '$ReportBranch' не используй. Не пиши план вместо действий:
отсутствие SHA заранее не блокирует работу. blocked допустим только после
фактической ошибки доступа/инструмента или нарушения ограничения; назови шаг и
ответ инструмента в отчёте.
"@
}

$template = @'
@GitHub

ОБЯЗАТЕЛЬНОЕ ПРАВИЛО: приложение и инструменты GitHub уже подключены к этому
чату. Ты обязан использовать их для этой задачи. Первая фактическая операция
до любого объяснения, плана или решения о `blocked` — вызов доступного
GitHub-инструмента для чтения репозитория `$Repository` и состояния ветки
`$BaseBranch`. Не отвечай «нет доступа» и не объявляй блокировку по догадке,
пока такой вызов не выполнен и не вернул фактическую ошибку. В отчёте укажи,
какой GitHub-инструмент был вызван и что именно он вернул. Если GitHub вернул
ошибку, приведи её суть и остановись только на этом фактическом основании.
Строка `@GitHub` выше — обязательное указание использовать подключённое
приложение, а не декоративная пометка.

## X-маршрут: $RequestId
Тип: `$TaskType`
Репозиторий: `$Repository`
База продукта: `$BaseBranch`

## Задача
$TaskSummary

## Дополнительные сведения
$TaskInstructions

Если дополнительные сведения содержат старый договор, его поля, ссылки или
маркеры, игнорируй их: этот канонический договор имеет приоритет.

## Контекст и навыки
$PublishedContextMarkdown
$RequiredSkillsManifestMarkdown

## Ограничения и доставка
Не работай с `main`, не сливай PR, не включай автослияние и не деплой.
Не читай и не публикуй пароли, cookies, токены, `.env` или хранилище профиля.
$deliveryInstructions

## Отчёт
После работы создай `$reportPath` в ветке своего режима. В нём обязательны:

```text
# Отчёт X-маршрута: $RequestId
## Кратко для пользователя
## Полный подробный ответ
## Что прочитано
## Использованные навыки
## Созданные файлы
## Изменённые файлы
## Удалённые файлы
## Доставка
## Служебные сведения X
## Проверки
## Что не проверялось
## Риски и ограничения
## Сверка с фактическими изменениями
```

В «Доставка» укажи фактические ветку, способ, PR и SHA коммитов, кроме SHA
самого отчёта. Итоговые списки файлов сверяй с фактическим diff Git; временный
файл, удалённый до итога, опиши только в полном ответе. Секреты не включай.
После коммита отчёта получи `report_commit_sha` и сформируй ссылку строго:

`$repositoryUrl/blob/<report_commit_sha>/$reportPath`

Заранее отсутствующий SHA не является блокировкой: сначала выполни разрешённые
действия. blocked допустим только после фактической ошибки доступа/инструмента
или нарушения ограничения; назови начатый шаг и реальную причину.

## Ответ в чате
Это отдельный новый чат в `X-auto`; прежние чаты не продолжай. Ответь ровно
двумя блоками, затем маркером. Не дублируй отчёт, SHA, PR, проверки и списки:

1. `## Кратко для пользователя` — простой итог и важные ограничения.
2. `## Полный отчёт` — ровно одна ссылка:
   `[Открыть полный отчёт]($repositoryUrl/blob/<report_commit_sha>/$reportPath)`
   со ссылкой на фактический 40-символьный SHA, а не на карточку ChatGPT.

```text
BEGIN $RequestId
status: success
END $RequestId
```

При блокировке до создания отчёта не выдумывай ссылку. Дай только короткий блок
«## Кратко для пользователя» с причиной и начатым шагом, затем:

Если именно модель установила, что запись остановила система безопасности
OpenAI до выполнения записи, добавь перед этим маркером ровно один невидимый
HTML-комментарий:

`<!-- X_ROUTE_RETRY: safety_write_block -->`

Добавляй этот сигнал только при таком фактическом событии. Обычный отказ
GitHub, отсутствие прав, недоступный инструмент или предположение о причине
не являются сигналом повторной попытки.

```text
BEGIN $RequestId
status: blocked
END $RequestId
```
'@

$template = $template.Replace('$RequestId', $RequestId).Replace('$TaskType', $TaskType).Replace('$TaskSummary', $TaskSummary).Replace('$TaskInstructions', $TaskInstructions).Replace('$PublishedContextMarkdown', $PublishedContextMarkdown).Replace('$RequiredSkillsManifestMarkdown', $RequiredSkillsManifestMarkdown).Replace('$Repository', $Repository).Replace('$BaseBranch', $BaseBranch).Replace('$deliveryInstructions', $deliveryInstructions).Replace('$reportPath', $reportPath).Replace('$repositoryUrl', $repositoryUrl)
$template
