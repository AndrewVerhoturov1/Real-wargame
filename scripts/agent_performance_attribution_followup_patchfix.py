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
path.write_text(content.replace(old, new, 1), encoding='utf-8')
print('Disambiguated performance summary attribution replacement.')
