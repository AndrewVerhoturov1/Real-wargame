# Исполнитель 4 — доступ к общим редакторам из Combat Lab

## Роль

Ты — Исполнитель 4 программы объединения игровых редакторов Real-Wargame.

Твоя зона ответственности:

- новая вкладка Combat Lab `Настройка игры`;
- grouped catalogue редакторов из общего registry;
- открытие embedded editors в большом modal workbench поверх карты;
- переход в полноэкранный Graph v2 editor с возвратом в Combat Lab;
- ссылки от выбранного бойца к исходным глобальным профилям;
- lifecycle, focus and runtime isolation этой интеграции.

Ты не создаёшь editor panels, profile registries, common menu или второй overlay coordinator.

## Репозиторий

```text
AndrewVerhoturov1/Real-wargame
```

## Рабочая ветка

```text
worker/20260731-combat-lab-game-editors
```

Создай её строго от точного Wave 2 Foundation SHA, указанного оркестратором в сообщении запуска.

До изменений:

```bash
git fetch origin --prune
git rev-parse HEAD
git rev-parse origin/feature/20260731-combat-lab-user-acceptance-fixes
```

Стартовый `HEAD` обязан равняться Wave 2 Foundation SHA.

Foundation обязан содержать:

- common overlay coordinator;
- modal layer helper;
- shared game-editor registry;
- shared GameEditorWorkspace;
- migrated existing editor definitions.

Если это не так, не создавай local substitute и верни `BLOCKED`.

## Обязательное чтение

Полностью прочитай:

1. `AGENTS.md`;
2. `docs/ai/repo-context.json`;
3. `docs/ai/SKILLS_INDEX.md`;
4. `docs/performance/PERFORMANCE_PRINCIPLES.md`;
5. `.agents/skills/real-wargame-performance/SKILL.md`;
6. `.agents/skills/real-wargame-ai-runtime/SKILL.md`;
7. `docs/superpowers/specs/2026-07-31-shared-game-editors-combat-lab-design.md`;
8. `docs/superpowers/plans/2026-07-31-shared-game-editors-combat-lab.md`;
9. shared overlay and game-editor contracts in Wave 2 Foundation;
10. `src/combat-lab/main.ts`;
11. `src/combat-lab/CombatLabExtension.ts`;
12. `src/combat-lab/CombatLabWorkspaceServices.ts`;
13. `src/combat-lab/ui/CombatLabWorkspaceHosts.ts`;
14. `src/combat-lab/ui/CombatLabWorkspaceTabs.ts`;
15. `src/combat-lab/parameters/installCombatLabQuickParameters.ts`;
16. selected-unit/scene/program panels and profile selectors;
17. `CombatLabExperimentDraft`, visual controller, batch client and lifecycle tests;
18. current Combat Lab UI/contract smoke scripts.

Используй `superpowers:test-driven-development`. Перед готовностью используй `superpowers:verification-before-completion`.

## Главная архитектурная граница

Combat Lab не получает копии редакторов.

Правильный поток:

```text
CombatLab settings catalogue
→ shared GameEditorDefinition
→ common overlay coordinator
→ shared GameEditorWorkspace
→ existing editor installation
→ existing canonical profile registry
```

Запрещённый поток:

```text
CombatLab
→ copied sliders
→ experiment-owned copy of global profile
→ second storage/runtime path
```

## 1. Новая workspace tab

Расширь canonical tab definitions:

```text
scene
program
batch
parameters
settings
metrics
journal
```

Label and title:

```text
labelRu: Настройка игры
titleRu: Настройка игры
```

Требования:

- `CombatLabWorkspaceHosts` получает readonly `settings` host;
- `normalizeCombatLabWorkspaceTab` принимает `settings`;
- persisted old values остаются совместимыми;
- default tab не меняется без отдельного product requirement;
- создаётся ровно один host внутри существующего workspace root;
- не создаётся второй dock, drawer or composition root.

## 2. Grouped catalogue

Создай focused integration modules, например:

```text
src/combat-lab/game-editors/CombatLabGameEditorCatalogue.ts
src/combat-lab/game-editors/CombatLabGameEditorOverlay.ts
src/combat-lab/game-editors/CombatLabGameEditorLinks.ts
src/combat-lab/game-editors/combat-lab-game-editors.css
```

Точные имена можно адаптировать, но разделяй catalogue, overlay lifecycle and selected-unit links.

Catalogue строится динамически из shared registry definitions.

Группы и порядок берутся из definition metadata:

```text
behavior → Поведение
soldier → Боец
combat → Бой
world → Мир
```

Не создавай второй hardcoded list IDs для текущих и будущих editors.

Допускается единственная mapping labels для четырёх groups, если shared platform ещё не содержит Russian group labels.

Каждый item показывает:

- Russian editor label;
- embedded/route behavior;
- краткое техническое назначение только из stable metadata, если metadata уже предусмотрена;
- current profile name only when it can be read through canonical registry API without mounting editor.

Catalogue не подписывается на все registries каждую frame. Обновление revision-driven or explicit on activation.

## 3. Большой modal workbench

Embedded editor открывается поверх карты через common overlay coordinator.

Required behavior:

- map and dock remain visually present behind dark backdrop;
- background is inert;
- modal uses most available viewport but preserves margins;
- header shows editor label and close control;
- long editor form scrolls internally;
- save/cancel controls remain reachable according to panel contract;
- `Escape` first asks active editor `beforeClose`;
- if close is refused, overlay remains open;
- close/destroy calls installation destroy exactly once;
- reopening creates a fresh installation with no leaked listener;
- switching catalogue item does not leave old installation alive;
- focus returns to catalogue item after close;
- reduced width 1100×760 remains usable.

Do not implement a local modal framework. Consume Worker 1 foundation.

## 4. Graph route and return

`behaviorGraph` is route activation in Combat Lab.

Required flow:

```text
/combat-lab.html
→ open behaviorGraph request
→ /ai-node-editor.html with graph section and encoded safe return target
→ existing Graph v2 workspace and storage
→ explicit return to /combat-lab.html
```

Requirements:

- use same origin relative paths;
- only allow repository-owned relative return targets;
- never execute arbitrary URL from query string;
- no second graph canvas;
- no second graph storage key;
- no copied graph JSON;
- preserve unsaved graph behavior already defined by AI editor;
- direct load of `/ai-node-editor.html` without return target remains unchanged.

The return mechanism may be represented by one contextual `Вернуться в полигон` action or by a safe shell navigation state. Do not restore a permanent duplicate top strip.

## 5. Selected-unit source profile links

The existing `Параметры` tab and selected-unit presentation may display source references such as:

```text
Профиль маршрута: normal
[Открыть профиль]

Профиль движения: normal_walk
[Открыть профиль]
```

Use only profile IDs actually present in the selected unit/current experiment/runtime definition.

Link click creates `GameEditorOpenRequest`:

```ts
{
  editorId,
  profileId,
  selectedUnitId,
}
```

Requirements:

- target editor opens directly at the referenced profile when supported;
- absent profile ID uses current registry fallback and shows a clear message;
- no profile object copied into CombatLabExperimentDraft;
- no direct localStorage access from Combat Lab integration;
- no direct mutation of simulation state;
- no reset/start merely from opening a profile;
- saved profile applies according to its canonical revision semantics, not by custom Combat Lab code.

## 6. Quick parameters boundary

Current Combat Lab quick parameters remain experiment-local overrides.

Tests must prove:

- changing a quick parameter does not mutate a global profile registry;
- changing a global profile does not silently rewrite experiment override values;
- reset/start still uses current experiment draft and seed;
- settings catalogue never instantiates a second draft;
- global editor access does not call `CombatLabResetAndStart` unless existing user action explicitly requests it.

## 7. Composition lifecycle

Preferred ownership:

- `CombatLabExtension` creates one settings integration after workspace hosts and shared registry are ready;
- integration mounts catalogue into `hosts.settings`;
- integration receives overlay coordinator/registry explicitly through composition, or through the explicit shared application service established in Wave 2 Foundation;
- `destroy()` closes editor overlay, destroys workspace installation and removes listeners;
- no module performs work at import time by querying the page.

Do not make `CombatLabWorkspaceTabs` own editor registry or profile runtime.

## 8. Runtime and performance isolation

Opening editors must not:

- advance simulation;
- create a second Pixi ticker;
- create a second visual controller;
- reset experiment;
- cancel or restart batch;
- scan map;
- rebuild tactical rasters;
- poll selected unit per frame;
- add a second selection ticker listener.

If selected-unit links need updates, reuse existing `CombatLabWorkspaceServices.selection` subscription or the current revision-driven selected-unit presentation. Do not create a parallel selected-unit observer.

Hidden `settings` catalogue and closed editor overlay must perform no recurring DOM work.

## Запрещено

- менять AppShellMenu implementation;
- создавать overlay coordinator;
- создавать or copy editor panels;
- добавлять profile registries;
- менять Graph v2 storage;
- менять quick parameter semantics;
- менять scenario executor or batch pipeline;
- создавать second workspace root;
- случайно искать registered foundation nodes через broad CSS selectors;
- мутировать simulation state вне штатных ports;
- менять main/preview;
- создавать deployment or PR.

## TDD и regression tests

До реализации добавь падающие tests.

Обязательные cases:

1. `settings` входит в canonical tab definitions.
2. Workspace hosts содержит ровно один settings host.
3. Old stored tab values normalize correctly.
4. Catalogue reads shared registry and does not contain copied editor IDs list.
5. Group order deterministic.
6. Embedded definition opens common modal overlay.
7. Route definition does not mount panel.
8. Graph route includes safe return target.
9. Unsafe external return target is rejected.
10. `beforeClose=false` leaves overlay open.
11. Closing destroys installation once.
12. Repeated open/close does not accumulate subscriptions/listeners.
13. Selected-unit link passes editorId/profileId/unitId.
14. Missing profile shows fallback/error without crash.
15. Quick parameter change does not mutate global profile registry.
16. Profile editor open/save does not modify experiment override object directly.
17. No second draft/visual controller/batch client construction.
18. No module-level global host query.
19. No console error in focused DOM interaction harness.
20. Reduced-width modal keeps close and editor controls accessible.

Добавь focused npm script, если существующих contract scripts недостаточно.

## Проверки

Минимально реально выполни:

```bash
npm ci --no-audit --no-fund
npm run typecheck
npm run combat-lab-ui-contract:smoke
npm run combat-lab-experiment:smoke
npm run combat-lab-batch:smoke
npm run combat-lab-scenario-system:verify
npm run workspace-architecture-contract:smoke
npm run performance-contract:smoke
npm run infantry-combat-stage9:verify
npm run build
```

Также выполни новый settings catalogue/overlay contract smoke.

Не заявляй browser QA: финальный compiler проверит объединённый продукт в Chromium. Ты обязан проверить доступный focused DOM interaction harness и отсутствие ошибок в нём.

## Коммиты

Рекомендуемая структура:

```text
test(combat-lab): define shared game-editor access contract
feat(combat-lab): open shared editors from the settings workspace
```

Correction commits допустимы. Не force-push после публикации.

## Формат отчёта

Верни:

```text
READY FOR ORCHESTRATOR
BLOCKED
FAIL
```

При готовности:

```text
status: READY FOR ORCHESTRATOR
wave2_foundation_sha:
branch:
previous_head:
current_head:
commits_added:
workspace_changes:
catalogue_groups:
profile_links_added:
root_causes:
files_changed:
regression_tests_added_or_updated:
focused_checks:
typecheck:
production_build:
performance_impact:
known_remaining_issues:
deployment_created: false
acceptance_branch_touched: false
preview_branch_touched: false
main_touched: false
```

Не переносить изменения в acceptance-ветку. После push и отчёта остановись.
