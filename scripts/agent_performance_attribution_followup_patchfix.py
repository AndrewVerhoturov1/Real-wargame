from pathlib import Path

path = Path(__file__).with_name('agent_performance_attribution_followup_apply.py')
content = path.read_text(encoding='utf-8')

old = '''content = replace_exact(
    content,
    "        applicationAttributedLongTaskCount: applicationLongTasks.filter((item) => item.applicationAttributed).length,\\n"
    "        unattributedLongTaskCount: applicationLongTasks.filter((item) => !item.applicationAttributed).length,\\n",
    "        applicationAttributedLongTaskCount: applicationLongTasks.filter((item) => item.applicationAttributed).length,\\n"
    "        applicationDominatedLongTaskCount: applicationLongTasks.filter((item) => item.applicationDominated).length,\\n"
    "        partiallyAttributedLongTaskCount: applicationLongTasks\\n"
    "          .filter((item) => item.applicationAttributed && !item.applicationDominated).length,\\n"
    "        unattributedLongTaskCount: applicationLongTasks.filter((item) => !item.applicationAttributed).length,\\n",
    'performance summary attribution counts',
)
'''
new = '''content = replace_exact(
    content,
    "        phaseAggregateCount: performancePhaseAggregates.length,\\n"
    "        applicationAttributedLongTaskCount: applicationLongTasks.filter((item) => item.applicationAttributed).length,\\n"
    "        unattributedLongTaskCount: applicationLongTasks.filter((item) => !item.applicationAttributed).length,\\n",
    "        phaseAggregateCount: performancePhaseAggregates.length,\\n"
    "        applicationAttributedLongTaskCount: applicationLongTasks.filter((item) => item.applicationAttributed).length,\\n"
    "        applicationDominatedLongTaskCount: applicationLongTasks.filter((item) => item.applicationDominated).length,\\n"
    "        partiallyAttributedLongTaskCount: applicationLongTasks\\n"
    "          .filter((item) => item.applicationAttributed && !item.applicationDominated).length,\\n"
    "        unattributedLongTaskCount: applicationLongTasks.filter((item) => !item.applicationAttributed).length,\\n",
    'performance summary attribution counts',
)
'''
if content.count(old) != 1:
    raise RuntimeError(f'ambiguous attribution replacement block changed: found {content.count(old)}')
content = content.replace(old, new, 1)

old_smoke = '''    "threat.x += 0.1;\\n"
    "blue.tacticalKnowledge.revision += 1;\\n"
    "buildSoldierAwarenessReport(state, blue);\\n"
    "assert.equal(\\n"
    "  getSoldierDangerFieldDiagnostics(state.map).geometryBuildCount,\\n"
    "  soldierDangerGeometryBuildsAfterFirstThreat,\\n"
    "  'sub-quarter-cell subjective movement must reuse full-map danger geometry',\\n"
    ");\\n"
'''
new_smoke = '''    "buildSoldierAwarenessReport(state, blue);\\n"
    "const soldierDangerGeometryBuildsAfterHeightChange = getSoldierDangerFieldDiagnostics(state.map).geometryBuildCount;\\n"
    "threat.x += 0.1;\\n"
    "blue.tacticalKnowledge.revision += 1;\\n"
    "buildSoldierAwarenessReport(state, blue);\\n"
    "assert.equal(\\n"
    "  getSoldierDangerFieldDiagnostics(state.map).geometryBuildCount,\\n"
    "  soldierDangerGeometryBuildsAfterHeightChange,\\n"
    "  'sub-quarter-cell subjective movement must reuse full-map danger geometry after map revisions are warm',\\n"
    ");\\n"
    "const directionalBuildsAfterSubCellMovement = getDirectionalTacticalFieldDiagnostics(state.map).buildCount;\\n"
'''
if content.count(old_smoke) != 1:
    raise RuntimeError(f'sub-cell danger smoke replacement changed: found {content.count(old_smoke)}')
content = content.replace(old_smoke, new_smoke, 1)

marker = '''    'danger performance sub-cell movement scenario',
)
write(path, content)
'''
replacement = '''    'danger performance sub-cell movement scenario',
)
content = replace_exact(
    content,
    "  directionalBuildsAfterFirstThreat + 1,\\n"
    "  'the next report must rebuild directional terrain once for changed geometry content',\\n",
    "  directionalBuildsAfterSubCellMovement + 1,\\n"
    "  'material movement after the sub-cell probe must rebuild directional terrain once',\\n",
    'danger performance directional movement baseline',
)
write(path, content)
'''
if content.count(marker) != 1:
    raise RuntimeError(f'danger performance write marker changed: found {content.count(marker)}')
content = content.replace(marker, replacement, 1)

path.write_text(content, encoding='utf-8')
print('Disambiguated attribution replacement and isolated danger movement assertions from map and directional warmup.')
