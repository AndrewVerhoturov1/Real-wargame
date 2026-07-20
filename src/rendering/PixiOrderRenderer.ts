import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { gridToWorld, type TacticalMap } from '../core/map/MapModel';
import type { UnitModel } from '../core/units/UnitModel';
import {
  buildCommandPlanRouteOverlaySnapshot,
  type CommandPlanRouteOverlaySnapshot,
  type PlanStageOverlaySnapshot,
  type TraversalSegmentOverlaySnapshot,
} from './CommandPlanRouteOverlayModel';

const COMMAND_COLOR = 0xffd85a;
const PLAN_COLOR = 0x62aaff;
const ROUTE_COLOR = 0x66e38a;
const CROUCHED_ROUTE_COLOR = 0x55dbe8;
const PRONE_ROUTE_COLOR = 0xb77cff;
const ATTENTION_COLOR = 0xffe28a;
const FAILURE_COLOR = 0xff755f;
const PLAN_LANE_OFFSET_PX = 8;
const OVERLAY_OFF_CLASS = 'command-plan-route-overlay-off';
const LABEL_STYLE = new TextStyle({
  fontFamily: 'Arial, sans-serif',
  fontSize: 12,
  fontWeight: '600',
  fill: 0xdcecff,
  stroke: { color: 0x101720, width: 3, join: 'round' },
});

interface UnitOverlayView {
  readonly root: Container;
  readonly commandGraphics: Graphics;
  readonly planGraphics: Graphics;
  readonly routeGraphics: Graphics;
  readonly activeStageLabel: Text;
  key: string;
}

interface OffsetLine {
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
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
    const activeStageLabel = new Text({ text: '', style: LABEL_STYLE });
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
    || (snapshot.selected && (
      snapshot.planStages.length > 0
      || snapshot.routePoints.length > 1
      || snapshot.traversalSegments.length > 0
    ));
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

  const commandStroke = { width: snapshot.selected ? 3 : 2, color: COMMAND_COLOR, alpha };
  graphics.circle(to.x, to.y, snapshot.selected ? 10 : 7).stroke(commandStroke);
  graphics.moveTo(to.x - 13, to.y).lineTo(to.x + 13, to.y);
  graphics.moveTo(to.x, to.y - 13).lineTo(to.x, to.y + 13);
  graphics.stroke(commandStroke);

  if (command.finalFacingRadians !== null) {
    drawFacingArrow(graphics, to.x, to.y, command.finalFacingRadians, snapshot.selected ? 24 : 18, COMMAND_COLOR, alpha);
  }

  if (command.status === 'blocked') {
    graphics.moveTo(to.x - 7, to.y - 7).lineTo(to.x + 7, to.y + 7);
    graphics.moveTo(to.x + 7, to.y - 7).lineTo(to.x - 7, to.y + 7);
    graphics.stroke({ width: 3, color: FAILURE_COLOR, alpha: 0.95 });
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
    const lane = offsetLine(previous.x, previous.y, target.x, target.y, PLAN_LANE_OFFSET_PX);
    drawDashedLine(graphics, lane.fromX, lane.fromY, lane.toX, lane.toY, 8, 5, PLAN_COLOR, 2, stageAlpha(stage));

    graphics.moveTo(lane.toX, lane.toY).lineTo(target.x, target.y)
      .stroke({ width: 1, color: PLAN_COLOR, alpha: stageAlpha(stage) * 0.5 });
    drawPlanMarker(graphics, lane.toX, lane.toY, stage);
    previous = target;
  }
}

function drawPlanMarker(graphics: Graphics, x: number, y: number, stage: PlanStageOverlaySnapshot): void {
  const active = stage.status === 'active';
  const failed = stage.status === 'failed' || stage.status === 'cancelled';
  const radius = active ? 7 : 5;
  const alpha = stageAlpha(stage);

  graphics.poly([
    x, y - radius,
    x + radius, y,
    x, y + radius,
    x - radius, y,
  ]).fill({ color: 0x14243a, alpha: active ? 0.88 : 0.62 })
    .stroke({ width: active ? 3 : 2, color: failed ? FAILURE_COLOR : PLAN_COLOR, alpha });

  if (stage.status === 'completed') {
    graphics.moveTo(x - 3, y).lineTo(x - 1, y + 3).lineTo(x + 4, y - 3)
      .stroke({ width: 2, color: PLAN_COLOR, alpha: 0.55 });
  }
}

function drawRoute(
  map: TacticalMap,
  graphics: Graphics,
  snapshot: CommandPlanRouteOverlaySnapshot,
): void {
  graphics.clear();
  if (!snapshot.selected) return;
  if (snapshot.traversalSegments.length > 0) {
    for (const segment of snapshot.traversalSegments) drawTraversalSegment(map, graphics, segment);
    return;
  }
  if (snapshot.routePoints.length < 2) return;

  const first = gridToWorld(map, snapshot.routePoints[0]!);
  graphics.moveTo(first.x, first.y);
  for (let index = 1; index < snapshot.routePoints.length; index += 1) {
    const point = gridToWorld(map, snapshot.routePoints[index]!);
    graphics.lineTo(point.x, point.y);
  }
  graphics.stroke({ width: 4, color: ROUTE_COLOR, alpha: 0.95 });

  for (let index = 1; index < snapshot.routePoints.length; index += 1) {
    const point = gridToWorld(map, snapshot.routePoints[index]!);
    const current = index === 1;
    graphics.circle(point.x, point.y, current ? 6 : 4)
      .fill({ color: 0x173523, alpha: current ? 0.92 : 0.7 })
      .stroke({ width: current ? 3 : 2, color: ROUTE_COLOR, alpha: current ? 1 : 0.72 });
  }
}

function drawTraversalSegment(
  map: TacticalMap,
  graphics: Graphics,
  segment: TraversalSegmentOverlaySnapshot,
): void {
  if (segment.points.length < 2) return;
  const color = postureColor(segment.posture);
  const alpha = segment.active ? 1 : 0.82;
  const width = segment.active ? 5 : 4;
  for (let index = 1; index < segment.points.length; index += 1) {
    const from = gridToWorld(map, segment.points[index - 1]!);
    const to = gridToWorld(map, segment.points[index]!);
    drawMovementLine(graphics, from.x, from.y, to.x, to.y, segment.movementProfileId, color, width, alpha);
  }

  const boundary = gridToWorld(map, segment.points[0]!);
  graphics.circle(boundary.x, boundary.y, segment.active ? 5 : 4)
    .fill({ color: 0x111820, alpha: 0.82 })
    .stroke({ width: 2, color, alpha });
  if (segment.bodyFacingRadians !== null) {
    drawFacingArrow(graphics, boundary.x, boundary.y, segment.bodyFacingRadians, 17, color, 0.9);
  }

  const attentionAnchor = gridToWorld(map, segment.points[Math.floor(segment.points.length / 2)]!);
  if (segment.attentionCenterRadians !== null) {
    drawFacingArrow(
      graphics,
      attentionAnchor.x,
      attentionAnchor.y,
      segment.attentionCenterRadians,
      14,
      ATTENTION_COLOR,
      0.72,
      1.5,
    );
    if (segment.attentionPolicy === 'search_sector' && segment.attentionArcRadians !== null) {
      const half = segment.attentionArcRadians / 2;
      graphics.arc(
        attentionAnchor.x,
        attentionAnchor.y,
        18,
        segment.attentionCenterRadians - half,
        segment.attentionCenterRadians + half,
      ).stroke({ width: 1, color: ATTENTION_COLOR, alpha: 0.5 });
    }
  }
}

function drawMovementLine(
  graphics: Graphics,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  movementProfileId: string,
  color: number,
  width: number,
  alpha: number,
): void {
  if (movementProfileId === 'run' || movementProfileId === 'sprint') {
    drawDashedLine(graphics, fromX, fromY, toX, toY, 14, 5, color, width, alpha);
    return;
  }
  if (movementProfileId === 'crawl') {
    drawDashedLine(graphics, fromX, fromY, toX, toY, 3, 5, color, width + 1, alpha);
    return;
  }
  if (movementProfileId === 'stealth_move' || movementProfileId === 'crouched_move') {
    drawDashedLine(graphics, fromX, fromY, toX, toY, 7, 3, color, width, alpha);
    return;
  }
  graphics.moveTo(fromX, fromY).lineTo(toX, toY).stroke({ width, color, alpha });
}

function postureColor(posture: TraversalSegmentOverlaySnapshot['posture']): number {
  if (posture === 'crouched') return CROUCHED_ROUTE_COLOR;
  if (posture === 'prone') return PRONE_ROUTE_COLOR;
  return ROUTE_COLOR;
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

  const activeIndex = Math.max(0, Math.min(snapshot.planStages.length - 1, snapshot.activeStageIndex));
  const stage = snapshot.planStages[activeIndex]!;
  label.text = stage.labelRu;
  label.visible = true;
  const anchor = resolvePlanStageAnchor(map, snapshot, activeIndex);
  label.position.set(anchor.x, anchor.y - 13);
}

function resolvePlanStageAnchor(
  map: TacticalMap,
  snapshot: CommandPlanRouteOverlaySnapshot,
  stageIndex: number,
): { x: number; y: number } {
  let previous = gridToWorld(map, snapshot.unitPosition);
  for (let index = 0; index <= stageIndex; index += 1) {
    const targetPosition = snapshot.planStages[index]?.target;
    if (!targetPosition) continue;
    const target = gridToWorld(map, targetPosition);
    if (index === stageIndex) {
      const lane = offsetLine(previous.x, previous.y, target.x, target.y, PLAN_LANE_OFFSET_PX);
      return { x: lane.toX, y: lane.toY };
    }
    previous = target;
  }
  return { x: previous.x + PLAN_LANE_OFFSET_PX, y: previous.y };
}

function offsetLine(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  offset: number,
): OffsetLine {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.hypot(dx, dy);
  if (length <= 0.001) {
    return {
      fromX: fromX + offset,
      fromY,
      toX: toX + offset,
      toY,
    };
  }

  const normalX = -dy / length;
  const normalY = dx / length;
  return {
    fromX: fromX + normalX * offset,
    fromY: fromY + normalY * offset,
    toX: toX + normalX * offset,
    toY: toY + normalY * offset,
  };
}

function stageAlpha(stage: PlanStageOverlaySnapshot): number {
  if (stage.status === 'completed') return 0.42;
  if (stage.status === 'pending') return 0.58;
  if (stage.status === 'failed' || stage.status === 'cancelled') return 0.92;
  return 1;
}

function drawFacingArrow(
  graphics: Graphics,
  x: number,
  y: number,
  finalFacingRadians: number,
  length: number,
  color: number,
  alpha: number,
  width = 3,
): void {
  const endX = x + Math.cos(finalFacingRadians) * length;
  const endY = y + Math.sin(finalFacingRadians) * length;
  const size = 7;
  graphics.moveTo(x, y).lineTo(endX, endY);
  graphics.moveTo(endX, endY).lineTo(endX - Math.cos(finalFacingRadians - Math.PI / 6) * size, endY - Math.sin(finalFacingRadians - Math.PI / 6) * size);
  graphics.moveTo(endX, endY).lineTo(endX - Math.cos(finalFacingRadians + Math.PI / 6) * size, endY - Math.sin(finalFacingRadians + Math.PI / 6) * size);
  graphics.stroke({ width, color, alpha });
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
  for (let offset = 0; offset < length; offset += dashLength + gapLength) {
    const start = offset;
    const end = Math.min(length, offset + dashLength);
    graphics.moveTo(fromX + directionX * start, fromY + directionY * start)
      .lineTo(fromX + directionX * end, fromY + directionY * end);
  }
  graphics.stroke({ width, color, alpha });
}

function isOverlayEnabled(): boolean {
  return typeof document === 'undefined' || !document.body.classList.contains(OVERLAY_OFF_CLASS);
}
