# Route Q — ручной пакет передачи для внешнего GitHub-only агента

Готовый ручной пакет для маршрута Q: передача задачи внешнему агенту, у которого
есть доступ **только к GitHub** (без локальной файловой системы, без приватных
конфигов и без маршрутных навыков окружения).

Пакет самодостаточен: он работает даже до публикации ветки с новыми документами,
потому что все канонические источники зафиксированы на точном базовом коммите
`073e2266d0de3f6ab88f30e010f6619ebd96aa93` (HEAD `real-wargame-preview`).
Ссылки на новые документы используют ветку `feature/20260821-opencode-routes`
и становятся достижимыми только после публикации этой ветки (см. раздел 6).

## 1. Правила для составителя пакета (этот документ)

- Никаких локальных путей, `file://`, секретов, `.env`, токенов, приватных
  данных и «голых» URL (без протокола). Разрешены только полные абсолютные
  HTTPS-ссылки на GitHub и raw-файлы.
- Никаких ссылок на локальные навыки окружения: они недоступны внешнему агенту
  и помечаются в манифесте как `local-only / unavailable`.
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
- База для работы: точный коммит 073e2266d0de3f6ab88f30e010f6619ebd96aa93.
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
наступлении условия. Для недоступных навыков указано `local-only / unavailable`
(их несекретные правила изложены в канонических документах раздела 5 и в
`docs/ai/OPENCODE_ROUTES.md`).

| Навык | Статус | Зачем может понадобиться | URL |
|---|---|---|---|
| real-wargame-performance | conditional | обязателен для симуляции, ИИ, восприятия, навигации, тактических полей, рендера, воркеров, очередей, кэшей, жизненного цикла, производительности | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/073e2266d0de3f6ab88f30e010f6619ebd96aa93/.agents/skills/real-wargame-performance/SKILL.md) |
| real-wargame-local-preview | conditional | локальный запуск и прямая визуальная проверка через реальный браузер, если доступен прямой браузер | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/073e2266d0de3f6ab88f30e010f6619ebd96aa93/.agents/skills/real-wargame-local-preview/SKILL.md) |
| real-wargame-manual-vercel-deploy | conditional | обязателен при явном запросе деплоя на Vercel / создания или обновления Preview | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/073e2266d0de3f6ab88f30e010f6619ebd96aa93/.agents/skills/real-wargame-manual-vercel-deploy/SKILL.md) |
| vercel-deployment-playwright-e2e | conditional | визуальная проверка существующего Preview через Playwright, если прямого браузера нет | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/073e2266d0de3f6ab88f30e010f6619ebd96aa93/.agents/skills/vercel-deployment-playwright-e2e/SKILL.md) |
| real-wargame-pixijs | conditional | любая работа с PixiJS 8, canvas, рендером, камерой, указателем, визуальным слоем | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/073e2266d0de3f6ab88f30e010f6619ebd96aa93/.agents/skills/real-wargame-pixijs/SKILL.md) |
| real-wargame-ai-runtime | conditional | работа с графом ИИ солдата, Utility-оценкой, Blackboard, Runtime, отменой, Bridge, AI-словарём | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/073e2266d0de3f6ab88f30e010f6619ebd96aa93/.agents/skills/real-wargame-ai-runtime/SKILL.md) |
| real-wargame-github-pages-deploy | conditional | явный запрос деплоя на GitHub Pages | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/073e2266d0de3f6ab88f30e010f6619ebd96aa93/.agents/skills/real-wargame-github-pages-deploy/SKILL.md) |
| real-wargame-documentation | conditional | правила ведения документации, генерации и проверки docs; на момент составления файл не отслеживается репозиторием | local-only / unavailable (правила изложены в канонических документах раздела 5) |
| opencode-mcp-windows-control (диспетчер маршрутов) | conditional | источник по маршрутам A/B/C/D/L/Q/R/W/X; локальный навык окружения | local-only / unavailable (правила — в docs/ai/OPENCODE_ROUTES.md) |
| routing-reminder | conditional | краткое напоминание по маршрутам; локальный навык окружения | local-only / unavailable (правила — в docs/ai/OPENCODE_ROUTES.md) |
| d-route-control | conditional | только при явной просьбе про нативные модели Codex / Route D | local-only / unavailable |
| x-route-control | conditional | только при явном /X или автоматическом GitHub-маршруте | local-only / unavailable |
| opencode-zworker-control | conditional | только при явном ручном /zworker | local-only / unavailable |
| zworker-auto | conditional | только при автоматическом ZIP-маршруте W | local-only / unavailable |
| opencode-deepseek-pro-jobs-control | conditional | только при тяжёлой локальной работе Route C | local-only / unavailable |
| opencode-github-mcp-control | conditional | только при явной GitHub-работе; внешнему агенту не нужен, GitHub-инструменты локального окружения недоступны | local-only / unavailable |

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

Все ссылки закреплены на коммит `073e2266d0de3f6ab88f30e010f6619ebd96aa93`
(HEAD `real-wargame-preview`). Префикс:

Префикс для raw-источников: [открыть raw-каталог](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/073e2266d0de3f6ab88f30e010f6619ebd96aa93/).

| Файл | Ссылка |
|---|---|
| AGENTS.md | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/073e2266d0de3f6ab88f30e010f6619ebd96aa93/AGENTS.md) |
| docs/ai/repo-context.json | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/073e2266d0de3f6ab88f30e010f6619ebd96aa93/docs/ai/repo-context.json) |
| docs/ai/WEB_CHAT_START.md | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/073e2266d0de3f6ab88f30e010f6619ebd96aa93/docs/ai/WEB_CHAT_START.md) |
| docs/ai/TASK_ROUTER.md | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/073e2266d0de3f6ab88f30e010f6619ebd96aa93/docs/ai/TASK_ROUTER.md) |
| docs/subprojects/index.json | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/073e2266d0de3f6ab88f30e010f6619ebd96aa93/docs/subprojects/index.json) |
| docs/subprojects/ai-single-unit-editor/STATUS.md | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/073e2266d0de3f6ab88f30e010f6619ebd96aa93/docs/subprojects/ai-single-unit-editor/STATUS.md) |
| docs/workflow/WEB_CHAT_FEATURE_DELIVERY.md | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/073e2266d0de3f6ab88f30e010f6619ebd96aa93/docs/workflow/WEB_CHAT_FEATURE_DELIVERY.md) |
| docs/workflow/EXTERNAL_CHAT_REQUIRED_RULES.md | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/073e2266d0de3f6ab88f30e010f6619ebd96aa93/docs/workflow/EXTERNAL_CHAT_REQUIRED_RULES.md) |
| docs/workflow/SKILL_PATCH_PREVIEW_BRANCH_POLICY.md | [открыть](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/073e2266d0de3f6ab88f30e010f6619ebd96aa93/docs/workflow/SKILL_PATCH_PREVIEW_BRANCH_POLICY.md) |

## 6. Новые документы (ветка feature/20260821-opencode-routes)

Ссылки ниже используют ветку `feature/20260821-opencode-routes`. Они становятся
достижимыми **только после публикации этой ветки** в GitHub. До публикации
пакет самодостаточен за счёт источников раздела 5.

| Файл | Ссылка |
|---|---|
| docs/ai/OPENCODE_ROUTES.md | [открыть после публикации ветки](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/feature/20260821-opencode-routes/docs/ai/OPENCODE_ROUTES.md) |
| docs/ai/OPENCODE_ROUTES_EXTERNAL_Q.md | [открыть после публикации ветки](https://raw.githubusercontent.com/AndrewVerhoturov1/Real-wargame/feature/20260821-opencode-routes/docs/ai/OPENCODE_ROUTES_EXTERNAL_Q.md) |

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
