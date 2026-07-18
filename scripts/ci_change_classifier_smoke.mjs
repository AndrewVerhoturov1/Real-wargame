import assert from 'node:assert/strict';
import { classifyPaths, isSafeEvidenceTailPath } from './ci_change_classifier.mjs';

const docs = classifyPaths(['docs/workflow/CI_RISK_BASED_ACCEPTANCE.md', 'README.md']);
assert.equal(docs.docs_only, true);
assert.equal(docs.needs_build, false);
assert.equal(docs.danger_performance_recommended, false);
assert.equal(docs.live_performance_recommended, false);

const navigation = classifyPaths(['src/core/navigation/RouteCostField.ts']);
assert.equal(navigation.navigation, true);
assert.equal(navigation.runtime, true);
assert.equal(navigation.needs_build, true);
assert.equal(navigation.live_performance_recommended, true);

const danger = classifyPaths(['src/core/knowledge/SoldierDangerField.ts']);
assert.equal(danger.combat, true);
assert.equal(danger.danger_performance_recommended, true);

const workflow = classifyPaths(['.github/workflows/live-windows-ai-browser-performance.yml']);
assert.equal(workflow.performance_contract, true);
assert.equal(workflow.docs_only, false);

assert.equal(isSafeEvidenceTailPath('docs/workflow/CI_RISK_BASED_ACCEPTANCE.md'), true);
assert.equal(isSafeEvidenceTailPath('.agents/skills/real-wargame-performance/SKILL.md'), true);
assert.equal(isSafeEvidenceTailPath('docs/performance/PERFORMANCE_PRINCIPLES.md'), false);
assert.equal(isSafeEvidenceTailPath('scripts/performance_report_contract_smoke.mjs'), false);
assert.equal(isSafeEvidenceTailPath('src/core/simulation/SimulationTick.ts'), false);

console.log('CI change classifier smoke passed: docs, focused subsystems, performance recommendation and evidence-tail invalidation are distinct.');
