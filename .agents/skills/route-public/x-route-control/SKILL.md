---
name: x-route-control
description: Use when the user explicitly invokes `/X` or asks for a strong external web/chat GitHub route that must run in the user's visible Chrome session, return branch/PR delivery, and finish with a terminal block instead of a ZIP.
---

# X Route Control

## Overview

`/X` is a temporary explicit launcher for this route:

```text
strong external web/chat reasoning + direct GitHub branch/PR delivery
```

`/X` is not a generic web mode.
It is one specific, tested runtime pattern.

The route is complete when the response, confirmed GitHub facts (via the single
OpenCode-mediated verification pass), and the terminal block (if present)
together establish what actually happened. The terminal block is the preferred
handoff summary, not a hard success gate.

Completion must not fail due solely to a formatting defect, automatic UI text
after the END marker, or other protocol formality when substantive evidence
already confirms the result.

## Локальная политика доставки

Этот раздел имеет приоритет над устаревшими общими описаниями веток, PR и
OpenCode-проверки ниже. Для локальных скриптов доступны только два явно
заданных режима: `report_only` и `product_change`; X-чат не выбирает режим
самостоятельно. Проверка завершённого отчёта выполняется видимым Chrome через
CDP, без Computer Use и без OpenCode.

## Semantic position

Route X is the automatic counterpart of manual Q-mode.

Manual Q means the user controls the GitHub-aware external request.
Route X means Codex automates that GitHub-aware branch/PR workflow through the approved browser route.

Route X is not R and not Route W:

- R/manual `/zworker` returns ZIP and is user-controlled.
- Route W returns ZIP and is Codex-automated.
- Q returns branch + PR and is user-controlled.
- Route X returns branch + PR and is Codex-automated.
- R-init (Route X preview integration) использует Route X как транспортный/доставочный слой.
  R-init-control владеет контрактом рабочего процесса (preview-ветка, чеклист, GO/NO-GO, merge-handoff).
  Route X отвечает только за доставку: ветка + PR + терминальный маркер + верификация.
  R-init не переопределяет правила Route X и не дублирует транспортную логику.

## Route D precedence for skill tasks

Route X is not the first route for skill-authoring or skill-editing tasks.

If the task creates, changes, reviews, or designs any skill, `SKILL.md`, route skill, routing contract, prompt contract, stop condition, verification rule, or recovery rule, Codex MUST apply Route D first.

After the D contract is satisfied, Route X may be used as the GitHub PR delivery route when all normal X preconditions are met.

Do not treat skill changes as ordinary tiny Route A edits or ordinary non-simple Route X work before applying Route D.

## Default use in collaborative repositories

If the repository is marked as collaborative GitHub development (per the source-of-truth defined in the dispatcher skill `opencode-mcp-windows-control`), Route X is the default route for non-simple work.

Use Route A for simple/fast tasks.

Use Route D first for all skill-authoring and skill-editing tasks.

Use Route X for work that is medium, complex, architectural, multi-file, design-heavy, review-heavy, or otherwise not a tiny Route A task, when the expected result should be a direct push to preview (or PR fallback).

Use Route W only if Route X is unavailable, inappropriate, or the expected result is a ZIP.

Use Route C only for bounded local hard implementation/repair when required state is local-only or not visible to the external GitHub-aware executor.

### Preview-flow base branch default

For the `Real-wargame` collaborative project, any X or Q delivery must target `real-wargame-preview` as the default branch, not `main`. The permanent preview branch is `real-wargame-preview`. Targeting `main` is allowed only when explicit user GO to main is present in the task context.

Instruct external executors to push/commit directly to `real-wargame-preview` (preferred) or open PRs against `real-wargame-preview` (fallback), unless the task explicitly says MAIN_GO has been given by the user.

## When to Use

Use `/X` only when all are true:

- the user explicitly invoked `/X` or clearly asked for this route;
- strong external reasoning is useful;
- the executor can work directly in GitHub;
- the result should be a branch + PR + text/markdown report, not a ZIP;
- the required repository context is already published or can be safely published.

If the user explicitly invoked `/X`, do not reject the route only because the
task looks small, read-only, or "better suited for Route A".
Reject `/X` only for real blockers, not for taste.

Do not use `/X` when:

- the task depends on unpublished local-only state;
- the task includes secrets or `.env`;
- the task is tiny enough for Route A;
- the user asked for manual `/zworker`;
- the task naturally needs ZIP artifacts.

## Core Contract

`/X` must preserve all of these:

- one task -> one result in `real-wargame-preview` (direct push or PR);
- no direct `main` writes;
- no merge without human permission;
- no auto-merge;
- truth order: PR diff/changed files/commits first, report second;
- completion determined by substantive evidence (response + GitHub facts + verification), with the terminal block as preferred handoff summary;
- one separate OpenCode-mediated GitHub verification after completion.

Before any GitHub read/write inside `/X`, Codex MUST read
`opencode-github-mcp-control`.

If the user did not explicitly request unpublished local state, `/X` defaults
to the published GitHub repository state.

In that fast path, Route A reconnaissance stays minimal:

- confirm repository target;
- confirm published GitHub context is sufficient;
- note local dirty state only as a scope warning.

## Browser Runtime

This is the most important rule.

### Неподменяемый транспорт X

Для X на этой рабочей станции правильным браузером является только отдельный
видимый Chrome-профиль `chrome-zworker-plus-next`, запущенный с CDP на порту
`9223`. Правильный запуск начинается именно локальными скриптами навыка, а не
выбором браузера в интерфейсе Codex или ChatGPT:

```text
Run-X-Chrome.ps1
→ Open-X-Auto-Chat.ps1
→ Send-X-Route-Prompt.ps1
```

Встроенный браузер Codex/ChatGPT полностью запрещён для X. Нельзя использовать
`browser-client.mjs`, `node_repl`, `agent.browsers`, встроенные вкладки,
`playwright.browser_tabs` или управление через расширение Chrome. Это не
требует удалять или отключать расширения: маршрут просто не использует их.
Если штатный скрипт временно не получил CDP, сначала дождись его штатного
ожидания и повтори проверку того же `9223` через тот же скрипт. Не выбирай
другой браузер и не запускай неизвестный профиль. Только после исчерпания
этой проверки можно завершить X с точной причиной недоступности транспорта.

Уже открытый встроенный браузер не считается X-сессией и не должен получать
промпт. Диагностическое чтение разрешено только в видимом выделенном Chrome;
оно не превращает другой браузер в рабочий транспорт.

### Локальные скрипты запуска и проекта `X-auto`

Локальные скрипты являются обязательной точкой запуска X на этой рабочей
станции. Они не входят в репозиторий Real-Wargame и не создают GitHub-доставку,
но именно они обеспечивают правильный транспорт Route X.

```text
.agents/skills/route-public/x-route-control\Run-X-Chrome.ps1
.agents/skills/route-public/x-route-control\Open-X-Auto-Chat.ps1
.agents/skills/route-public/x-route-control\New-X-Route-Prompt.ps1
.agents/skills/route-public/x-route-control\Send-X-Route-Prompt.ps1
.agents/skills/route-public/x-route-control\Test-X-Route-Completion.ps1
.agents/skills/route-public/x-route-control\Write-X-Route-Report.ps1
```

Обычный старт:

1. Запусти `Run-X-Chrome.ps1` и дождись `X_ROUTE_CHROME_READY` либо
   `X_ROUTE_CHROME_STARTED`.
2. Один раз вручную создай или подтверди в видимом ChatGPT проект с точным
   именем `X-auto`. Не автоматизируй вход, CAPTCHA, создание проекта или
   переключение аккаунта.
3. Запусти `Open-X-Auto-Chat.ps1`. Он подключается только к CDP на `9223`,
   при отсутствии вкладки ChatGPT создаёт одну видимую вкладку в том же
   Chrome, выбирает видимый `X-auto` и подтверждает пустое рабочее поле на
   странице проекта. Каждый X-запрос создаёт новый отдельный чат именно в
   этом проекте; продолжать прежний чат запрещено. Скрипт сам текст в чат не
   отправляет.
4. Для отправки применяй `Send-X-Route-Prompt.ps1` с краткой формулировкой
   задачи и обязательным `TaskType`. Для этого навыка по умолчанию выбран
   `AndrewVerhoturov1/Real-wargame`, а новый request id создаётся автоматически;
   их можно переопределить явно. Дополнительные инструкции необязательны:
   если `TaskInstructions` не переданы, скрипт использует краткую формулировку
   как полное описание задачи. Скрипт сам
   вызывает `New-X-Route-Prompt.ps1`: произвольный готовый текст промпта он
   не принимает. Обязательный параметр `-TaskType` принимает только
   `report_only` или `product_change`; генератор закрепляет контракт отчёта,
   двух пользовательских блоков и короткого завершающего маркера.
   Поле на главной странице называется «Новый чат в X-auto»: отправка текста
   в него сама создаёт новый диалог внутри проекта. Скрипт отказывается от
   общего поля ChatGPT и принимает только это проектное поле. Он работает
   через нативные CDP-команды `Input.insertText` и
   `Input.dispatchMouseEvent`, а не через изменение DOM. Он подтверждает
   введённый текст и активную видимую кнопку отправки, нажимает её ровно один
   раз, ждёт маркер только в последнем ответе, проверяет обязательные поля
   через `Test-X-Route-Completion.ps1` и создаёт локальный технический журнал.
   При неопределённой отправке повтор того же промпта запрещён. Допустим
   только `-ResumeExistingDraft`: этот режим проверяет совпадение уже
   введённого черновика с исходным текстом и делает единственное нажатие
   отправки, не вставляя текст повторно. Если это нажатие по координатам
   уже подтверждённо не сработало, допустим ровно один
   `-UseDomClickFallback` для той же найденной кнопки; после него повторов
   нет.

После переходов между этими этапами скрипты делают короткую паузу на отрисовку:
после готовности CDP, после открытия страницы проекта и после появления
завершающего маркера перед поиском ссылки. Это нужно, чтобы ChatGPT успел
вставить видимую ссылку в HTML. Пауза не считается новой попыткой, не нажимает
кнопки повторно и не заменяет проверку точного адреса, SHA и заголовка отчёта.

`Open-X-Auto-Chat.ps1` использует встроенный .NET WebSocket для прямого CDP:
новые зависимости, Playwright и доступ к cookies, паролям, токенам или
хранилищу профиля запрещены.

Computer Use не является транспортом Route X. Его можно применять только
после неуспеха прямого CDP, лишь для чтения видимой ситуации в уже запущенном
выделенном Chrome и ручной диагностики. Нельзя открывать или использовать им
встроенный браузер. Запрещены массовые клики, ввод учётных данных, чтение
секретов, работа с cookies и замена CDP-транспорта Computer Use-автоматизацией.

### Два режима отчётов X-маршрута

Для каждого содержательного X-запуска внешний ассистент обязан создать
пользовательский полный отчёт:

```text
docs/reports/x-route/XROUTE-<request-id>.md
```

Для `report_only` разрешён только этот Markdown-файл в постоянной ветке
`x-route-reports`; продуктовые файлы, временные ветки и PR запрещены.
Отправитель удерживает локальную блокировку, поэтому два таких запуска не
идут одновременно. Для `product_change` отчёт создаётся в единственной
`feature/YYYYMMDD-...`-ветке, начатой от `real-wargame-preview`, вместе с
продуктовым изменением и одним PR в preview. В итоговом чате X обязан дать
постоянную GitHub-ссылку вида
`blob/<report_commit_sha>/docs/reports/x-route/XROUTE-<id>.md`. Этот файл, а
не локальный журнал, является полным пользовательским ответом.

Для `report_only` внешний ассистент обязан выполнять разрешённые действия в
прямом порядке: проверить доступ к репозиторию, получить или один раз создать
`x-route-reports`, создать единственный файл отчёта, сделать один коммит,
получить его SHA и только после этого вернуть ссылку. Отсутствие SHA до
коммита — ожидаемое состояние, а не основание для `blocked`. Блокировка
разрешена только при фактической невозможности одного из этих шагов (нет
доступа, недоступен инструмент либо дальнейшее действие нарушило бы явное
ограничение); в отчёте должен быть назван начатый шаг и реальная причина.

Для `product_change` X также обязан выполнить, а не только описать, GitHub-
операции через доступный в чате инструмент: прочитать репозиторий и актуальную
`real-wargame-preview`, создать feature-ветку, внести разрешённую правку,
сделать коммит продуктовой части, открыть один PR, затем добавить отчёт
финальным коммитом в ту же ветку. Так отчёт содержит фактический URL PR, а PR
обновляется последним коммитом. Сам текст задания является разрешением на эти
шаги в указанных границах. Отсутствие готового SHA до коммита не является
блокировкой в любом из двух режимов. `blocked` допустим только после
фактической попытки операции и реальной ошибки доступа, недоступности
инструмента или конфликта с явным ограничением.

`Write-X-Route-Report.ps1` сохраняет отдельный локальный технический журнал
CDP-транспорта по адресу:

```text
local-run-reports/XROUTE-<request-id>.md
```

Локальный журнал нужен только для диагностики транспорта. Он не подменяет
GitHub-отчёт и не является основной ссылкой в пользовательском результате.
Если выполнение остановилось до GitHub-доставки, сохрани локальный журнал со
статусом `blocked`, но не выдумывай GitHub-отчёт или постоянную ссылку.

### Канонический промпт и структура GitHub-отчёта

Перед каждой содержательной отправкой вызывай
`New-X-Route-Prompt.ps1` через `Send-X-Route-Prompt.ps1`. Для обычного вызова
достаточны краткое описание задачи и явный `-TaskType`: отправитель подставит
стандартный репозиторий и новый request id. Опубликованный контекст и манифест
навыков передавай отдельными полями, когда они действительно нужны; не
подставляй секреты и локальные пути.

Канонический промпт всегда начинается с отдельной строки `@GitHub`, а сразу
после неё содержит видимое текстовое правило: приложение и инструменты GitHub
уже подключены к чату и обязательны для этой задачи. Это не декоративная
пометка. Первым фактическим действием X обязан вызвать доступный GitHub-
инструмент, прочитать репозиторий и состояние точной ветки, и только потом
переходить к объяснению, плану или изменению файлов. Отсутствие ранее
полученных SHA, ветки, PR или отчёта не является основанием для `blocked`.
Запрет действует одинаково для `report_only` и `product_change`.

Если внешний X возвращает `status: blocked`, в кратком объяснении он обязан
указать фактический ответ GitHub-инструмента: например код ошибки, отказ в
доступе, недоступность инструмента или отсутствие репозитория. Формулировки
«я не пробовал», «не получил подтверждение» и «инструмент не вызывался» не
считаются блокировкой. Локальный проверяющий скрипт отклоняет такой маркер как
неподтверждённый и записывает `partial`; повторная отправка запрещена.

Единственное исключение — когда сама модель явно установила, что операция
записи была остановлена системой безопасности OpenAI до выполнения записи.
Тогда перед трёхстрочным маркером `blocked` модель добавляет невидимый сигнал:

```html
<!-- X_ROUTE_RETRY: safety_write_block -->
```

Скрипт не определяет причину самостоятельно: он только распознаёт этот точный
сигнал модели. После него скрипт освобождает текущий транспорт, ждёт ровно
10 секунд, создаёт новый request id, открывает новый отдельный чат в `X-auto`
и выполняет ровно одну повторную попытку. В новую попытку передаётся указание
сначала проверить, что предыдущая попытка не оставила частичных изменений.
Обычный `blocked` без этого сигнала повторно не запускается. После одной
повторной попытки дальнейшие повторы запрещены.

`TaskInstructions` желательно содержат только суть задачи. Старые request id,
пути отчёта, ссылки, итоговые заголовки и строки `BEGIN/END/status` больше не
останавливают отправку: скрипт выводит предупреждение, исключает вложенный
старый договор и оставляет только краткую суть плюс канонический шаблон. Это
не меняет содержание самой задачи. Канонический шаблон имеет приоритет над
ручным форматом. При реальной блокировке X перед коротким
маркером `blocked` выводит один блок «Кратко для пользователя» с понятной
фактической причиной и начатым шагом; отчёт и ссылку при этом не выдумывает.

Созданный внешний Markdown-отчёт обязан иметь разделы:

```text
# Отчёт X-маршрута: XROUTE-<id>
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

В разделе доставки укажи фактическую ветку, способ доставки, Pull Request при
наличии и SHA всех коммитов, кроме SHA самого коммита отчёта: самоссылка в
содержимом коммита невозможна. В последнем разделе прямо зафиксируй, что
списки файлов получены из фактических итоговых изменений Git. Списки
созданных, изменённых и удалённых файлов отражают только финальный diff ветки
относительно базы PR. Временный файл, созданный и удалённый до итогового
состояния, опиши в полном подробном ответе, но не в этих списках. Не дублируй
этот отчёт полностью в чате.

### Canonical authenticated session and transport

Route X MUST treat this pair as the single source of truth for the browser
session. Do not infer, search for, or substitute any other profile, browser,
port, cookie database, or "authentication file":

```text
CDP endpoint: http://127.0.0.1:9223
authenticated Chrome profile: <TEMP>\chrome-zworker-plus-next
```

The profile directory above is the authorization container. It is expected to
be already authenticated before every ordinary Route X run. The executor MUST
use direct CDP attach to that profile as the primary and authoritative browser
transport, even if a Browser/Chrome extension is missing or unavailable.

Do not ask the user to log in, to select an account, or to provide credentials
as part of normal startup. Do not inspect, copy, modify, or name individual
session files such as `Cookies`; the profile directory and its normal Chrome
session are the only permitted authorization source.

If ChatGPT unexpectedly shows a login page, treat this as
`X_ROUTE_SESSION_EXPIRED_OR_REVOKED`: stop the run and report that the saved
profile session is no longer usable. Do not automate passwords, 2FA, CAPTCHA,
or account switching, and do not make an ordinary run ask for authorization.

`/X` must use the same stable browser pattern as Route W:

- known dedicated Plus profile
- Chrome headful
- CDP attach
- ChatGPT Web in a visible window

Allowed runtime:

```text
known Plus profile -> Chrome headful with CDP -> attach -> new page in that same Chrome
```

Allowed properties:

- Google Chrome
- headful mode
- visible browser window
- existing or intentionally started Chrome with CDP
- dedicated new page in that attached browser context
- ChatGPT Web

Preferred local profile on this machine:

- `<TEMP>\chrome-zworker-plus-next`

The exact launch form, when Chrome is not already reachable on CDP, is:

```text
--remote-debugging-port=9223
--user-data-dir=<TEMP>\chrome-zworker-plus-next
https://chatgpt.com/
```

These arguments are mandatory. A model MUST NOT replace them with a default
profile, another `--user-data-dir`, another port, or a direct cookie-file path.

Forbidden runtime paths:

- `browser-client.mjs`, `node_repl`, `agent.browsers`, Codex/ChatGPT in-app browser
- Chrome control extension as the X transport
- `playwright.browser_tabs`
- in-app hidden browser tabs as the primary `/X` transport
- spawning a separate unseen automation browser
- launching an unknown Chrome profile just because CDP is absent
- switching to a different browser family
- password automation
- 2FA automation
- CAPTCHA automation

Reason:

- Route W already has a stable Plus-profile flow on this machine;
- a failed `/X` regression launched the wrong authenticated Chrome session;
- `/X` must reuse the proven Plus-profile pattern rather than drift into
  arbitrary Chrome sessions.

If CDP is unavailable, `/X` may self-launch Chrome only with the known Plus
profile above.
The launch must be performed by `Run-X-Chrome.ps1`; do not replace it with an
in-app browser, an extension, `browser-client.mjs`, or an arbitrary browser
launcher. After a transient failure, repeat the same script/probe once and
wait for its `X_ROUTE_CHROME_READY` or `X_ROUTE_CHROME_STARTED` result.
Do not silently fall back to `playwright.browser_tabs`.
Do not self-launch an unknown or default Chrome profile.

## Preflight

Use this exact browser preflight order:

1. probe only `http://127.0.0.1:9223/json/version`
2. if CDP is alive, attach and inspect that session
3. if CDP is offline, launch Chrome headful with:
   - `--remote-debugging-port=9223`
   - `--user-data-dir=<TEMP>\chrome-zworker-plus-next`
   - `https://chatgpt.com/`
4. attach to that Chrome session
5. open one dedicated new page in the attached context
6. navigate to `https://chatgpt.com/`
7. confirm one of these states:
   - composer ready
   - logged-out/login required
   - anti-bot/challenge
   - wrong account / not-Plus session

Stop conditions:

- if login is required -> stop with `X_ROUTE_SESSION_EXPIRED_OR_REVOKED`; do not ask for authorization during the normal route
- if Cloudflare or anti-bot challenge is visible -> stop and ask the user to
  clear it manually in that same visible Chrome window
- if the session is not the intended Plus-capable session -> stop and report
  wrong-profile/wrong-account blocker
- if CDP attach fails after the prescribed same-script retry -> stop and report
  `/X` blocked; do not switch browser transports

Plus/session indicators should include signals such as:

- `ChatGPT Plus`
- `Plus`
- `High`
- another clear Plus/paid model-picker state already known to this workstation

Challenge/login indicators include strings such as:

- `One moment`
- a localized equivalent of `One moment`
- `verify you are human`
- `challenge`
- `log in`
- `sign up`

Do not continue to prompt submission when those indicators are present.

Port policy:

- default port is `9223`
- do not scan random alternative ports unless the user explicitly told Codex to
  use a different port

## Canonical Flow

`/X` should stay short and deterministic.

Default sequence:

1. выбрать обязательный тип задачи: `report_only` или `product_change`
2. one CDP probe on `9223`
3. attach or self-launch the known Plus profile
4. verify composer-ready and Plus-capable session
5. открыть новый пустой чат `X-auto` и submit one `/X` prompt with one request id
6. wait for the terminal block in the last assistant message
7. открыть единственную видимую ссылку отчёта в отдельной вкладке Chrome и проверить её адрес и заголовок
8. report the result

Do not add exploratory browser steps when this flow is sufficient.

### Как X-маршрут работает сейчас

1. Codex явно выбирает `report_only` для ответа без продуктовых правок либо
   `product_change` для работы с продуктом; X-чат не выбирает тип сам.
2. `Run-X-Chrome.ps1` проверяет CDP `9223`; если он недоступен, запускает
   только закреплённый видимый Chrome-профиль и ждёт CDP. Второй Chrome не
   запускается при уже доступном CDP.
3. Для запуска в проекте ChatGPT Codex вызывает `Open-X-Auto-Chat.ps1`.
   Проект `X-auto` должен уже существовать: скрипт находит его в видимом UI,
   открывает и подтверждает пустой чат внутри проекта. Каждый X-запрос
   создаёт в нём отдельный диалог.
4. Прямой CDP подтверждает видимую сессию: не страница входа, не challenge,
   доступно поле чата и виден признак Plus/платного режима. При блокере запуск
   прекращается без учётных данных.
5. Codex отправляет ровно один X-запрос с новым request id и ждёт уникальный
   завершающий блок в последнем ответе ассистента.
6. После содержательного результата CDP сначала ждёт, пока последний ответ
   стабилизируется и в его видимой разметке появится настоящий `href` ссылки.
   Затем открывает одну ссылку полного отчёта в отдельной вкладке Chrome и
   проверяет её неизменяемый адрес и заголовок. Локальный статус `success`
   запрещён, пока CDP не подтвердил точный адрес, заголовок, закрытие именно
   созданной проверочной вкладки и возврат на X-auto. Computer Use и OpenCode
   не используются.
7. Для содержательной GitHub-доставки X создаёт полный отчёт в
   `docs/reports/x-route/XROUTE-<request-id>.md` и даёт постоянную ссылку на
   него в GitHub. Codex сохраняет `runs/XROUTE-<request-id>.md` только как
   локальный журнал транспорта, не как пользовательский результат.

Границы безопасности: не читать cookies, пароли, токены и локальное
хранилище; не делать прямых GitHub-действий со стороны Codex; не сливать PR,
не включать auto-merge и не деплоить без отдельного запроса пользователя.

Unnecessary steps include:

- rejecting explicit `/X` just because the task is overview-only;
- `opencode_session_summarize` preflight for ordinary `/X` startup;
- stacked `opencode_context` + `opencode_vcs_info` + `opencode_mcp_status` +
  `opencode_setup` before one simple reconnaissance answer would suffice;
- extra tab-listing before attach when CDP is already the chosen path;
- probing many random CDP ports without explicit reason;
- page-wide marker searches;
- ad hoc retries with new browser transports;
- a second GitHub verification pass that only repeats the first one.

## Pre-X GitHub state gate

Route X must start from GitHub-visible repository state.

Before submitting the X prompt, Codex must decide whether the external executor has enough current GitHub context to do the task safely.

Allowed fast path:

- the required files and rules are already present in GitHub;
- no unpublished local-only changes are required;
- the prompt can point the executor to repository paths, branches, PRs, or raw URLs that exist on GitHub.

If required context exists only locally, or local state is newer than GitHub, do not silently start Route X.

Do not create a separate `zworker-context` branch for Route X by default, because Route X itself must preserve one task -> one result in `real-wargame-preview` (direct push or PR fallback).

Legal choices are:

1. stop and report Route X blocked by unpublished context;
2. use Route A or Route C locally instead;
3. switch to Route W/manual `/zworker` if a published raw-link ZIP workflow is the intended result;
4. with explicit user permission, prepare the one intended task branch through OpenCode-mediated GitHub/local workflow and instruct the X executor to continue that same branch/PR.

The final Route X verification must confirm that the task still has exactly one result delivery (direct push to `real-wargame-preview` or one PR).

## Required Skills Manifest (X)

Before submitting the X prompt, Codex MUST build a `Required Skills Manifest`
and include it in the prompt for every skill that may be needed for the task.

Each manifest entry MUST contain:

- exact skill name;
- externally readable `SKILL.md` URL, preferably a raw GitHub URL pinned to a
  commit (branch URL only when no commit URL exists);
- why the skill may be needed;
- status: `required` or `conditional`;
- reading order when one skill depends on another.

The X executor works through GitHub. Codex MUST give it only externally
accessible safe links and MUST NOT publish secrets, `.env` files, private local
paths, or non-public skill contents in the manifest or elsewhere in the prompt.

The X prompt MUST require the executor to:

- open and read every `required` skill before starting the task;
- read each `conditional` skill only when its condition becomes true;
- report `skills_read`, `skills_skipped`, and `skills_unavailable` in the
  final report and in the terminal block;
- stop and report a blocker when a required skill cannot be opened;
- not silently invent or apply rules from skills that are not listed in the
  manifest.

If a relevant skill is local-only, publish a safe externally readable copy
through the approved GitHub/context-sync route, or include only its non-secret
rules directly in the prompt and mark the URL unavailable.

This manifest does not alter the Route X contract: one task -> one delivery
(branch + PR or direct preview push), the separate OpenCode-mediated GitHub
verification, and the terminal completion marker still apply.

## Prompt Submission

Use one canonical submission order.

Preferred locator order:

1. `div.ProseMirror[contenteditable="true"]`
2. `textarea`
3. visible generic `[contenteditable="true"]`

Rules:

- use the first visible locator from that ordered list;
- submit the prompt once;
- if submission clearly fails, do one fixed fallback attempt using the next
  locator in the same ordered list;
- if that also fails, stop and diagnose composer state instead of inventing
  more retries in the same run.

## Completion Contract

The external assistant may write its main report as normal text or markdown.
That prose is not the machine completion signal.

The machine completion signal is the terminal block at the very end of the
final assistant message.

Use a unique request id such as `XROUTE-YYYYMMDD-001` or `XROUTE-YYYYMMDD-HHMM-short-topic`.

Required success form:

```text
BEGIN XROUTE-<request-id>
status: success
END XROUTE-<request-id>
```

В успешном маркере разрешены только три приведённые строки. Адрес отчёта,
ветка, SHA, PR, проверки и перечни файлов находятся только в полном отчёте.
`Test-X-Route-Completion.ps1` проверяет эту форму до признания локальной
отправки завершённой.

Required blocked form:

```text
BEGIN XROUTE-<request-id>
status: blocked
END XROUTE-<request-id>
```

### Substantive-evidence completion rule

The terminal block is the preferred machine-completion summary, not a strict
gate. Route X completion is determined by the totality of substantive evidence:

- the assistant response content (what was done);
- GitHub-verified facts (branch, PR, commits, changed files);
- the terminal block, when present and well-formed.

If the response, confirmed GitHub facts, and the single verification pass
together establish what happened, the route MUST be treated as complete
regardless of any formatting defect in the terminal block, automatic ChatGPT
UI text after the END marker, or other protocol formality.

A real blocker requires missing or contradictory substantive evidence,
ambiguous identity (wrong request id, unknown repository), or unconfirmed
GitHub delivery. Protocol form alone is never a real blocker.

The prompt must also require:

- do not print the terminal block before the work is actually complete;
- prefer not to print anything after the end marker;
- do not claim local checks that were not actually run;
- do not write directly to `main`;
- do not merge the PR;
- do not enable auto-merge.

## Route X completion marker validation

The terminal block is validated for substantive evidence, not protocol form.

The completion marker is read for its identity and claimed facts. The marker is
assessed as usable (good enough to proceed) when:

- `BEGIN XROUTE-<id>` and `END XROUTE-<id>` can be identified (they need not be
  exact or unique on the page);
- the request id matches or is close enough to resolve to this run;
- `status` is `success` or `blocked`.

For `status: success`, the marker is usable when at least core identity fields
(repository, branch, and either pr_url or commit_sha) are present and
unambiguous. `changed_files` is strongly preferred but its absence is a
warning, not a blocker — the verification pass enumerates the actual files.

For `status: blocked`, the marker is usable when at least `reason` is present.

A marker that cannot be identified at all (no BEGIN or END, no recognisable
request id, no status line) is treated as:

```text
ROUTE_X_PROTOCOL_UNKNOWN
```

Protocol-level defects that do NOT make the marker unusable include, but are not
limited to:

- automatic ChatGPT UI text appearing after the `END XROUTE-<id>` line;
- minor list-format deviations;
- extra whitespace or line breaks inside the marker;
- a missing or incomplete `changed_files` list;
- the marker appearing in a non-last assistant message when the last message
  still contains the actual substantive result;
- the marker appearing in the middle rather than at the very end of the message
  when the content after it is clearly a continuation of the report.

### Processing rules

When a usable success marker is detected:

- proceed to the single OpenCode-mediated GitHub verification pass;
- the verification pass is the authoritative completion check, not the marker;
- report any marker warning alongside the verification result.

When a usable blocked marker is detected:

- report the blocker as-is;
- do not proceed as if the route completed.

When the marker is unusable (`ROUTE_X_PROTOCOL_UNKNOWN`):

- do not yet declare failure;
- check whether the response content plus verified PR facts already establish
  what happened (for deliveries, check GitHub directly; for read-only, check
  response content and available PR facts);
- if the substantive result is clear, treat the route as complete and report the
  marker issue as a warning only;
- if the substantive result is unclear even after a GitHub check, report the
  ambiguous state and ask the user for guidance.

Do not send a repair prompt solely to fix a formatting defect. Do not repeat
work just to produce a cleaner marker.

## Wait Rule

Never detect completion by scanning the whole page.

Wait only for the terminal block inside the last assistant message.

Rules:

- generate a fresh request id for each run;
- watch the last assistant message only;
- proceed only after `END XROUTE-<request-id>` appears there;
- use one canonical bounded waiter;
- wrap long polling safely;
- do not rewrite the waiter ad hoc unless the waiter itself is proven broken.

## Verification Rule

The verification pass is the authoritative completion check.
The terminal block alone is not enough; GitHub facts are the ground truth.

After a usable success marker or clear substantive evidence appears, Codex must
run one separate OpenCode-mediated GitHub verification pass.

Default policy:

- run exactly one bounded `verify_pack`;
- require that pass to return the route-proof fields and the PR facts;
- do not run a second "details" verification unless the first one is missing a
  required field or returned unclear evidence.

Verification must confirm:

- the changes exist in the target branch (`real-wargame-preview`);
- the branch is not `main`;
- changed files match the allowed scope;
- the diff exists and matches the report at a high level;
- if PR was used: the PR is still open, merge did not happen, auto-merge is not enabled when available;
- if direct push was used: the commit SHA matches and changes are visible.

For preview-flow tasks targeting the `Real-wargame` project, the target branch
must be `real-wargame-preview`. If the target is `main`, treat it as a
preview-policy violation (fail/warning) unless the task explicitly documents
that user MAIN_GO has been given.

Truth order:

1. PR diff / changed files / commits
2. PR metadata
3. assistant report text

If report and diff disagree, trust GitHub and treat the report as wrong.

## Route X verification prompt template

After a usable success completion marker or clear substantive evidence, Codex MUST run exactly one OpenCode-mediated GitHub `verify_pack`.

Use this shape:

```text
MODE: verify_pack

GOAL:
Verify Route X GitHub delivery for request <request_id>.

SCOPE:
Repository: <owner/repo>
Reported branch: <branch>
Reported PR: <pr_url> (or commit_sha if direct push)
Reported changed files: <changed_files_from_marker>
Reported report path: <report_path>
Reported report URL: <report_url>

MUST DO:
- Use only OpenCode-mediated GitHub MCP access.
- Do not use direct Codex-side GitHub tools.
- Do not use local `gh`.
- If PR was used: confirm the PR exists, is open, source branch is not `main`, targets expected base branch, no merge and no auto-merge.
- If direct push was used: confirm the commit SHA exists in `real-wargame-preview` and changes are present.
- Confirm the target/head branch is not `main`.
- Confirm the changed files are within the allowed scope.
- Confirm the report exists at the reported immutable GitHub URL and belongs to
  the reported delivery.
- Compare the diff/changed files/commits against the assistant report and its
  lists of read, created, modified and deleted files at a high level.
- Report any mismatch between the completion marker/report and GitHub facts.
- For preview-flow tasks (Real-wargame project): if `main` was targeted, treat it as a preview-policy violation and flag it as fail/warning.

MUST NOT:
- Do not merge.
- Do not close the PR.
- Do not comment on the PR unless explicitly asked.
- Do not push commits.
- Do not run local tests.
- Do not inspect local repo state.

OUTPUT:
TASK_STATUS: COMPLETED / PARTIAL / BLOCKED / FAILED
ROUTE_X_VERIFICATION: pass/fail
GitHub route used: OpenCode-mediated yes/no
direct Codex-side GitHub tools used: yes/no
local gh used: yes/no
repository:
branch:
delivery_method: direct_push / pr
commit_sha: <sha> (if direct push)
pr_url: <url> (if PR)
pr_state: (if PR)
base_branch:
merge_status:
auto_merge_status:
changed_files:
report_path:
report_url:
report_exists:
report_audit_matches_diff:
scope_check:
diff_matches_report:
one_delivery_check:
preview_policy_check: <pass / violation — must flag unexpected main base>
not_checked:
risks:
route_violation:
```

If the verification output is missing required route-proof fields, Codex may run one narrow follow-up verification only for the missing fields. Do not repeat a full second verification pass merely "to be sure".

## Local preview sync after verification

For preview-flow tasks targeting the `Real-wargame` project, GitHub verification confirms remote delivery but not local test readiness.

After GitHub verification passes, Codex MUST run a Route A phase to synchronise the local preview folder (`<local-preview-folder>`) from `origin/real-wargame-preview`:

1. `git fetch origin real-wargame-preview`
2. `git reset --hard origin/real-wargame-preview` or `git pull --ff-only`
3. Confirm local HEAD matches the delivered remote commit SHA.

Only after local sync is confirmed may Codex prepare the `.bat` launcher, write the manual checklist, and report the result as ready for local human testing.

Do not skip local sync by claiming the GitHub delivery itself is sufficient for local testing.

## Recovery and retry semantics

If browser preflight fails before prompt submission:

- stop with the exact blocker;
- ask the user to restore the visible Chrome/Plus session when needed;
- retry only after the blocker is fixed.

If prompt submission clearly failed before any message was sent:

- one fixed fallback locator attempt is allowed;
- if that fails, stop and diagnose composer/session state.

If the prompt may have been submitted:

- do not blindly resend the same task;
- do not create a new request id and duplicate the work unless Codex has clear evidence that no prompt was sent.

If the assistant returns `status: blocked`:

- do not run PR verification;
- report the blocker;
- choose a new route only at a normal phase boundary, кроме единственного
  автоматического повтора, явно запрошенного моделью сигналом
  `X_ROUTE_RETRY: safety_write_block` после остановки записи системой
  безопасности OpenAI.

If a success completion marker appears but GitHub verification fails:

- Route X is not complete;
- trust GitHub facts over the assistant report;
- report `ROUTE_X_VERIFICATION: fail`;
- do not merge;
- do not treat the PR as accepted.

If follow-up changes are needed for the same task:

- use the same branch and PR;
- do not create a second PR for the same task;
- if a second PR was created, report a route violation and ask for a decision before proceeding.

### Formatting-only defect recovery

If the only issue is a formatting defect in the terminal block:

- do not send a repair prompt;
- do not repeat the work or create a new ChatGPT thread;
- do not create a new request id;
- proceed directly to the single verification pass;
- report the marker issue as a warning alongside the verification result.

This applies to ALL Route X tasks, including code deliveries. A real blocker
requires missing or contradictory substantive evidence, ambiguous identity, or
unconfirmed GitHub delivery. Protocol form alone is never a real blocker.

## Common Mistakes

- Using `playwright.browser_tabs` because it seems simpler.
  Reality: `/X` then drifts away from the proven visible-Chrome runtime.

- Treating any opened page as success.
  Reality: login/challenge pages are blockers, not readiness.

- Looking for the marker anywhere on the page.
  Reality: the prompt itself may contain the marker text.

- Rejecting a valid result because the marker has a formatting defect.
  Reality: verification pass + GitHub facts are authoritative; the marker is
  preferred form, not a hard gate. Report the defect as a warning and proceed.

- Sending a repair prompt only to fix the terminal block format.
  Reality: this duplicates cost for cosmetic reasons when the same information
  is already in the verification result.

- Running a second GitHub verification "just to be sure".
  Reality: one full `verify_pack` should already be enough.

- Expanding reconnaissance into local-state analysis by default.
  Reality: `/X` should prefer published GitHub state unless the user asked
  otherwise.

- Not flagging an unexpected `main` base branch as a preview-policy violation
  for preview-flow tasks.

## User-Facing Output

Внешний ассистент при успешном `/X` отвечает в чате ровно двумя
пользовательскими блоками:

1. `## Кратко для пользователя` — простое русское объяснение результата,
   пользы и ограничений без англицизмов и технических подробностей.
2. `## Полный отчёт` — одна Markdown-ссылка на
   `docs/reports/x-route/XROUTE-<request-id>.md` в точном коммите GitHub.
Полный технический текст, request id, SHA, PR, проверки и перечни файлов
находятся только в разделе `## Служебные сведения X` GitHub-отчёта. После
двух пользовательских блоков допускается только видимый машинный блок
`BEGIN/END XROUTE` без дополнительного служебного пояснения. Локальная
ссылка из `runs/` может присутствовать лишь во внутренней диагностике Codex,
но не заменяет ссылку для пользователя.

Если ChatGPT отрисовал ссылку без доступного CDP-атрибута `href`, скрипт сначала
ждёт завершения отрисовки последнего ответа, затем открывает единственную
видимую ссылку обычным кликом. Если ChatGPT покажет
видимое окно «Внешний сайт», скрипт подтверждает ровно одну кнопку «Открыть
ссылку», затем ждёт загрузку новой вкладки GitHub и проверяет её точный адрес
и заголовок. После успешной проверки скрипт закрывает только созданную им
вкладку по её CDP-идентификатору и возвращает на передний план X-auto. Если
ссылка не открылась, не подтвердилась или проверочная вкладка не закрылась,
Если внешний X уже вернул `status: success`, но ссылка не дорисовалась или
локальная проверка ответа не завершилась, результат получает локальный статус
`partial`, а не `blocked`; повторной отправки задачи нет. `blocked` означает
только фактическую блокировку внешнего X или остановку до отправки. Если ссылка
открылась, но не подтвердилась или проверочная вкладка не закрылась, вкладка
остаётся открытой для диагностики.

Обычные интервалы ожидания намеренно имеют запас: ответ X ждётся до 30 минут,
страница и поле ввода — до 60 секунд, а проверка ссылки отчёта — до 120
секунд. Верхние границы равны соответственно 60, 2 и 5 минутам. Для появления
окна подтверждения, новой вкладки и загрузки отчёта используется
`ReportLinkTimeoutSeconds`; он по умолчанию равен 120
секундам. Он не сокращает и не заменяет проверку точного адреса, SHA и
заголовка отчёта.

Не объявляй локальный X-запуск полностью подтверждённым, пока есть:

1. два пользовательских блока и корректный трёхстрочный маркер;
2. CDP подтвердил открытие отдельной вкладки с неизменяемой ссылкой отчёта,
   его request id и заголовком, а затем её закрытие и возврат в X-auto.

The terminal block is the preferred handoff summary. If it is present, include
it in the report. If it has a formatting defect, note the defect as a warning
but still present the result as complete when substantive evidence is clear.

For preview-flow tasks (`Real-wargame` project), a third signal is required before declaring local-test readiness:

3. local preview folder synced from `origin/real-wargame-preview` and confirmed matching the delivered commit SHA.
