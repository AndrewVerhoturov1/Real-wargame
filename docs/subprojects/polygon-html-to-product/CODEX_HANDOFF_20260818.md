# Handoff Кодексу — Полигон / Редакторы после visual-parity волны

Дата: 2026-08-18

## 1. Назначение документа

Пользователь завершил текущую Web Chat-волну по переносу визуального слоя раздела **«Редакторы»** из принятого HTML-прототипа в продукт и передаёт дальнейшую доработку Кодексу.

Этот документ — текущая точка входа для следующей сессии. Исторические six-X/checkpoint документы остаются полезным контекстом, но при конфликте формулировок этот handoff имеет приоритет для состояния редакторов на 2026-08-18.

## Дополнение: «Профили маршрута» после локального pixel-parity прохода

После ранее опубликованного snapshot `f695c9b1...` в текущей feature-ветке добавлен локальный product commit:

```text
c30a2bfb3ec24322b384ee192c2c16b84fe45f64
```

Он не опубликован и не перенесён в preview. Для `Профили маршрута → Осторожный → Основное` перенесены точная DOM-композиция и CSS утверждённого HTML: профильная колонка, шапка, вкладки, резюме, четыре карточки, компактное ограничение обхода, metadata-grid и нижняя полоса.

Настоящий `maximumDetourRatio` остаётся единственным источником значения: визуальный ввод процентов синхронизирован с тем же диапазоном и числовым полем. Встроенный браузер подтвердил `50% → 55% → 50%` и выбор настоящих профилей.

Не выдавать за готовую продуктовую возможность счётчики `Бойцы / Программа / Лаборатория`: пока это visual-only оболочка с нулевыми значениями, поскольку owner/read-model связей отсутствует. Исключение `Типы поверхностей = НЕДОСТУПНО` остаётся принятым пользователем.

## 2. Точная идентичность результата

```text
repository: AndrewVerhoturov1/Real-wargame
base_branch: real-wargame-preview
base_commit: bd25f5debc312db7021b1515a525697ad248fff1
feature_branch: feat/20260817-polygon-editors-visual-parity
product_implementation_sha: f695c9b1c035340de319e769b2ada4c993d2b83b
```

`product_implementation_sha` — точный продуктовый snapshot, который прошёл финальные проверки и был опубликован в Vercel.

После этого SHA документация может добавлять docs-only commits на ту же feature-ветку. Поэтому Кодекс при старте обязан заново получить remote HEAD ветки и отдельно помнить, что проверенный/опубликованный product snapshot — `f695c9b1...`.

## 3. Опубликованный Preview

```text
Vercel project: repo
project_id: prj_oYeFUOItTdUkzawQT99c1WcUvBss
team_id: team_OghO4H75wJnpy5zyfySmPuSS
deployment_id: dpl_5LcLrP6Me3RVCQ7ibQavpJRstXYF
preview_root: https://repo-mb33ew0x4-111s-projects-807221af.vercel.app/
polygon: https://repo-mb33ew0x4-111s-projects-807221af.vercel.app/combat-lab.html
```

Deployment выполнен штатным для репозитория emergency exact-source fallback из:

`.agents/skills/real-wargame-manual-vercel-deploy/SKILL.md`

Vercel build сам клонировал `feat/20260817-polygon-editors-visual-parity`, проверил `git rev-parse HEAD` и подтвердил:

```text
Verified deployment source: feat/20260817-polygon-editors-visual-parity @ f695c9b1c035340de319e769b2ada4c993d2b83b
```

## 4. Проверки exact product snapshot

Для `f695c9b1c035340de319e769b2ada4c993d2b83b` подтверждено:

- `npm run verify:preview` — **31/31 isolated checks passed**;
- TypeScript — passed;
- production `vite build` — passed;
- `verify:deployment-pages` — passed;
- опубликованные `/`, `/ai-node-editor.html`, `/combat-lab.html` — HTTP 200;
- опубликованный `/deployment-source.json`:
  - `ref = feat/20260817-polygon-editors-visual-parity`;
  - `sourceSha = f695c9b1c035340de319e769b2ada4c993d2b83b`;
  - `verificationStatus = passed`;
  - `skippedChecks = []`.

Финальный browser QA:

```text
GitHub Actions run: 32088591178
browser: system Google Chrome
viewport: 1440x900
result: SUCCESS
```

Проверено:

- все 11 состояний навигации редакторов;
- aligned состояние `Линейный пехотинец`;
- aligned состояние `Оружие / ППШ-41`;
- каждый parity-node с `[hidden]` действительно имеет `display:none`;
- вкладки Архетипов и Ранений остаются компактными и не забирают flexible owner-grid;
- Perception flow остаётся компактным и не забирает flexible owner-grid;
- 0 console errors;
- 0 page errors;
- 0 failed requests.

Временные validation/audit PR закрыты **без merge**:

```text
#311 — product validation
#312 — exact local visual audit
```

## 5. Что изменено в product code относительно базы

Feature-ветка содержит presentation/parity работу вокруг существующих authoritative editors. Основные файлы:

```text
src/combat-lab/game-editors/CombatLabGameEditors.ts
src/combat-lab/game-editors/PolygonGlobalEditorParity.ts
src/combat-lab/game-editors/combat-lab-game-editors.css
src/combat-lab/game-editors/polygon-global-editor-feature-grid.css
src/combat-lab/game-editors/polygon-global-editor-wave3.css
```

Также на ветке есть execution-plan:

```text
docs/superpowers/plans/2026-08-18-polygon-editors-visual-parity-wave-2.md
```

Ключевой архитектурный принцип результата:

> HTML-прототип определяет внешний вид и композицию; продуктовые owners определяют реальные данные, команды, persistence и readback.

Ни один новый gameplay truth/registry/owner для подгонки картинки не создавался.

## 6. Принятый набор редакторов в навигации

В разделе «Редакторы» Полигона остаются ровно 11 принятых пунктов:

### Поведение

1. Профили маршрута
2. Тактические позиции

### Боец

3. Архетипы бойцов
4. Профили внимания
5. Профили восприятия
6. Профили движения

### Бой

7. Вооружение
8. Ранения и подавление

### Мир

9. Типы поверхностей
10. Профили местности
11. Направленный рельеф

`Данные бойца` и `Граф поведения` **не должны появляться в этой навигации**. Их код/редакторы не удаляются; они просто не являются пунктами принятого меню Полигона.

## 7. Что текущая волна реально закрыла

### Общая оболочка

- внешний modal/shell приведён к геометрии принятого HTML;
- исправлен старый внутренний inset от `.combat-lab-tab-panel`;
- навигация вернулась к принятой ширине/плотности;
- secondary mode label `Встроенный редактор` убран из визуального первого плана;
- унифицированы tabs, summary cards, forms и footer presentation;
- устранён CSS-конфликт, при котором owner `display:grid !important` визуально отменял `[hidden]`.

### Тактические позиции

Overview summary строится из настоящих owner-полей:

- `defaultObjective`;
- `standingMaximumDanger`;
- `crouchedMaximumDanger`;
- `safetyWeight`.

### Профили движения

Summary использует настоящие значения owner-а, включая speed/stamina/noise/fire-while-moving. Параллельного состояния не создано.

### Вооружение

Добавлен presentation-слой поверх существующего owner-а:

- live summary;
- внутренние presentation-tabs `Основное / Огонь / Точность / Перезарядка / Использование / Демаскировка`;
- tabs только фильтруют/компонуют существующие authoritative sections.

### Архетипы бойцов / Ранения и подавление

Исправлена структура gameplay-tuning grid:

```text
heading / tabs / summary / fields(1fr) / savebar
```

Вкладки больше не растягиваются на сотни пикселей, а owner fields сохраняют рабочую flexible-область.

### Профили восприятия

Исправлена структура grid:

```text
heading / flow(auto) / fields(1fr) / savebar
```

Flow больше не забирает `1fr` у настоящих полей.

### Направленный рельеф

Статические псевдодиаграммы, которые могли выглядеть как реальные owner-driven данные, не используются как финальная визуализация.

## 8. Статус каждого из 11 редакторов

| Редактор | Текущий статус после волны | Следующий смысловой шаг |
|---|---|---|
| Профили маршрута | presentation существенно сближен с прототипом | дальнейшая визуальная полировка только на live product values; не подменять отличающиеся числовые значения прототипом |
| Тактические позиции | live summary подключён | при необходимости дальше убирать технический шум, не пряча обязательные owner-команды |
| Архетипы бойцов | tabs/summary/grid исправлены | доводить accepted summary-карточки из существующих live fields |
| Профили внимания | presentation уплотнён, hidden-identity работает | довести accepted 2-column parameter layout; reset только через реальную owner-команду |
| Профили восприятия | flow/grid исправлены | дальнейшие slider/reset улучшения только при сохранении одного owner-state |
| Профили движения | live summary подключён | визуальная полировка accepted compact form |
| Вооружение | live summary + presentation-tabs | продолжить перенос принятого catalogue/header/actions, сохраняя registry/revision owner semantics |
| Ранения и подавление | tabs/summary/grid исправлены | довести semantic overview, raw controls держать в профильных tabs |
| Типы поверхностей | **BLOCKED / НЕДОСТУПНО** | нужен настоящий standalone product owner + persistence/read/write/references |
| Профили местности | **PARTIAL / owner semantic gap** | проверить/создать корректный aggregate Environment Profile read-model/owner presentation; текущий nested material UI не равен прототипному агрегату |
| Направленный рельеф | **PARTIAL** | live silhouette + 8-sector diagram только из authoritative owner values; не рисовать статическую fake-графику |

## 9. Жёсткие границы для следующей доработки

Кодексу нельзя «закрывать» визуальные пробелы ценой второй продуктовой истины.

Запрещено без отдельного архитектурного решения:

- fake Journal / fake telemetry / synthetic Series;
- fake Surface Types registry;
- перенос prototype `localStorage` architecture в продукт;
- hardcoded gameplay values только ради совпадения со screenshot;
- второй selection store;
- второй map/runtime/editor owner;
- прямое изменение `UnitModel` из UI вместо штатной команды;
- статическая directional-terrain картинка, выдаваемая за live данные;
- удаление настоящих служебных owner-полей только потому, что их нет на Overview прототипа — допустимо переносить их в служебный/management presentation.

## 10. Что считать известными blocker/dependency, а не CSS-задачей

### Surface Types

В текущем product catalogue отдельного authoritative owner-а нет. Пункт должен оставаться честно unavailable, пока capability не реализована.

Прототипная static registry/storage логика не является допустимым product owner-ом.

### Environment Profiles

Прототип показывает aggregate environment profile, а текущий product UI во многих состояниях работает через вложенный material/environment контекст. Если агрегированного read-model нет, это product-owner/read-model задача, а не CSS-перестановка.

### Directional Terrain

Accepted silhouette и radial 8-sector diagram должны строиться из настоящих значений. Если текущий owner не предоставляет достаточный read-model, сначала расширяется product capability, затем presentation.

### Reset / synchronized slider + number

Допустимо добавлять только если это та же authoritative field/command path. Нельзя создавать параллельное локальное состояние, которое расходится с owner.

## 11. Рекомендуемый порядок работы Кодекса

1. Получить свежий remote HEAD `real-wargame-preview` и feature-ветки; не предполагать, что HEAD всё ещё равен product SHA из этого документа.
2. Прочитать:
   - этот handoff;
   - `INTEGRATION_STATUS.md`;
   - `ELEMENT_MIGRATION_WORKFLOW.md`;
   - `CHECKPOINT_20260817_APPROACH_RESET.md` как исторический контекст;
   - `.agents/skills/real-wargame-orchestration/SKILL.md`;
   - `.agents/skills/real-wargame-screenshots/SKILL.md`;
   - `.agents/skills/real-wargame-manual-vercel-deploy/SKILL.md`.
3. Сначала провести собственный screenshot review текущего опубликованного Preview против принятого HTML-прототипа.
4. Разделить замечания на:
   - CSS/DOM presentation;
   - presentation-adapter на существующих live owners;
   - owner/read-model dependency;
   - отсутствующую product capability.
5. Дорабатывать существующую feature-ветку либо создать следующую ветку по правилам оркестрации — решение принять после проверки актуальной remote базы.
6. `Surface Types` вести отдельной функциональной задачей, не маскировать visual-only патчем.
7. Для Environment и Directional Terrain сначала доказать owner/read-model контракт, затем рисовать accepted presentation.
8. После каждой содержательной волны: TypeScript + `verify:preview` + production build + fresh screenshot QA exact SHA.
9. Deploy — только по отдельному явному запросу пользователя.
10. Transfer/merge в `real-wargame-preview` — только после отдельного пользовательского GO.

## 12. Что уже не нужно повторять

Не требуется заново:

- доказывать существование базового editor registry;
- строить новый editor runtime;
- создавать новый selection store;
- переносить HTML как standalone приложение;
- повторять старую six-X интеграцию;
- считать старый checkpoint окончательным визуальным ориентиром.

Нужно продолжать именно **поэлементный перенос принятого HTML presentation поверх настоящего product runtime**.

## 13. Связанные документы

```text
docs/subprojects/polygon-html-to-product/INTEGRATION_STATUS.md
docs/subprojects/polygon-html-to-product/ELEMENT_MIGRATION_WORKFLOW.md
docs/subprojects/polygon-html-to-product/CHECKPOINT_20260817_APPROACH_RESET.md
docs/subprojects/polygon-html-to-product/IMPLEMENTATION_WAVE_20260817.md
docs/subprojects/polygon-html-to-product/ORCHESTRATOR_HANDOFF_20260817.md
docs/superpowers/plans/2026-08-18-polygon-editors-visual-parity-wave-2.md
```

## 14. Handoff summary

```text
product snapshot verified and deployed:
f695c9b1c035340de319e769b2ada4c993d2b83b

preview:
https://repo-mb33ew0x4-111s-projects-807221af.vercel.app/combat-lab.html

browser audit:
32088591178 — SUCCESS

next owner:
Codex

main remaining hard blockers:
- real Surface Types owner
- Environment aggregate owner/read-model parity
- live Directional Terrain diagrams/read-model

transfer_to_preview:
NOT AUTHORIZED by this handoff

main:
DO NOT TOUCH
```
