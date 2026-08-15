# C10 CHRONIST non-History linkage — verification

Проверено 2026-08-16 на полном checkout ветки `feature/20260816-polygon-chronist-linkage`.

PASS:

- объединённые smoke/behavior tests C1–C9;
- `node scripts/combat_lab_chronist_linkage_smoke.mjs`;
- `node --experimental-strip-types scripts/combat_lab_chronist_linkage_behavior_smoke.ts`;
- `npm run combat-lab-experiment:smoke`;
- `npx tsc --noEmit`;
- `npm run build`.

Проверенный объём C10:

- Metrics telemetry связывается с существующим LIVE Journal event по реальному shot/impact ID;
- связанная Метрика добавляется в существующее обязательное событие, а не создаёт дубликат;
- unmatched telemetry может стать отдельным metrics-only T3 event;
- ProgramStepRef → JournalEventIds;
- frozen Series measurement snapshot → стабильная ссылка обратно к MeasurementDefinition;
- C1–C9 совместно компилируются и собираются в одной ветке.

History/viewTime/global timeline/recorded historical replay в C10 не входят и остаются зоной ИСТОРИКА.
