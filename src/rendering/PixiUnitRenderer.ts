import { Container, Graphics } from 'pixi.js';
import type { UnitPosture } from '../core/behavior/BehaviorModel';
import type { WeaponClass } from '../core/infantry-combat/catalogs/CombatCatalogTypes';
import { gridToWorld, type TacticalMap } from '../core/map/MapModel';
import type { UnitModel } from '../core/units/UnitModel';

const UNIT_RADIUS_CELL_FRACTION = 0.18;
const MIN_UNIT_RADIUS_PX = 4.5;
const DIRECTION_EPSILON = 1e-9;
const FAR_ENTER_ZOOM = 0.66;
const FAR_EXIT_ZOOM = 0.78;
const NEAR_ENTER_ZOOM = 1.42;
const NEAR_EXIT_ZOOM = 1.26;
const INITIAL_FAR_ZOOM = 0.72;
const INITIAL_NEAR_ZOOM = 1.34;

export type UnitRendererLod = 'near' | 'medium' | 'far';
export type UnitSymbolShape = 'circle' | 'rounded-triangle' | 'rounded-rectangle' | 'square' | 'death';

type CombatVisualState = 'effective' | 'wounded' | 'incapacitated' | 'dead';

interface UnitVisualState {
  posture: UnitPosture;
  combat: CombatVisualState;
  weaponClass: WeaponClass;
  movementMarks: 0 | 1 | 2;
  suppression: number;
  aiming: boolean;
  shotId: string | null;
}

interface UnitView {
  container: Container;
  movement: Graphics;
  suppression: Graphics;
  body: Graphics;
  wound: Graphics;
  weapon: Graphics;
  aim: Graphics;
  flash: Graphics;
  death: Graphics;
  selection: Graphics;
  lod: UnitRendererLod | null;
  shape: UnitSymbolShape;
  geometryKey: string;
  detailKey: string;
  selected: boolean;
  movementMarks: 0 | 1 | 2;
  rebuildCount: number;
  lastShotId: string | null | undefined;
}

export interface UnitRendererDiagnostics {
  viewCount: number;
  creationCount: number;
  removalCount: number;
  updateCount: number;
  geometryRebuildCount: number;
  lodTransitionCount: number;
}

export interface UnitRendererViewDiagnostics {
  lod: UnitRendererLod;
  shape: UnitSymbolShape;
  selected: boolean;
  movementMarkerCount: 0 | 1 | 2;
  weaponVisible: boolean;
  aimCueVisible: boolean;
  muzzleFlashVisible: boolean;
  suppressionVisible: boolean;
  woundVisible: boolean;
  deathVisible: boolean;
  bodyRotation: number;
  weaponRotation: number;
  geometryRebuildCount: number;
}

type DebugWindow = Window & { __realWargameUnitRendererDebug?: UnitRendererDiagnostics };

export class PixiUnitRenderer {
  readonly container = new Container();
  private readonly views = new Map<string, UnitView>();
  private readonly diagnostics: UnitRendererDiagnostics = {
    viewCount: 0,
    creationCount: 0,
    removalCount: 0,
    updateCount: 0,
    geometryRebuildCount: 0,
    lodTransitionCount: 0,
  };

  constructor() {
    this.container.eventMode = 'none';
    this.container.interactiveChildren = false;
    this.publishDiagnostics();
  }

  render(map: TacticalMap, units: UnitModel[], selectedUnitIds: string[], zoom?: number): void {
    const selectedIds = new Set(selectedUnitIds);
    const visibleIds = new Set<string>();
    const baseRadius = getUnitRadius(map);
    const displayZoom = normalizeZoom(zoom ?? this.container.parent?.scale.x ?? 1);

    for (const [index, unit] of units.entries()) {
      visibleIds.add(unit.id);
      let view = this.views.get(unit.id);
      if (!view) {
        view = createView();
        this.views.set(unit.id, view);
        this.container.addChild(view.container);
        this.diagnostics.creationCount += 1;
      }
      if (this.container.getChildIndex(view.container) !== index) {
        this.container.setChildIndex(view.container, Math.min(index, this.container.children.length - 1));
      }
      updateView(view, map, unit, selectedIds.has(unit.id), baseRadius, displayZoom, this.diagnostics);
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

  getDiagnostics(): UnitRendererDiagnostics {
    return { ...this.diagnostics, viewCount: this.views.size };
  }

  getViewDiagnostics(unitId: string): UnitRendererViewDiagnostics | null {
    const view = this.views.get(unitId);
    if (!view?.lod) return null;
    return {
      lod: view.lod,
      shape: view.shape,
      selected: view.selected,
      movementMarkerCount: view.movementMarks,
      weaponVisible: view.weapon.visible,
      aimCueVisible: view.aim.visible,
      muzzleFlashVisible: view.flash.visible,
      suppressionVisible: view.suppression.visible,
      woundVisible: view.wound.visible,
      deathVisible: view.death.visible,
      bodyRotation: view.body.rotation,
      weaponRotation: view.weapon.rotation,
      geometryRebuildCount: view.rebuildCount,
    };
  }

  destroy(): void {
    for (const view of this.views.values()) view.container.destroy({ children: true });
    this.views.clear();
    this.container.removeChildren();
    this.diagnostics.viewCount = 0;
    if (typeof window !== 'undefined') delete (window as DebugWindow).__realWargameUnitRendererDebug;
  }

  private publishDiagnostics(): void {
    this.diagnostics.viewCount = this.views.size;
    if (typeof window !== 'undefined') {
      (window as DebugWindow).__realWargameUnitRendererDebug = { ...this.diagnostics };
    }
  }
}

export function resolveUnitRendererLod(zoom: number, previous: UnitRendererLod | null = null): UnitRendererLod {
  const value = normalizeZoom(zoom);
  if (previous === 'far') return value >= FAR_EXIT_ZOOM ? 'medium' : 'far';
  if (previous === 'near') return value <= NEAR_EXIT_ZOOM ? 'medium' : 'near';
  if (previous === 'medium') {
    if (value <= FAR_ENTER_ZOOM) return 'far';
    if (value >= NEAR_ENTER_ZOOM) return 'near';
    return 'medium';
  }
  if (value <= INITIAL_FAR_ZOOM) return 'far';
  if (value >= INITIAL_NEAR_ZOOM) return 'near';
  return 'medium';
}

function createView(): UnitView {
  const container = new Container();
  const movement = new Graphics();
  const suppression = new Graphics();
  const body = new Graphics();
  const wound = new Graphics();
  const weapon = new Graphics();
  const aim = new Graphics();
  const flash = new Graphics();
  const death = new Graphics();
  const selection = new Graphics();
  container.eventMode = 'none';
  container.interactiveChildren = false;
  for (const graphic of [movement, suppression, body, wound, weapon, aim, flash, death, selection]) {
    graphic.eventMode = 'none';
  }
  container.addChild(movement, suppression, body, wound, weapon, aim, flash, death, selection);
  return {
    container, movement, suppression, body, wound, weapon, aim, flash, death, selection,
    lod: null, shape: 'circle', geometryKey: '', detailKey: '', selected: false,
    movementMarks: 0, rebuildCount: 0, lastShotId: undefined,
  };
}

function updateView(
  view: UnitView,
  map: TacticalMap,
  unit: UnitModel,
  selected: boolean,
  baseRadius: number,
  zoom: number,
  diagnostics: UnitRendererDiagnostics,
): void {
  const position = gridToWorld(map, unit.position);
  view.container.position.set(position.x, position.y);

  const lod = resolveUnitRendererLod(zoom, view.lod);
  if (view.lod && view.lod !== lod) diagnostics.lodTransitionCount += 1;
  view.lod = lod;
  const state = resolveVisualState(unit);
  const radius = lodRadius(baseRadius, lod);
  const shape = resolveShape(state, lod);
  const dead = state.combat === 'dead';

  const geometryKey = [lod, radius.toFixed(3), shape, state.posture, unit.side, unit.type, unit.behaviorRuntime.state, state.combat, state.weaponClass].join(':');
  if (view.geometryKey !== geometryKey) {
    view.geometryKey = geometryKey;
    drawBody(view.body, unit, state, lod, shape, radius);
    drawWeapon(view.weapon, state.weaponClass, lod, radius);
    drawAim(view.aim, state.weaponClass, lod, radius);
    drawFlash(view.flash, state.weaponClass, lod, radius);
    drawDeath(view.death, lod, radius);
    drawSelection(view.selection, lod, radius, shape);
    view.rebuildCount += 6;
    diagnostics.geometryRebuildCount += 6;
  }

  const detailKey = `${lod}:${radius.toFixed(3)}:${state.movementMarks}`;
  if (view.detailKey !== detailKey) {
    view.detailKey = detailKey;
    drawMovement(view.movement, lod, state.movementMarks, radius);
    drawSuppression(view.suppression, lod, radius);
    drawWound(view.wound, lod, radius);
    view.rebuildCount += 3;
    diagnostics.geometryRebuildCount += 3;
  }

  view.shape = shape;
  view.selected = selected;
  view.movementMarks = state.movementMarks;
  const orientBody = lod !== 'far' && (shape === 'rounded-triangle' || shape === 'rounded-rectangle' || shape === 'death');
  view.body.rotation = orientBody ? unit.facingRadians : 0;
  view.death.rotation = orientBody ? unit.facingRadians : 0;
  view.selection.rotation = orientBody ? unit.facingRadians : 0;
  view.movement.rotation = unit.facingRadians;

  const weaponRotation = displayedWeaponRotation(unit);
  positionWeaponLayers(view, unit.facingRadians, weaponRotation, radius);
  view.weapon.visible = lod !== 'far' && !dead;
  view.aim.visible = view.weapon.visible && state.aiming;
  view.suppression.visible = lod !== 'far' && !dead && state.suppression > 0;
  view.suppression.alpha = Math.min(0.9, Math.max(0.25, state.suppression));
  view.wound.visible = lod !== 'far' && state.combat === 'wounded';
  view.death.visible = dead;
  view.selection.visible = selected;
  view.movement.visible = lod !== 'far' && !dead && state.movementMarks > 0;

  const newShot = view.lastShotId !== undefined && state.shotId !== null && state.shotId !== view.lastShotId;
  view.flash.visible = view.weapon.visible && newShot;
  view.lastShotId = state.shotId;
}

function resolveVisualState(unit: UnitModel): UnitVisualState {
  const infantry = unit.infantryCombatRuntime;
  const capabilities = infantry.wounds.capabilities;
  const legacyAction = unit.behaviorRuntime.currentAction;
  let combat: CombatVisualState = 'effective';
  if (!capabilities.alive || legacyAction === 'dead') combat = 'dead';
  else if (!capabilities.conscious || legacyAction === 'incapacitated') combat = 'incapacitated';
  else if (infantry.wounds.slots.length > 0) combat = 'wounded';

  const phase = infantry.activeFireTask?.phase;
  const solution = infantry.activeFireTask?.aimTracking.solution;
  const aiming = Boolean(solution?.valid && (phase === 'aiming' || phase === 'firing'));
  const shotId = infantry.primaryWeapon?.lastCommittedShotId ?? infantry.activeFireTask?.committedShotId ?? null;
  const movementMarks: 0 | 1 | 2 = !unit.movementRuntime.isMoving
    ? 0
    : unit.movementRuntime.actualGait === 'sprint' ? 2 : 1;
  return {
    posture: unit.behaviorRuntime.posture,
    combat,
    weaponClass: infantry.primaryWeapon?.resolved.weapon.weaponClass ?? legacyWeaponClass(unit),
    movementMarks,
    suppression: Math.max(0, infantry.suppression.suppressionLevel),
    aiming,
    shotId,
  };
}

function legacyWeaponClass(unit: UnitModel): WeaponClass {
  if (unit.heldItem === 'support_item') return 'machine_gun';
  if (unit.heldItem === 'short_item') return 'submachine_gun';
  return 'rifle';
}

function resolveShape(state: UnitVisualState, lod: UnitRendererLod): UnitSymbolShape {
  if (state.combat === 'dead') return 'death';
  if (lod === 'far') return state.weaponClass === 'machine_gun' ? 'square' : 'circle';
  if (state.posture === 'crouched') return 'rounded-triangle';
  if (state.posture === 'prone') return 'rounded-rectangle';
  return 'circle';
}

function displayedWeaponRotation(unit: UnitModel): number {
  const solution = unit.infantryCombatRuntime.activeFireTask?.aimTracking.solution;
  const direction = solution?.currentDirection;
  if (solution?.valid && direction && Number.isFinite(direction.x) && Number.isFinite(direction.y)
    && Math.hypot(direction.x, direction.y) > DIRECTION_EPSILON) {
    return Math.atan2(direction.y, direction.x);
  }
  return unit.facingRadians;
}

function positionWeaponLayers(view: UnitView, facing: number, weaponRotation: number, radius: number): void {
  const forward = radius * 0.08;
  const right = radius * 0.34;
  const x = forward * Math.cos(facing) - right * Math.sin(facing);
  const y = forward * Math.sin(facing) + right * Math.cos(facing);
  for (const graphic of [view.weapon, view.aim, view.flash]) {
    graphic.position.set(x, y);
    graphic.rotation = weaponRotation;
  }
}

function drawBody(g: Graphics, unit: UnitModel, state: UnitVisualState, lod: UnitRendererLod, shape: UnitSymbolShape, r: number): void {
  g.clear();
  const fill = unitFill(unit, state.combat);
  const border = unit.side === 'red' ? 0x5a1018 : 0x102f5c;
  const stroke = { width: lod === 'near' ? 2 : 1.5, color: border };
  if (shape === 'death') {
    g.roundRect(-r * 1.35, -r * 0.42, r * 2.7, r * 0.84, r * 0.18)
      .fill({ color: 0x5a5a5a, alpha: 0.72 }).stroke({ ...stroke, color: 0x343434 });
    return;
  }
  if (shape === 'square') {
    g.roundRect(-r * 0.72, -r * 0.72, r * 1.44, r * 1.44, r * 0.12).fill({ color: fill }).stroke(stroke);
    return;
  }
  if (shape === 'rounded-rectangle') {
    g.roundRect(-r * 1.4, -r * 0.48, r * 2.8, r * 0.96, r * 0.2).fill({ color: fill }).stroke(stroke);
    facingDot(g, r * 0.92, r);
    return;
  }
  if (shape === 'rounded-triangle') {
    const fx = r * 1.05;
    const rx = -r * 0.72;
    const h = r * 0.82;
    const c = r * 0.18;
    g.moveTo(fx, 0).quadraticCurveTo(fx - c, -c, fx - c * 1.4, -c * 1.2)
      .lineTo(rx + c, -h).quadraticCurveTo(rx, -h, rx, -h + c)
      .lineTo(rx, h - c).quadraticCurveTo(rx, h, rx + c, h)
      .lineTo(fx - c * 1.4, c * 1.2).quadraticCurveTo(fx - c, c, fx, 0)
      .closePath().fill({ color: fill }).stroke(stroke);
    facingDot(g, r * 0.52, r);
    return;
  }
  g.circle(0, 0, r).fill({ color: fill }).stroke(stroke);
  if (lod !== 'far') facingDot(g, r * 0.58, r);
}

function facingDot(g: Graphics, x: number, r: number): void {
  g.circle(x, 0, Math.max(1.1, r * 0.15)).fill({ color: 0xf6edcf, alpha: 0.95 });
}

function drawMovement(g: Graphics, lod: UnitRendererLod, count: 0 | 1 | 2, r: number): void {
  g.clear();
  if (lod === 'far' || count === 0) return;
  for (let i = 0; i < count; i += 1) {
    const x = -r * (1.55 + i * 0.48);
    const h = r * (lod === 'near' ? 0.42 : 0.34);
    g.moveTo(x - r * 0.34, -h).lineTo(x, 0).lineTo(x - r * 0.34, h);
  }
  g.stroke({ width: lod === 'near' ? 1.8 : 1.35, color: 0xf6edcf, alpha: 0.88 });
}

function drawSuppression(g: Graphics, lod: UnitRendererLod, r: number): void {
  g.clear();
  if (lod === 'far') return;
  const o = r + (lod === 'near' ? 5 : 3.5);
  const s = Math.max(2.5, r * 0.42);
  g.moveTo(-o, -o + s).lineTo(-o, -o).lineTo(-o + s, -o);
  g.moveTo(o - s, -o).lineTo(o, -o).lineTo(o, -o + s);
  g.moveTo(o, o - s).lineTo(o, o).lineTo(o - s, o);
  g.moveTo(-o + s, o).lineTo(-o, o).lineTo(-o, o - s);
  g.stroke({ width: lod === 'near' ? 1.8 : 1.4, color: 0xb6633c, alpha: 0.95 });
}

function drawWound(g: Graphics, lod: UnitRendererLod, r: number): void {
  g.clear();
  if (lod === 'far') return;
  const mr = Math.max(2.2, r * (lod === 'near' ? 0.34 : 0.28));
  const x = r * 0.95;
  const y = r * 0.92;
  g.circle(x, y, mr).fill({ color: 0xefe6cf, alpha: 0.96 }).stroke({ width: 1.2, color: 0x7e2d2f });
  g.moveTo(x - mr * 0.5, y).lineTo(x + mr * 0.5, y).moveTo(x, y - mr * 0.5).lineTo(x, y + mr * 0.5);
  g.stroke({ width: 1.2, color: 0x9f3438, alpha: 0.96 });
}

function drawWeapon(g: Graphics, weapon: WeaponClass, lod: UnitRendererLod, r: number): void {
  g.clear();
  if (lod === 'far') return;
  const length = weaponLength(weapon, r);
  const width = weapon === 'machine_gun' ? 3 : weapon === 'submachine_gun' ? 2.5 : 2;
  g.moveTo(0, 0).lineTo(length, 0).stroke({ width: lod === 'near' ? width : Math.max(1.5, width - 0.5), color: 0x1a1710 });
  if (weapon === 'machine_gun') {
    g.moveTo(r * 0.7, -r * 0.22).lineTo(r * 0.7, r * 0.22).stroke({ width: 1.2, color: 0xd2c09a });
  }
}

function drawAim(g: Graphics, weapon: WeaponClass, lod: UnitRendererLod, r: number): void {
  g.clear();
  if (lod === 'far') return;
  const muzzle = weaponLength(weapon, r);
  if (lod === 'near') {
    const gap = r * 0.22;
    const len = r * 0.42;
    g.moveTo(muzzle + gap, 0).lineTo(muzzle + gap + len, 0)
      .moveTo(muzzle + gap * 2 + len, 0).lineTo(muzzle + gap * 2 + len * 2, 0)
      .stroke({ width: 1.2, color: 0xf6edcf, alpha: 0.92 });
  } else {
    const x = muzzle + r * 0.48;
    const c = Math.max(2, r * 0.28);
    g.moveTo(x - c, 0).lineTo(x + c, 0).moveTo(x, -c).lineTo(x, c)
      .stroke({ width: 1.1, color: 0xf6edcf, alpha: 0.9 });
  }
}

function drawFlash(g: Graphics, weapon: WeaponClass, lod: UnitRendererLod, r: number): void {
  g.clear();
  if (lod === 'far') return;
  const x = weaponLength(weapon, r);
  const s = r * (lod === 'near' ? 0.46 : 0.34);
  g.moveTo(x, 0).lineTo(x + s, -s * 0.35).lineTo(x + s * 0.72, 0)
    .lineTo(x + s, s * 0.35).lineTo(x, 0).closePath().fill({ color: 0xf0c75e, alpha: 0.98 });
}

function drawDeath(g: Graphics, lod: UnitRendererLod, r: number): void {
  g.clear();
  const h = r * (lod === 'far' ? 0.55 : 0.72);
  g.moveTo(-h, -h).lineTo(h, h).moveTo(h, -h).lineTo(-h, h)
    .stroke({ width: lod === 'near' ? 2 : 1.6, color: 0x242424, alpha: 0.96 });
}

function drawSelection(g: Graphics, lod: UnitRendererLod, r: number, shape: UnitSymbolShape): void {
  g.clear();
  const sr = r + (lod === 'far' ? 3 : lod === 'medium' ? 4 : 5);
  const stroke = { width: lod === 'far' ? 1.6 : 2, color: 0xfff2a8, alpha: 0.96 };
  if (shape === 'rounded-rectangle' || shape === 'death') {
    g.roundRect(-sr * 1.45, -sr * 0.72, sr * 2.9, sr * 1.44, Math.max(2, r * 0.3)).stroke(stroke);
  } else {
    g.circle(0, 0, sr).stroke(stroke);
  }
}

function weaponLength(weapon: WeaponClass, r: number): number {
  if (weapon === 'machine_gun') return r * 2.15;
  if (weapon === 'submachine_gun') return r * 1.38;
  if (weapon === 'pistol') return r * 0.95;
  return r * 1.78;
}

function unitFill(unit: UnitModel, combat: CombatVisualState): number {
  if (combat === 'dead') return 0x5a5a5a;
  if (combat === 'incapacitated') return 0x686868;
  if (unit.behaviorRuntime.state === 'stressed') return unit.side === 'red' ? 0xb73d48 : 0x356db7;
  if (unit.side === 'red') return unit.type === 'support_team' ? 0xe04f5b : unit.type === 'scout_team' ? 0xef7650 : 0xd94b45;
  return unit.type === 'support_team' ? 0x4b7fd0 : unit.type === 'scout_team' ? 0x70a9f5 : 0x4f8fe5;
}

function getUnitRadius(map: TacticalMap): number {
  return Math.max(MIN_UNIT_RADIUS_PX, map.cellSize * UNIT_RADIUS_CELL_FRACTION);
}

function lodRadius(base: number, lod: UnitRendererLod): number {
  return lod === 'far' ? base * 1.45 : lod === 'medium' ? base * 1.1 : base;
}

function normalizeZoom(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}
