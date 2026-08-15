# C6 Series/Run records — verification

Проверено 2026-08-16 на полном checkout ветки `feature/20260816-polygon-series-records`.

PASS:

- `node scripts/combat_lab_series_records_smoke.mjs`
- `node --experimental-strip-types scripts/combat_lab_series_records_behavior_smoke.ts`
- `node scripts/combat_lab_series_archive_file_actions_smoke.mjs`
- `npx tsc --noEmit`
- `npm run build`

Проверенный объём: versioned SeriesRecord/RunRecord, frozen input/runtime/measurement provenance, seed и maximumSimulationSeconds каждого Run, archive digest/validation, file import/export.

History/viewTime/recorded historical replay в C6 не входят.
