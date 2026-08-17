# Prompt исполнителю ЛИНЗА — правая панель Info / Attention / Memory LIVE

Ты — исполнитель **ЛИНЗА**.

В начале каждого отчёта напиши:

> Я — ЛИНЗА. Отвечаю за реальные данные правой панели: Инфо, Внимание и Память.

## Контекст

Подпроект: «Перенос Полигона из HTML-прототипа в продукт».

Плановая база:

```text
repository: AndrewVerhoturov1/Real-wargame
base_branch: real-wargame-preview
base_commit: 26e5f7f3681a4cf03e58ae7137cfe67387a1e015
suggested_feature_branch: feature/20260817-polygon-right-panel-live
```

Перед созданием ветки заново получи exact current HEAD `real-wargame-preview`.

## Главная цель

Реализовать в новом дизайне честный LIVE-слой трёх вкладок правой панели:

```text
Инфо
Внимание
Память
```

Работать строго по уже принятому `LINZA_RIGHT_PANEL_CONTRACT.md`: использовать существующих product owners, не создавать собственный runtime/history/front и не подменять отсутствующие capabilities демонстрационными данными.

## Обязательные источники

Прочитай:

- `AGENTS.md`;
- `.agents/skills/real-wargame-orchestration/SKILL.md`;
- `.agents/skills/real-wargame-performance/SKILL.md`;
- `.agents/skills/real-wargame-screenshots/SKILL.md`;
- `docs/subprojects/polygon-html-to-product/INTEGRATION_STATUS.md`;
- `docs/subprojects/polygon-html-to-product/IMPLEMENTATION_WAVE_20260817.md`;
- `docs/subprojects/polygon-html-to-product/LINZA_RIGHT_PANEL_CONTRACT.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_RIGHT_PANEL_V1.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_INTERFACE_LINKAGE_V1.md`;
- current owners/API, перечисленные в принятом LINZA contract;
- `src/combat-lab/ui/CombatLabWorkspaceTabs.ts`;
- `src/core/simulation/SimulationState.ts`;
- AttentionController/Profile/Storage;
- perception knowledge/contact owners;
- map/material/terrain/spatial owners.

## Критическая граница ревизии ЛИНЗЫ

Ранее ЛИНЗА была отклонена за создание собственных runtime-модулей. Исправленная ревизия была принята именно потому, что вернулась к contract-only границе.

Поэтому **не восстанавливай** без отдельного принятого product-Q:

```text
EstimatedFront.ts
UnitKnowledgeHistory.ts
UnitMemoryReadModel.ts
MapInfoReadModel.ts как новый owner
AttentionCommands.ts как новый параллельный command owner
AttentionReadModel.ts как новый domain owner
```

Thin presentation/read adapter допустим, новый gameplay owner — нет.

## Параллельная зависимость от ПУЛЬСА

ПУЛЬС параллельно делает общий selection/right-panel seam.

Чтобы не создавать конфликт:

- не вводи второй selection store;
- не меняй selection semantics;
- не делай `CombatLabWorkspaceTabs` владельцем Info/Attention/Memory domain data;
- проектируй свои представления как installer/adapters, принимающие `state`, `unitId/selection` и конкретные hosts извне;
- если generic right-panel host seam ПУЛЬСА ещё не появился на твоей базе, реализуй views/adapters и focused tests независимо, а финальный hook оставь для маленького integration commit после принятия ПУЛЬСА.

Не используй private DOM traversal как постоянный архитектурный контракт только ради раннего подключения.

## 1. «Инфо» LIVE

### Что показывает

`Инфо` относится к точке карты под курсором или к UI-owned закреплённой точке.

Используй настоящие owners:

- TacticalMap / cell identity;
- coordinate/cell label;
- SmoothTerrain height;
- DirectionalTerrainStaticGrid slope/direction;
- EnvironmentMaterialProfile surface/vegetation;
- real movement/passability properties;
- real object cover/protection properties;
- MapObjectSpatialIndex/local geometry query;
- units near point только через bounded policy.

### Требования

- hover info не должен делать `all units × every pointermove`;
- для объектов использовать local spatial query;
- pin точки — только presentation state;
- не записывать ничего в simulation;
- не сворачивать разные физические свойства в выдуманный общий «рейтинг», если такого owner нет;
- явно различать неизвестно/unavailable и настоящее значение 0.

## 2. «Внимание» LIVE

Настоящие owners:

```text
UnitModel.attentionSettings
UnitModel.attentionRuntime
AttentionProfileRegistry
perception subsystem
```

Показывай реально доступные:

- текущий mode;
- source режима, где важно;
- выбранный profile;
- focus direction/target;
- search center/arc;
- focus/direct/peripheral/rear parameters;
- vision range/falloff;
- реальные субъективные perception contacts.

Изменения выполняй только через существующие product functions/write paths, например подтверждённые контрактом:

```text
applyAttentionProfileToUnit(...)
setAttentionMode(...)
setSearchSector(...)
clearAttentionOverride(...)
```

Если для UI boundary нужен thin adapter, он должен только маршрутизировать к canonical функциям и делать readback. Не создавай второй attention runtime.

Запрещено пересчитывать LOS/visibility в UI.

## 3. «Память» LIVE

Источник — субъективное knowledge конкретного выбранного бойца, а не objective список врагов.

Поддерживаемый объём по принятому контракту:

- текущий подтверждённый контакт;
- прошлый/последнее известное положение;
- uncertainty/time/confidence там, где они реально существуют;
- предположения/cues, реально присутствующие в perception/tactical knowledge;
- `reported` как provenance полученных сведений.

### Estimated Front

Не рисовать предполагаемый фронт, пока у него нет отдельного принятого product owner/semantic contract.

Если HTML ожидает этот блок, корректное LIVE-поведение первой версии — честный unavailable/неподдерживаемый scope, а не вычисление из скрытых enemy positions.

## 4. HISTORY не входит

Эта задача — только LIVE.

Не создавать:

- HistoryProvider;
- snapshots;
- per-tick history recording;
- replay storage;
- fallback `HISTORY → current LIVE data`.

Когда общий HistoryProvider появится у ХРОНИСТА, эти views должны уметь принимать read-only historical projection через отдельный будущий Q.

## 5. Presentation

Сохранить новый дизайн АРКИ:

- compact right-panel layout;
- табличные/секционные данные без огромных debug dumps;
- readable labels/value hierarchy;
- linked entities в стиле Interface Linkage v1;
- active/empty/unavailable states;
- никаких fake progress bars или случайных чисел ради заполнения.

## Явно НЕ твоя зона

Не меняй:

- Unit tab и posture command — ПУЛЬС;
- selection owner — ПУЛЬС;
- map renderer/colors — КАРТА;
- unit glyph — ПЕШКА;
- editor redesign — РЕДАКТОРЫ;
- entity context menu — КОНТЕКСТ;
- HistoryProvider/replay/persistence;
- SimulationTick ради отображения панели.

## Проверки

Минимум:

1. Info canonical-owner smoke;
2. local object query/bounded pointer-path smoke;
3. Attention read + write + readback smoke;
4. Memory subjective/reported contact smoke;
5. assert forbidden LINZA runtime/history/front owners отсутствуют;
6. assert SimulationTick не получил LINZA history work;
7. TypeScript/noEmit;
8. production build;
9. risk-selected CI;
10. browser visual QA на exact final SHA либо честное `integration hook pending`, если generic host seam ПУЛЬСА ещё не принят.

## Критерии ACCEPT

- Info читает реальную карту и local prepared data;
- Attention читает и меняет только canonical owners/write paths;
- Memory субъективна и не раскрывает objective enemy truth;
- нет Estimated Front без owner;
- нет локальной HISTORY;
- нет второго selection store;
- pointer path bounded;
- presentation соответствует новому shell;
- граница интеграции с seam ПУЛЬСА явно описана.

## Возврат результата

Верни:

```text
executor: ЛИНЗА
base_commit:
feature_branch:
current_commit:
changed_files:
checks_run:
not_checked:
info_live_status:
attention_live_status:
memory_live_status:
right_panel_hook_status:
performance_impact:
forbidden_runtime_owners_present: no
history_provider_created: no
blockers:
next_integration_point: ПУЛЬС + ЛИНЗА
preview_touched: no
main_touched: no
deployment_touched: no
```

Не делай merge/transfer/deployment самостоятельно.
