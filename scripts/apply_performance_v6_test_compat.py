from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one replacement, found {count}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')


replace_once(
    'src/core/debug/PerformanceMonitor.ts',
    """        compatibility: {
          v5SceneUnitCount: state.units.length,
          v5Samples: samples,
          note: 'Explicit legacy compatibility payload. This file remains performance-report-v6 and must not be parsed as v5.',
        },""",
    """        compatibility: {
          v5SceneUnitCount: state.units.length,
          v5Scene: {
            mapWidthCells: state.map.width,
            mapHeightCells: state.map.height,
            cellSizePx: state.map.cellSize,
            metersPerCell: state.map.metersPerCell,
            terrainCells: state.map.cells.length,
            objectCount: state.map.objects.length,
            unitCount: state.units.length,
            pressureZoneCount: state.pressureZones.length,
            currentZoom: roundThree(zoom),
          },
          v5Samples: samples,
          note: 'Explicit legacy compatibility payload. This file remains performance-report-v6 and must not be parsed as v5.',
        },""",
)

workflow = '.github/workflows/danger-layer-browser-performance.yml'
replace_once(
    workflow,
    "      - 'tests/danger-layer-browser-performance.spec.ts'\n",
    "      - 'tests/danger-layer-browser-performance.spec.ts'\n      - 'tests/performance-report-compat.ts'\n",
)
replace_once(
    workflow,
    "          cp source/src/core/debug/BuildIdentity.ts baseline/src/core/debug/BuildIdentity.ts\n",
    "          cp source/tests/performance-report-compat.ts baseline/tests/performance-report-compat.ts\n",
)

browser = 'tests/danger-layer-browser-performance.spec.ts'
replace_once(
    browser,
    "import path from 'node:path';\n",
    "import path from 'node:path';\nimport { normalizePerformanceReport } from './performance-report-compat';\n",
)
replace_once(
    browser,
    "  const report = JSON.parse(readFileSync(downloadedPath, 'utf8')) as PerformanceReport;\n",
    "  const report = normalizePerformanceReport<PerformanceReport>(JSON.parse(readFileSync(downloadedPath, 'utf8')));\n",
)
replace_once(
    browser,
    """  expect(report.version).toBe('performance-report-v5');
  expect(report.build?.performanceContractVersion).toBe('performance-report-v5');""",
    """  expect(['performance-report-v5', 'performance-report-v6']).toContain(report.version);
  expect(report.build?.performanceContractVersion).toBe(report.version);""",
)

movement = 'tests/danger-layer-movement-performance.spec.ts'
replace_once(
    movement,
    "import path from 'node:path';\n",
    "import path from 'node:path';\nimport { normalizePerformanceReport } from './performance-report-compat';\n",
)
replace_once(
    movement,
    "    report: JSON.parse(readFileSync(downloadedPath, 'utf8')) as PerformanceReport,\n",
    "    report: normalizePerformanceReport<PerformanceReport>(JSON.parse(readFileSync(downloadedPath, 'utf8'))),\n",
)
replace_once(
    movement,
    """  expect(report.version).toBe('performance-report-v5');
  expect(report.build?.performanceContractVersion).toBe('performance-report-v5');""",
    """  expect(['performance-report-v5', 'performance-report-v6']).toContain(report.version);
  expect(report.build?.performanceContractVersion).toBe(report.version);""",
)

long_task = 'tests/danger-layer-long-task-attribution.spec.ts'
replace_once(
    long_task,
    "import path from 'node:path';\n",
    "import path from 'node:path';\nimport { normalizePerformanceReport } from './performance-report-compat';\n",
)
replace_once(
    long_task,
    "    report: JSON.parse(readFileSync(downloadedPath, 'utf8')) as PerformanceReport,\n",
    "    report: normalizePerformanceReport<PerformanceReport>(JSON.parse(readFileSync(downloadedPath, 'utf8'))),\n",
)
replace_once(
    long_task,
    """  expect(report.version).toBe('performance-report-v5');
  expect(report.build?.performanceContractVersion).toBe('performance-report-v5');""",
    """  expect(['performance-report-v5', 'performance-report-v6']).toContain(report.version);
  expect(report.build?.performanceContractVersion).toBe(report.version);""",
)

for path in (
    browser,
    movement,
    long_task,
):
    text = Path(path).read_text(encoding='utf-8')
    if "expect(report.version).toBe('performance-report-v5')" in text:
        raise SystemExit(f'{path}: stale hardcoded v5 assertion remains')

monitor = Path('src/core/debug/PerformanceMonitor.ts').read_text(encoding='utf-8')
if 'v5Scene:' not in monitor:
    raise SystemExit('PerformanceMonitor: v5Scene compatibility view missing')
workflow_text = Path(workflow).read_text(encoding='utf-8')
if 'performance-report-compat.ts' not in workflow_text:
    raise SystemExit('Danger workflow: test compatibility reader missing')
