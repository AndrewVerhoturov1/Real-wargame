from pathlib import Path

path = Path(__file__).with_name('agent_live_windows_followup_testsfix.py')
content = path.read_text(encoding='utf-8')
block = '''path = '.github/workflows/combat-foundation-core.yml'\ncontent = read(path)\ncontent = remove_exact(content, "      - 'scripts/combat_safe_position_winner_smoke.ts'\\n", 'combat workflow obsolete safe-position path')\nwrite(path, content)\n'''
if content.count(block) != 1:
    raise RuntimeError(f'combat workflow patch block count: {content.count(block)}')
path.write_text(content.replace(block, '', 1), encoding='utf-8')
print('Deferred combat workflow path-filter cleanup to connector commit.')
