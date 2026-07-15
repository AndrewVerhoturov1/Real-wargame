import { Container, Graphics } from 'pixi.js';
import { gridToWorld, type TacticalMap } from '../core/map/MapModel';
import type { UnitModel } from '../core/units/UnitModel';

const UNIT_RADIUS_CELL_FRACTION = 0.18;
const MIN_UNIT_RADIUS_PX = 4.5;

interface UnitView {
  container: Container;
  stress: Graphics;
  body: Graphics;
  weapon: Graphics;
  posture: Graphics;
  selection: Graphics;
  bodyKey: string;
  weaponKey: string;
  radius: number;
}

export interface UnitRendererDiagnostics {
  viewCount: number;
  creationCount: number;
  removalCount: number;
  updateCount: number;
  geometryRebuildCount: number;
}

type UnitRendererDebugWindow = Window & {
  __realWargameUnitRendererDebug?: UnitRendererDiagnostics;
};

export class PixiUnitRenderer {
  readonly container = new Container();
  private readonly views = new Map<string, UnitView>();
  private readonly diagnostics: UnitRendererDiagnostics = {
    viewCount: 0,
    creationCount: 0,
    removalCount: 0,
    updateCount: 0,
    geometryRebuildCount: 0,
  };

  constructor() {
    this.container.eventMode = 'none';
    this.container.interactiveChildren = false;
    this.publishDiagnostics();
  }

  render(map: TacticalMap, units: UnitModel[], selectedUnitIds: string[]): void {
    const selectedIds = new Set(selectedUnitIds);
    const visibleIds = new Set<string>();
    const unitRadius = getUnitRadius(map);

    for (const [index, unit] of units.entries()) {
      visibleIds.add(unit.id);
      let view = this.views.get(unit.id);
      if (!view) {
        view = createUnitView();
        this.views.set(unit.id, view);
        this.container.addChild(view.container);
        this.diagnostics.creationCount += 1;
      }

      if (this.container.getChildIndex(view.container) !== index) {
        this.container.setChildIndex(view.container, Math.min(index, this.container.children.length - 1));
      }
      updateUnitView(view, map, unit, selectedIds.has(unit.id), unitRadius, this.diagnostics);
      this.diagnostics.updateCount += 1;
    }

    for (const [unitId, view] of this.views) {
      if (visibleIds.has(unitId)) continue;
      this.views.delete(unitId);
      this.container.removeChild(view.container);
      view.container.destroy({ children: true });
      this.diagnostics.removalCount += 1;
    }

    this.publishDiagnostics();
  }

  destroy(): void {
    for (const view of this.views.values()) view.container.destroy({ children: true });
    this.views.clear();
    this.container.removeChildren();
    delete (window as UnitRendererDebugWindow).__realWargameUnitRendererDebug;
  }

  private publishDiagnostics(): void {
    this.diagnostics.viewCount = this.views.size;
    (window as UnitRendererDebugWindow).__realWargameUnitRendererDebug = { ...this.diagnostics };
  }
}

function createUnitView(): UnitView {
  const container = new Container();
  const stress = new Graphics();
  const body = new Graphics();
  const weapon = new Graphics();
  const posture = new Graphics();
  const selection = new Graphics();

  container.eventMode = 'none';
  container.interactiveChildren = false;
  for (const graphics of [stress, body, weapon, posture, selection]) graphics.eventMode = 'none';
  container.addChild(stress, body, weapon, posture, selection);

  return {
    container,
    stress,
    body,
    weapon,
    posture,
    selection,
    bodyKey: '',
    weaponKey: '',
    radius: 0,
  };
}

function updateUnitView(
  view: UnitView,
  map: TacticalMap,
  unit: UnitModel,
  selected: boolean,
  unitRadius: number,
  diagnostics: UnitRendererDiagnostics,
): void {
  const position = gridToWorld(map, unit.position);
  view.container.position.set(position.x, position.y);

  const bodyKey = [
    unitRadius.toFixed(3),
    unit.type,
    unit.side,
    unit.behaviorRuntime.state,
    unit.behaviorRuntime.currentAction,
    unit.behaviorRuntime.posture,
  ].join(':');
  if (bodyKey !== view.bodyKey) {
    view.bodyKey = bodyKey;
    view.radius = unitRadius;
    redrawBody(view.body, unit, unitRadius);
    redrawPosture(view.posture, unit, unitRadius);
    redrawStress(view.stress, unitRadius);
    redrawSelection(view.selection, unitRadius);
    diagnostics.geometryRebuildCount += 4;
  }

  const weaponKey = `${unitRadius.toFixed(3)}:${unit.heldItem}`;
  if (weaponKey !== view.weaponKey) {
    view.weaponKey = weaponKey;
    redrawWeapon(view.weapon, unit.heldItem, unitRadius);
    diagnostics.geometryRebuildCount += 1;
  }

  view.weapon.rotation = unit.facingRadians;
  view.selection.visible = selected;
  view.stress.visible = unit.behaviorRuntime.stress > 0;
  view.stress.alpha = Math.min(0.7, Math.max(0.12, unit.behaviorRuntime.stress / 160));
}

function redrawBody(graphics: Graphics, unit: UnitModel, unitRadius: number): void {
  graphics.clear();
  const fill = getUnitFill(unit);
  const border = unit.side === 'red' ? 0x5a1018 : 0x102f5c;
  if (unit.behaviorRuntime.posture === 'prone') {
    graphics.roundRect(-unitRadius * 1.5, -unitRadius * 0.45, unitRadius * 3, unitRadius * 0.9, 4)
      .fill({ color: fill })
      .stroke({ width: 2, color: border });
    return;
  }

  const radius = unit.behaviorRuntime.posture === 'crouched' ? unitRadius * 0.75 : unitRadius;
  graphics.circle(0, 0, radius).fill({ color: fill }).stroke({ width: 2, color: border });
}

function redrawPosture(graphics: Graphics, unit: UnitModel, unitRadius: number): void {
  graphics.clear();
  if (unit.behaviorRuntime.posture === 'standing') return;

  if (unit.behaviorRuntime.posture === 'crouched') {
    graphics.moveTo(-unitRadius * 0.8, unitRadius * 1.25).lineTo(unitRadius * 0.8, unitRadius * 1.25)
      .stroke({ width: 1.5, color: 0xf6edcf, alpha: 0.9 });
    return;
  }

  graphics.moveTo(-unitRadius, unitRadius * 1.15).lineTo(unitRadius, unitRadius * 1.15)
    .stroke({ width: 1.5, color: 0xf6edcf, alpha: 0.9 });
  graphics.moveTo(-unitRadius * 0.8, unitRadius * 1.55).lineTo(unitRadius * 0.8, unitRadius * 1.55)
    .stroke({ width: 1.5, color: 0xf6edcf, alpha: 0.9 });
}

function redrawStress(graphics: Graphics, unitRadius: number): void {
  graphics.clear();
  graphics.circle(0, 0, unitRadius + 5).stroke({ width: 1.5, color: 0xb6633c });
}

function redrawSelection(graphics: Graphics, unitRadius: number): void {
  graphics.clear();
  const selectionRadius = unitRadius + 5;
  graphics.roundRect(
    -selectionRadius,
    -selectionRadius,
    selectionRadius * 2,
    selectionRadius * 2,
    4,
  ).stroke({ width: 2, color: 0xfff2a8, alpha: 0.96 });
}

function redrawWeapon(graphics: Graphics, itemKind: UnitModel['heldItem'], unitRadius: number): void {
  graphics.clear();
  const startX = unitRadius * 0.6;
  const length = itemKind === 'support_item'
    ? unitRadius * 2.2
    : itemKind === 'short_item'
      ? unitRadius * 1.4
      : unitRadius * 1.8;
  const endX = startX + length;

  graphics.moveTo(startX, 0).lineTo(endX, 0)
    .stroke({ width: itemKind === 'support_item' ? 3 : 2, color: 0x1a1710 });
  graphics.moveTo(startX, -unitRadius * 0.5).lineTo(startX, unitRadius * 0.5)
    .stroke({ width: 1.5, color: 0xd2c09a, alpha: 0.95 });
}

function getUnitFill(unit: UnitModel): number {
  if (unit.behaviorRuntime.currentAction === 'dead') return 0x2d2d2d;
  if (unit.behaviorRuntime.currentAction === 'incapacitated') return 0x555555;
  if (unit.behaviorRuntime.state === 'stressed') return unit.side === 'red' ? 0xb73d48 : 0x356db7;
  if (unit.side === 'red') {
    if (unit.type === 'support_team') return 0xe04f5b;
    if (unit.type === 'scout_team') return 0xef7650;
    return 0xd94b45;
  }
  if (unit.type === 'support_team') return 0x4b7fd0;
  if (unit.type === 'scout_team') return 0x70a9f5;
  return 0x4f8fe5;
}

function getUnitRadius(map: TacticalMap): number {
  return Math.max(MIN_UNIT_RADIUS_PX, map.cellSize * UNIT_RADIUS_CELL_FRACTION);
}
