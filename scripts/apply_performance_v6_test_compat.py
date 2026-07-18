from pathlib import Path


def replace_or_assert(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding='utf-8')
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one source replacement, found {count}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')


def ensure_after(path: str, anchor: str, addition: str) -> None:
    target = Path(path)
    text = target.read_text(encoding='utf-8')
    if addition in text:
        return
    count = text.count(anchor)
    if count != 1:
        raise SystemExit(f'{path}: expected one insertion anchor, found {count}')
    target.write_text(text.replace(anchor, f'{anchor}{addition}', 1), encoding='utf-8')


replace_or_assert(
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
ensure_after(
    workflow,
    "      - 'tests/danger-layer-browser-performance.spec.ts'\n",
    "      - 'tests/performance-report-compat.ts'\n",
)
workflow_target = Path(workflow)
workflow_text = workflow_target.read_text(encoding='utf-8')
legacy_identity_copy = "          cp source/src/core/debug/BuildIdentity.ts baseline/src/core/debug/BuildIdentity.ts\n"
if legacy_identity_copy in workflow_text:
    workflow_target.write_text(workflow_text.replace(legacy_identity_copy, '', 1), encoding='utf-8')
ensure_after(
    workflow,
    "          cp source/tests/danger-layer-browser-performance.spec.ts baseline/tests/danger-layer-browser-performance.spec.ts\n",
    "          cp source/tests/performance-report-compat.ts baseline/tests/performance-report-compat.ts\n",
)

movement = 'tests/danger-layer-movement-performance.spec.ts'
replace_or_assert(
    movement,
    "import path from 'node:path';\n",
    "import path from 'node:path';\nimport { normalizePerformanceReport } from './performance-report-compat';\n",
)
replace_or_assert(
    movement,
    "    report: JSON.parse(readFileSync(downloadedPath, 'utf8')) as PerformanceReport,\n",
    "    report: normalizePerformanceReport<PerformanceReport>(JSON.parse(readFileSync(downloadedPath, 'utf8'))),\n",
)
replace_or_assert(
    movement,
    """  expect(report.version).toBe('performance-report-v5');
  expect(report.build?.performanceContractVersion).toBe('performance-report-v5');""",
    """  expect(report.version).toBe('performance-report-v6');
  expect(report.build?.performanceContractVersion).toBe(report.version);""",
)

long_task = 'tests/danger-layer-long-task-attribution.spec.ts'
replace_or_assert(
    long_task,
    "import path from 'node:path';\n",
    "import path from 'node:path';\nimport { normalizePerformanceReport } from './performance-report-compat';\n",
)
replace_or_assert(
    long_task,
    "    report: JSON.parse(readFileSync(downloadedPath, 'utf8')) as PerformanceReport,\n",
    "    report: normalizePerformanceReport<PerformanceReport>(JSON.parse(readFileSync(downloadedPath, 'utf8'))),\n",
)
replace_or_assert(
    long_task,
    """  expect(report.version).toBe('performance-report-v5');
  expect(report.build?.performanceContractVersion).toBe('performance-report-v5');""",
    """  expect(report.version).toBe('performance-report-v6');
  expect(report.build?.performanceContractVersion).toBe(report.version);""",
)

browser_text = Path('tests/danger-layer-browser-performance.spec.ts').read_text(encoding='utf-8')
if "EXPECTED_REPORT_VERSION = IS_CANDIDATE ? 'performance-report-v6' : 'performance-report-v5'" not in browser_text:
    raise SystemExit('Danger browser test must explicitly distinguish baseline v5 from candidate v6')

for path in (movement, long_task):
    text = Path(path).read_text(encoding='utf-8')
    if "expect(report.version).toBe('performance-report-v5')" in text:
        raise SystemExit(f'{path}: stale hardcoded v5 assertion remains')
    if "normalizePerformanceReport<PerformanceReport>" not in text:
        raise SystemExit(f'{path}: normalized v6 compatibility read missing')

monitor = Path('src/core/debug/PerformanceMonitor.ts').read_text(encoding='utf-8')
if 'v5Scene:' not in monitor:
    raise SystemExit('PerformanceMonitor: v5Scene compatibility view missing')
workflow_text = Path(workflow).read_text(encoding='utf-8')
if workflow_text.count('performance-report-compat.ts') < 2:
    raise SystemExit('Danger workflow: test compatibility reader path/copy missing')
if 'BuildIdentity.ts baseline/src/core/debug/BuildIdentity.ts' in workflow_text:
    raise SystemExit('Danger workflow: exact v5 baseline identity is still overwritten')
