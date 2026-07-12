import { readFileSync, writeFileSync, rmSync } from 'node:fs';

const journalPath = 'docs/subprojects/ai-single-unit-editor/JOURNAL.md';
let journal = readFileSync(journalPath, 'utf8');
const entry = '- **2026-07-12**: Completed Compact Route Controls and Editor Navigation on isolated branch `tmp/ui-compact-route-controls-20260712`. The soldier card is compact, real route-profile and cost-map controls are in game, terminal blue targets clear correctly, the AI editor has one unified menu, and obsolete Diagnostics/Auto 4–5 UI is removed. Exact-SHA core and system-Chrome Playwright 3/3 passed; six PNGs were downloaded and inspected. See `journal/2026-07-12-compact-route-controls-editor-navigation.md`.\n';
if (!journal.includes('2026-07-12-compact-route-controls-editor-navigation.md')) {
  journal = `${journal.trimEnd()}\n${entry}`;
  writeFileSync(journalPath, journal, 'utf8');
}
rmSync('scripts/finalize_compact_ui_docs.mjs', { force: true });
rmSync('.github/workflows/tmp-finalize-compact-ui-docs.yml', { force: true });
console.log('Appended compact UI journal entry and removed temporary sync machinery.');
