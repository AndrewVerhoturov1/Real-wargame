import path from 'node:path';
import process from 'node:process';

const DEFAULT_SMOKE_TIMEOUT_MS = 120_000;

export function createPreviewSmokeScenarios(root = process.cwd()) {
  return [
    scenario('perception contact priority', 'perception_contact_priority_smoke.mjs'),
    scenario('posture-adaptive movement', 'posture_adaptive_movement_smoke.mjs'),
    scenario('tactical position foundation', 'tactical_position_foundation_smoke.mjs'),
    scenario('tactical position search', 'tactical_position_search_smoke.mjs'),
    scenario('tactical position interaction', 'tactical_position_interaction_smoke.mjs'),
    scenario('tactical position tuning', 'tactical_position_tuning_smoke.mjs'),
    scenario('tactical position request service', 'tactical_position_request_service_smoke.mjs'),
    scenario('tactical position graph runtime', 'tactical_position_graph_runtime_smoke.mjs'),
    scenario('tactical position objective', 'tactical_position_objective_smoke.mjs'),
    scenario('tactical query system', 'tactical_query_system_smoke.mjs'),
    scenario('AI per-unit scheduler', 'ai_per_unit_scheduler_smoke.mjs'),
    scenario('workspace architecture contract', 'workspace_smoke_architecture_contract.mjs'),
    scenario('tactical workspace', 'tactical_workspace_smoke.mjs'),
  ];

  function scenario(name, filename) {
    return {
      name,
      command: process.execPath,
      args: [path.join(root, 'scripts', filename)],
      cwd: root,
      timeoutMs: DEFAULT_SMOKE_TIMEOUT_MS,
    };
  }
}
