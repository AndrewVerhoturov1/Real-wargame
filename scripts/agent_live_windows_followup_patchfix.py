from pathlib import Path

path = Path(__file__).with_name('agent_live_windows_followup_apply.py')
content = path.read_text(encoding='utf-8')
old = '''def remove_exact(content: str, value: str, label: str) -> str:\n    return replace_exact(content, value, "", label)\n'''
new = '''def remove_exact(content: str, value: str, label: str) -> str:\n    count = content.count(value)\n    if count < 1:\n        raise RuntimeError(f"{label}: expected at least one exact match, found {count}")\n    return content.replace(value, "")\n'''
if content.count(old) != 1:
    raise RuntimeError('remove_exact helper shape changed unexpectedly')
path.write_text(content.replace(old, new, 1), encoding='utf-8')
print('Adjusted patch helper to remove all exact legacy declarations.')
