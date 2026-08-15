# C7 Series analysis — verification

Проверено 2026-08-16 на полном checkout ветки `feature/20260816-polygon-series-analysis`.

PASS:

- `node scripts/combat_lab_series_records_smoke.mjs`
- `node --experimental-strip-types scripts/combat_lab_series_records_behavior_smoke.ts`
- `node scripts/combat_lab_series_analysis_smoke.mjs`
- `node --experimental-strip-types scripts/combat_lab_series_analysis_behavior_smoke.ts`
- `npx tsc --noEmit`
- `npm run build`

Проверенный объём: все RunRecord, фильтры, распределения `bucket → RunIds`, summary и детерминированные IQR-outliers с объяснимой причиной.

History/viewTime в C7 не входят.
