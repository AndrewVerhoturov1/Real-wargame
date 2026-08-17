# КАРТА — отчёт о реализации живой поверхности Полигона

Дата: 2026-08-17  
REQUEST_ID: `XROUTE-20260817-POLYGON-MAP-SURFACE-001`

## Итог

Направление **КАРТА** завершило отдельную реализацию центральной игровой поверхности нового Полигона.

Вместо CSS-placeholder новый shell теперь показывает существующий product-owned Pixi canvas. Новый renderer, новый map runtime, новый selection store и второе состояние карты не создавались.

Финальный проверенный кандидат:

```text
repository: AndrewVerhoturov1/Real-wargame
base branch: real-wargame-preview
base SHA: 8292bf25bf241712901090fcb565dded939e7a08
feature branch: feature/20260817-polygon-map-surface-x
final exact SHA: 74d476992c002cebca5c8c9e5de3336c338355ec
PR: #283
PR URL: https://github.com/AndrewVerhoturov1/Real-wargame/pull/283
product commits in feature branch: 1
product files changed: 2
```

На момент этого отчёта этот SHA **не перенесён в `real-wargame-preview` и не задеплоен**.

## Что было до задачи

Принятый exact-shell АРКИ уже создавал новую оболочку Полигона, но намеренно скрывал настоящий Pixi canvas и оставлял в центре декоративный placeholder.

При этом настоящий product renderer уже существовал в штатной цепочке:

```text
GameApplication
→ PixiTacticalBoardApp
→ PixiMapRenderer
→ TacticalMap / overlays / objects / units
```

Поэтому задача КАРТЫ была не в создании нового rendering subsystem, а в корректной интеграции уже работающей продуктовой карты в новый shell.

## Изменённые product-файлы

### `src/combat-lab/main.ts`

Добавлен только импорт отдельного integration-style слоя:

```text
./polygon-map-surface.css
```

Runtime-инициализация Combat Lab, `GameApplication`, map renderer и simulation owners не переписывались.

### `src/combat-lab/polygon-map-surface.css`

Создан отдельный CSS integration layer для нового shell.

Он делает следующее:

1. Показывает реальный `#app canvas`, который ранее скрывался exact-shell стилями.
2. Полностью убирает старый `.polygon-shell-map-placeholder`.
3. Делает центральный `.polygon-shell-viewport` прозрачным, чтобы под новым shell была видна настоящая карта.
4. Размещает `#app` в центральном поле между левой и правой панелями.
5. Ограничивает размер карты одновременно доступной шириной и высотой окна:

```text
map size = min(available width, available height)
```

Это сохраняет квадратную поверхность и не позволяет ей вылезать за viewport.
6. Использует существующие shell tokens (`panel width`, `collapsed width`, `panel gap`, `topbar`, `history`) вместо отдельной геометрической системы.
7. При collapse левой или правой панели автоматически освобождает соответствующее место реальной карте.
8. Возвращает видимость canvas без изменения самого `PixiMapRenderer`.
9. Привязывает `.html-map-overlay` к рамке карты через `position: absolute`, чтобы HTML-подписи использовали ту же локальную область, что и canvas.
10. Скрывает старый fixed debug-scale label, который относится к прежнему full-screen HUD и выходил бы за новую рамку карты.
11. Нейтрализует у корневого Polygon shell унаследованный `backdrop-filter`, который относился к старому Combat Lab drawer и размывал живую карту.

## Сохранённые product owners

КАРТА не меняла следующие зоны:

- `PixiMapRenderer`;
- `PixiUnitRenderer`;
- `CameraController`;
- `BoardInputController`;
- tactical right-button controls;
- map selection state;
- `UnitModel`;
- simulation state;
- gameplay commands;
- map revision cache;
- product map data;
- редакторы;
- данные ПУЛЬСА и ЛИНЗЫ.

Таким образом, существующие pan/zoom/selection/grid/overlays/objects продолжают обслуживаться штатным product runtime, а не UI shell.

## Что обнаружила независимая проверка и что было исправлено

Первый вариант интеграции был недостаточно устойчивым. Remote visual QA выявил несколько реальных проблем, после чего product commit был пересобран до финального exact SHA.

### 1. Карта выходила за viewport после collapse

Первоначально размер центральной карты определялся преимущественно горизонтальным свободным местом.

На `1600×900` после collapse левой панели карта могла вырасти примерно до `1121×1121` и уйти за верхнюю границу окна.

Исправление:

- введены вычисляемые left/right edges;
- размер карты ограничен одновременно доступной шириной и доступной высотой;
- позиционирование переведено на реальные top/right/bottom/left shell boundaries;
- `transform` больше не используется для вертикального центрирования.

### 2. Живая Pixi-карта была визуально размытой

Canvas backing size и его CSS-размер совпадали, поэтому причина не была в растягивании WebGL canvas.

Диагностика показала, что новый `.polygon-shell` сохранил compatibility-класс старого `.combat-lab-dock`, от которого наследовался:

```text
backdrop-filter: blur(7px)
```

Full-screen shell находился поверх product canvas и размывал его целиком.

Исправление:

```text
backdrop-filter: none
-webkit-backdrop-filter: none
```

нейтрализованы только на корневом новом Polygon shell. Панели и их собственные визуальные эффекты не переписывались.

### 3. HTML-подписи могли отделяться от карты

`HtmlOverlayRenderer` рассчитывает подписи в координатах map root, но старый общий CSS использовал `position: fixed`, что было корректно для full-screen карты.

После переноса карты в центральную рамку это могло увести подписи относительно canvas и под соседние панели.

Исправление:

```text
#app .html-map-overlay
→ position: absolute
→ inset: 0
→ width/height: 100%
→ overflow: hidden
```

Теперь canvas и HTML overlay используют одну и ту же рамку.

## Проверка exact SHA

Для проверки использовался временный remote GitHub Actions harness, потому что рабочая среда исполнителя не могла получить полноценный локальный checkout через `git clone`.

Harness всегда checkout'ил **сам product exact SHA**, а не CI-коммит.

Финальный visual/technical run:

```text
GitHub Actions run: 31992089286
name: XRoute Map Surface Final Sharp Verification
conclusion: success
verified product SHA: 74d476992c002cebca5c8c9e5de3336c338355ec
```

Проверено:

- exact product SHA;
- exact parent/base;
- один product commit;
- scope product diff;
- `npm ci`;
- TypeScript / `tsc --noEmit`;
- production build;
- map revision smoke;
- map grid LOD smoke;
- live browser launch;
- наличие реального `PixiMapRenderer`;
- наличие product units / `PixiUnitRenderer`;
- canvas backing size против client size;
- canvas/HTML-overlay containment;
- отсутствие root `backdrop-filter`;
- console errors;
- page errors;
- failed requests.

## Browser visual QA

Финальные screenshots были не только автоматически созданы, но и просмотрены вручную.

Проверялись состояния:

```text
1600×900 — обе панели открыты, grid off
1600×900 — grid on
1600×900 — левая панель collapsed
1600×900 — zoom in/out
1600×900 — pan
1080×800 — обе панели открыты
1080×800 — правая панель collapsed
```

Финальное наблюдение:

- живая карта резкая;
- сетка резкая;
- HTML labels остаются внутри map frame;
- collapse действительно отдаёт освободившуюся площадь настоящей карте;
- zoom меняет продуктовую map view;
- canvas не выходит за окно;
- на `1080×800` при двух открытых панелях центральная карта закономерно мала из-за принятой shell-геометрии, после collapse заметно расширяется.

Pixel-perfect соответствие HTML-прототипу **не заявляется**: product map показывает настоящие игровые данные, а HTML reference использует демонстрационную prototype scene. Проверялось соответствие принятой геометрии/композиции shell и корректность интеграции живой карты.

## Baseline / stale smoke contracts

Во время проверки выявлены несколько старых smoke-контрактов, которые не отражают текущий product state и воспроизводятся независимо от КАРТЫ.

В частности, `combat_lab_workspace_layout_smoke.mjs` на baseline `8292bf25...` ожидает список скоростей:

```text
[0.1, 0.25, 0.5, 1, 2, 4, 10]
```

в то время как сам baseline product уже содержит:

```text
[0.1, 0.25, 0.5, 1, 2, 5, 10]
```

Это stale test contract и не является регрессией КАРТЫ.

Ранее также были воспроизведены на baseline старые ожидания Combat Lab UI (`combat-lab-drawer`, вкладка `Настройка игры`). Они должны корректироваться владельцем соответствующего test contract отдельно, а не изменением map integration.

## Performance impact

Реализация КАРТЫ не добавляет новый renderer и не меняет per-frame rendering path.

Нет:

- второго canvas/runtime;
- второго map state;
- нового per-frame DOM→Pixi sync;
- пересоздания terrain/map по кадрам;
- изменений `PixiMapRenderer` cache strategy;
- вычисления LOS или gameplay logic в UI.

Изменения ограничены shell/layout integration и существующим resize behaviour приложения.

## Границы дальнейшей интеграции

Следующая общая точка интеграции:

```text
КАРТА + ПЕШКА + ПУЛЬС
```

где:

- КАРТА даёт настоящую поверхность map renderer;
- ПЕШКА владеет новым визуальным языком бойца и LOD в `PixiUnitRenderer`;
- ПУЛЬС владеет живой цепочкой selection → unitId → UnitModel → правый `Юнит` → command → readback.

КАРТА не должна принимать ownership этих областей в дальнейших правках.

## Deployment / transfer status

На момент этого отчёта:

```text
transfer to real-wargame-preview: NOT DONE
deployment: NOT DONE
merge: NOT DONE
auto-merge: NOT ENABLED
main: NOT TOUCHED
```

После отдельного запроса на deployment была запущена проверочная deployment-процедура, но canonical `verify:preview` остановил её **до Vercel publication** на доказанном stale baseline smoke contract. Позднее пользователь явно отменил deployment; последующие workflow-попытки также не дошли до Vercel publication.

Следовательно, существующий финальный SHA `74d476992c002cebca5c8c9e5de3336c338355ec` остаётся только проверенным feature-кандидатом в PR #283.

## Краткий статус

```text
КАРТА product implementation: READY
final exact SHA: 74d476992c002cebca5c8c9e5de3336c338355ec
PR: #283
live Pixi surface inside Polygon shell: READY
responsive map frame: READY
left/right collapse integration: READY
zoom/pan/grid preservation: VERIFIED
HTML overlay containment: VERIFIED
root blur regression: FIXED AND VERIFIED
product owner boundaries: PRESERVED
transfer: NOT DONE
deployment: NOT DONE
blockers for code candidate: NONE
```
