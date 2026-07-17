from pathlib import Path

path = Path(__file__).with_name('agent_live_windows_followup_apply.py')
content = path.read_text(encoding='utf-8')
old_helper = '''def remove_exact(content: str, value: str, label: str) -> str:\n    return replace_exact(content, value, "", label)\n'''
new_helper = '''def remove_exact(content: str, value: str, label: str) -> str:\n    count = content.count(value)\n    if count < 1:\n        raise RuntimeError(f"{label}: expected at least one exact match, found {count}")\n    return content.replace(value, "")\n'''
if content.count(old_helper) != 1:
    raise RuntimeError('remove_exact helper shape changed unexpectedly')
content = content.replace(old_helper, new_helper, 1)
duplicate = 'content = remove_exact(content, "  bestSafePositions: SoldierSafePosition[];\\n", "cached awareness safe positions")\n'
if content.count(duplicate) != 1:
    raise RuntimeError('duplicate cached safe-position removal step changed unexpectedly')
content = content.replace(duplicate, '', 1)
marker = '# Ensure the active source tree contains no safe-position feature identifiers.\n'
if content.count(marker) != 1:
    raise RuntimeError('final safe-position verification marker changed unexpectedly')
harness_patch = '''# Remove the legacy safe-position field from the visual QA snapshot contract while retaining danger parity checks.\npath = "src/testing/CombatTacticalIntegrationVisualQaHarness.ts"\ncontent = read(path)\ncontent = remove_exact(content, "  readonly bestSafePosition: { x: number; y: number } | null;\\n", "visual QA safe-position snapshot field")\ncontent = remove_exact(\n    content,\n    "    bestSafePosition: report.bestSafePositions[0]\\n"\n    "      ? { ...report.bestSafePositions[0].position }\\n"\n    "      : null,\\n",\n    "visual QA safe-position snapshot value",\n)\nwrite(path, content)\n\n\n'''
content = content.replace(marker, harness_patch + marker, 1)
path.write_text(content, encoding='utf-8')
print('Adjusted patch helper and removed duplicate plus visual-QA safe-position contracts.')
