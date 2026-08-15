# C9 Full ExperimentEnvelope Save/Open — verification

Проверено 2026-08-16 на полном checkout ветки `feature/20260816-polygon-experiment-envelope`.

PASS:

- `node scripts/combat_lab_experiment_envelope_smoke.mjs`
- `node --experimental-strip-types scripts/combat_lab_experiment_envelope_behavior_smoke.ts`
- `node scripts/combat_lab_experiment_envelope_file_actions_smoke.mjs`
- `node scripts/combat_lab_metrics_telemetry_smoke.mjs`
- `node scripts/combat_lab_laboratory_runtime_smoke.mjs`
- `npx tsc --noEmit`
- `npm run build`

Проверенный объём: versioned envelope `experiment(scene/units/Program) + Laboratory + MeasurementDefinitions`, общий fingerprint, строгая проверка полного payload до Open, отдельный `.polygon-experiment.json` file path.

History/Series results не смешиваются с mutable input experiment.
