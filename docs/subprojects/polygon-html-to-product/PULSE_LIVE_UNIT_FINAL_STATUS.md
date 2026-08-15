# ПУЛЬС — финальный статус реализации LIVE Unit

Дата: 2026-08-16.

Этот файл является пост-реализационным дополнением к:

- `PULSE_LIVE_UNIT_CONTRACT.md` — исследовательский контракт и self-check planned scope;
- `PULSE_LIVE_UNIT_IMPLEMENTATION_REPORT.md` — подробный отчёт реализации.

Если статус ниже отличается от статуса `частично` в исследовательском контракте, для ветки реализации действует **этот пост-реализационный статус**. Сам исходный контракт сохранён как доказательство того, какие gaps существовали до кодовой работы.

## Идентичность

```text
executor_name: ПУЛЬС
base_branch: real-wargame-preview
base_commit: 1246e1d612e648e7d7378db1c02be3bbf3d2a16a
feature_branch: feature/20260816-polygon-live-unit-complete
arka_source_commit: 59a255d4e4fca86a6b1fb8c8765e3b979e28f7fc
pulse_contract_commit: aa7965ca06df12453466a5f03efc723318b94e44
implementation_code_commit: 6eeaa85f7da0f10106865215cef25c62b40554aa
verification_contract_fix_commit: 934c95cb6f67c865cb04fe589bace736194314a7
```

## Planned scope: итог после кодовой работы

| Функция | Пост-реализационный статус | Примечание |
|---|---|---|
| карта → настоящий selected unit | **реализовано существующим owner** | `SimulationState.selectedUnitId` / `getSelectedUnit` |
| одна identity карты и Right Panel | **реализовано** | второго selected-unit store нет |
| полная LIVE-карточка `Юнит` | **реализовано в feature-ветке** | реальные UnitModel/combat/physiology owners |
| здоровье / мораль / подавление / усталость | **реализовано в feature-ветке** | без demo values |
| ранения / тело / кровотечение | **реализовано в feature-ветке** | infantry combat wound/physiology runtime |
| поза | **реализовано в feature-ветке** | фактический readback из UnitModel |
| `стоя / пригнувшись / лёжа` | **реализовано в feature-ветке** | только `CombatLabVisualSession.executeInteractive` |
| command accepted/rejected + причина | **реализовано в feature-ветке** | `CombatLabCommandResultV1` |
| `Приказ игрока` отдельно | **реализовано в feature-ветке** | `UnitModel.playerCommand` |
| `Действие сейчас` отдельно | **реализовано в feature-ветке** | единый read-only presentation resolver |
| оружие | **реализовано в feature-ветке** | `infantryCombatRuntime.primaryWeapon` |
| боекомплект | **реализовано в feature-ветке** | rounds in weapon + real ammo inventory |
| готовность оружия | **реализовано в feature-ветке** | единый read-only readiness resolver |
| secondary/collapsible сведения | **реализовано в feature-ветке** | UI-owned `<details>` |
| роль отдельно от архетипа | **реализовано в feature-ветке** | role из experiment draft, archetype из UnitModel |
| authoritative profile links | **реализовано в feature-ветке** | existing GameEditorLinks / GameEditorRegistry path |
| отсутствие synthetic fallback weapon | **реализовано в feature-ветке** | `primaryWeapon === null` отображается как `Нет оружия` |
| stale selection после reset/new run | **архитектурно закрыто в коде** | каждый refresh повторно вызывает `getSelectedUnit(state)` |
| HISTORY `Юнит` на `viewTime` | **не реализовано: внешний blocker** | нужен history provider ХРОНИСТА; fake history запрещён |
| полный Unit Editor authoring/LIVE | **отдельная product-задача, не gap текущего Right Panel write-scope** | текущий инспектор намеренно не превращён в direct runtime editor |
| `Инфо / Внимание / Память` | **не зона ПУЛЬСА** | ЛИНЗА |

## Verification status

Код и тестовые entrypoints записаны в GitHub, но текущая среда не имеет локального checkout репозитория. Прямой доступ контейнера к GitHub блокируется DNS; GitHub connector не исполняет Node/npm.

Поэтому до получения реального exit code **нельзя считать ветку прошедшей executable verification**.

Обязательный gate:

```text
node scripts/combat_lab_live_unit_verify.mjs
npx tsc --noEmit
npm run build
browser / visual QA нового Right Panel
```

На текущем remote commit GitHub external status checks и workflow runs отсутствуют, то есть CI не заменяет этот gate.

## Handoff

```text
result: LIVE Unit implementation is present on the feature branch; executable verification is still required
next_merge_point: АРКА + ПУЛЬС → LIVE Unit acceptance
history_dependency: ХРОНИСТ → history provider → ПУЛЬС historical Unit read-only integration
preview_touched: no
main_touched: no
deployment_touched: no
pr_created: no
```
