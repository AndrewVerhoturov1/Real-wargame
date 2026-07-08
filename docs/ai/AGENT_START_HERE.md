# Agent Start Here

Короткий вход для Codex, OpenCode, внешнего web-chat и zworker, которые работают с `AndrewVerhoturov1/Real-wargame`.

Полный контракт остаётся в `AGENTS.md`. Этот файл нужен, чтобы агент не утонул в длинных правилах и сразу выбрал правильный маршрут.

## 1. Ветка по умолчанию

Рабочая ветка для изменений:

```text
real-wargame-preview
```

`main` не менять без явного разрешения пользователя.

Если задача пришла без отдельного разрешения на `main`, результат должен попасть в `real-wargame-preview` прямым коммитом/пушем или через PR в `real-wargame-preview`.

## 2. Что читать первым

Минимальный старт:

```text
AGENTS.md
docs/workflow/EXTERNAL_CHAT_REQUIRED_RULES.md
docs/ai/SKILLS_INDEX.md
```

Если задача относится к подпроекту, дополнительно прочитать соответствующие файлы в `docs/subprojects/<id>/`.

## 3. Как выбрать skill

Сначала открыть общий индекс:

```text
docs/ai/SKILLS_INDEX.md
```

Самые частые маршруты:

| Задача | Читать |
|---|---|
| Запустить игру, открыть preview, сделать скриншоты, показать игру в чате | `.agents/skills/real-wargame-local-preview/SKILL.md` |
| Любая PixiJS/canvas/2D-графика | `docs/ai/PIXIJS_SKILLS_INDEX.md`, затем `.agents/skills/pixijs/SKILL.md` |
| Проверка/изменение GitHub workflow для скриншотов | `.agents/skills/real-wargame-local-preview/SKILL.md` |
| Работа с внешним GitHub-aware чатом | `docs/workflow/EXTERNAL_CHAT_REQUIRED_RULES.md` |

## 4. Локальный запуск и скриншоты

Если пользователь просит:

```text
запусти игру
открой локально
покажи скриншоты
проверь preview
скачай artifact
```

сначала читать:

```text
.agents/skills/real-wargame-local-preview/SKILL.md
```

Не утверждать, что локальный запуск выполнен, если была только GitHub Actions проверка. Формулировать честно:

```text
Проверено через GitHub Actions + Chromium + Playwright.
```

или:

```text
Проверено локально командой/батником ...
```

## 5. Нельзя

- Нельзя писать прямо в `main` без явного GO пользователя.
- Нельзя мержить PR без явного GO пользователя.
- Нельзя включать auto-merge.
- Нельзя просить пользователя выполнять Git/terminal, если агент может подготовить `.bat`, PR, artifact или понятную кнопку/ссылку.
- Нельзя говорить, что проверки запускались, если они не запускались.
- Нельзя оставлять временную ветку/PR без причины в отчёте.

## 6. Минимальный отчёт

В конце задачи указать:

```text
branch: real-wargame-preview
commit/pr: ...
transfer_path: direct push / PR into preview / not changed
checks_run: ...
manual_checks_needed: ...
risks: ...
```

Если был временный PR/ветка, указать статус закрытия или причину, почему оставлено открытым.
