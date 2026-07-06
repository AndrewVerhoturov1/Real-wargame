# 2D Tactical Command Game — Project Start

## Goal

Запустить проект **2D Tactical Command Game** (PixiJS + TypeScript + Vite) согласно мастер-документу. Первый видимый результат — **Tactical Map Workshop v0.1**: редактор карты 20×20 с terrain-кистями, высотами, экспортом/импортом JSON, debug overlay и тестовой сценой просмотра.

## Current focus

Реализовать Map Workshop v0.1 по спецификации `Inbox/MASTER_PROJECT_S_2D_TACTICAL_COMMAND_GAME.md` [глава 9]:
- Vite + TypeScript + PixiJS проект, главное меню, Map Editor, Test Scene
- сетка 20×20, размер клетки 32 px
- terrain-кисти: field, forest, road, swamp
- высота клетки: -1, 0, +1, +2
- экспорт/импорт JSON, очистка карты, debug overlay координат

## Key decisions

- **Стек**: PixiJS + TypeScript + Vite + JSON, позже Web Workers / Tauri / Rust-WASM по необходимости (GDD гл. 5).
- **Архитектура**: разделение на display (PixiJS) и brain (simulation core); core не зависит от PixiJS (GDD гл. 6).
- **Data-first**: карты, оружие, юниты, поведение, профили — в JSON; редакторы меняют данные (GDD гл. 8).
- **Первая версия** — не игра, а мастерская карты; бой, ИИ, геномы, сервер — позже (GDD гл. 9.1).

## Read first

1. `Inbox/MASTER_PROJECT_S_2D_TACTICAL_COMMAND_GAME.md` — книга проекта (особенно гл. 5, 6, 7, 8, 9, 45)
2. `docs/subprojects/real-wargame-start/SUBPROJECT.md`
3. `docs/subprojects/real-wargame-start/subproject.json`
4. `docs/subprojects/real-wargame-start/JOURNAL.md`

## Boundaries

- Читать только файлы, относящиеся к текущей задаче и подпроекту.
- Не читать `docs/ai/`, `AGENTS.md` или другие подпроекты без явной необходимости.
- В v0.1 **не делать**: бой, подавление, геномы, GOAP, HTN, баллистику, артиллерию, связь, кампанию, сервер, базу данных, сложный UI-фреймворк (GDD гл. 9.3).

## Testing

- После `npm install && npm run dev` открывается браузер.
- Пользователь может: открыть редактор, нарисовать terrain, изменить высоты, экспортировать JSON, загрузить JSON обратно, увидеть карту в тестовой сцене (GDD гл. 9.4).
