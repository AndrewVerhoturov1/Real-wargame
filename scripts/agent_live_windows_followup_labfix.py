from pathlib import Path

path = Path(__file__).with_name('agent_live_windows_followup_apply.py')
content = path.read_text(encoding='utf-8')
marker = '# Ensure the active source tree contains no safe-position feature identifiers.\n'
if content.count(marker) != 1:
    raise RuntimeError('final safe-position verification marker changed unexpectedly')
patch = '''# Remove legacy safe-position output from the old AI test-lab panel.\npath = "src/ui/AiTestLabControls.ts"\ncontent = read(path)\ncontent = remove_exact(content, "  ['safe', 'Безопасные места'],\\n", "AI lab safe mode")\ncontent = remove_exact(content, "  const best = report.bestSafePositions[0];\\n", "AI lab best safe lookup")\ncontent = remove_exact(content, "    ['Лучшая позиция', best ? `${best.score.toFixed(0)} баллов, ${Math.round(best.distanceCells * state.map.metersPerCell)} м` : 'не найдена'],\\n", "AI lab best safe grid row")\ncontent = remove_exact(content, "    best ? `Лучшее безопасное место: ${Math.round(best.distanceCells * state.map.metersPerCell)} м, оценка ${best.score.toFixed(0)}` : 'Лучшее безопасное место: нет',\\n", "AI lab best safe diagnostic row")\ncontent = remove_exact(content, "    ['safe', 'Зелёный — безопасная позиция'],\\n", "AI lab safe legend")\nwrite(path, content)\n\n\n# Remove blackboard options that no longer exist after safe-position deletion.\npath = "src/ai-node-editor/ai-test-lab-node-options.ts"\ncontent = read(path)\ncontent = remove_exact(content, "  { value: 'bestSafePositionScore', labelRu: 'Оценка лучшей безопасной позиции', labelEn: 'Best safe position score' },\\n", "safe-position score node option")\ncontent = remove_exact(content, "  { value: 'distanceToBestSafePosition', labelRu: 'Расстояние до безопасной позиции', labelEn: 'Distance to best safe position' },\\n", "safe-position distance node option")\nwrite(path, content)\n\n\n'''
content = content.replace(marker, patch + marker, 1)
path.write_text(content, encoding='utf-8')
print('Added AI test-lab and node-option safe-position removal to the source patch.')
