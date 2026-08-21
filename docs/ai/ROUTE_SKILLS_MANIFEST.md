# Манифест публичных маршрутных навыков

Этот файл связывает маршруты Codex/OpenCode с репозиторными копиями навыков.
Внешний агент читает именно эти файлы из GitHub. Исходные локальные файлы
окружения не нужны и не публикуются.

| Маршрут | Публичный навык | Когда читать | Результат |
|---|---|---|---|
| A | [opencode-mcp-windows-control](../../.agents/skills/route-public/opencode-mcp-windows-control/SKILL.md) | перед разведкой, чтением и проверками | безопасный выбор маршрута и работа через OpenCode |
| B | [opencode-deepseek-pro-jobs-control](../../.agents/skills/route-public/opencode-deepseek-pro-jobs-control/SKILL.md) | только после сбоя прямого маршрута | одна ограниченная попытка восстановления |
| C | [opencode-deepseek-pro-jobs-control](../../.agents/skills/route-public/opencode-deepseek-pro-jobs-control/SKILL.md) | перед тяжёлой локальной jobs-фазой | ограниченный локальный ремонт |
| D | [d-route-control](../../.agents/skills/route-public/d-route-control/SKILL.md) | только по явной просьбе про нативный Codex | прямой нативный этап |
| L | [opencode-mcp-windows-control](../../.agents/skills/route-public/opencode-mcp-windows-control/SKILL.md) | перед узким микро-патчем | одна очевидная правка на известном файле |
| Q | [opencode-github-mcp-control](../../.agents/skills/route-public/opencode-github-mcp-control/SKILL.md) | при ручной GitHub-aware передаче | внешний отчёт с точной ревизией |
| R | [opencode-zworker-control](../../.agents/skills/route-public/opencode-zworker-control/SKILL.md) | только при явном `/zworker` | ZIP с `answer.md` |
| W | [zworker-auto](../../.agents/skills/route-public/zworker-auto/SKILL.md) | перед автоматическим ZIP-маршрутом | ZIP с проверяемым отчётом |
| X | [x-route-control](../../.agents/skills/route-public/x-route-control/SKILL.md) | перед любым `/X` или автоматическим X | ветка/PR, отчёт и проверка доставки |

Общие документы:

- [routing-reminder](../../.agents/skills/route-public/routing-reminder/SKILL.md)
  — краткое напоминание о выборе маршрута;
- [real-wargame-documentation](../../.agents/skills/route-public/real-wargame-documentation/SKILL.md)
  — правила документации и проверок.

## Состав Route X

Перед чтением X сначала открыть [SKILL.md](../../.agents/skills/route-public/x-route-control/SKILL.md), затем:

1. [Run-X-Chrome.ps1](../../.agents/skills/route-public/x-route-control/Run-X-Chrome.ps1)
2. [Open-X-Auto-Chat.ps1](../../.agents/skills/route-public/x-route-control/Open-X-Auto-Chat.ps1)
3. [New-X-Route-Prompt.ps1](../../.agents/skills/route-public/x-route-control/New-X-Route-Prompt.ps1)
4. [Send-X-Route-Prompt.ps1](../../.agents/skills/route-public/x-route-control/Send-X-Route-Prompt.ps1)
5. [Test-X-Route-Completion.ps1](../../.agents/skills/route-public/x-route-control/Test-X-Route-Completion.ps1)
6. [Write-X-Route-Report.ps1](../../.agents/skills/route-public/x-route-control/Write-X-Route-Report.ps1)

Изменения X, отражённые в публичной копии: обязательный выделенный Chrome/CDP
`9223`, запрет встроенного браузера как транспорта, сигнал модели
`X_ROUTE_RETRY: safety_write_block`, ожидание 10 секунд, новый чат и ровно одна
повторная попытка, а также паузы на загрузку интерфейса и дорисовку ответа.
