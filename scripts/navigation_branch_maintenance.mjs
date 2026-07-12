import { readFile, writeFile } from 'node:fs/promises';

const replacements = [
  {
    path: 'src/core/pathfinding/GridPathfinder.ts',
    edits: [
      [
        'tacticalSearch.visitedCells + (baseline.ok ? baseline.visitedCells : 0)',
        'tacticalSearch.visitedCells',
      ],
    ],
  },
  {
    path: 'src/core/orders/PlayerCommand.ts',
    edits: [[
      'readonly movementMode: NavigationMovementMode;',
      'readonly movementMode?: NavigationMovementMode;',
    ]],
  },
  {
    path: 'src/core/units/UnitModel.ts',
    edits: [
      ['unitRoleNavigationProfileId: string | null;', 'unitRoleNavigationProfileId?: string | null;'],
      ['navigationMovementMode: NavigationMovementMode | null;', 'navigationMovementMode?: NavigationMovementMode | null;'],
      ['activeNavigationProfileId: string;', 'activeNavigationProfileId?: string;'],
      ['activeNavigationProfileSource: NavigationProfileSource;', 'activeNavigationProfileSource?: NavigationProfileSource;'],
    ],
  },
  {
    path: 'src/core/navigation/RouteCostField.ts',
    edits: [
      [
        "import type { NavigationProfile, NavigationTerrainCostKey } from './NavigationProfiles';\n",
        "import type { NavigationProfile, NavigationTerrainCostKey } from './NavigationProfiles';\n\nconst mapIdentityByMap = new WeakMap<TacticalMap, number>();\nlet nextMapIdentity = 1;\n",
      ],
      [
        '  const staticKey = [\n    map.width,',
        '  const staticKey = [\n    getMapIdentity(map),\n    map.width,',
      ],
      [
        'function trimCache<T>(cache: Map<string, T>, maximum: number): void {',
        "function getMapIdentity(map: TacticalMap): number {\n  const existing = mapIdentityByMap.get(map);\n  if (existing !== undefined) return existing;\n  const identity = nextMapIdentity;\n  nextMapIdentity += 1;\n  mapIdentityByMap.set(map, identity);\n  return identity;\n}\n\nfunction trimCache<T>(cache: Map<string, T>, maximum: number): void {",
      ],
    ],
  },
];

let changedFiles = 0;
for (const target of replacements) {
  const original = await readFile(target.path, 'utf8');
  let updated = original;
  for (const [before, after] of target.edits) {
    if (updated.includes(before)) {
      updated = updated.replaceAll(before, after);
      continue;
    }
    if (updated.includes(after)) continue;
    throw new Error(`Expected maintenance pattern was not found in ${target.path}: ${before.slice(0, 120)}`);
  }
  if (updated !== original) {
    await writeFile(target.path, updated, 'utf8');
    changedFiles += 1;
    console.log(`Updated ${target.path}`);
  }
}

console.log(`Navigation branch maintenance complete. Changed files: ${changedFiles}.`);
