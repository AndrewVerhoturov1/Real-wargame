import { readFile, writeFile } from 'node:fs/promises';

const subprojectPath = 'docs/subprojects/ai-single-unit-editor/SUBPROJECT.md';
const journalPath = 'docs/subprojects/ai-single-unit-editor/JOURNAL.md';
const jsonPath = 'docs/subprojects/ai-single-unit-editor/subproject.json';

const subprojectMarker = '## Hierarchical states and explicit plans v1';
const subprojectSection = `

## Hierarchical states and explicit plans v1

The one-soldier runtime now has a persistent decision layer above Graph v2:

\`\`\`text
AiStateRuntime
→ allowed Utility branches
→ AiPlan
→ current Graph v2 subgraph
→ existing Action Runtime
\`\`\`

The first leaf states are \`Idle\`, \`FollowingOrder\`, \`Contact\` and \`Suppressed\`, grouped under \`Normal\` and \`Combat\`. The first plans are \`FollowMoveOrder\` and \`TakeCover\`.

Stable rules:

- a state limits which plans may compete;
- a valid active plan is not recreated every tick;
- an emergency state transition cancels an incompatible plan before a replacement is selected;
- plan steps execute registered subgraphs rather than owning a second movement implementation;
- nested subgraph movement remains visible to route monitoring, snapshot and owner-token cleanup;
- a restored running step continues with \`update\` and does not repeat \`start\`;
- Russian state, transition, plan and step explanations are visible in the tactical workspace and node editor;
- the compact UI is persistent and updates values in place.

Detailed explanation:

\`\`\`text
docs/subprojects/ai-single-unit-editor/HIERARCHICAL_STATES_AND_PLANS_V1.md
\`\`\`

This slice deliberately excludes shooting, morale, wounded/retreat/panic states, tactical queries and parallel plans. Shooting work should integrate through the same State → Utility → Plan → Subgraph contract rather than creating an independent competing runtime.
`;

const journalMarker = '## 2026-07-14 — hierarchical states and explicit plans v1';
const journalSection = `

## 2026-07-14 — hierarchical states and explicit plans v1

Base: \`real-wargame-preview\` \`cc907ca0f48caed418cd76b0f878c8b18fbe71c7\`  
Temporary branch: \`feat/ai-state-plan-v1-temp-2026-07-14\`  
Validation-only PR: \`#94\` to \`validation/ai-state-plan-v1-base-2026-07-14\`

Implemented:

- hierarchical \`Normal/Combat\` state paths with four leaf states;
- deterministic transition priority, wildcard suppression and hysteresis;
- explicit serializable \`AiPlan\` and \`AiPlanRuntime\`;
- \`FollowMoveOrder\` and \`TakeCover\` plans;
- state-gated plan selection and non-per-tick Utility reevaluation;
- Graph v2 plan-step delegation to existing subgraphs;
- nested movement owner-token discovery for route monitoring and scene snapshots;
- cancellation-before-replacement ordering;
- runtime session save/restore of state, plan, step, attempts and plan history;
- compact Russian tactical and node-editor diagnostics;
- deterministic browser visual-QA harness and five requested screenshot names.

New automated checks:

- \`state-machine:smoke\`;
- \`plan-runtime:smoke\`;
- \`state-plan-scenario:smoke\`.

First CI evidence confirmed all three new checks plus Graph v2, runtime, runtime session, workspace, editor and runtime-debug smoke checks. A stale scene-export version assertion and TypeScript target compatibility issues were found and corrected. Full regression and production build are rerun before completion.

Visual QA is prepared but not executed. No PNG is considered approved until the user authorizes a real system-Chromium run and the resulting images are inspected.
`;

async function appendOnce(path, marker, section) {
  const source = await readFile(path, 'utf8');
  if (source.includes(marker)) return;
  await writeFile(path, `${source.trimEnd()}${section}\n`);
}

function unique(values) {
  return Array.from(new Set(values));
}

await appendOnce(subprojectPath, subprojectMarker, subprojectSection);
await appendOnce(journalPath, journalMarker, journalSection);

const data = JSON.parse(await readFile(jsonPath, 'utf8'));
data.updated_at = '2026-07-14';
data.title = 'AI Single-Unit Editor — Stateful Tactical Awareness, Hierarchical States and Plans';
data.current_focus = 'Finish and validate the first State → Utility → Plan → Subgraph vertical slice on the temporary branch without mixing in the parallel shooting implementation.';
data.next_step = 'Complete the full required regression and docs checks, remove temporary patch/validation infrastructure, close validation PR #94 without merging, then ask for explicit visual-QA approval. Do not transfer to preview without a separate user command.';
data.last_verified_commit = 'pending-final-validation-on-feat-ai-state-plan-v1-temp-2026-07-14';
data.must_read_first = unique([
  'docs/subprojects/ai-single-unit-editor/HIERARCHICAL_STATES_AND_PLANS_V1.md',
  'docs/superpowers/plans/2026-07-14-ai-state-plan-v1.md',
  ...(data.must_read_first ?? []),
]);
data.main_files = unique([
  ...(data.main_files ?? []),
  'src/core/ai/state/AiStateMachine.ts',
  'src/core/ai/state/AiStateRuntime.ts',
  'src/core/ai/state/AiPlan.ts',
  'src/core/ai/state/AiPlanRuntime.ts',
  'src/core/ai/state/AiStatePlanPipeline.ts',
  'src/ui/AiStatePlanPanel.ts',
  'src/ai-node-editor/state-machine-ui.ts',
  'src/testing/AiStatePlanVisualQaHarness.ts',
]);
data.test_files = unique([
  ...(data.test_files ?? []),
  'scripts/ai_state_machine_smoke.ts',
  'scripts/ai_plan_runtime_smoke.ts',
  'scripts/ai_state_plan_scenario_smoke.ts',
  'tests/ai-state-plan-visual.spec.ts',
]);
data.manual_docs = unique([
  ...(data.manual_docs ?? []),
  'docs/subprojects/ai-single-unit-editor/HIERARCHICAL_STATES_AND_PLANS_V1.md',
  'docs/superpowers/plans/2026-07-14-ai-state-plan-v1.md',
]);
data.suggested_verification = unique([
  'npm run state-machine:smoke',
  'npm run plan-runtime:smoke',
  'npm run state-plan-scenario:smoke',
  ...(data.suggested_verification ?? []),
]);
data.safety_rules = unique([
  ...(data.safety_rules ?? []),
  'Only one AiPlan may be active for the soldier in this vertical slice.',
  'An emergency state transition must cancel an incompatible plan before replacement selection.',
  'Plan steps reuse Graph v2 subgraphs and the existing action owner token; never create a second movement runtime.',
  'A restored running plan step must continue update without repeating start or cleanup.',
  'Do not mix the parallel shooting implementation into this temporary branch.',
  'Do not transfer this branch to real-wargame-preview without an explicit user command.',
]);
data.known_limits = unique([
  ...(data.known_limits ?? []),
  'State-plan v1 intentionally contains only Idle, FollowingOrder, Contact and Suppressed.',
  'State-plan v1 intentionally contains only FollowMoveOrder and TakeCover.',
  'Shooting, morale, wounded/retreat/panic states, tactical queries and parallel plans are not implemented in this slice.',
  'The visual scenario is prepared but Chromium and the five PNGs are not run without explicit approval.',
]);
data.last_verified_runs = {
  ...(data.last_verified_runs ?? {}),
  hierarchical_states_and_plans_v1: {
    date: '2026-07-14',
    branch: 'feat/ai-state-plan-v1-temp-2026-07-14',
    base_preview_sha: 'cc907ca0f48caed418cd76b0f878c8b18fbe71c7',
    status: 'validation_in_progress',
    confirmed: [
      'state-machine:smoke',
      'plan-runtime:smoke',
      'state-plan-scenario:smoke',
      'graph-v2:smoke',
      'runtime:smoke',
      'runtime-session:smoke',
      'workspace:smoke',
      'editor:smoke',
      'runtime-debug-v2:smoke',
      'Agent Docs Integrity',
      'Preview Policy',
    ],
    visual_qa_prepared: true,
    visual_qa_run: false,
  },
};

await writeFile(jsonPath, `${JSON.stringify(data, null, 2)}\n`);
console.log('AI state/plan documentation patch applied.');
