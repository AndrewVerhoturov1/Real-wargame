import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { gridToWorld, type TacticalMap } from '../core/map/MapModel';
import type { UnitModel } from '../core/units/UnitModel';
import {
  buildCommandPlanRouteOverlaySnapshot,
  type CommandPlanRouteOverlaySnapshot,
  type PlanStageOverlaySnapshot,
} from './CommandPlanRouteOverlayModel';

const COMMAND_COLOR = 0xffd85a;
const PLAN_COLOR = 0x62aaff;
const ROUTE_COLOR = 0x66e38a;
const FAILURE_COLOR = 0xff755f;
const OVERLAY_OFF_CLASS = 'command-plan-route-overlay-off';
const LABEL_STYLE = new TextStyle({
  fontFamily: 'Arial, sans-serif',
  fontSize: 12,
  fontWeight: '600',
  fill: 0xdcecff,
  stroke: 0x101720,
  strokeThickness: 3,
  lineJoin: 'round',
});

interface UnitOverlayView {
  readonly root: Container;
  readonly commandGraphics: Graphics;
  readonly planGraphics: Graphics;
  readonly routeGraphics: Graphics;
  readonly activeStageLabel: Text;
  key: string;
}

export interface OrderRendererDiagnostics {
  readonly activeViews: number;
  readonly createdViews: number;
  readonly destroyedViews: number;
  readonly redrawnViews: number;
}

export class PixiOrderRenderer {
  readonly container = new Container();
  private readonly views = new Map<string, UnitOverlayView>();
  private createdViews = 0;
  private destroyedViews = 0;
  private redrawnViews = 0;

  render(
    map: TacticalMap,
    units: readonly UnitModel[],
    selectedUnitIds: readonly string[],
    active?: boolean,
  ): void {
    const visible = active ?? isOverlayEnabled();
    this.container.visible = visible;
    if (!visible) return;

    const selectedIds = new Set(selectedUnitIds);
    const visibleIds = new Set<string>();

    for (const unit of units) {
      const snapshot = buildCommandPlanRouteOverlaySnapshot(map, unit, selectedIds.has(unit.id));
      if (!hasVisibleContent(snapshot)) continue;
      visibleIds.add(unit.id);

      const view = this.views.get(unit.id) ?? this.createView(unit.id);
      if (view.key === snapshot.key) continue;
      this.drawView(map, view, snapshot);
      view.key = snapshot.key;
      this.redrawnViews += 1;
    }

    for (const [unitId, view] of this.views) {
      if (visibleIds.has(unitId)) continue;
      this.destroyView(unitId, view);
    }
  }

  getDiagnostics(): OrderRendererDiagnostics {
    return {
      activeViews: this.views.size,
      createdViews: this.createdViews,
      destroyedViews: this.destroyedViews,
      redrawnViews: this.redrawnViews,
    };
  }

  destroy(): void {
    for (const [unitId, view] of [...this.views]) this.destroyView(unitId, view);
    this.container.removeChildren();
  }

  private createView(unitId: string): UnitOverlayView {
    const root = new Container();
    root.name = `command-plan-route:${unitId}`;
    root.eventMode = 'none';
    root.interactiveChildren = false;

    const commandGraphics = new Graphics();
    const planGraphics = new Graphics();
    const routeGraphics = new Graphics();
    const activeStageLabel = new Text('', LABEL_STYLE);
    activeStageLabel.anchor.set(0.5, 1);
    activeStageLabel.visible = false;
    root.addChild(commandGraphics, planGraphics, routeGraphics, activeStageLabel);
    this.container.addChild(root);

    const view: UnitOverlayView = {
      root,
      commandGraphics,
      planGraphics,
      routeGraphics,
      activeStageLabel,
      key: '',
    };
    this.views.set(unitId, view);
    this.createdViews += 1;
    return view;
  }

  private destroyView(unitId: string, view: UnitOverlayView): void {
    this.views.delete(unitId);
    this.container.removeChild(view.root);
    view.root.destroy({ children: true });
    this.destroyedViews += 1;
  }

  private drawView(
    map: TacticalMap,
    view: UnitOverlayView,
    snapshot: CommandPlanRouteOverlaySnapshot,
  ): void {
    drawCommand(map, view.commandGraphics, snapshot);
    drawPlan(map, view.planGraphics, snapshot);
    drawRoute(map, view.routeGraphics, snapshot);
    updateActiveStageLabel(map, view.activeStageLabel, snapshot);
  }
}

function hasVisibleContent(snapshot: CommandPlanRouteOverlaySnapshot): boolean {
  return Boolean(snapshot.command)
    || (snapshot.selected && (snapshot.planStages.length > 0 || snapshot.routePoints.length > 1));
}

function drawCommand(
  map: TacticalMap,
  graphics: Graphics,
  snapshot: CommandPlanRouteOverlaySnapshot,
): void {
  graphics.clear();
  const command = snapshot.command;
  if (!command) return;

  const from = gridToWorld(map, snapshot.unitPosition);
  const to = gridToWorld(map, command.target);
  const alpha = snapshot.selected ? 0.95 : 0.34;
  drawDashedLine(graphics, from.x, from.y, to.x, to.y, snapshot.selected ? 13 : 9, 7, COMMAND_COLOR, snapshot.selected ? 3 : 2, alpha);

  graphics.lineStyle(snapshot.selected ? 3 : 2, COMMAND_COLOR, alpha);
  graphics.drawCircle(to.x, to.y, snapshot.selected ? 10 : 7);
  graphics.moveTo(to.x - 13, to.y);
  graphics.lineTo(to.x + 13, to.y);
  graphics.moveTo(to.x, to.y - 13);
  graphics.lineTo(to.x, to.y + 13);

  if (command.status === 'blocked') {
    graphics.lineStyle(3, FAILURE_COLOR, 0.95);
    graphics.moveTo(to.x - 7, to.y - 7);
    graphics.lineTo(to.x + 7, to.y + 7);
    graphics.moveTo(to.x + 7, to.y - 7);
    graphics.lineTo(to.x - 7, to.y + 7);
  }
}

function drawPlan(
  map: TacticalMap,
  graphics: Graphics,
  snapshot: CommandPlanRouteOverlaySnapshot,
): void {
  graphics.clear();
  if (!snapshot.selected || snapshot.planStages.length === 0) return;

  const spatialStages = snapshot.planStages.filter((stage) => stage.target !== null);
  let previous = gridToWorld(map, snapshot.unitPosition);
  for (const stage of spatialStages) {
    const target = gridToWorld(map, stage.target!);
    drawDashedLine(graphics, previous.x, previous.y, target.x, target.y, 8, 5, PLAN_COLOR, 2, stageAlpha(stage));
    drawPlanMarker(graphics, target.x, target.y, stage);
    previous = target;
  }
}

function drawPlanMarker(graphics: Graphics, x: number, y: number, stage: PlanStageOverlaySnapshot): void {
  const active = stage.status === 'active';
  const failed = stage.status === 'failed' || stage.status === 'cancelled';
  const radius = active ? 7 : 5;
  const alpha = stageAlpha(stage);

  graphics.lineStyle(active ? 3 : 2, failed ? FAILURE_COLOR : PLAN_COLOR, alpha);
  graphics.beginFill(0x14243a, active ? 0.88 : 0.62);
  graphics.drawCircle(x, y, radius);
  graphics.endFill();

  if (stage.status === 'completed') {
    graphics.lineStyle(2, PLAN_COLOR, 0.55);
    graphics.moveTo(x - 3, y);
    graphics.lineTo(x - 1, y + 3);
    graphics.lineTo(x + 4, y - 3);
  }
}

function drawRoute(
  map: TacticalMap,
  graphics: Graphics,
  snapshot: CommandPlanRouteOverlaySnapshot,
): void {
  graphics.clear();
  if (!snapshot.selected || snapshot.routePoints.length < 2) return;

  const first = gridToWorld(map, snapshot.routePoints[0]);
  graphics.lineStyle(4, ROUTE_COLOR, 0.95);
  graphics.moveTo(first.x, first.y);
  for (let index = 1; index < snapshot.routePoints.length; index += 1) {
    const point = gridToWorld(map, snapshot.routePoints[index]);
    graphics.lineTo(point.x, point.y);
  }

  for (let index = 1; index < snapshot.routePoints.length; index += 1) {
    const point = gridToWorld(map, snapshot.routePoints[index]);
    const current = index === 1;
    graphics.lineStyle(current ? 3 : 2, ROUTE_COLOR, current ? 1 : 0.72);
    graphics.beginFill(0x173523, current ? 0.92 : 0.7);
    graphics.drawCircle(point.x, point.y, current ? 6 : 4);
    graphics.endFill();
  }
}

function updateActiveStageLabel(
  map: TacticalMap,
  label: Text,
  snapshot: CommandPlanRouteOverlaySnapshot,
): void {
  if (!snapshot.selected || snapshot.planStages.length === 0) {
    label.visible = false;
    label.text = '';
    return;
  }

  const stage = snapshot.planStages[Math.max(0, Math.min(snapshot.planStages.length - 1, snapshot.activeStageIndex))];
  label.text = stage.labelRu;
  label.visible = true;
  const anchor = gridToWorld(map, stage.target ?? snapshot.unitPosition);
  label.position.set(anchor.x, anchor.y - 13);
}

function stageAlpha(stage: PlanStageOverlaySnapshot): number {
  if (stage.status === 'completed') return 0.42;
  if (stage.status === 'pending') return 0.58;
  if (stage.status === 'failed' || stage.status === 'cancelled') return 0.92;
  return 1;
}

function drawDashedLine(
  graphics: Graphics,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  dashLength: number,
  gapLength: number,
  color: number,
  width: number,
  alpha: number,
): void {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.hypot(dx, dy);
  if (length <= 0.001) return;

  const directionX = dx / length;
  const directionY = dy / length;
  graphics.lineStyle(width, color, alpha);
  for (let offset = 0; offset < length; offset += dashLength + gapLength) {
    const start = offset;
    const end = Math.min(length, offset + dashLength);
    graphics.moveTo(fromX + directionX * start, fromY + directionY * start);
    graphics.lineTo(fromX + directionX * end, fromY + directionY * end);
  }
}

function isOverlayEnabled(): boolean {
  return typeof document === 'undefined' || !document.body.classList.contains(OVERLAY_OFF_CLASS);
}
