# C8 Frozen deterministic rerun — verification

Проверено 2026-08-16 на полном checkout ветки `feature/20260816-polygon-series-rerun`.

PASS:

- `node scripts/combat_lab_series_records_smoke.mjs`
- `node --experimental-strip-types scripts/combat_lab_series_records_behavior_smoke.ts`
- `node scripts/combat_lab_series_rerun_smoke.mjs`
- `node --experimental-strip-types scripts/combat_lab_series_rerun_behavior_smoke.ts`
- `npx tsc --noEmit`
- `npm run build`

Проверенный объём: rerun из exact frozen input + seed + runtimeVersionId + maximumSimulationSeconds, строгая проверка совместимости до запуска, сравнение eventDigest/finalStateDigest после запуска.

Это rerun/recalculation, а не recorded historical replay. Recorded replay относится к ИСТОРИКУ.
