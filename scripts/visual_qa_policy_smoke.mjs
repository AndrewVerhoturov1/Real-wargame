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

const requiredFiles = [
  'AGENTS.md',
  '.agents/skills/real-wargame-local-preview/SKILL.md',
  '.agents/skills/real-wargame-ai-runtime/SKILL.md',
  '.agents/skills/real-wargame-pixijs/SKILL.md',
];

for (const path of requiredFiles) {
  const content = read(path);
  if (!content.includes('VISUAL_QA_APPROVAL_POLICY.md')) {
    fail(`${path} must reference the canonical visual QA approval policy`);
  }
}

const agents = read('AGENTS.md');
for (const token of [
  'Визуальная проверка подготовлена. Запустить её сейчас?',
  'visual_qa_prepared',
  'visual_qa_approval',
  'visual_qa_run',
]) {
  if (!agents.includes(token)) fail(`AGENTS.md is missing ${token}`);
}

const localSkill = read('.agents/skills/real-wargame-local-preview/SKILL.md');
if (!localSkill.includes('Do **not** start a local browser run')) {
  fail('local preview skill must forbid unapproved browser execution');
}
if (!localSkill.includes('manual-only')) {
  fail('local preview skill must describe the screenshot workflow as manual-only');
}

const policy = read('docs/workflow/VISUAL_QA_APPROVAL_POLICY.md');
if (!policy.includes('Do not restore `push` or `pull_request` triggers')) {
  fail('canonical policy must forbid restoring automatic screenshot triggers');
}

if (process.exitCode) process.exit(process.exitCode);

console.log('Visual QA approval policy smoke passed.');
