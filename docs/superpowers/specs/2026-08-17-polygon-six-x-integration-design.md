# Polygon Six-X Integration Design

## Goal

Собрать шесть независимых результатов волны Polygon X в отдельный интеграционный кандидат, не меняя их исходные ветки, и закрыть только недостающие программные стыки перед preview deployment.

## Scope

1. Перенести в интеграционную ветку КАРТУ, ПЕШКУ, ПУЛЬС, ЛИНЗУ, РЕДАКТОРЫ и КОНТЕКСТ от общей базы `8292bf25bf241712901090fcb565dded939e7a08`.
2. Сохранить единых product owners: один Pixi runtime/map/unit renderer, один selection path, штатный command path, существующий GameEditorRegistry.
3. Подключить `PolygonRightPanelLiveView` к `CombatLabRightPanelSeam` ПУЛЬСА: `info`, `attention`, `memory` получают существующие hosts/state/selected unit context.
4. Подключить `EntityContextMenu` navigation callbacks к правой панели и существующему editor-open API без DOM-hacks и без новых runtime/store.
5. Свести все изменения `src/combat-lab/main.ts` без потери map CSS, LIVE Unit и editor shell bridge.
6. До визуальной приёмки проверять только программную целостность: TypeScript, production build и focused smoke/contract tests на объединённом SHA.

## Non-goals

- Browser/screenshot/pixel-perfect приёмка.
- Vercel deployment в рамках этой интеграционной правки.
- Реализация отсутствующих `nearby units`, `danger`, `Estimated Front`, HISTORY или новых domain capabilities.
- Рефакторинг архитектуры вне точек интеграции.

## Architecture

`CombatLabRightPanelSeam` остаётся владельцем DOM-hosts и общей selection-связки. ЛИНЗА монтируется как presentation adapter поверх этих hosts и получает данные из существующего `SimulationState`; отдельного selection controller не создаётся.

`TacticalOrderRadialInput` остаётся владельцем RMB arbitration. `EntityContextMenu` получает только callbacks `openPanel`/`openEditor`; маршруты используют существующую правую панель и `requestCombatLabGameEditorOpen`/GameEditorRegistry path.

## Acceptance

- Шесть результатов присутствуют в одном tree.
- `info/attention/memory` реально смонтированы в общий right-panel seam.
- Контекстные действия `Юнит/Инфо/Внимание/Память/Редактировать` имеют реальные owner callbacks, а не остаются disabled из-за отсутствия маршрута.
- Нет второго runtime/selection/renderer/command/editor registry.
- `npm run typecheck`, `npm run build` и соответствующие focused smoke проходят на итоговом SHA либо остаётся конкретный воспроизводимый кодовый блокер.