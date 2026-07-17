from pathlib import Path

path = Path(__file__).with_name('agent_live_windows_followup_testsfix.py')
content = path.read_text(encoding='utf-8')
old = 'content = replace_regex(\n'
if content.count(old) != 1:
    raise RuntimeError(f'expected one undefined replace_regex call, found {content.count(old)}')
content = content.replace(old, 'content = remove_regex(\n', 1)
marker = "\n\nfor root_name in ('tests', 'scripts'):\n"
if content.count(marker) != 1:
    raise RuntimeError('final evidence scan marker changed unexpectedly')
patch = '''\n\n# Remove the legacy safe-position field from combat browser evidence.\npath = 'tests/combat-tactical-integration.spec.ts'\ncontent = read(path)\ncontent = remove_exact(content, '  bestSafePosition: { x: number; y: number } | null;\\n', 'combat browser safe-position field')\ncontent = remove_exact(content, '    expect(snapshot.bestSafePosition).not.toBeNull();\\n', 'combat browser safe-position assertions')\ncontent = replace_exact(content, "  test('real visual contact appears in the existing danger, safe-position and route views', async ({ page }, testInfo) => {", "  test('real visual contact appears in the existing danger and route views', async ({ page }, testInfo) => {", 'combat visual-contact title')\ncontent = replace_exact(content, "  test('reverse slope changes the safe-position and routed movement context', async ({ page }, testInfo) => {", "  test('reverse slope changes the danger and routed movement context', async ({ page }, testInfo) => {", 'combat reverse-slope title')\ncontent = replace_exact(content, "combat-stage1-04-reverse-slope-safe-route.png", "combat-stage1-04-reverse-slope-danger-route.png", 'combat reverse-slope screenshot name')\nwrite(path, content)\n'''
content = content.replace(marker, patch + marker, 1)
path.write_text(content, encoding='utf-8')
print('Corrected evidence helper and removed combat safe-position evidence.')
