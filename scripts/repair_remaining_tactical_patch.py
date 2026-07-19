from pathlib import Path

path = Path('scripts/fix_remaining_tactical_v2.py')
source = path.read_text()
replacements = [
    (
        '  assert.ok(!searchControls.includes("[data-role=\\"sidebar-body\\"]"),',
        '  assert.ok(!searchControls.includes(\'[data-role="sidebar-body"]\'),',
    ),
    (
        "    'data-role=\"tactical-position-objective\"',",
        "    \"objectiveSelect.dataset.role = 'tactical-position-objective'\",",
    ),
    (
        "    'data-role=\"tactical-position-metrics\"',",
        "    \"diagnostics.dataset.role = 'tactical-position-metrics'\",",
    ),
]
for before, after in replacements:
    if before not in source:
        raise RuntimeError(f'Repair source fragment not found: {before}')
    source = source.replace(before, after, 1)
path.write_text(source)
