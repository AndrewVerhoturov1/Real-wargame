from pathlib import Path

path = Path(__file__).with_name('agent_live_workspace_revision_apply.py')
content = path.read_text(encoding='utf-8')
old = "    commandTool.routeFacingDraft?.toFixed(4) ?? 'none',\n"
new = "    commandTool.routeFacingDraft\n      ? `${commandTool.routeFacingDraft.target.x.toFixed(2)}:${commandTool.routeFacingDraft.target.y.toFixed(2)}:${commandTool.routeFacingDraft.finalFacingRadians?.toFixed(4) ?? 'none'}`\n      : 'none',\n"
if content.count(old) != 1:
    raise RuntimeError(f'route-facing signature placeholder count: {content.count(old)}')
path.write_text(content.replace(old, new, 1), encoding='utf-8')
print('Corrected route-facing draft signature in workspace patch.')
