from pathlib import Path

path = Path('scripts/fix_remaining_tactical_v2.py')
source = path.read_text()
before = '  assert.ok(!searchControls.includes("[data-role=\\"sidebar-body\\"]"),'
after = '  assert.ok(!searchControls.includes(\'[data-role="sidebar-body"]\'),'
if before not in source:
    raise RuntimeError('Selector assertion source fragment not found')
path.write_text(source.replace(before, after, 1))
