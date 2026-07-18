import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

function requireIncludes(relativePath, requiredFragments) {
  const content = read(relativePath);
  for (const fragment of requiredFragments) {
    if (!content.includes(fragment)) {
      throw new Error(`${relativePath} must include mandatory performance contract fragment: ${fragment}`);
    }
  }
}

const canonicalPath = 'docs/performance/PERFORMANCE_PRINCIPLES.md';
const skillPath = '.agents/skills/real-wargame-performance/SKILL.md';
const ciPolicyPath = 'docs/workflow/CI_RISK_BASED_ACCEPTANCE.md';

requireIncludes(canonicalPath, [
  '# Real-Wargame Mandatory Performance Contract',
  'No heavy synchronous work in an interactive callback',
  'Revision-based identity is mandatory',
  'Workers and queues are bounded',
  'Performance gates must enforce their thresholds',
  'AI scheduler:',
  'SimulationTick:',
  'application-blocking LongTasks: 0',
  'unknown LongTasks: 0',
  'Required PR section',
]);

requireIncludes(skillPath, [
  canonicalPath,
  ciPolicyPath,
  'This document is a repository contract. It is not optional guidance.',
  'Required design review',
  'Required validation',
  'TESTED_IMPLEMENTATION_HEAD',
  'PERFORMANCE_REASON',
  'Required report',
]);

requireIncludes(ciPolicyPath, [
  'A new commit SHA is not, by itself, a technical reason',
  'Heavy performance evidence is opt-in',
  'TESTED_IMPLEMENTATION_HEAD',
  'Evidence invalidation',
  'A skipped, non-applicable heavy workflow is not a failure',
]);

requireIncludes('AGENTS.md', [
  canonicalPath,
  skillPath,
  'The performance document is a mandatory repository contract, not optional advice.',
  'Mandatory performance contract',
  'performance_impact: completed / not applicable with reason',
]);

requireIncludes('docs/ai/WEB_CHAT_START.md', [
  canonicalPath,
  skillPath,
  'Mandatory performance route',
  'Performance impact',
]);

requireIncludes('docs/ai/SKILLS_INDEX.md', [
  'Real-Wargame performance contract',
  skillPath,
  'mandatory in addition to the domain skill',
]);

requireIncludes('docs/orchestration/ORCHESTRATOR_PROMPT.md', [
  canonicalPath,
  skillPath,
  'обязательным performance-контрактом',
  'Performance impact',
]);

requireIncludes('docs/orchestration/WORKER_PROMPT.md', [
  canonicalPath,
  skillPath,
  'Это обязательный контракт',
  'Performance impact',
]);

requireIncludes('docs/orchestration/INTEGRATOR_PROMPT.md', [
  canonicalPath,
  skillPath,
  'Performance impact',
  'tested implementation head',
  'performance reason',
  'focused',
]);

requireIncludes('docs/orchestration/RESULT_TEMPLATE.md', [
  '## Performance impact',
  'worst-case complexity:',
  'full-map builds:',
  'cache owner/key/limit:',
  'tested implementation head:',
  'performance reason:',
  '## Verification selection',
]);

requireIncludes('scripts/check_agent_docs.mjs', [
  "import './performance_principles_contract_smoke.mjs';",
]);

requireIncludes('scripts/ci_change_classifier.mjs', [
  'SAFE_TAIL_PATTERNS',
  'danger_performance_recommended',
  'live_performance_recommended',
  'evidence_status',
]);

requireIncludes('package.json', [
  '"performance-contract:smoke": "node scripts/performance_principles_contract_smoke.mjs"',
]);

console.log('Mandatory performance principles and risk-based evidence contract passed.');
