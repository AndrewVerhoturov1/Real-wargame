from pathlib import Path

path = Path(__file__).with_name('agent_live_windows_followup_testsfix.py')
content = path.read_text(encoding='utf-8')
marker = "\n\nfor root_name in ('tests', 'scripts'):\n"
if content.count(marker) != 1:
    raise RuntimeError('final evidence scan marker changed unexpectedly')
patch = '''\n\n# Update the AI test-lab source contract after deleting legacy safe positions.\npath = 'scripts/ai_test_lab_smoke.mjs'\ncontent = read(path)\nfor line, label in [\n    ("  'SAFE_SEARCH_RADIUS_METERS',\\n", 'AI lab safe radius expectation'),\n    ("  'bestSafePositions',\\n", 'AI lab safe positions expectation'),\n    ("  'buildBestSafePositionsFromWorldField',\\n", 'AI lab renderer safe scan expectation'),\n    ("  'bestSafePositionScore',\\n", 'AI lab safe score expectations'),\n    ("  'distanceToBestSafePosition',\\n", 'AI lab safe distance expectations'),\n]:\n    content = remove_exact(content, line, label)\nwrite(path, content)\n'''
content = content.replace(marker, patch + marker, 1)
path.write_text(content, encoding='utf-8')
print('Removed safe-position expectations from AI test-lab smoke.')
