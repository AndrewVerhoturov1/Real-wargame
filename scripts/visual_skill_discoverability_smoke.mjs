import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const ROUTER_PATH = '.agents/skills/real-wargame-screenshots/SKILL.md';
const DIRECT_PATH = '.agents/skills/real-wargame-local-preview/SKILL.md';
const FALLBACK_PATH = '.agents/skills/vercel-deployment-playwright-e2e/SKILL.md';

assert.ok(existsSync(ROUTER_PATH), `missing screenshot router skill: ${ROUTER_PATH}`);

const router = readFileSync(ROUTER_PATH, 'utf8');
for (const token of [
  'name: real-wargame-screenshots',
  'MUST use',
  'screenshot',
  'скриншот',
  'visual',
  'Playwright',
  'Combat Lab',
  'AI Editor',
  DIRECT_PATH,
  FALLBACK_PATH,
]) {
  assert.ok(router.includes(token), `screenshot router skill must contain ${token}`);
}

const agents = readFileSync('AGENTS.md', 'utf8');
const mandatoryHeading = '## Mandatory screenshot and visual-QA routing';
assert.ok(agents.includes(mandatoryHeading), 'AGENTS.md must contain the mandatory screenshot route');
assert.ok(
  agents.indexOf(mandatoryHeading) < agents.indexOf('## 2. Communication'),
  'mandatory screenshot route must appear before general communication guidance',
);
for (const token of [ROUTER_PATH, 'до ответа', 'скриншоты', 'проверь визуально', 'посмотри интерфейс']) {
  assert.ok(agents.includes(token), `AGENTS.md must contain ${token}`);
}

const skillsIndex = readFileSync('docs/ai/SKILLS_INDEX.md', 'utf8');
assert.ok(skillsIndex.includes('Real-Wargame screenshot router'), 'skills index must list the screenshot router');
assert.ok(skillsIndex.includes(ROUTER_PATH), 'skills index must link the screenshot router');
assert.ok(
  skillsIndex.indexOf(ROUTER_PATH) < skillsIndex.indexOf(DIRECT_PATH),
  'skills index must route through the screenshot router before specialized visual skills',
);

const webChatStart = readFileSync('docs/ai/WEB_CHAT_START.md', 'utf8');
assert.ok(webChatStart.includes(ROUTER_PATH), 'WEB_CHAT_START must route visual intent through the screenshot router');

const context = JSON.parse(readFileSync('docs/ai/repo-context.json', 'utf8'));
assert.equal(context.schemaVersion, 7);
assert.equal(context.delivery.visualQaRouting.routerSkill, ROUTER_PATH);
assert.equal(context.delivery.visualQaRouting.mandatoryBeforeResponse, true);
assert.equal(context.delivery.visualQaRouting.userMustNameSkill, false);
assert.equal(context.defaultSkills.screenshots, ROUTER_PATH);
const aliases = [
  ...context.delivery.visualQaRouting.intentAliasesRu,
  ...context.delivery.visualQaRouting.intentAliasesEn,
];
for (const alias of ['скриншот', 'проверь визуально', 'посмотри интерфейс', 'зайди на деплой', 'Playwright']) {
  assert.ok(aliases.includes(alias), `repo context must contain visual intent alias ${alias}`);
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
assert.equal(
  packageJson.scripts['visual-skill-discoverability:smoke'],
  'node scripts/visual_skill_discoverability_smoke.mjs',
);
assert.ok(packageJson.scripts['docs:smoke'].includes('visual-skill-discoverability:smoke'));

const previewGate = readFileSync('scripts/verify_preview.mjs', 'utf8');
assert.ok(
  previewGate.includes(
    "nodeCheck('Visual skill discoverability contract', 'visual_skill_discoverability_smoke.mjs', 30_000)",
  ),
);

console.log('Visual skill discoverability contract passed.');
