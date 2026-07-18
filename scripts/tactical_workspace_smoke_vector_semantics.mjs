import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function expectIncludes(relativePath, snippets) {
  let content = '';
  try {
    content = read(relativePath);
  } catch {
    failures.push(`${relativePath}: file is missing`);
    return;
  }
  for (const snippet of snippets) {
    if (!content.includes(snippet)) failures.push(`${relativePath}: missing ${JSON.stringify(snippet)}`);
  }
}

function expectExcludes(relativePath, snippets) {
  const content = read(relativePath);
  for (const snippet of snippets) {
    if (content.includes(snippet)) failures.push(`${relativePath}: must not contain ${JSON.stringify(snippet)}`);
  }
}

expectIncludes('src/rendering/PixiOverlayRenderer.ts', [
  'STABLE_DIRECTIONAL_FIRE_COLOR', 'CURRENT_CONTACT_MARKER_COLOR',
  'drawZoneHandles(graphics, zone, cellSize, stroke);',
  'graphics.fill({ color: 0xfff2a8 }).stroke(stroke);',
  ".fill({ color: isSelected ? 0xfff2a8 : 0xff765f, alpha: activeAlpha })\n    .stroke(directionStroke);",
]);
expectExcludes('src/rendering/PixiOverlayRenderer.ts', [
  'const dangerColor = threat.visibleNow ? 0xff4e3d : 0xf09a55;',
  'graphics.rect(x * cellSize - handleSize / 2, y * cellSize - handleSize / 2, handleSize, handleSize).fill({ color: 0xfff2a8 });',
  'graphics.circle(centerX, centerY, isSelected ? 7 : 5).fill({ color: isSelected ? 0xfff2a8 : 0xff765f, alpha: activeAlpha });',
]);

expectIncludes('src/rendering/PixiMapRenderer.ts', [
  'const materialGraphics = new Map<string, Graphics>();',
  'const material = getSurfaceMaterial(environment, materialId);',
  'color: material.presentation.colorTint,',
  'alpha: material.presentation.opacity,',
  'const selectedControlStroke = { width: 3, color: 0xfff2a8, alpha: 0.95 };',
  'graphics.fill({ color: 0xfff2a8 }).stroke(selectedControlStroke);',
  'graphics.circle(0, 0, radius * 0.55).fill({ color: 0x293844 }).stroke(outline);',
]);
expectExcludes('src/rendering/PixiMapRenderer.ts', [
  ').fill({ color: style.fill });',
  'graphics.moveTo(px, 0).lineTo(px, mapHeight).stroke({ width: 1, color: 0xf6edcf, alpha: 0.12 });',
  'graphics.rect(point[0] - handle / 2, point[1] - handle / 2, handle, handle).fill({ color: 0xfff2a8 });',
]);
expectIncludes('src/rendering/PixiOrderRenderer.ts', [
  "stroke: { color: 0x101720, width: 3, join: 'round' }",
  'graphics.stroke({ width, color, alpha });',
]);
expectIncludes('src/rendering/AdaptiveGridLodInstaller.ts', [
  'graphics.stroke({ width: 2, color: 0xf6edcf, alpha: 0.22 });',
]);

if (failures.length > 0) {
  console.error('PixiJS 8 vector semantics contract failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('PixiJS 8 vector semantics contract passed.');
