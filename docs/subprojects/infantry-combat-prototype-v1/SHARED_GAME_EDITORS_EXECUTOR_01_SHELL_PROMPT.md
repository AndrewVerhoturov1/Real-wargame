# Исполнитель 1 — общее игровое меню и координатор верхних слоёв

## Роль

Ты — Исполнитель 1 программы объединения игровых редакторов Real-Wargame.

Твоя единственная зона ответственности:

- общее меню трёх режимов;
- единый порядок обработки `Escape`;
- общий модальный слой;
- фокус, затемнение и блокировка фона;
- освобождение занятого постоянной верхней полосой места.

Ты не реализуешь платформу игровых редакторов, новые профили или вкладку Combat Lab.

## Репозиторий

```text
AndrewVerhoturov1/Real-wargame
```

## Рабочая ветка

```text
worker/20260731-app-shell-overlay-menu
```

Создай её строго от точного Foundation SHA, указанного оркестратором в сообщении запуска.

Перед любыми изменениями выполни:

```bash
git fetch origin --prune
git rev-parse HEAD
git rev-parse origin/feature/20260731-combat-lab-user-acceptance-fixes
```

Требования:

- локальный `HEAD` новой рабочей ветки до первого изменения равен Foundation SHA;
- Foundation SHA должен быть 40-символьным SHA из сообщения запуска;
- при несовпадении не исправляй ветку самостоятельно и верни `BLOCKED`;
- не сбрасывай и не переписывай опубликованную историю.

## Обязательное чтение

До реализации полностью прочитай:

1. `AGENTS.md`;
2. `docs/ai/repo-context.json`;
3. `docs/ai/SKILLS_INDEX.md`;
4. `docs/performance/PERFORMANCE_PRINCIPLES.md`;
5. `.agents/skills/real-wargame-performance/SKILL.md`;
6. `docs/superpowers/specs/2026-07-31-shared-game-editors-combat-lab-design.md`;
7. `docs/superpowers/plans/2026-07-31-shared-game-editors-combat-lab.md`;
8. текущие `src/shared/AppShellMenu.ts` и все места вызова `installAppShellMenu`;
9. существующие диалоговые и popup-механизмы, которые уже реагируют на `Escape`.

Используй обязательные навыки репозитория. Для реализации по плану используй `superpowers:test-driven-development`, а перед объявлением готовности — `superpowers:verification-before-completion`.

## Цель

Вместо постоянно видимой верхней полосы должен остаться компактный вызов `Меню`.

При открытии поверх текущего режима появляется единый тёмный модальный слой:

```text
REAL WARGAME

Игра
Редактор ИИ
Испытательный полигон

Выход
```

Текущий режим явно отмечен.

Меню должно работать одинаково на:

```text
/
/ai-node-editor.html
/combat-lab.html
```

## Архитектура

Сохрани `AppShellMenu` единственным владельцем навигации между режимами и выхода.

Создай один общий координатор верхних слоёв. Допустимая структура:

```text
src/shared/app-overlay/AppOverlayCoordinator.ts
src/shared/app-overlay/AppModalLayer.ts
src/shared/app-overlay/app-overlay.css
```

Точные имена можно изменить только ради согласования с существующим стилем каталогов. Не создавай второй координатор или отдельную реализацию для каждого режима.

Координатор должен поддерживать:

- один документный обработчик `keydown`;
- упорядоченные закрываемые слои;
- приоритет верхнего слоя;
- открытие меню по `Escape`, только когда закрывать больше нечего;
- закрытие текущего верхнего слоя по `Escape`;
- идемпотентное уничтожение;
- восстановление фокуса;
- блокировку взаимодействия с фоном;
- возможность следующему исполнителю открыть через него большой редактор Combat Lab.

Минимальный смысловой контракт:

```ts
export interface AppOverlayHandle {
  readonly priority: number;
  close(): void;
  destroy(): void;
}

export interface DismissLayerOptions {
  readonly priority: number;
  readonly isOpen: () => boolean;
  readonly requestClose: () => boolean | Promise<boolean>;
}

export interface AppModalOptions {
  readonly ariaLabel: string;
  readonly priority: number;
  readonly trigger?: HTMLElement | null;
  readonly render: (host: HTMLElement) => void;
  readonly beforeClose?: () => boolean | Promise<boolean>;
}
```

Названия могут быть уточнены, но смысл и тестируемость должны сохраниться.

## Поведение `Escape`

Обязательный порядок:

1. Закрыть самый приоритетный открытый зарегистрированный слой.
2. Если открыт игровой menu modal — закрыть его.
3. Если слоёв нет — открыть игровое меню.

Не устанавливай безусловный обработчик `Escape` внутри каждого entrypoint.

Не перехватывай `Escape`, когда событие уже обработано более узким компонентом, если это нарушает жизненный цикл существующего окна.

## Модальный слой

Обязательные свойства:

- `role="dialog"`;
- `aria-modal="true"`;
- доступное название;
- тёмная полупрозрачная подложка;
- фокус при открытии переходит внутрь;
- `Tab` и `Shift+Tab` не выпускают фокус на фон;
- после закрытия фокус возвращается к вызвавшей кнопке, если она ещё существует;
- фон не получает клики и клавиатурный фокус;
- повторное закрытие и `destroy()` безопасны;
- обработчики, наблюдатели и таймеры удаляются симметрично.

Не делай DOM верхнего слоя источником состояния симуляции.

## Общее меню

Сохрани существующие функции:

- переход в игру;
- переход в редактор ИИ;
- переход в Combat Lab;
- выход/остановка локальной лаборатории;
- синхронизация закрытия вкладок, если она уже требуется локальному запускателю.

Разрешены только действительно необходимые вторичные действия:

- в игре — `Новая игра`;
- в служебном режиме — перезагрузка текущего режима, если существующий контракт требует её.

Они не должны превращать меню обратно в постоянную панель.

## Освобождение места

Удалить или заменить стили, которые резервируют место под старую полосу:

- верхний отступ игры;
- искусственный `margin-top` редактора ИИ;
- специальные 54/100-пиксельные компенсации;
- сдвиги Combat Lab, существующие только из-за старого shell menu.

Не ломай реальные внутренние панели режимов.

## Запрещено

- менять `main`;
- менять `real-wargame-preview`;
- создавать deployment;
- создавать PR;
- добавлять второй `AppShellMenu`;
- создавать отдельные меню для игры, редактора ИИ и Combat Lab;
- изменять Graph v2;
- изменять Combat Lab draft, runtime, batch или workspace tabs;
- переносить profile editors;
- ослаблять существующие проверки;
- добавлять библиотеку модальных окон без необходимости;
- оставлять старую и новую навигацию одновременно.

## Тестирование через TDD

Сначала добавь падающие regression tests.

Минимально тесты должны доказать:

1. На странице устанавливается один общий корень меню.
2. Постоянной полосы ссылок нет.
3. Компактная кнопка открывает modal.
4. Текущий режим отмечен.
5. `Escape` открывает меню при отсутствии других слоёв.
6. `Escape` сначала закрывает более приоритетный слой.
7. Второй `Escape` после закрытия верхнего слоя не открывает меню в том же событии.
8. Фокус остаётся внутри modal.
9. Закрытие восстанавливает фокус.
10. Фон блокирован.
11. `destroy()` удаляет document listener.
12. Повторная установка shell menu не создаёт второй координатор или второй root.
13. На ширине 1100 пикселей все четыре основных действия доступны.

Добавь отдельную focused-команду в `package.json`, если подходящего существующего script нет.

## Проверки

Перед готовностью реально выполни:

```bash
npm ci --no-audit --no-fund
npm run typecheck
npm run combat-lab-ui-contract:smoke
npm run editor:smoke
npm run workspace-architecture-contract:smoke
npm run performance-contract:smoke
npm run build
```

Также выполни созданный focused shell/overlay smoke.

Если существующая проверка падает:

1. прочитай точную диагностику;
2. установи root cause;
3. усили regression test;
4. внеси системное исправление;
5. повтори матрицу.

Не объявляй команду пройденной, если она не запускалась.

## Коммиты

Рекомендуемая структура:

```text
test(shell): define common overlay and escape contract
feat(shell): replace permanent mode strip with modal menu
```

Количество коммитов не ограничено, но каждый должен быть осмысленным.

Не делай dummy commits и не переписывай опубликованные коммиты.

## Формат отчёта

Верни один из статусов:

```text
READY FOR ORCHESTRATOR
BLOCKED
FAIL
```

При готовности отчёт обязан содержать:

```text
status: READY FOR ORCHESTRATOR
foundation_sha:
branch:
previous_head:
current_head:
commits_added:
requirements_implemented:
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

Не переносить изменения в acceptance-ветку. Остановись после push рабочей ветки и отчёта.
