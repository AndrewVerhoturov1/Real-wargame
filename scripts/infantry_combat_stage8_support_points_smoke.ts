import assert from 'node:assert/strict';
import {
  SUPPRESSION_GOLDEN_ANGLE_RADIANS,
  getSuppressionSupportPoint,
} from '../src/core/infantry-combat/runtime';

verifyDeterministicPattern();
verifyPatternInsideCircle();
verifyTaskRotationAndCoverage();

console.log('Infantry combat Stage 8 support-point smoke passed: deterministic golden-angle pattern, bounded radius and stable task rotation.');

function verifyDeterministicPattern(): void {
  const center = { xMetres: 20, yMetres: 30, zMetres: 1.2 };
  const first = getSuppressionSupportPoint('support-task-a', 3, 10, center, 8);
  const repeated = getSuppressionSupportPoint('support-task-a', 3, 10, center, 8);
  assert.deepEqual(repeated, first);
  assert.equal(first.zMetres, center.zMetres);
  assert.ok(Number.isFinite(SUPPRESSION_GOLDEN_ANGLE_RADIANS));
}

function verifyPatternInsideCircle(): void {
  const center = { xMetres: -5, yMetres: 7, zMetres: 0.8 };
  const radius = 12;
  for (let ordinal = 0; ordinal < 64; ordinal += 1) {
    const point = getSuppressionSupportPoint('support-task-b', ordinal, 64, center, radius);
    const distance = Math.hypot(point.xMetres - center.xMetres, point.yMetres - center.yMetres);
    assert.ok(distance <= radius + 1e-12, `ordinal ${ordinal} escaped the target circle`);
    assert.ok(distance > 0, 'half-cell radial sampling must not collapse onto the centre');
  }
}

function verifyTaskRotationAndCoverage(): void {
  const center = { xMetres: 0, yMetres: 0, zMetres: 0 };
  const first = Array.from({ length: 10 }, (_, ordinal) => (
    getSuppressionSupportPoint('support-task-c', ordinal, 10, center, 10)
  ));
  const rotated = Array.from({ length: 10 }, (_, ordinal) => (
    getSuppressionSupportPoint('support-task-d', ordinal, 10, center, 10)
  ));
  assert.notDeepEqual(rotated, first);
  const quadrants = new Set(first.map((point) => `${point.xMetres >= 0 ? '+' : '-'}${point.yMetres >= 0 ? '+' : '-'}`));
  assert.ok(quadrants.size >= 3, 'finite suppress burst must cover several quadrants');
}
