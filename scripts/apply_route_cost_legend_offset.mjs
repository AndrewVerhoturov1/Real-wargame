import { readFileSync, writeFileSync, rmSync } from 'node:fs';

const path = 'src/rendering/PixiRouteCostOverlayRenderer.ts';
let source = readFileSync(path, 'utf8');
const before = 'this.legend.position.set(8, 8);';
const after = 'this.legend.position.set(8, 34);';
if (!source.includes(before)) throw new Error('Route cost legend anchor missing');
source = source.replace(before, after);
writeFileSync(path, source, 'utf8');
rmSync('scripts/apply_route_cost_legend_offset.mjs', { force: true });
rmSync('.github/workflows/tmp-apply-route-cost-legend.yml', { force: true });
console.log('Moved route cost legend below front-zone labels.');
