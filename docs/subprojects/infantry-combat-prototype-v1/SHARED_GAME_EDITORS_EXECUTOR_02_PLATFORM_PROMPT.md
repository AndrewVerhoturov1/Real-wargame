# Исполнитель 2 — единая платформа игровых редакторов

## Роль

Ты — Исполнитель 2 программы объединения игровых редакторов Real-Wargame.

Твоя зона ответственности:

- один общий реестр игровых редакторов;
- один явный контракт подключения редактора в переданный контейнер;
- перенос существующих редакторов на этот контракт;
- использование общей платформы в редакторе ИИ;
- устранение глобального поиска DOM-хостов при импорте модулей;
- полноценный жизненный цикл открытия, переключения, проверки несохранённых изменений и уничтожения.

Ты не реализуешь меню, новые игровые профили и подключение редакторов в Combat Lab.

## Репозиторий

```text
AndrewVerhoturov1/Real-wargame
```

## Рабочая ветка

```text
worker/20260731-shared-game-editor-platform
```

Создай её строго от точного Foundation SHA, указанного оркестратором в сообщении запуска.

До изменений проверь:

```bash
git fetch origin --prune
git rev-parse HEAD
git rev-parse origin/feature/20260731-combat-lab-user-acceptance-fixes
```

Стартовый `HEAD` рабочей ветки обязан совпасть с Foundation SHA. При несовпадении верни `BLOCKED`. Не исправляй base самостоятельно.

## Обязательное чтение

Полностью прочитай:

1. `AGENTS.md`;
2. `docs/ai/repo-context.json`;
3. `docs/ai/SKILLS_INDEX.md`;
4. `docs/performance/PERFORMANCE_PRINCIPLES.md`;
5. `.agents/skills/real-wargame-performance/SKILL.md`;
6. `.agents/skills/real-wargame-ai-runtime/SKILL.md`;
7. `docs/architecture/ENGINE_MIGRATION_READINESS.md`;
8. `docs/superpowers/specs/2026-07-31-shared-game-editors-combat-lab-design.md`;
9. `docs/superpowers/plans/2026-07-31-shared-game-editors-combat-lab.md`;
10. `ai-node-editor.html`;
11. `src/ai-node-editor/AiEditorSectionRegistry.ts`;
12. `src/ai-node-editor/NavigationProfileEditor.ts`;
13. `src/ai-node-editor/TacticalPositionProfileEditor.ts`;
14. `src/ai-node-editor/MovementProfileEditorIntegration.ts`;
15. `src/ai-node-editor/EnvironmentProfileEditorIntegration.ts` и panel;
16. `src/ai-node-editor/CombatCatalogEditor.ts`;
17. редакторы внимания, данных бойца и направленного рельефа;
18. существующие storage/registry/runtime модули всех этих профилей.

Перед изменениями составь карту:

```text
editor ID
current entrypoint
current DOM host discovery
current registry/storage owner
current save/import/export lifecycle
current teardown behavior
```

Используй `superpowers:test-driven-development`. Перед готовностью используй `superpowers:verification-before-completion`.

## Цель

И редактор ИИ, и следующий исполнитель Combat Lab должны получать одни и те же определения редакторов.

Нельзя оставлять два списка вкладок, два набора labels, два lifecycle и две формы над одним профилем.

## Обязательная платформа

Создай focused-модули под общей директорией, например:

```text
src/game-editors/GameEditorTypes.ts
src/game-editors/GameEditorRegistry.ts
src/game-editors/GameEditorWorkspace.ts
src/game-editors/createDefaultGameEditorRegistry.ts
src/game-editors/game-editor-workspace.css
```

Допускается другое расположение только при строгом соответствии существующей структуре. Не размещай общую платформу внутри `combat-lab` или конкретного editor panel.

Минимальный смысловой контракт:

```ts
export type GameEditorSurface = 'ai-editor' | 'combat-lab';
export type GameEditorGroup = 'behavior' | 'soldier' | 'combat' | 'world';
export type GameEditorActivation = 'embedded' | 'route' | 'hidden';

export interface GameEditorOpenRequest {
  readonly editorId: string;
  readonly profileId?: string;
  readonly selectedUnitId?: string;
  readonly returnTo?: string;
}

export interface GameEditorMountContext {
  readonly host: HTMLElement;
  readonly surface: GameEditorSurface;
  readonly request: GameEditorOpenRequest;
  readonly requestClose: () => void;
}

export interface GameEditorInstallation {
  beforeClose?(): boolean | Promise<boolean>;
  destroy(): void;
}

export interface GameEditorDefinition {
  readonly id: string;
  readonly labelRu: string;
  readonly group: GameEditorGroup;
  readonly order: number;
  activationFor(surface: GameEditorSurface): GameEditorActivation;
  mount?(context: GameEditorMountContext): GameEditorInstallation;
  route?(request: GameEditorOpenRequest): string;
}
```

Ты можешь уточнить имена, но не можешь убрать:

- surface-specific activation;
- явный host;
- open request;
- before-close contract;
- teardown;
- route editor support;
- stable metadata.

## Реестр

Реестр должен:

- отклонять пустой ID;
- отклонять повторный ID;
- выдавать детерминированную сортировку по group/order/ID;
- не зависеть от DOM;
- не использовать глобальный mutable singleton как скрытый composition root;
- поддерживать создание одного default registry в entrypoint;
- отдавать immutable definition snapshots;
- не пересоздавать профили или storage.

Один registry instance на страницу создаётся явно composition root соответствующего режима.

## Workspace host

`GameEditorWorkspace` обязан:

- принимать host и registry явно;
- держать не более одной активной installation;
- при переключении вызывать `beforeClose` текущей installation;
- не переключать редактор, если закрытие отклонено;
- уничтожать текущую installation перед новым mount;
- безопасно переживать повторный `destroy()`;
- не оставлять MutationObserver, timers или subscriptions;
- поддерживать open request с `profileId` и `selectedUnitId`;
- возвращать route URL для route-only definitions;
- не владеть игровыми данными.

## Существующие редакторы

Зарегистрируй ровно один раз:

```text
behaviorGraph
 tacticalPositions
 routeProfiles
 environmentProfiles
 movementProfiles
 weapons
 attentionProfiles
 soldierData
 directionalTerrain
```

Пробел перед некоторыми строками выше не является частью ID. Итоговые стабильные IDs должны быть без пробелов и покрыты тестом.

### behaviorGraph

- В `ai-editor` — основной embedded workspace.
- В `combat-lab` — route activation на существующий `/ai-node-editor.html`.
- Используется текущий Graph v2 canvas и текущий storage key.
- Не создавай второй graph instance.

### tacticalPositions

Текущий модуль ищет глобальные navigation/root элементы. Преобразуй его в mountable panel/installation.

### routeProfiles

Раздели старую ответственность `NavigationProfileEditor.ts`, если это необходимо:

- общая panel rendering/storage logic;
- AI-editor composition adapter.

Не дублируй NavigationProfileRegistry.

### environmentProfiles

Редактор уже существует:

```text
src/ai-node-editor/EnvironmentProfileEditorPanel.ts
src/ai-node-editor/EnvironmentProfileEditorIntegration.ts
src/core/map/EnvironmentMaterialProfile.ts
src/core/map/EnvironmentProfileRuntime.ts
src/ui/EnvironmentProfileStorage.ts
```

Используй его. Верни `Профили местности` в общий видимый catalogue, если текущий entrypoint его не загружает.

### movementProfiles

Сохрани MovementProfileRegistry и current before-leave behavior.

### weapons

Сохрани combat catalog ownership, loadout data, import/export and validation. Не переносить оружейные данные в editor registry.

### attentionProfiles

Сохрани существующий profile registry. Не смешивай с новым perception editor, который будет делать другой исполнитель.

### soldierData

Оставь семантику текущих Graph v2 blackboard defaults. Этот раздел не должен притворяться редактором всех характеристик бойца.

### directionalTerrain

Текущий global installer нужно преобразовать в mountable definition. Сохрани runtime profile storage and revision semantics.

## AI editor composition

AI editor должен строить верхнюю навигацию из shared registry.

Требования:

- один список definition metadata;
- labels и order не дублируются в HTML/string constants другого реестра;
- graph workspace остаётся рабочим;
- route/environment/movement/weapon/etc. открываются через `GameEditorWorkspace`;
- кнопки `Обновить`, `Открыть игру`, `Выход` удаляются из локальной навигации, потому что этим владеет общее меню Исполнителя 1;
- если Исполнитель 1 ещё не интегрирован в твою ветку, не реализуй его код и не создавай временный дубликат: убери только локальное дублирование, защищённое contract test;
- import order в `ai-node-editor.html` не должен быть скрытым способом регистрации, когда default registry может сделать это явно.

## Запрещено

- менять AppShellMenu или реализовывать modal menu;
- менять Combat Lab workspace;
- добавлять perception/archetype/wound profiles;
- менять simulation semantics;
- создавать второй registry для Combat Lab;
- хранить definitions в DOM dataset как source of truth;
- искать host через случайные CSS selectors внутри mountable panels;
- запускать editor logic при простом импорте модуля;
- делать editor panel владельцем core runtime;
- добавлять polling;
- оставлять старый и новый section registry одновременно;
- изменять main/preview;
- создавать deployment или PR.

## TDD и regression tests

Сначала создай падающие contract tests.

Они обязаны доказать:

1. Registry отклоняет duplicate IDs.
2. Sorting deterministic.
3. Default registry содержит все девять IDs ровно один раз.
4. Каждая definition имеет group/order/surface activation.
5. `behaviorGraph` embedded в AI editor и route в Combat Lab.
6. Workspace передаёт host явно.
7. Workspace уважает `beforeClose=false`.
8. Workspace уничтожает старую installation один раз.
9. Повторный destroy безопасен.
10. Tactical position и directional terrain modules не ищут page-global host на import.
11. Ни один panel не импортирует Combat Lab.
12. Environment editor visible и использует existing panel/storage.
13. AI editor navigation строится из registry metadata.
14. Старый параллельный section path отсутствует.
15. Core registry/profile modules не импортируют DOM.

Добавь focused npm script, если подходящего нет.

## Проверки

Реально выполни:

```bash
npm ci --no-audit --no-fund
npm run typecheck
npm run editor:smoke
npm run graph-v2:smoke
npm run movement-profiles:smoke
npm run combat-catalog-editor:smoke
npm run attention-profiles:smoke
npm run directional-terrain:smoke
npm run environment-materials:smoke
npm run workspace-architecture-contract:smoke
npm run performance-contract:smoke
npm run build
```

Также выполни новый shared editor registry/workspace contract smoke.

Если точное имя существующего script изменилось в Foundation SHA, используй его актуальное имя и явно укажи соответствие в отчёте.

## Производительность

Изменение UI lifecycle считается performance-affecting.

Докажи:

- hidden panels не подписаны или полностью inactive;
- переключение не создаёт растущий список listeners;
- registry listing не происходит каждый кадр;
- MutationObserver не наблюдает весь document без необходимости;
- editor workspace не запускает simulation work;
- destroy симметричен.

Не запускать тяжёлую browser performance matrix без отдельной необходимости; финальный compiler выполнит общий performance audit. Здесь обязательны focused lifecycle contracts и performance-contract smoke.

## Коммиты

Рекомендуемая структура:

```text
test(editors): define shared registry and lifecycle contracts
refactor(editors): mount existing game editors through one platform
```

Можно разбить migration на несколько осмысленных commits.

Не force-push после публикации.

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
foundation_sha:
branch:
previous_head:
current_head:
commits_added:
editor_ids_registered:
legacy_paths_removed:
root_causes:
files_changed:
regression_tests_added_or_updated:
focused_checks:
typecheck:
production_build:
performance_impact:
known_remaining_issues:
deployment_created: false
preview_branch_touched: false
main_touched: false
```

Не переносить результат в acceptance-ветку. После push и отчёта остановись.
