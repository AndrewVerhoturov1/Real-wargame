# Soldier AI Dictionary reference

The authoritative machine-readable source is:

```text
src/core/ai/AiConceptCatalog.ts
```

The in-game and node-editor panels are generated from that source. Do not maintain a second manual list of blackboard values.

## Main live values

| Key | Russian label | Type | Status | Main source |
|---|---|---|---|---|
| `danger` | Опасность прямо сейчас | 0–100 | simplified | current threat evaluation |
| `stress` | Стресс | 0–100 | ready | behavior runtime |
| `suppression` | Подавление | 0–100 | simplified | current threat evaluation |
| `fatigue` | Усталость | 0–100 | ready | soldier condition |
| `morale` | Боевой дух | 0–100 | ready | soldier condition |
| `health` | Здоровье | 0–100 | simplified | soldier condition |
| `ammo` | Патроны | number | simplified | weapon runtime |
| `enemyVisible` | Враг виден | yes/no | simplified | active threat knowledge |
| `enemyKnown` | Враг известен | yes/no | simplified | active threat knowledge |
| `underFire` | Под огнём | yes/no | simplified | danger or suppression |
| `hasOrder` | Есть приказ | yes/no | ready | real unit order |
| `isInCover` | В укрытии | yes/no | simplified | current cover protection |
| `weaponReady` | Оружие готово | yes/no | simplified | weapon runtime and ammunition |
| `directionToThreat` | Направление на угрозу | degrees | ready | strongest threat |
| `threatDistance` | Расстояние до угрозы | metres | ready | strongest threat |
| `coverProtection` | Защита текущего укрытия | 0–100 | ready | small-arms cover evaluation |
| `currentPositionDanger` | Опасность текущей позиции по мнению бойца | 0–100 | hidden/exposed | personal awareness map |
| `routeDanger` | Опасность маршрута | 0–100 | hidden/exposed | personal awareness map |
| `threatConfidence` | Уверенность в сведениях об угрозе | 0–100 | hidden/exposed | personal threat memory |
| `best_cover_position` | Лучшая безопасная позиция | position | ready | awareness with cover fallback |

## Soldier characteristics now available to the graph

| Keys | Russian meaning | Status |
|---|---|---|
| `resilience`, `caution`, `decisiveness` | стойкость, осторожность, решительность | exposed |
| `discipline`, `initiative`, `tactics` | дисциплина, инициатива, тактика | exposed |
| `weaponSkill` | владение оружием | exposed; weapon simulation remains simplified |
| `confusion`, `attention`, `view`, `intuition` | растерянность, внимание, зрение, интуиция | exposed |
| `speed`, `stealth` | физическая подготовка, скрытность | exposed; deeper simulation coupling remains planned |
| `posture`, `behaviorProfile` | поза и профиль поведения | live reference values |

## Human workflow

### In the game

1. Select a soldier.
2. Press **Словарь ИИ** in the tactical top bar.
3. Search or filter by category and readiness.
4. Open a concept to see its live value, source, limitations and a plain-language explanation.
5. Use **Показать на карте** to activate a relevant map layer or point.
6. Use **Использовать в графе** to open the node editor and insert a preconfigured node.

### In the node editor

1. Press **Словарь ИИ** in the editor top bar.
2. Review the latest real runtime blackboard when a game evaluation exists.
3. Choose a concept and a prepared node template.
4. The new node is inserted next to the selected node and linked as its child.
5. Human selectors for numeric and boolean inputs are enhanced from the same catalog.

## AI Authoring Workbench

The **Инструменты ИИ** button in the node editor opens three human-facing tools. They use Russian by default and retain an English switch.

### Custom memory wizard

The **Своя память** tab creates safe graph-memory slots without asking the user to enter JSON or technical keys.

- The user gives the memory a Russian name and may also provide an English name.
- Supported first-version types are `number`, `boolean` and `text`.
- The technical key is generated automatically as `user_memory_N`.
- The default value is written into `blackboardDefaults`.
- Numeric memories can create a configured threshold or score node.
- Boolean memories can create a configured flag-check node.
- The new memory appears in compatible node selectors immediately.
- A memory cannot be deleted while graph nodes still reference it.

### Human graph diagnostics

The **Проверка графа** tab checks the saved graph and explains problems in ordinary language.

It reports:

- unknown AI Dictionary keys;
- recognized old aliases;
- manually entered memory that should be replaced by the wizard;
- `path_exists`, which is currently a placeholder and always succeeds;
- simplified line-of-sight and line-of-fire checks;
- simplified action executors;
- object searches that are not yet connected to the tactical host;
- target-selection rules that do not yet perform full multi-target ranking.

Clicking a diagnostic closes the workbench and selects the related graph node.

### Decision history

The **История решений** tab keeps up to 20 recent AI calculations in browser storage.

Each entry includes:

- soldier name;
- selected branch;
- human explanation;
- leading branch scores and VETO status;
- a collapsible list of blackboard values with translated dictionary labels.

This is a local authoring aid, not a permanent campaign save or army-wide telemetry database.

## Performance rule

The dictionary panel may rebuild its list after a search, filter or language change. Live simulation updates must update existing value elements instead of rebuilding the entire dialog every frame.

Decision history is capped at 20 entries. The workbench polls only the small existing debug payload and does not recalculate the awareness map.
