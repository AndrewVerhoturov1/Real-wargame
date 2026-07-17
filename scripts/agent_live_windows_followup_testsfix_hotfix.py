from pathlib import Path

path = Path(__file__).with_name('agent_live_windows_followup_testsfix.py')
content = path.read_text(encoding='utf-8')
old = 'content = replace_regex(\n'
if content.count(old) != 1:
    raise RuntimeError(f'expected one undefined replace_regex call, found {content.count(old)}')
path.write_text(content.replace(old, 'content = remove_regex(\n', 1), encoding='utf-8')
print('Corrected evidence patch to use remove_regex.')
