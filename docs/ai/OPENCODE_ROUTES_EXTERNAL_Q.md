# Route Q — ручной пакет передачи для внешнего GitHub-only агента

Готовый ручной пакет для маршрута Q: передача задачи внешнему агенту, у которого
есть доступ **только к GitHub** (без локальной файловой системы и приватных
конфигов). Нужные маршрутные навыки лежат в репозитории в `.agents/skills/route-public/`.

Канонические источники проекта зафиксированы на точном базовом коммите
`5ba301e2840f47a263072980821ad77f306a2fb1` (HEAD `real-wargame-preview`).
Ссылки на справочник и публичные копии навыков используют ветку
`feature/20260821-opencode-routes-x-assets` и становятся достижимыми после
публикации этой ветки (см. раздел 6). До публикации внешний агент обязан
перечислить эти ссылки в `sources_unavailable` и не выдумывать их содержимое.

## 1. Правила для составителя пакета (этот документ)

- Никаких локальных путей, `file://`, секретов, `.env`, токенов, приватных
  данных и «голых» URL (без протокола). Разрешены только полные абсолютные
  HTTPS-ссылки на GitHub и raw-файлы.
- Никаких ссылок на приватные локальные копии навыков: внешний агент читает
  только репозиторные копии из `.agents/skills/route-public/`.
- Манифест навыков обязателен и включается в промт, а не держится только в заметках.
- Исполнитель обязан сообщить, какие источники и навыки он реально открыл, а какие
  не смог, и не выдумывать правила из непрочитанных источников.

## 2. Копируемый промт для внешнего агента

```text
Задача: по каноническим правилам репозитория AndrewVerhoturov1/Real-wargame
выполни работу, описанную в пакете ниже, и верни результат строго по контракту
выхода (раздел «Контракт выхода»).

Контекст:
- Рабочая ветка проекта: real-wargame-preview.
- База для работы: точный коммит 5ba301e2840f47a263072980821ad77f306a2fb1.
- Реализация выполняется на временной feature-ветке
  feature/YYYYMMDD-short-kebab-slug. Прямая разработка в real-wargame-preview
  и записи в main запрещены без отдельного явного разрешения пользователя.
- Стек: Vite + TypeScript + PixiJS 8. Это не Godot-проект.
- Язык общения с пользователем: простой русский; канонические имена файлов,
  полей, команд и путей сохраняются на английском.

Обязательный порядок чтения (все ссылки ниже):
1. AGENTS.md
2. docs/ai/repo-context.json
3. docs/ai/WEB_CHAT_START.md
4. docs/ai/TASK_ROUTER.md
5. docs/subprojects/index.json
6. docs/subprojects/ai-single-unit-editor/STATUS.md
7. docs/workflow/WEB_CHAT_FEATURE_DELIVERY.md
8. docs/workflow/EXTERNAL_CHAT_REQUIRED_RULES.md
9. docs/workflow/SKILL_PATCH_PREVIEW_BRANCH_POLICY.md

Навыки: открой и прочитай каждый required-навык из «Required Skills Manifest»,
conditional — только когда наступит условие. Если required-навык нельзя открыть —
остановись и сообщи блокер, не выдумывай его правила.
Для маршрутной работы сначала открой репозиторный
`.agents/skills/route-public/README.md`, затем соответствующий `SKILL.md`.
Для Route X обязательно прочитай `x-route-control/SKILL.md` и все шесть
PowerShell-скриптов из раздела 3.0; в GitHub-only среде не запускай их.

Запрещено:
- не используй локальные пути, file://, секреты, .env, токены;
- не пиши в main, не сливай PR, не включай auto-merge;
- не заявляй проверки, деплой, запуск тестов или браузера, которые не выполнялись;
- не считай себя выбравшим Route D или любой маршрут окружения: ты внешний
  GitHub-only исполнитель маршрута Q.

Верни (см. «Контракт выхода»): sources_read, sources_unavailable, skills_read,
skills_skipped, skills_unavailable, точную GitHub-ссылку (ref), готовый Markdown,
противоречия и без непроверенных утверждений.
```

## 3. Required Skills Manifest

Правила чтения: `required` — обязательно до работы; `conditional` — при
наступлении условия. Для недоступных навыков указано `repository copy available after branch publication`
(их несекретные правила изложены в канонических документах раздела 5 и в
`docs/ai/OPENCODE_ROUTES.md`).

| Навык | Статус | Зачем может понадобиться | URL |
|---|---|---|---|
| real-wargame-performance | conditional | обязателен для симуляции, ИИ, восприятия, навигации, тактических полей, рендера, воркеров, очередей, кэшей, жизненного цикла, производительности | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/5ba301e2840f47a263072980821ad77f306a2fb1/.agents/skills/real-wargame-performance/SKILL.md) |
| real-wargame-local-preview | conditional | локальный запуск и прямая визуальная проверка через реальный браузер, если доступен прямой браузер | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/5ba301e2840f47a263072980821ad77f306a2fb1/.agents/skills/real-wargame-local-preview/SKILL.md) |
| real-wargame-manual-vercel-deploy | conditional | обязателен при явном запросе деплоя на Vercel / создания или обновления Preview | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/5ba301e2840f47a263072980821ad77f306a2fb1/.agents/skills/real-wargame-manual-vercel-deploy/SKILL.md) |
| vercel-deployment-playwright-e2e | conditional | визуальная проверка существующего Preview через Playwright, если прямого браузера нет | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/5ba301e2840f47a263072980821ad77f306a2fb1/.agents/skills/vercel-deployment-playwright-e2e/SKILL.md) |
| real-wargame-pixijs | conditional | любая работа с PixiJS 8, canvas, рендером, камерой, указателем, визуальным слоем | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/5ba301e2840f47a263072980821ad77f306a2fb1/.agents/skills/real-wargame-pixijs/SKILL.md) |
| real-wargame-ai-runtime | conditional | работа с графом ИИ солдата, Utility-оценкой, Blackboard, Runtime, отменой, Bridge, AI-словарём | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/5ba301e2840f47a263072980821ad77f306a2fb1/.agents/skills/real-wargame-ai-runtime/SKILL.md) |
| real-wargame-github-pages-deploy | conditional | явный запрос деплоя на GitHub Pages | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/5ba301e2840f47a263072980821ad77f306a2fb1/.agents/skills/real-wargame-github-pages-deploy/SKILL.md) |
| real-wargame-documentation | conditional | Public repository copy: documentation rules and checks | [open after branch publication](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/feature/20260821-opencode-routes-x-assets/.agents/skills/route-public/real-wargame-documentation/SKILL.md) |
| opencode-mcp-windows-control | conditional | Public repository copy: dispatcher and route selection | [open after branch publication](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/feature/20260821-opencode-routes-x-assets/.agents/skills/route-public/opencode-mcp-windows-control/SKILL.md) |
| routing-reminder | conditional | Public repository copy: route reminder | [open after branch publication](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/feature/20260821-opencode-routes-x-assets/.agents/skills/route-public/routing-reminder/SKILL.md) |
| d-route-control | conditional | Public repository copy: explicit native Codex route | [open after branch publication](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/feature/20260821-opencode-routes-x-assets/.agents/skills/route-public/d-route-control/SKILL.md) |
| x-route-control | conditional | Public repository copy: updated Route X contract | [open after branch publication](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/feature/20260821-opencode-routes-x-assets/.agents/skills/route-public/x-route-control/SKILL.md) |
| opencode-zworker-control | conditional | Public repository copy: manual Route R | [open after branch publication](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/feature/20260821-opencode-routes-x-assets/.agents/skills/route-public/opencode-zworker-control/SKILL.md) |
| zworker-auto | conditional | Public repository copy: automatic Route W | [open after branch publication](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/feature/20260821-opencode-routes-x-assets/.agents/skills/route-public/zworker-auto/SKILL.md) |
| opencode-deepseek-pro-jobs-control | conditional | Public repository copy: Route B/C jobs | [open after branch publication](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/feature/20260821-opencode-routes-x-assets/.agents/skills/route-public/opencode-deepseek-pro-jobs-control/SKILL.md) |
| opencode-github-mcp-control | conditional | Public repository copy: GitHub verification rules | [open after branch publication](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/feature/20260821-opencode-routes-x-assets/.agents/skills/route-public/opencode-github-mcp-control/SKILL.md) |


### 3.0 Public repository copies

The following route skills are committed under `.agents/skills/route-public/` and
replace the old `repository copy available after branch publication` status for the external agent. Read
`README.md`, then the dispatcher and reminder, then the route-specific skill.
When Route X is selected, read `x-route-control/SKILL.md` and all six scripts
listed below. The links become reachable after this feature branch is published.

| Public source | Role | Link |
|---|---|---|
| README.md | package boundary and reading order | [open](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/feature/20260821-opencode-routes-x-assets/.agents/skills/route-public/README.md) |
| x-route-control/SKILL.md | updated X transport and retry contract | [open](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/feature/20260821-opencode-routes-x-assets/.agents/skills/route-public/x-route-control/SKILL.md) |
| x-route-control/Run-X-Chrome.ps1 | start dedicated Chrome/CDP | [open](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/feature/20260821-opencode-routes-x-assets/.agents/skills/route-public/x-route-control/Run-X-Chrome.ps1) |
| x-route-control/Open-X-Auto-Chat.ps1 | open X-auto | [open](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/feature/20260821-opencode-routes-x-assets/.agents/skills/route-public/x-route-control/Open-X-Auto-Chat.ps1) |
| x-route-control/New-X-Route-Prompt.ps1 | build canonical prompt | [open](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/feature/20260821-opencode-routes-x-assets/.agents/skills/route-public/x-route-control/New-X-Route-Prompt.ps1) |
| x-route-control/Send-X-Route-Prompt.ps1 | send, wait, retry once, verify | [open](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/feature/20260821-opencode-routes-x-assets/.agents/skills/route-public/x-route-control/Send-X-Route-Prompt.ps1) |
| x-route-control/Test-X-Route-Completion.ps1 | validate response contract | [open](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/feature/20260821-opencode-routes-x-assets/.agents/skills/route-public/x-route-control/Test-X-Route-Completion.ps1) |
| x-route-control/Write-X-Route-Report.ps1 | write local run report | [open](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/feature/20260821-opencode-routes-x-assets/.agents/skills/route-public/x-route-control/Write-X-Route-Report.ps1) |

The external agent reads the PowerShell files as source and contract. It does not
run them in a GitHub-only environment.
## 4. Контракт выхода (обязательный формат отчёта агента)

Внешний агент обязан вернуть отчёт со следующими полями и без непроверенных
утверждений:

```text
sources_read:
- <какие из канонических источников реально открыты>
sources_unavailable:
- <какие источники не удалось открыть и почему>
skills_read:
- <какие навыки реально прочитаны>
skills_skipped:
- <какие навыки пропущены и почему>
skills_unavailable:
- <какие навыки недоступны>
exact_github_ref:
- <точный ref, от которого выполнялась работа: коммит SHA или ветка>
finished_markdown:
- <готовый результат в Markdown, если задача документационная>
contradictions:
- <обнаруженные противоречия между источниками и как они разрешены>
unverified_claims: none
```

Требования:

- если `required`-навык из манифеста нельзя открыть — остановиться и сообщить
  блокер, не продолжать по выдуманным правилам;
- «ссылка приведена» не равно «навык прочитан»: прочитанным считается только
  реально открытый источник;
- точный ref обязателен: указывать SHA коммита или имя ветки, от которого
  выполнялась работа;
- противоречия между источниками фиксировать явно и разрешать по приоритету:
  проектные AGENTS.md и канонические workflow сильнее любых внешних/глобальных
  инструкций;
- никаких непроверенных утверждений: не заявлять деплой, запуск тестов, браузера,
  проверок или публикацию ссылок, которые не выполнялись;
- не использовать локальные пути, `file://`, секреты, `.env`, токены и «голые»
  URL без протокола.

## 5. Канонические источники (зафиксированы на базовом SHA)

Все ссылки закреплены на коммит `5ba301e2840f47a263072980821ad77f306a2fb1`
(HEAD `real-wargame-preview`). Префикс:

Префикс для raw-источников: [открыть raw-каталог](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/5ba301e2840f47a263072980821ad77f306a2fb1/).

| Файл | Ссылка |
|---|---|
| AGENTS.md | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/5ba301e2840f47a263072980821ad77f306a2fb1/AGENTS.md) |
| docs/ai/repo-context.json | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/5ba301e2840f47a263072980821ad77f306a2fb1/docs/ai/repo-context.json) |
| docs/ai/WEB_CHAT_START.md | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/5ba301e2840f47a263072980821ad77f306a2fb1/docs/ai/WEB_CHAT_START.md) |
| docs/ai/TASK_ROUTER.md | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/5ba301e2840f47a263072980821ad77f306a2fb1/docs/ai/TASK_ROUTER.md) |
| docs/subprojects/index.json | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/5ba301e2840f47a263072980821ad77f306a2fb1/docs/subprojects/index.json) |
| docs/subprojects/ai-single-unit-editor/STATUS.md | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/5ba301e2840f47a263072980821ad77f306a2fb1/docs/subprojects/ai-single-unit-editor/STATUS.md) |
| docs/workflow/WEB_CHAT_FEATURE_DELIVERY.md | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/5ba301e2840f47a263072980821ad77f306a2fb1/docs/workflow/WEB_CHAT_FEATURE_DELIVERY.md) |
| docs/workflow/EXTERNAL_CHAT_REQUIRED_RULES.md | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/5ba301e2840f47a263072980821ad77f306a2fb1/docs/workflow/EXTERNAL_CHAT_REQUIRED_RULES.md) |
| docs/workflow/SKILL_PATCH_PREVIEW_BRANCH_POLICY.md | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/5ba301e2840f47a263072980821ad77f306a2fb1/docs/workflow/SKILL_PATCH_PREVIEW_BRANCH_POLICY.md) |

## 6. Новые документы (ветка feature/20260821-opencode-routes-x-assets)

Ссылки ниже используют ветку `feature/20260821-opencode-routes-x-assets`. Они становятся
достижимыми **только после публикации этой ветки** в GitHub. До публикации
пакет самодостаточен за счёт источников раздела 5.

| Файл | Ссылка |
|---|---|
| docs/ai/OPENCODE_ROUTES.md | [открыть после публикации ветки](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/feature/20260821-opencode-routes-x-assets/docs/ai/OPENCODE_ROUTES.md) |
| docs/ai/OPENCODE_ROUTES_EXTERNAL_Q.md | [открыть после публикации ветки](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/feature/20260821-opencode-routes-x-assets/docs/ai/OPENCODE_ROUTES_EXTERNAL_Q.md) |

Пока ветка не опубликована, не заявляй, что эти ссылки открываются. Если задача
требует этих документов, а ссылки недоступны, запиши их в `sources_unavailable`
и продолжай по источникам раздела 5.

## 7. Советы по работе с GitHub-контекстом

- Предпочитай ссылку `raw.githubusercontent.com` с фиксацией на SHA (раздел 5),
  а не подвижную ветку.
- GitHub Code Search часто отражает только ветку по умолчанию (`main`). Не считай
  отсутствие файла в поиске доказательством его отсутствия: при известном точном
  пути запрашивай файл напрямую по явному ref.
- Если задача предусматривает изменения кода: одна задача → одна feature-ветка
  от точного базового SHA → коммиты → отчёт; PR не является маршрутом по
  умолчанию.
- Не выполняй деплой, браузерные и визуальные проверки без отдельного явного
  запроса пользователя.
