# 2D Tactical Command Game — Project Start

## Goal

Запустить проект **2D Tactical Command Game** (PixiJS + TypeScript + Vite) согласно мастер-документу. Первый интегрированный видимый результат — **Tactical Board Prototype v0.1**: тактическая карта 20×20, камера, тестовые подразделения, выделение, приказы движения, линии приказов и debug overlay.

## Current focus

Интегрировать и проверить Tactical Board Prototype v0.1:
- Vite + TypeScript + PixiJS runtime;
- карта-сетка 20×20, размер клетки 32 px;
- zoom колесом мыши и pan средней кнопкой либо Space + drag;
- 2–5 тестовых подразделений;
- выделение левой кнопкой;
- приказ движения правой кнопкой;
- линия приказа и прямолинейное движение;
- debug overlay координат, выбранного подразделения, цели и zoom.

## Key decisions

- **Практический первый шаг**: Tactical Board Prototype v0.1 идёт перед Map Workshop, чтобы проверить базовый командный цикл.
- **Стек**: PixiJS + TypeScript + Vite + JSON; более тяжёлые технологии добавляются только по необходимости.
- **Архитектура**: PixiJS отвечает за rendering/input, core хранит карту, юниты, приказы и simulation tick; core не импортирует PixiJS.
- **Data-first**: тестовая карта и подразделения загружаются из JSON.
- **Граница v0.1**: без боя, врагов, AI, pathfinding, line of sight, укрытий, редактора карты, сервера и БД.

## Read first

1. `docs/subprojects/real-wargame-start/CODEX_HANDOFF_TAC_BOARD_V0_1.md`
2. `docs/subprojects/real-wargame-start/SUBPROJECT.md`
3. `docs/subprojects/real-wargame-start/subproject.json`
4. `docs/subprojects/real-wargame-start/JOURNAL.md`
5. `Inbox/MASTER_PROJECT_S_2D_TACTICAL_COMMAND_GAME.md` — книга проекта, когда нужен более широкий продуктовый контекст

## Boundaries

- Читать только файлы, относящиеся к текущей задаче и подпроекту.
- Не менять `docs/ai/`, `AGENTS.md` или другие подпроекты без явной необходимости.
- В v0.1 не добавлять бой, врагов, подавление, мораль, AI, GOAP, HTN, Utility AI, pathfinding, line of sight, баллистику, артиллерию, связь, редактор карты, сервер, БД или сложный UI-фреймворк.
- Сохранять разделение core/rendering/input/data; core не должен импортировать PixiJS.

## Testing

Repository-level checks:
- changed-file scope matches the tactical-board runtime and this subproject memory;
- `AGENTS.md`, `docs/ai/**` and `docs/subprojects/github-collaboration/**` remain unchanged;
- JSON and TypeScript paths are present at the documented repo-relative locations.

Needs local verification:
- run `npm install` and `npm run build`;
- run `npm run dev` and open the browser;
- select each counter, issue a right-click move order, verify movement/order line/debug HUD;
- verify wheel zoom and middle-mouse or Space + left-drag pan.
