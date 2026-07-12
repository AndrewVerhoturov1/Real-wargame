import { readFile, writeFile } from 'node:fs/promises';

const mergeSha = '5deb899673c7b6e57b9089ecf890699f6d617a9a';
const verifiedHeadSha = 'a560b9b92593ce2c2b280d364431bba7d3c4aec4';
const metadataPath = 'docs/subprojects/ai-single-unit-editor/subproject.json';
const journalPath = 'docs/subprojects/ai-single-unit-editor/journal/2026-07-12-perception-attention-v1.md';

const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
metadata.current_focus = 'Soldier Perception and Attention v1 перенесён в real-wargame-preview через PR #70. В актуальной preview-ветке доступны режимы Марш/Наблюдение/Поиск цели/Стрельба, плавное поле внимания, постепенное ослабление обзора лесом, накопление и старение субъективных контактов, примерный слух, Blackboard и ноды управления вниманием, редактор профилей и отдельный PixiJS-слой. Свежие изменения компактной карточки бойца, маршрутов и редактора сохранены.';
metadata.next_step = 'Провести пользовательскую проверку результата в real-wargame-preview. После подтверждения планировать следующий этап: восприятие всех бойцов, обмен контактами по командной цепочке и полноценные вражеские юниты; main не менять без отдельного явного GO пользователя.';
metadata.last_verified_commit = mergeSha;
metadata.last_verified_runs = {
  ...metadata.last_verified_runs,
  current_preview_base: 'ca3f2e71327f184ce2aaccbd3749ebd6da93944c',
  perception_core: `29201062853: success on ${verifiedHeadSha}; build, perception, performance, attention nodes, runtime, workspace, game editor, LOS, dictionary, lab and docs checks passed`,
  preview_pr_core: '29203543094: Preview Core Checks success on PR #70 head',
  navigation_profiles_core: '29203543098: success',
  compact_route_controls_core: '29203543076: success',
  command_plan_route_core: '29203543097: success',
  policy: '29203543069: success',
  docs_integrity: '29203543082: success',
  preview_merge: `PR #70 merged into real-wargame-preview as ${mergeSha}`,
  preview_transfer: `completed via PR #70 as ${mergeSha}`,
};
metadata.manual_docs = Array.from(new Set([
  ...(metadata.manual_docs ?? []),
  journalPath,
]));
metadata.safety_rules = (metadata.safety_rules ?? []).map((rule) =>
  rule === 'Не переносить временную ветку в real-wargame-preview без отдельного подтверждения пользователя.'
    ? 'Perception v1 теперь является канонической частью real-wargame-preview; новые ветки восприятия перед merge должны синхронизироваться с актуальной preview.'
    : rule,
);
await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

let journal = await readFile(journalPath, 'utf8');
journal = journal.replace(
  '**Transfer to preview:** not performed',
  `**Transfer to preview:** PR #70 merged as \`${mergeSha}\``,
);
journal = journal.replace(
  '- implementation was not transferred into `real-wargame-preview`.',
  '- implementation is now canonical in `real-wargame-preview`; `main` was not changed.',
);
if (!journal.includes('## Transfer to preview\n')) {
  journal = journal.replace(
    '## Honest v1 limits',
    `## Transfer to preview\n\nPR #70 merged the verified implementation into \`real-wargame-preview\` as \`${mergeSha}\`. The branch was \`behind_by: 0\` before merge, so the current compact route controls, navigation profiles and editor changes were preserved.\n\nFresh PR checks on \`${verifiedHeadSha}\` passed Preview Core, Navigation Profiles Core, Compact Route Controls Core, Command Plan Route Core, Preview Policy and Agent Docs Integrity before the merge. \`main\` was not changed.\n\n## Honest v1 limits`,
  );
}
await writeFile(journalPath, journal, 'utf8');
