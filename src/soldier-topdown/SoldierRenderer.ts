export const SOLDIER_POSES = [
  'idle',
  'ready',
  'walk',
  'run',
  'crouch',
  'crouchMove',
  'crouchRun',
  'prone',
  'proneAim',
  'crawl',
  'standAim',
  'crouchAim',
] as const;

export type SoldierPoseId = (typeof SOLDIER_POSES)[number];

export const SOLDIER_WEAPONS = ['mosin', 'ppsh41', 'dp27'] as const;
export type SoldierWeaponId = (typeof SOLDIER_WEAPONS)[number];

export interface SoldierRenderState {
  pose: SoldierPoseId;
  weapon: SoldierWeaponId;
  phase: number;
  bodyDirection: number;
  attentionDirection: number;
  weaponDirection: number;
  size: number;
  selected?: boolean;
}

export interface SoldierRenderOptions {
  showShadow?: boolean;
  showBodyDirection?: boolean;
  showAttentionDirection?: boolean;
  showWeaponDirection?: boolean;
  showAttentionSector?: boolean;
  attentionSectorRadians?: number;
  opacity?: number;
}

export const POSE_LABELS: Record<SoldierPoseId, string> = {
  idle: 'Стоит спокойно',
  ready: 'Оружие наготове',
  walk: 'Идёт',
  run: 'Бежит',
  crouch: 'Стоит пригнувшись',
  crouchMove: 'Движется пригнувшись',
  crouchRun: 'Бежит пригнувшись',
  prone: 'Лежит',
  proneAim: 'Целится лёжа',
  crawl: 'Ползёт',
  standAim: 'Целится стоя',
  crouchAim: 'Целится из приседа',
};

export const WEAPON_LABELS: Record<SoldierWeaponId, string> = {
  mosin: 'Винтовка Мосина',
  ppsh41: 'ППШ-41',
  dp27: 'ДП-27',
};

interface Vec { x: number; y: number; }
interface Skeleton {
  prone: boolean;
  low: boolean;
  head: Vec;
  torsoCenter: Vec;
  torsoWidth: number;
  torsoLength: number;
  leftShoulder: Vec;
  rightShoulder: Vec;
  leftHip: Vec;
  rightHip: Vec;
  leftKnee: Vec;
  rightKnee: Vec;
  leftFoot: Vec;
  rightFoot: Vec;
  bodyBob: number;
  crawlReach: number;
}
interface WeaponSpec {
  total: number;
  rear: number;
  width: number;
  receiverWidth: number;
  woodLength: number;
  frontGrip: number;
  rearGrip: number;
}
interface WeaponGeometry {
  rear: Vec;
  muzzle: Vec;
  rearGrip: Vec;
  frontGrip: Vec;
  receiver: Vec;
}

const TAU = Math.PI * 2;
const BASE_EXTENT = 54;
const C = {
  outline: '#24271b', tunic: '#73764e', tunicLight: '#8c8e61', tunicDark: '#585c3d',
  trousers: '#626543', boots: '#29251c', helmet: '#575b39', helmetLight: '#777b4d',
  skin: '#b88e68', pack: '#4f5036', wood: '#64482f', metal: '#30332d', metalLight: '#5a5e54',
  select: '#d3b45b', bodyGuide: '#d5c382', attentionGuide: '#9cc6a2', weaponGuide: '#d79d78',
};
const WEAPONS: Record<SoldierWeaponId, WeaponSpec> = {
  mosin: { total: 34, rear: 8, width: 2.2, receiverWidth: 3.0, woodLength: 14, frontGrip: 2.5, rearGrip: -4.2 },
  ppsh41: { total: 27, rear: 7, width: 3.2, receiverWidth: 4.5, woodLength: 13, frontGrip: 1.0, rearGrip: -4.0 },
  dp27: { total: 35, rear: 7, width: 3.6, receiverWidth: 5.0, woodLength: 12, frontGrip: 4.0, rearGrip: -3.8 },
};

const v = (x: number, y: number): Vec => ({ x, y });
const add = (a: Vec, b: Vec): Vec => v(a.x + b.x, a.y + b.y);
const mul = (a: Vec, n: number): Vec => v(a.x * n, a.y * n);
const mid = (a: Vec, b: Vec): Vec => v((a.x + b.x) * 0.5, (a.y + b.y) * 0.5);
function rotateLocal(p: Vec, radians: number): Vec {
  const c = Math.cos(radians), s = Math.sin(radians);
  return v(p.x * c - p.y * s, p.x * s + p.y * c);
}
const forward = (radians: number): Vec => v(Math.sin(radians), -Math.cos(radians));
const right = (radians: number): Vec => v(Math.cos(radians), Math.sin(radians));
const localToWorld = (p: Vec, bodyDirection: number): Vec => rotateLocal(p, bodyDirection);
const smoothPhase = (phase: number): number => Math.sin(phase * TAU);
const doublePhase = (phase: number): number => Math.sin(phase * TAU * 2);

function resolveSkeleton(pose: SoldierPoseId, phase01: number): Skeleton {
  const step = smoothPhase(phase01);
  const lift = Math.abs(Math.cos(phase01 * TAU));
  const pulse = doublePhase(phase01);
  const base: Skeleton = {
    prone: false, low: false, head: v(0, -8.4), torsoCenter: v(0, 0.3), torsoWidth: 18.5, torsoLength: 12.5,
    leftShoulder: v(-7.8, -2.2), rightShoulder: v(7.8, -2.2), leftHip: v(-4.1, 4.5), rightHip: v(4.1, 4.5),
    leftKnee: v(-4.4, 8.2), rightKnee: v(4.4, 8.2), leftFoot: v(-4.6, 13.4), rightFoot: v(4.6, 13.4),
    bodyBob: 0, crawlReach: 0,
  };
  switch (pose) {
    case 'idle': base.leftFoot = v(-4.8, 13.2); base.rightFoot = v(4.8, 12.8); return base;
    case 'ready': base.head.y = -9.2; base.torsoCenter.y = -0.4; base.leftFoot = v(-5.4, 12.7); base.rightFoot = v(5.2, 13.4); return base;
    case 'walk': {
      const stride = step * 5.8; base.bodyBob = -lift * 0.7;
      base.leftKnee = v(-4.5 - pulse * 0.7, 8.0 - stride * 0.44); base.rightKnee = v(4.5 + pulse * 0.7, 8.0 + stride * 0.44);
      base.leftFoot = v(-4.8 - pulse * 0.8, 13.0 - stride); base.rightFoot = v(4.8 + pulse * 0.8, 13.0 + stride); return base;
    }
    case 'run': {
      const stride = step * 8.8; base.head = v(0, -10.4); base.torsoCenter = v(0, -1.2 - lift * 0.8);
      base.leftShoulder.y = -3.5; base.rightShoulder.y = -3.5; base.leftHip.y = 3.8; base.rightHip.y = 3.8; base.bodyBob = -lift * 1.1;
      base.leftKnee = v(-6.0 - pulse * 1.1, 7.0 - stride * 0.46); base.rightKnee = v(6.0 + pulse * 1.1, 7.0 + stride * 0.46);
      base.leftFoot = v(-7.3 - pulse * 1.0, 11.8 - stride); base.rightFoot = v(7.3 + pulse * 1.0, 11.8 + stride); return base;
    }
    case 'crouch': case 'crouchAim':
      base.low = true; base.head = v(0, -9.8); base.torsoCenter = v(0, 0.6); base.torsoWidth = 19.8; base.torsoLength = 11.2;
      base.leftShoulder = v(-8.5, -1.6); base.rightShoulder = v(8.5, -1.6); base.leftHip = v(-4.6, 4.4); base.rightHip = v(4.6, 4.4);
      base.leftKnee = v(-8.2, 7.6); base.rightKnee = v(8.2, 7.6); base.leftFoot = v(-6.4, 12.0); base.rightFoot = v(6.4, 12.0); return base;
    case 'crouchMove': {
      const stride = step * 4.2; base.low = true; base.head = v(0, -10.1); base.torsoCenter = v(0, 0.2 - lift * 0.45); base.torsoWidth = 20.0; base.torsoLength = 11.0;
      base.leftShoulder = v(-8.6, -1.8); base.rightShoulder = v(8.6, -1.8); base.leftHip = v(-4.6, 4.0); base.rightHip = v(4.6, 4.0);
      base.leftKnee = v(-8.7, 7.2 - stride * 0.4); base.rightKnee = v(8.7, 7.2 + stride * 0.4); base.leftFoot = v(-6.6, 11.7 - stride); base.rightFoot = v(6.6, 11.7 + stride); base.bodyBob = -lift * 0.6; return base;
    }
    case 'crouchRun': {
      const stride = step * 6.7; base.low = true; base.head = v(0, -11.0); base.torsoCenter = v(0, -0.8 - lift * 0.65); base.torsoWidth = 20.3; base.torsoLength = 10.7;
      base.leftShoulder = v(-8.7, -2.5); base.rightShoulder = v(8.7, -2.5); base.leftHip = v(-4.8, 3.6); base.rightHip = v(4.8, 3.6);
      base.leftKnee = v(-9.4, 6.4 - stride * 0.42); base.rightKnee = v(9.4, 6.4 + stride * 0.42); base.leftFoot = v(-7.5, 10.8 - stride); base.rightFoot = v(7.5, 10.8 + stride); base.bodyBob = -lift * 0.9; return base;
    }
    case 'prone': case 'proneAim':
      base.prone = true; base.low = true; base.head = v(0, -13.3); base.torsoCenter = v(0, -0.8); base.torsoWidth = 14.8; base.torsoLength = 25.5;
      base.leftShoulder = v(-6.4, -6.0); base.rightShoulder = v(6.4, -6.0); base.leftHip = v(-4.2, 7.0); base.rightHip = v(4.2, 7.0);
      base.leftKnee = v(-4.4, 12.9); base.rightKnee = v(4.4, 12.9); base.leftFoot = v(-4.7, 19.0); base.rightFoot = v(4.7, 19.0); return base;
    case 'crawl': {
      const reach = step; base.prone = true; base.low = true; base.crawlReach = reach; base.head = v(pulse * 0.45, -13.0); base.torsoCenter = v(pulse * 0.35, -0.6); base.torsoWidth = 15.0; base.torsoLength = 24.5;
      base.leftShoulder = v(-6.5, -5.7 - reach * 1.2); base.rightShoulder = v(6.5, -5.7 + reach * 1.2); base.leftHip = v(-4.2, 6.8); base.rightHip = v(4.2, 6.8);
      base.leftKnee = v(-7.5, 11.5 - reach * 3.2); base.rightKnee = v(7.5, 11.5 + reach * 3.2); base.leftFoot = v(-5.8, 18.6 - reach * 1.2); base.rightFoot = v(5.8, 18.6 + reach * 1.2); base.bodyBob = Math.cos(phase01 * TAU) * 0.35; return base;
    }
    case 'standAim': base.head = v(0, -9.4); base.torsoCenter = v(0, -0.5); base.leftFoot = v(-5.6, 13.1); base.rightFoot = v(5.6, 13.1); return base;
  }
}

function drawCapsuleSegment(ctx: CanvasRenderingContext2D, a: Vec, b: Vec, width: number, fill: string, outlineWidth = 1.5) {
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = C.outline; ctx.lineWidth = width + outlineWidth * 2;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.strokeStyle = fill; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.restore();
}
function drawJoint(ctx: CanvasRenderingContext2D, p: Vec, radius: number, fill: string) {
  ctx.fillStyle = C.outline; ctx.beginPath(); ctx.arc(p.x, p.y, radius + 1.2, 0, TAU); ctx.fill();
  ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, TAU); ctx.fill();
}
function drawRotatedEllipse(ctx: CanvasRenderingContext2D, center: Vec, rx: number, ry: number, rotation: number, fill: string, stroke = C.outline, lineWidth = 1.5) {
  ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.beginPath(); ctx.ellipse(center.x, center.y, rx, ry, rotation, 0, TAU); ctx.fill(); ctx.stroke();
}
const worldPoint = (local: Vec, bodyDirection: number, origin: Vec): Vec => add(origin, localToWorld(local, bodyDirection));

function drawShadow(ctx: CanvasRenderingContext2D, state: SoldierRenderState, skeleton: Skeleton) {
  ctx.save(); ctx.globalAlpha *= 0.18; const angle = state.bodyDirection; const center = add(v(2, 2.5), mul(forward(angle), skeleton.prone ? 1.5 : -0.3));
  ctx.fillStyle = '#0c0f0b'; ctx.beginPath();
  if (skeleton.prone) ctx.ellipse(center.x, center.y, 8, 22, angle, 0, TAU); else ctx.ellipse(center.x, center.y, skeleton.low ? 13 : 11.5, skeleton.low ? 10.5 : 9.5, angle, 0, TAU);
  ctx.fill(); ctx.restore();
}
function drawSelection(ctx: CanvasRenderingContext2D, state: SoldierRenderState, skeleton: Skeleton) {
  if (!state.selected) return; ctx.save(); ctx.strokeStyle = C.select; ctx.globalAlpha *= 0.9; ctx.lineWidth = 1.25; ctx.setLineDash([3, 3]); ctx.beginPath();
  if (skeleton.prone) ctx.ellipse(0, 1.8, 13.5, 26, state.bodyDirection, 0, TAU); else ctx.ellipse(0, 2, skeleton.low ? 16.5 : 15, skeleton.low ? 15 : 14, 0, 0, TAU);
  ctx.stroke(); ctx.restore();
}
function drawDiagnostics(ctx: CanvasRenderingContext2D, state: SoldierRenderState, options: SoldierRenderOptions, headWorld: Vec) {
  const line = (angle: number, length: number, color: string, start: Vec = v(0, 0)) => { const f = forward(angle); ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.25; ctx.globalAlpha *= 0.9; ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(start.x + f.x * length, start.y + f.y * length); ctx.stroke(); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(start.x + f.x * length, start.y + f.y * length, 1.8, 0, TAU); ctx.fill(); ctx.restore(); };
  if (options.showAttentionSector) { const span = options.attentionSectorRadians ?? Math.PI * 0.48, r = 28; ctx.save(); ctx.globalAlpha *= 0.12; ctx.fillStyle = C.attentionGuide; ctx.beginPath(); ctx.moveTo(headWorld.x, headWorld.y); const start = state.attentionDirection - span * 0.5 - Math.PI / 2; ctx.arc(headWorld.x, headWorld.y, r, start, start + span); ctx.closePath(); ctx.fill(); ctx.restore(); }
  if (options.showBodyDirection) line(state.bodyDirection, 24, C.bodyGuide);
  if (options.showAttentionDirection) line(state.attentionDirection, 22, C.attentionGuide, headWorld);
  if (options.showWeaponDirection) line(state.weaponDirection, 30, C.weaponGuide, v(0, -0.5));
}
function drawLegs(ctx: CanvasRenderingContext2D, state: SoldierRenderState, s: Skeleton, origin: Vec) {
  const body = state.bodyDirection, lh = worldPoint(s.leftHip, body, origin), rh = worldPoint(s.rightHip, body, origin), lk = worldPoint(s.leftKnee, body, origin), rk = worldPoint(s.rightKnee, body, origin), lf = worldPoint(s.leftFoot, body, origin), rf = worldPoint(s.rightFoot, body, origin);
  const thighWidth = s.prone ? 4.9 : s.low ? 5.5 : 5.2, shinWidth = s.prone ? 4.6 : 4.8;
  drawCapsuleSegment(ctx, lh, lk, thighWidth, C.trousers); drawCapsuleSegment(ctx, rh, rk, thighWidth, C.trousers); drawCapsuleSegment(ctx, lk, lf, shinWidth, C.tunicDark); drawCapsuleSegment(ctx, rk, rf, shinWidth, C.tunicDark);
  const bootForward = mul(forward(body), s.prone ? 2.6 : 2.8); drawCapsuleSegment(ctx, lf, add(lf, bootForward), s.prone ? 4.4 : 4.8, C.boots, 1.2); drawCapsuleSegment(ctx, rf, add(rf, bootForward), s.prone ? 4.4 : 4.8, C.boots, 1.2);
}
function drawTorso(ctx: CanvasRenderingContext2D, state: SoldierRenderState, s: Skeleton, origin: Vec) {
  const body = state.bodyDirection, center = worldPoint(add(s.torsoCenter, v(0, s.bodyBob)), body, origin);
  drawRotatedEllipse(ctx, center, s.torsoWidth * 0.5, s.torsoLength * 0.5, body, s.low ? C.tunicDark : C.tunic);
  const rear = add(center, mul(forward(body), s.prone ? -3.5 : -4.2)); ctx.save(); ctx.translate(rear.x, rear.y); ctx.rotate(body); ctx.fillStyle = C.pack; ctx.strokeStyle = C.outline; ctx.lineWidth = 1.3;
  const w = s.prone ? 9.5 : 11, h = s.prone ? 5 : 6.3; ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 2.2); ctx.fill(); ctx.stroke(); ctx.restore();
  const shoulderFront = add(center, mul(forward(body), s.torsoLength * 0.28)), shRight = mul(right(body), s.torsoWidth * 0.39); ctx.save(); ctx.strokeStyle = C.tunicLight; ctx.globalAlpha *= 0.55; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(shoulderFront.x - shRight.x, shoulderFront.y - shRight.y); ctx.lineTo(shoulderFront.x + shRight.x, shoulderFront.y + shRight.y); ctx.stroke(); ctx.restore();
}
function resolveWeaponGeometry(state: SoldierRenderState, s: Skeleton, origin: Vec): WeaponGeometry {
  const spec = WEAPONS[state.weapon], f = forward(state.weaponDirection), r = right(state.weaponDirection), bodyF = forward(state.bodyDirection);
  const lateral = s.prone ? 1.6 : state.pose === 'idle' ? 2.8 : 2.1, advance = s.prone ? 8.8 : s.low ? 4.2 : 3.6, receiver = add(origin, add(mul(f, advance), mul(r, lateral)));
  const rear = add(receiver, mul(f, -spec.rear)), muzzle = add(receiver, mul(f, spec.total - spec.rear)), rearGrip = add(receiver, mul(f, spec.rearGrip)), frontGrip = add(receiver, mul(f, spec.frontGrip));
  if (!s.prone && state.pose === 'idle') { const nudge = mul(bodyF, -0.8); return { rear: add(rear, nudge), muzzle: add(muzzle, nudge), rearGrip: add(rearGrip, nudge), frontGrip: add(frontGrip, nudge), receiver: add(receiver, nudge) }; }
  return { rear, muzzle, rearGrip, frontGrip, receiver };
}
function drawWeapon(ctx: CanvasRenderingContext2D, state: SoldierRenderState, g: WeaponGeometry) {
  const spec = WEAPONS[state.weapon], f = forward(state.weaponDirection), r = right(state.weaponDirection), woodEnd = add(g.rear, mul(f, spec.woodLength));
  drawCapsuleSegment(ctx, g.rear, woodEnd, spec.width + 1.2, C.wood, 1.2); drawCapsuleSegment(ctx, woodEnd, g.muzzle, spec.width, C.metal, 1.15);
  ctx.save(); ctx.translate(g.receiver.x, g.receiver.y); ctx.rotate(state.weaponDirection); ctx.fillStyle = C.metal; ctx.strokeStyle = C.outline; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.roundRect(-spec.receiverWidth * 0.5, -4, spec.receiverWidth, 8, 1.2); ctx.fill(); ctx.stroke();
  if (state.weapon === 'ppsh41') { ctx.fillStyle = C.metal; ctx.beginPath(); ctx.arc(2.6, 1.2, 4, 0, TAU); ctx.fill(); ctx.stroke(); ctx.strokeStyle = C.metalLight; ctx.globalAlpha *= 0.65; ctx.beginPath(); ctx.arc(2.6, 1.2, 2.6, 0, TAU); ctx.stroke(); }
  if (state.weapon === 'dp27') { ctx.fillStyle = C.metal; ctx.beginPath(); ctx.ellipse(0, -1, 5.5, 5, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.strokeStyle = C.metalLight; ctx.globalAlpha *= 0.65; ctx.beginPath(); ctx.arc(0, -1, 3.2, 0, TAU); ctx.stroke(); }
  ctx.restore();
  if (state.weapon === 'dp27') { const bipodRoot = add(g.muzzle, mul(f, -5.5)), left = add(add(bipodRoot, mul(f, 4.5)), mul(r, -4)), rightP = add(add(bipodRoot, mul(f, 4.5)), mul(r, 4)); drawCapsuleSegment(ctx, bipodRoot, left, 1.15, C.metal, 0.55); drawCapsuleSegment(ctx, bipodRoot, rightP, 1.15, C.metal, 0.55); }
  ctx.save(); ctx.fillStyle = C.metalLight; ctx.beginPath(); ctx.arc(g.muzzle.x, g.muzzle.y, state.weapon === 'dp27' ? 1.4 : 1, 0, TAU); ctx.fill(); ctx.restore();
}
function drawArms(ctx: CanvasRenderingContext2D, state: SoldierRenderState, s: Skeleton, origin: Vec, weapon: WeaponGeometry) {
  const body = state.bodyDirection, leftShoulder = worldPoint(s.leftShoulder, body, origin), rightShoulder = worldPoint(s.rightShoulder, body, origin), bodyRight = right(body), wf = forward(state.weaponDirection), wr = right(state.weaponDirection);
  let leftHand = weapon.frontGrip, rightHand = weapon.rearGrip; if (state.pose === 'idle') { leftHand = add(weapon.frontGrip, mul(wr, -0.5)); rightHand = add(weapon.rearGrip, mul(wr, 0.5)); }
  let leftElbow: Vec, rightElbow: Vec;
  if (s.prone) { const reach = s.crawlReach; leftElbow = add(mid(leftShoulder, leftHand), add(mul(bodyRight, -4.6), mul(wf, reach * 1.5))); rightElbow = add(mid(rightShoulder, rightHand), add(mul(bodyRight, 4.6), mul(wf, -reach * 1.5))); }
  else if (s.low) { leftElbow = add(mid(leftShoulder, leftHand), mul(bodyRight, -2.4)); rightElbow = add(mid(rightShoulder, rightHand), mul(bodyRight, 2.4)); }
  else { leftElbow = add(mid(leftShoulder, leftHand), mul(bodyRight, -1.8)); rightElbow = add(mid(rightShoulder, rightHand), mul(bodyRight, 1.8)); }
  const sleeve = s.low ? C.tunicDark : C.tunic; drawCapsuleSegment(ctx, leftShoulder, leftElbow, 4.8, sleeve, 1.2); drawCapsuleSegment(ctx, leftElbow, leftHand, 4.3, sleeve, 1.2); drawCapsuleSegment(ctx, rightShoulder, rightElbow, 4.8, sleeve, 1.2); drawCapsuleSegment(ctx, rightElbow, rightHand, 4.3, sleeve, 1.2); drawJoint(ctx, leftHand, 1.9, C.skin); drawJoint(ctx, rightHand, 1.9, C.skin);
}
function drawHead(ctx: CanvasRenderingContext2D, state: SoldierRenderState, s: Skeleton, origin: Vec): Vec {
  const bodyHead = worldPoint(add(s.head, v(0, s.bodyBob * 0.35)), state.bodyDirection, origin), attF = forward(state.attentionDirection), bodyF = forward(state.bodyDirection), center = add(bodyHead, add(mul(attF, 1.1), mul(bodyF, s.prone ? 0.3 : 0.15))), radius = s.prone ? 5.3 : s.low ? 5.7 : 6;
  ctx.save(); ctx.fillStyle = C.helmet; ctx.strokeStyle = C.outline; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(center.x, center.y, radius, radius * 0.92, state.attentionDirection, 0, TAU); ctx.fill(); ctx.stroke();
  const front = add(center, mul(attF, radius * 0.72)), rr = right(state.attentionDirection); ctx.strokeStyle = C.helmetLight; ctx.globalAlpha *= 0.78; ctx.lineWidth = 1.25; ctx.beginPath(); ctx.moveTo(front.x - rr.x * radius * 0.45, front.y - rr.y * radius * 0.45); ctx.lineTo(front.x + rr.x * radius * 0.45, front.y + rr.y * radius * 0.45); ctx.stroke();
  const face = add(center, mul(attF, radius * 0.87)); ctx.globalAlpha *= 0.9; ctx.fillStyle = C.skin; ctx.beginPath(); ctx.ellipse(face.x, face.y, 2.25, 1.2, state.attentionDirection, 0, TAU); ctx.fill(); ctx.restore(); return center;
}

export function drawSoldierTopDown(ctx: CanvasRenderingContext2D, x: number, y: number, state: SoldierRenderState, options: SoldierRenderOptions = {}): void {
  const scale = Math.max(0.18, state.size / BASE_EXTENT), skeleton = resolveSkeleton(state.pose, ((state.phase % 1) + 1) % 1), origin = v(0, 0);
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.globalAlpha = options.opacity ?? 1;
  drawSelection(ctx, state, skeleton); if (options.showShadow !== false) drawShadow(ctx, state, skeleton); drawLegs(ctx, state, skeleton, origin); drawTorso(ctx, state, skeleton, origin);
  const weapon = resolveWeaponGeometry(state, skeleton, origin); drawWeapon(ctx, state, weapon); drawArms(ctx, state, skeleton, origin, weapon); const head = drawHead(ctx, state, skeleton, origin); drawDiagnostics(ctx, state, options, head); ctx.restore();
}
