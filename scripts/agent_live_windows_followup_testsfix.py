from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding='utf-8')


def remove_exact(content: str, value: str, label: str, minimum: int = 1) -> str:
    count = content.count(value)
    if count < minimum:
        raise RuntimeError(f'{label}: expected at least {minimum} exact match(es), found {count}')
    return content.replace(value, '')


def replace_exact(content: str, old: str, new: str, label: str) -> str:
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one exact match, found {count}')
    return content.replace(old, new, 1)


def remove_regex(content: str, pattern: str, label: str, minimum: int = 1) -> str:
    updated, count = re.subn(pattern, '', content, flags=re.S)
    if count < minimum:
        raise RuntimeError(f'{label}: expected at least {minimum} regex match(es), found {count}')
    return updated


# Long-task capture: retain wall/canonical field checks, remove the deleted winner/local-scan contract.
path = 'tests/danger-layer-long-task-attribution.spec.ts'
content = read(path)
content = remove_regex(content, r'\ninterface SafePositionSnapshot \{.*?\n\}\n', 'long-task safe snapshot interface')
for line, label in [
    ('  lastLocalUpdateMs: number;\n', 'long-task last local metric'),
    ('  maxLocalUpdateMs: number;\n', 'long-task max local metric'),
    ('  rawMaxLocalUpdateMs?: number;\n', 'long-task raw local metric'),
    ('  bestSafePosition: SafePositionSnapshot | null;\n', 'long-task safe winner field'),
    ('  protectedAgainstThreatId: string | null;\n', 'long-task protected threat field'),
    ('  const beforeWinner = requireWinner(before);\n', 'long-task before winner'),
    ('  expect(beforeWinner.position.x).toBeLessThan(wallX);\n', 'long-task before winner assertion'),
    ('  expect(before.protectedAgainstThreatId).not.toBeNull();\n', 'long-task protected threat assertion'),
    ('  const afterWinner = requireWinner(after);\n', 'long-task after winner'),
    ('  expect(afterWinner.position.x).toBeGreaterThan(wallX);\n', 'long-task after winner assertion'),
    ('  expect(after.bestSafePosition).not.toEqual(before.bestSafePosition);\n', 'long-task winner change assertion'),
    ('  expect(after.protectedAgainstThreatId).toBe(before.protectedAgainstThreatId);\n', 'long-task protected id stability'),
    ('  expect(afterMovement.lastLocalUpdateMs).toBeLessThanOrEqual(10);\n', 'long-task local update bound'),
    ('  expect(report.computation?.awarenessMovement?.maxLocalUpdateMs).toBeLessThanOrEqual(10);\n', 'long-task report local bound'),
    ('    rawColdLocalUpdateMaxMs: report.computation?.awarenessMovement?.rawMaxLocalUpdateMs ?? null,\n', 'long-task raw local output'),
    ('    postWarmupLocalUpdateMaxMs: report.computation?.awarenessMovement?.maxLocalUpdateMs ?? null,\n', 'long-task local output'),
]:
    content = remove_exact(content, line, label)
content = remove_regex(
    content,
    r'\nfunction requireWinner\(value: MovementSnapshot\): SafePositionSnapshot \{.*?\n\}\n',
    'long-task require winner helper',
)
write(path, content)


# Movement browser evidence: prove canonical raster changes and bounded queueing, not a legacy position winner.
path = 'tests/danger-layer-movement-performance.spec.ts'
content = read(path)
content = remove_regex(content, r'\ninterface SafePositionSnapshot \{.*?\n\}\n', 'movement safe snapshot interface')
for line, label in [
    ('  ownMovementLocalUpdates: number;\n', 'movement own local metric'),
    ('  safePositionLocalScans: number;\n', 'movement safe scan metric'),
    ('  safePositionCellsScanned: number;\n', 'movement safe cells metric'),
    ('  lastLocalUpdateMs: number;\n', 'movement last local metric'),
    ('  maxLocalUpdateMs: number;\n', 'movement max local metric'),
    ('  bestSafePosition: SafePositionSnapshot | null;\n', 'movement safe winner field'),
    ('  protectedAgainstThreatId: string | null;\n', 'movement protected field'),
    ('  markerUpdateCount: number;\n', 'movement marker field'),
    ('const LOCAL_UPDATE_LIMIT_MS = 10;\n', 'movement local limit'),
    ("  expect(afterMovement.ownMovementLocalUpdates).toBeGreaterThan(beforeMovement.ownMovementLocalUpdates);\n", 'selected local update assertion'),
    ("  expect(afterMovement.safePositionLocalScans).toBeGreaterThan(beforeMovement.safePositionLocalScans);\n", 'selected safe scan assertion'),
    ("  expect(afterMovement.maxLocalUpdateMs).toBeLessThanOrEqual(LOCAL_UPDATE_LIMIT_MS);\n", 'selected local bound'),
    ("      ownMovementLocalUpdateDelta: delta(afterMovement, beforeMovement, 'ownMovementLocalUpdates'),\n", 'selected local counter'),
    ("      safePositionLocalScanDelta: delta(afterMovement, beforeMovement, 'safePositionLocalScans'),\n", 'selected safe counter'),
    ('      markerUpdateDelta: after.markerUpdateCount - before.markerUpdateCount,\n', 'selected marker counter'),
    ('      maxLocalUpdateMs: afterMovement.maxLocalUpdateMs,\n', 'selected max local counter'),
    ('  expect(movement.ownMovementLocalUpdates).toBeGreaterThan(beforeMovement.ownMovementLocalUpdates);\n', 'six-unit local assertion'),
    ("      ownMovementLocalUpdateDelta: delta(movement, beforeMovement, 'ownMovementLocalUpdates'),\n", 'six-unit local counter'),
    ('  const beforeWinner = requireWinner(before);\n', 'wall before winner'),
    ('  expect(beforeWinner.position.x).toBeLessThan(wallX);\n', 'wall before winner assertion'),
    ('  expect(before.protectedAgainstThreatId).not.toBeNull();\n', 'wall before protected assertion'),
    ('  const afterWinner = requireWinner(after);\n', 'wall after winner'),
    ('  expect(afterWinner.position.x).toBeGreaterThan(wallX);\n', 'wall after winner assertion'),
    ('  expect(after.bestSafePosition).not.toEqual(before.bestSafePosition);\n', 'wall winner change assertion'),
    ('  expect(after.protectedAgainstThreatId).toBe(before.protectedAgainstThreatId);\n', 'wall protected equality'),
    ('  expect(after.protectedAgainstThreatId).not.toBeNull();\n', 'wall protected non-null'),
    ("      initialWinnerSide: 'west-protected',\n", 'wall initial winner counter'),
    ("      finalWinnerSide: 'east-protected',\n", 'wall final winner counter'),
    ('      winnerChanged: JSON.stringify(after.bestSafePosition) !== JSON.stringify(before.bestSafePosition),\n', 'wall winner changed counter'),
    ('      protectedAgainstThreatId: after.protectedAgainstThreatId,\n', 'wall protected counter'),
    ('  expect(reportMovement?.maxLocalUpdateMs).toBeLessThanOrEqual(LOCAL_UPDATE_LIMIT_MS);\n', 'report local assertion'),
    ('  const markerScripts = loafs.flatMap((frame) => frame.scripts.filter((script) => /updateMarkers|drawSafePositionMarkers/i.test(scriptIdentity(script))).map((script) => script.durationMs));\n', 'marker script attribution'),
    ('    movement.maxMainThreadApplyMs + movement.maxLocalUpdateMs,\n', 'worker response local aggregate'),
    ('  if (movement.maxLocalUpdateMs > LOCAL_UPDATE_LIMIT_MS) blockingFailures.push(`renderer-local update max ${movement.maxLocalUpdateMs} > ${LOCAL_UPDATE_LIMIT_MS}`);\n', 'local attribution failure'),
]:
    content = remove_exact(content, line, label)
content = replace_exact(
    content,
    "test('wall crossing proves the applied async winner flips to the protected side', async ({ page }) => {",
    "test('wall crossing applies the final canonical async field after threat-side change', async ({ page }) => {",
    'wall test title',
)
content = remove_regex(
    content,
    r'\n    rendererLocalSafePositionAndRouteEvaluation: \{.*?\n    \},',
    'renderer local attribution phase',
)
content = remove_regex(
    content,
    r'\n    markerRedraw: \{.*?\n    \},',
    'marker attribution phase',
)
content = remove_regex(
    content,
    r'\nfunction requireWinner\(snapshotValue: MovementSnapshot\): SafePositionSnapshot \{.*?\n\}\n',
    'movement require winner helper',
)
content = content.replace('conservative raster/local aggregate', 'conservative raster-apply bound')
content = content.replace('conservative raster-apply plus renderer-local aggregate; no matching LoAF script was emitted', 'conservative raster-apply bound; no matching LoAF script was emitted')
write(path, content)


# Evidence assertion no longer requires local winner movement.
path = 'scripts/assert_danger_layer_movement_evidence.mjs'
content = read(path)
for line, label in [
    ('  if ((final.maxLocalUpdateMs ?? Infinity) > 10) failures.push(`local selected-unit update exceeded 10 ms: ${final.maxLocalUpdateMs}`);\n', 'assert final local bound'),
    ('  if ((phases.rendererLocalSafePositionAndRouteEvaluation ?? Infinity) > 10) failures.push(`renderer-local update exceeded 10 ms: ${phases.rendererLocalSafePositionAndRouteEvaluation}`);\n', 'assert local phase bound'),
    ("  if (!(counters.ownMovementLocalUpdateDelta > 0)) failures.push('selected-only local updates did not increase');\n", 'assert selected local update'),
    ("  if (!(counters.safePositionLocalScanDelta > 0)) failures.push('selected-only safe-position scans did not increase');\n", 'assert selected safe scan'),
    ("  if (!(counters.ownMovementLocalUpdateDelta > 0)) failures.push('six-unit scenario did not exercise selected-unit local updates');\n", 'assert six-unit local update'),
]:
    content = remove_exact(content, line, label)
content = replace_regex(
    content,
    r"  const beforeWinner = before\?\.bestSafePosition\?\.position;\n  const afterWinner = after\?\.bestSafePosition\?\.position;\n  if \(!\[wallX, beforeThreat\?\.x, afterThreat\?\.x, beforeWinner\?\.x, afterWinner\?\.x\]\.every\(Number\.isFinite\)\) \{\n    failures\.push\('wall-crossing geometry is incomplete'\);\n    return;\n  \}\n",
    'assert wall winner geometry',
)
for line, label in [
    ("  if (!(beforeWinner.x < wallX)) failures.push('initial renderer-local winner is not west/protected');\n", 'assert initial winner side'),
    ("  if (!(afterWinner.x > wallX)) failures.push('final renderer-local winner is not east/protected');\n", 'assert final winner side'),
    ("  if (!after?.protectedAgainstThreatId || after.protectedAgainstThreatId !== before?.protectedAgainstThreatId) {\n    failures.push('wall-crossing protectedAgainstThreatId was not preserved');\n  }\n", 'assert protected threat id'),
    ("  if (wall.counters?.winnerChanged !== true) failures.push('wall-crossing renderer-local winner did not change');\n", 'assert winner changed'),
]:
    content = remove_exact(content, line, label)
content = replace_exact(
    content,
    '  if (![wallX, beforeThreat?.x, afterThreat?.x].every(Number.isFinite)) {\n    failures.push(\'wall-crossing geometry is incomplete\');\n    return;\n  }\n',
    '  if (![wallX, beforeThreat?.x, afterThreat?.x].every(Number.isFinite)) {\n    failures.push(\'wall-crossing geometry is incomplete\');\n    return;\n  }\n',
    'wall geometry retained',
) if False else content
write(path, content)


# Attribution finalizer uses only actual worker-response and raster-apply timing now.
path = 'scripts/finalize_danger_layer_movement_attribution.mjs'
content = read(path)
for line, label in [
    ('const LOCAL_LIMIT_MS = 10;\n', 'finalizer local limit'),
    ('  Number(final.maxMainThreadApplyMs ?? 0) + Number(final.maxLocalUpdateMs ?? 0),\n', 'finalizer local aggregate'),
    ('if (Number(final.maxLocalUpdateMs ?? Infinity) > LOCAL_LIMIT_MS) failures.push(`renderer-local update max ${final.maxLocalUpdateMs} > ${LOCAL_LIMIT_MS}`);\n', 'finalizer local failure'),
]:
    content = remove_exact(content, line, label)
content = remove_regex(
    content,
    r'\n  rendererLocalSafePositionAndRouteEvaluation: \{.*?\n  \},',
    'finalizer local phase',
)
content = content.replace('Long Animation Frame named worker-response scripts plus conservative raster/local aggregate', 'Long Animation Frame named worker-response scripts plus conservative raster-apply bound')
content = content.replace('conservative upper bound: production raster apply max + renderer-local update max', 'conservative upper bound: production raster apply max')
content = content.replace('|updateLocalDerived|updateMarkers|drawSafePositionMarkers', '')
write(path, content)


for root_name in ('tests', 'scripts'):
    root = ROOT / root_name
    for source_path in root.rglob('*'):
        if not source_path.is_file() or source_path.suffix not in {'.ts', '.mjs'}:
            continue
        source = source_path.read_text(encoding='utf-8')
        for forbidden in (
            'bestSafePosition',
            'SafePositionSnapshot',
            'SoldierSafePosition',
            'safePositionLocalScans',
            'safePositionCellsScanned',
            'rendererLocalSafePositionAndRouteEvaluation',
            'drawSafePositionMarkers',
        ):
            if forbidden in source:
                raise RuntimeError(f'legacy safe-position evidence identifier {forbidden!r} remains in {source_path.relative_to(ROOT)}')

print('Removed legacy safe-position expectations from browser evidence and post-processing.')
