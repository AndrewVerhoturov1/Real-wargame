# Handoff оркестратору — функциональная волна редакторов Полигона 2026-08-18

## Практический порядок

Три новых исполнителя:

```text
СТЫК    = подключение уже готовых product mechanisms
КУЗНЕЦ  = реальные product gaps; сейчас planning-only
ПОЧВА   = концепция новой capability «Типы поверхностей»
```

Канонический общий документ:

`docs/subprojects/polygon-html-to-product/EDITORS_FUNCTIONAL_WAVE_20260818.md`

## Planning base

```text
repository: AndrewVerhoturov1/Real-wargame
base_branch: real-wargame-preview
planning_base_commit: bd25f5debc312db7021b1515a525697ad248fff1
planning_base_tree: 7dd8f092da7ae78eb41aac6c1d6edb71bebe4a9f
prototype_artifact: polygon-series-v1.1-memory-v3-interface-linkage(1).html
prototype_version: polygon-map-editor-unified-v44-infantry-integrated-20260815-memory-v3-interface-linkage-v1
```

Перед любым новым кодовым стартом заново разрешить exact current `real-wargame-preview` HEAD.

## Параллельная visual line

На момент подготовки:

```text
branch: feat/20260817-polygon-editors-visual-parity
candidate_commit: 13a70b76bd5087b87c0767970eb378ba192a1b49
scope: presentation-only CSS
```

Из мини-отчёта visual executor:

- `npm run verify:preview` ещё нельзя считать пройденным;
- post-change browser/screenshots ещё нельзя считать пройденными;
- Surface Types честно unavailable, потому что product owner отсутствует.

Оркестратор сначала завершает независимую проверку visual candidate. Если он изменится, использовать финальный exact accepted SHA, а не старый `13a70b76...`.

## Что можно запускать прямо сейчас

### КУЗНЕЦ — только фаза A

Prompt:

`docs/subprojects/polygon-html-to-product/prompts/08_KUZNETS_EDITOR_GAPS.md`

Разрешено:

- читать продукт/прототип;
- классифицировать все 11 редакторов;
- создать только `KUZNETS_EDITOR_GAPS_PLAN.md`.

Запрещено:

- product code;
- CSS;
- schemas/runtime;
- interface marking;
- merge/deploy.

После planning result — остановить исполнителя до результата СТЫКА и нового GO.

### ПОЧВА — этап 1

Prompt:

`docs/subprojects/polygon-html-to-product/prompts/09_POCHVA_SURFACE_TYPES_CONCEPT.md`

Разрешено:

- read-only исследование;
- обсуждение 2–3 архитектурных вариантов с пользователем;
- формирование рекомендуемой концепции.

На этапе 1 `changed_files: none`.

До `КОНЦЕПЦИЯ УТВЕРЖДЕНА` product code и даже канонический concept MD не писать.

## Что пока НЕ запускать в код

### СТЫК

Prompt:

`docs/subprojects/polygon-html-to-product/prompts/07_STYK_EDITOR_BINDING.md`

СТЫК стартует только когда exact accepted visual base определён одним из способов:

1. visual result уже transfer в актуальный preview; или
2. оркестратор явно разрешил stacked branch от exact accepted visual SHA.

Не создавать branch СТЫКА автоматически от planning base, если это приведёт к работе поверх старого presentation.

## Порядок после visual acceptance

```text
accepted visual SHA
→ СТЫК implementation
→ независимая проверка exact STYK SHA
→ пользовательский просмотр/GO по необходимости
→ новый base decision
→ отдельный GO КУЗНЕЦУ на фазу B
→ КУЗНЕЦ implementation
```

ПОЧВА идёт своей веткой решений:

```text
read-only research
→ обсуждение с пользователем
→ КОНЦЕПЦИЯ УТВЕРЖДЕНА
→ concept + implementation plan docs
→ отдельный GO на Surface Types product code
```

## Три route runtime mechanics

Не путать с текущим editor implementation:

```text
exposureWeight
enemyDistanceWeight
territoryWeights.friendly / neutral / enemy
```

Текущий scope:

- runtime не реализовывать;
- КУЗНЕЦ в будущей фазе B только маркирует их UI как `не подготовлено / пока не работает`;
- будущую механику раздать отдельными задачами позже.

## Главный source priority

```text
явное решение пользователя
> принятый HTML-прототип
> product architecture как способ реализации
> старое product behavior
```

Запрещено оставлять конфликтующее старое поведение только потому, что оно уже есть.

## Чего не объединять

- Surface Types != Environment Profiles.
- Visual parity != functional binding.
- Binding existing operation != product gap implementation.
- Поле в schema != доказанная работающая runtime capability.
- UI fake effect != implementation.

## Expected reports

### СТЫК

```text
executor: СТЫК
base_commit:
visual_base_commit:
feature_branch:
current_commit:
changed_files:
ready_bindings:
product_gaps_for_kuznets:
surface_types_status:
route_deferred_runtime_status:
checks_run:
not_checked:
preview_touched: no
main_touched: no
deployment_touched: no
```

### КУЗНЕЦ, фаза A

```text
executor: КУЗНЕЦ
phase: A / planning-only
base_commit:
feature_branch:
current_commit:
changed_files:
binding_only_count:
product_gap_count:
deferred_route_runtime:
surface_types_dependency:
unknown_or_blocked:
product_code_changed: no
next_gate: wait for STYK exact result + user GO
```

### ПОЧВА, этап 1

```text
executor: ПОЧВА
phase: 1 / concept discussion
base_commit:
changed_files: none
product_owner_status:
runtime_gaps:
architecture_options:
recommended_option:
user_decisions_needed:
next_gate: КОНЦЕПЦИЯ УТВЕРЖДЕНА
```

## Запреты оркестратору

Без отдельного пользовательского разрешения:

- не transfer в `real-wargame-preview`;
- не менять `main`;
- не merge;
- не deploy;
- не превращать KUZNETS phase A в implementation;
- не поручать СТЫКУ Surface Types;
- не поручать ПОЧВЕ код до двух пользовательских gates.
