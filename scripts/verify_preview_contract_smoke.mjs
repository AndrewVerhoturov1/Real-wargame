import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('scripts/verify_preview.mjs', 'utf8');
for (const token of [
  '--report',
  '--skip-preview-smokes',
  '--skip-reason',
  'skippedChecks',
  "status: report.passed ? (skipPreviewSmokes ? 'passed_with_skips' : 'passed') : 'failed'",
]) {
  assert.ok(source.includes(token), `verify_preview.mjs must contain ${token}`);
}
console.log('Preview verification contract passed.');
