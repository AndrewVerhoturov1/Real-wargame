# Real-Wargame

`Real-Wargame` — прототип 2D tactical command game и лаборатория поведения отдельного солдата.

## Технологии

```text
Vite
TypeScript
PixiJS 8
HTML/CSS
Node.js
Playwright
GitHub Actions
Vercel Preview
```

Это не проект на Godot.

## Ветки и разработка фич

Ветка приёмки разработки:

```text
real-wargame-preview
```

Стабильная ветка:

```text
main
```

Каждая новая фича разрабатывается в отдельной временной ветке, созданной от актуального commit `real-wargame-preview`:

```text
feature/YYYYMMDD-short-kebab-slug
```

Канонический маршрут:

```text
Web Chat реализует фичу в feature-ветке
→ выполняет focused non-browser checks
→ публикует ветку и manual live-test checklist
→ пользователь один раз передаёт ветку Codex
→ Codex только предоставляет branch-linked Vercel Preview URL
→ пользователь тестирует живое приложение
→ Web Chat исправляет проблемы в той же feature-ветке
→ по запросу пользователя Web Chat запускает visual GitHub Actions check
→ после явного GO пользователя Web Chat переносит exact tested commit в real-wargame-preview
```

Нельзя разрабатывать фичу напрямую в `real-wargame-preview`. `main` не меняется без отдельного прямого разрешения пользователя.

Подробный контракт:

```text
AGENTS.md
docs/workflow/WEB_CHAT_FEATURE_DELIVERY.md
```

## Запуск для пользователя

Основной запуск игры, редактора ИИ и локального AI engine:

```text
Run-Real-Wargame-Lab.bat
```

Пользователь не должен выполнять Git-команды, `npm`, переключать ветки или работать в терминале для обычного запуска и проверки.

Дополнительные диагностические запускатели могут оставаться в репозитории, но они не являются основным пользовательским маршрутом.

## Что сейчас разрабатывается

Текущий статус автоматически формируется из машинных данных:

```text
docs/ai/CURRENT_STATE.md
docs/subprojects/INDEX.md
```

Активный подпроект:

```text
ai-single-unit-editor
```

Он развивает:

- Utility AI и GraphRunner;
- многошаговый AI Runtime;
- Blackboard и Словарь ИИ;
- редактор нод;
- субъективную память и карту опасности бойца;
- территориальный контекст и линию фронта;
- понятное объяснение решений ИИ.

RTS-карта, редактор сцены, рельеф, лес, укрытия и видимость считаются поддерживаемой основой проекта.

## Язык разработки и интерфейса

Код, идентификаторы, сериализованные ключи и технические имена ведутся на английском.

Каждый пользовательский элемент обязан иметь полный русский перевод. Русский интерфейс включён по умолчанию.

Пользователь не должен редактировать JSON или технические ключи для обычной работы с игрой и ИИ.

## Архитектура

Короткая карта системы:

```text
docs/architecture/OVERVIEW.md
docs/architecture/MODULE_MAP.md
```

Основное разделение:

```text
data
→ simulation core
→ tactical knowledge
→ AI Runner / Runtime
→ game bridge
→ PixiJS rendering and input
→ human UI and editors
```

Core и чистый AI не должны зависеть от PixiJS или DOM.

## Вход для агентов

Начинать с:

```text
AGENTS.md
docs/ai/WEB_CHAT_START.md
docs/ai/repo-context.json
docs/workflow/WEB_CHAT_FEATURE_DELIVERY.md
docs/subprojects/index.json
```

Не нужно читать весь репозиторий, все журналы и все skills подряд.

## Проверка

До публикации feature-ветки Web Chat выполняет минимальный достаточный невизуальный набор:

```text
npx tsc --noEmit
focused smoke tests
npm run build
```

Для документации применяются `docs:smoke`, `docs:generate` и `docs:check` по правилам репозитория.

Playwright, Chromium и screenshot workflow не запускаются автоматически. Визуальная проверка выполняется только по явной просьбе пользователя и требует exact feature SHA, реального браузера, свежих PNG и их фактического просмотра. Статус GitHub Actions сам по себе не доказывает, что экран выглядит правильно.

## Большая концепция игры

Основные продуктовые документы:

- [10 ключевых принципов Real-Wargame](docs/product/CORE_GAME_PRINCIPLES.md) — каноническое обещание игры и ориентир для всех будущих механик;
- [MASTER PROJECT BOOK — 2D Tactical Command Game](Inbox/MASTER_PROJECT_S_2D_TACTICAL_COMMAND_GAME.md) — подробная продуктовая книга и долгосрочная архитектура игры;
- [`ideas/`](ideas/) — отдельные идеи и проектные концепции.

При обсуждении философии игры, её преимуществ или соответствии новой механики общему замыслу сначала нужно читать документ с 10 ключевыми принципами. Текущую готовность проекта нужно смотреть в сгенерированных `STATUS.md`.
