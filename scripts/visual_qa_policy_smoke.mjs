import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const fail = (message) => {
  console.error(`Visual QA policy smoke failed: ${message}`);
  process.exitCode = 1;
};

const screenshotWorkflow = read('.github/workflows/preview-screenshots.yml');
const triggerBlock = screenshotWorkflow.split('\npermissions:')[0];

if (!/\n\s*workflow_dispatch:\s*(?:\n|$)/.test(triggerBlock)) {
  fail('preview-screenshots.yml must keep workflow_dispatch');
}
if (/\n\s*push:\s*(?:\n|$)/.test(triggerBlock)) {
  fail('preview-screenshots.yml must not run automatically on push');
}
if (/\n\s*pull_request:\s*(?:\n|$)/.test(triggerBlock)) {
  fail('preview-screenshots.yml must not run automatically on pull_request');
}
if (!screenshotWorkflow.includes('npx playwright test')) {
  fail('manual screenshot workflow lost the Playwright command');
}
if (!screenshotWorkflow.includes('real-wargame-preview-screenshots')) {
  fail('manual screenshot workflow lost the screenshot artifact');
}

const previewPolicyWorkflow = read('.github/workflows/preview-policy.yml');
if (/^\s{2}visual-qa-screenshots:/m.test(previewPolicyWorkflow)) {
  fail('preview-policy.yml must not contain an automatic visual QA job');
}
if (/npx playwright|playwright install|Upload screenshots/.test(previewPolicyWorkflow)) {
  fail('preview-policy.yml must not execute browser or screenshot commands');
}

const agents = read('AGENTS.md');
const localSkill = read('.agents/skills/real-wargame-local-preview/SKILL.md');
const aiRuntimeSkill = read('.agents/skills/real-wargame-ai-runtime/SKILL.md');
const pixiSkill = read('.agents/skills/real-wargame-pixijs/SKILL.md');
const policy = read('docs/workflow/VISUAL_QA_APPROVAL_POLICY.md');

for (const [path, content] of [
  ['.agents/skills/real-wargame-local-preview/SKILL.md', localSkill],
  ['.agents/skills/real-wargame-ai-runtime/SKILL.md', aiRuntimeSkill],
  ['.agents/skills/real-wargame-pixijs/SKILL.md', pixiSkill],
]) {
  if (!content.includes('VISUAL_QA_APPROVAL_POLICY.md')) {
    fail(`${path} must reference the canonical visual QA approval policy`);
  }
}

if (!agents.includes('.agents/skills/real-wargame-local-preview/SKILL.md')) {
  fail('AGENTS.md must route direct-browser visual work through the local preview skill');
}
if (!agents.includes('Visual permission is separate from deployment permission.')) {
  fail('AGENTS.md must keep visual permission separate from deployment permission');
}
if (!agents.includes('visual_qa_status')) {
  fail('AGENTS.md must keep visual QA status in the final report contract');
}

for (const token of [
  'Визуальная проверка подготовлена. Запустить её сейчас?',
  'visual_qa_prepared',
  'visual_qa_approval',
  'visual_qa_run',
]) {
  if (!localSkill.includes(token)) fail(`local preview skill is missing ${token}`);
}

if (!localSkill.includes('do not run the browser')) {
  fail('local preview skill must forbid unapproved browser execution');
}
if (!localSkill.includes('manual-only')) {
  fail('local preview skill must describe the screenshot workflow as manual-only');
}

const forbidsAutomaticBrowserRun = policy.includes('Do not restore `push` or `pull_request` triggers')
  || policy.includes('A normal feature push, Vercel deployment or product PR must not automatically launch browser verification.');
if (!forbidsAutomaticBrowserRun) {
  fail('canonical policy must forbid automatic browser verification from push or pull request');
}

if (process.exitCode) process.exit(process.exitCode);

console.log('Visual QA approval policy smoke passed.');
