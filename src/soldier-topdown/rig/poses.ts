/**
 * Pose + animation resolver.
 *
 * A pose function fills the rig for a normalised cycle phase t (0..1).
 * Static poses use t for breathing/sway only, so every state stays alive.
 *
 * Design rules that keep the figures human from a top-down camera:
 *  - limb segment lengths are *projected* lengths and are pose dependent
 *    (an arm hanging down is short on screen, an aiming arm is nearly full length);
 *  - the support hand slides along the weapon until the arm can actually reach it,
 *    so hands never detach and arms never stretch;
 *  - knees are art-directed forward of the hip->foot line, which is what a real
 *    bent leg looks like from above;
 *  - shoulders and hips counter-rotate during gait.
 */
import {
  TAU,
  clamp,
  lerp,
  set,
  rotAbout,
  midJoint,
  angleDelta,
  type Pt,
  type Rig,
  type PoseId,
  type SoldierVisualState,
} from './core';
import { WEAPONS, type WeaponDef } from './weapons';

export interface PoseMeta {
  id: PoseId;
  label: string;
  short: string;
  group: 'stand' | 'crouch' | 'prone';
  moving: boolean;
  hint: string;
}

export const POSE_META: PoseMeta[] = [
  { id: 'idle', label: 'Стоит спокойно', short: 'idle', group: 'stand', moving: false, hint: 'оружие опущено, вес на обеих ногах' },
  { id: 'ready', label: 'Стоит наготове', short: 'ready', group: 'stand', moving: false, hint: 'оружие поперёк корпуса, стойка вполоборота' },
  { id: 'walk', label: 'Идёт', short: 'walk', group: 'stand', moving: true, hint: 'шаг в противофазе, лёгкая контрротация плеч' },
  { id: 'walk_aim', label: 'Идёт с прицеливанием', short: 'walk aim', group: 'stand', moving: true, hint: 'короткий шаг, оружие в линии прицеливания' },
  { id: 'run', label: 'Бежит', short: 'run', group: 'stand', moving: true, hint: 'наклон вперёд, широкий шаг, узкая колея' },
  { id: 'crouch_idle', label: 'Стоит пригнувшись', short: 'crouch', group: 'crouch', moving: false, hint: 'колени вынесены вперёд и в стороны' },
  { id: 'crouch_walk', label: 'Идёт пригнувшись', short: 'crouch walk', group: 'crouch', moving: true, hint: 'короткий шаг, покачивание корпуса' },
  { id: 'crouch_run', label: 'Бежит пригнувшись', short: 'crouch run', group: 'crouch', moving: true, hint: 'глубокий присед, широкий шаг' },
  { id: 'aim_stand', label: 'Целится стоя', short: 'aim', group: 'stand', moving: false, hint: 'приклад в плече, голова за прикладом' },
  { id: 'aim_crouch', label: 'Целится из приседа', short: 'crouch aim', group: 'crouch', moving: false, hint: 'присед + приклад в плече' },
  { id: 'prone', label: 'Лежит с оружием', short: 'prone', group: 'prone', moving: false, hint: 'тело вытянуто, ноги разведены' },
  { id: 'prone_aim', label: 'Целится лёжа', short: 'prone aim', group: 'prone', moving: false, hint: 'локти расставлены, корпус за оружием' },
  { id: 'crawl', label: 'Ползёт', short: 'crawl', group: 'prone', moving: true, hint: 'перекат корпуса, лягушачий подтяг ноги' },
];

export const POSE_BY_ID: Record<PoseId, PoseMeta> = POSE_META.reduce(
  (acc, m) => {
    acc[m.id] = m;
    return acc;
  },
  {} as Record<PoseId, PoseMeta>,
);

/* ------------------------------------------------------------------ helpers */

function weaponPoint(out: Pt, r: Rig, lx: number, ly: number): void {
  const s = Math.sin(r.wpnA);
  const c = Math.cos(r.wpnA);
  out.x = r.wpn.x + lx * c - ly * s;
  out.y = r.wpn.y + lx * s + ly * c;
}

/** put the butt plate at (px,py) and aim the muzzle along `ang` */
function weaponFromButt(r: Rig, w: WeaponDef, px: number, py: number, ang: number): void {
  r.wpnA = ang;
  r.wpn.x = px + w.back * Math.sin(ang);
  r.wpn.y = py - w.back * Math.cos(ang);
}

/**
 * Art-directed elbow.
 *
 * Strict two-bone IK fails from a top-down camera: the upper arm hangs down and
 * is heavily foreshortened while the forearm stays almost parallel to the
 * ground, so the two projected segments are never the same length. Instead the
 * elbow is placed between shoulder and hand and pushed sideways: the more the
 * arm is folded, the wider the elbow flares — exactly what a real arm does when
 * seen from above.
 */
function solveArm(out: Pt, sh: Pt, hd: Pt, reach: number, side: number): void {
  const dx = hd.x - sh.x;
  const dy = hd.y - sh.y;
  const d = Math.hypot(dx, dy);
  const fold = clamp(1 - d / Math.max(0.05, reach), 0, 1);
  const flare = 0.042 + fold * 0.135;
  out.x = sh.x + dx * 0.45 + side * flare;
  out.y = sh.y + dy * 0.45 + fold * 0.016;
}

function solveArms(r: Rig): void {
  const reach = r.armU + r.armF;
  solveArm(r.elR, r.shR, r.hdR, reach, 1);
  solveArm(r.elL, r.shL, r.hdL, reach, -1);
}

/** last grip parameters, so the weapon-direction override can re-attach hands */
let gripRear = 0.03;
let gripFore = 1;

/**
 * Both hands on the weapon. The support hand slides back along the fore-end
 * until the support arm can physically reach it.
 */
function gripHands(r: Rig, w: WeaponDef, rearSide = 0.03, foreScale = 1): void {
  gripRear = rearSide;
  gripFore = foreScale;
  weaponPoint(r.hdR, r, rearSide, 0.014);
  const reach = (r.armU + r.armF) * 0.99;
  let fore = w.gripFore * foreScale;
  weaponPoint(r.hdL, r, w.foreSide - 0.032, -fore);
  for (let i = 0; i < 14; i++) {
    const d = Math.hypot(r.hdL.x - r.shL.x, r.hdL.y - r.shL.y);
    if (d <= reach || fore <= 0.04) break;
    fore -= 0.022;
    weaponPoint(r.hdL, r, w.foreSide - 0.032, -fore);
  }
  r.freeL = false;
  solveArms(r);
}

function twistShoulders(r: Rig, a: number): void {
  const s = Math.sin(a);
  const c = Math.cos(a);
  rotAbout(r.shL, r.chest.x, r.chest.y, s, c);
  rotAbout(r.shR, r.chest.x, r.chest.y, s, c);
}

function twistHips(r: Rig, a: number): void {
  const s = Math.sin(a);
  const c = Math.cos(a);
  rotAbout(r.hipL, r.hip.x, r.hip.y, s, c);
  rotAbout(r.hipR, r.hip.x, r.hip.y, s, c);
}

function solveLegs(r: Rig, kneeFwd: number, kneeOut: number): void {
  midJoint(r.knL, r.hipL, r.ftL, kneeFwd + r.ftLiftL * 0.045, -kneeOut - r.ftLiftL * 0.01, 0.52);
  midJoint(r.knR, r.hipR, r.ftR, kneeFwd + r.ftLiftR * 0.045, kneeOut + r.ftLiftR * 0.01, 0.52);
}

/**
 * Gait cycle. Right leg on phase a, left leg half a cycle behind.
 * The excursion is asymmetric on purpose: a human plants the lead foot only a
 * little in front of the hip but trails the rear leg far behind, which is also
 * what keeps the lead boot from disappearing under the helmet from above.
 * lift = max(0, cos a) is 1 exactly when the foot passes under the hip.
 */
function legCycle(
  r: Rig,
  a: number,
  strideF: number,
  strideB: number,
  track: number,
  baseY: number,
  splay: number,
): void {
  const sr = Math.sin(a);
  const sl = -sr;
  r.ftLiftR = Math.max(0, Math.cos(a));
  r.ftLiftL = Math.max(0, -Math.cos(a));
  set(
    r.ftR,
    track + r.ftLiftR * 0.032,
    baseY - (sr > 0 ? sr * strideF : sr * strideB) + r.ftLiftR * 0.012,
  );
  set(
    r.ftL,
    -track - r.ftLiftL * 0.032,
    baseY - (sl > 0 ? sl * strideF : sl * strideB) + r.ftLiftL * 0.012,
  );
  r.ftAngR = splay + sr * 0.24;
  r.ftAngL = -splay + sl * 0.24;
}

/* -------------------------------------------------------------------- bases */

function standBase(r: Rig): void {
  r.stance = 0;
  r.scale = 1;
  r.elevation = 1;
  r.headR = 0.153;
  r.armU = 0.152;
  r.armF = 0.145;
  r.armW = 0.088;
  r.legW = 0.108;
  r.bootW = 0.088;
  r.bootL = 0.135;
  r.torsoW = 0.3;
  r.hipW = 0.122;
  r.shThick = 0.162;
  set(r.hip, 0, 0.105);
  set(r.chest, 0, -0.025);
  set(r.neck, 0, -0.06);
  set(r.head, 0, -0.108);
  r.headAngle = 0;
  set(r.shL, -0.188, -0.048);
  set(r.shR, 0.188, -0.048);
  set(r.hipL, -0.1, 0.1);
  set(r.hipR, 0.1, 0.1);
  r.ftLiftL = 0;
  r.ftLiftR = 0;
  r.freeL = false;
  r.shadowRX = 0.235;
  r.shadowRY = 0.215;
  r.shadowY = 0.035;
}

function crouchBase(r: Rig, depth: number): void {
  standBase(r);
  r.stance = 1;
  r.scale = 0.95 - depth * 0.03;
  r.elevation = 0.48 - depth * 0.08;
  r.headR = 0.158;
  r.armU = 0.145;
  r.armF = 0.14;
  r.shThick = 0.175;
  r.legW = 0.112;
  set(r.hip, 0, 0.145);
  set(r.chest, 0, -0.02);
  set(r.neck, 0, -0.065);
  set(r.head, 0, -0.14 - depth * 0.02);
  set(r.shL, -0.168, -0.058);
  set(r.shR, 0.168, -0.058);
  set(r.hipL, -0.104, 0.148);
  set(r.hipR, 0.104, 0.148);
  r.shadowRX = 0.25;
  r.shadowRY = 0.245;
  r.shadowY = 0.02;
}

function proneBase(r: Rig): void {
  r.stance = 2;
  r.scale = 1;
  r.elevation = 0.06;
  r.headR = 0.146;
  r.armU = 0.2;
  r.armF = 0.19;
  r.armW = 0.082;
  r.legW = 0.106;
  r.bootW = 0.092;
  r.bootL = 0.145;
  r.torsoW = 0.285;
  r.hipW = 0.128;
  r.shThick = 0.148;
  set(r.hip, 0, 0.075);
  set(r.chest, 0, -0.15);
  set(r.neck, 0, -0.235);
  set(r.head, 0, -0.345);
  r.headAngle = 0;
  set(r.shL, -0.175, -0.198);
  set(r.shR, 0.175, -0.198);
  set(r.hipL, -0.108, 0.068);
  set(r.hipR, 0.108, 0.068);
  r.ftLiftL = 0;
  r.ftLiftR = 0;
  r.freeL = false;
  r.shadowRX = 0.21;
  r.shadowRY = 0.44;
  r.shadowY = 0.05;
}

/* -------------------------------------------------------------------- poses */

function poseIdle(r: Rig, w: WeaponDef, t: number): void {
  standBase(r);
  const b = Math.sin(t * TAU) * 0.008;
  r.chest.y -= b;
  r.neck.y -= b;
  r.head.y -= b * 0.7;
  r.shL.y -= b * 0.8;
  r.shR.y -= b * 0.8;
  set(r.ftL, -0.176, 0.052);
  r.ftAngL = -0.38;
  set(r.ftR, 0.18, 0.084);
  r.ftAngR = 0.44;
  solveLegs(r, 0.055, 0.012);
  r.wpnA = -0.6 + b * 0.6;
  set(r.wpn, 0.15, 0.085 - b);
  gripHands(r, w, 0.032);
  r.headAngle = Math.sin(t * TAU * 0.5) * 0.09;
}

function poseReady(r: Rig, w: WeaponDef, t: number): void {
  standBase(r);
  const b = Math.sin(t * TAU) * 0.006;
  r.armU = 0.162;
  r.armF = 0.155;
  twistShoulders(r, 0.24);
  r.chest.y -= b * 0.6;
  r.head.y -= b * 0.5;
  set(r.ftL, -0.178, -0.058);
  r.ftAngL = -0.26;
  set(r.ftR, 0.17, 0.1);
  r.ftAngR = 0.54;
  solveLegs(r, 0.062, 0.016);
  r.wpnA = -0.34 + b;
  set(r.wpn, 0.132, -0.012 - b * 0.5);
  gripHands(r, w);
}

function poseWalk(r: Rig, w: WeaponDef, t: number): void {
  standBase(r);
  const a = t * TAU;
  const s = Math.sin(a);
  legCycle(r, a, 0.155, 0.2, 0.122, 0.035, 0.17);
  solveLegs(r, 0.06, 0.026);
  twistShoulders(r, s * 0.15);
  twistHips(r, -s * 0.1);
  const sway = Math.sin(a * 2) * 0.009;
  r.chest.x += sway;
  r.head.x += sway * 0.5;
  r.neck.x += sway * 0.8;
  r.shL.x += sway;
  r.shR.x += sway;
  r.hip.x -= sway * 0.6;
  r.wpnA = -0.44 + s * 0.06;
  set(r.wpn, 0.14 + sway - s * 0.012, 0.025);
  gripHands(r, w);
  r.headAngle = -sway * 1.5;
}

function poseWalkAim(r: Rig, w: WeaponDef, t: number): void {
  standBase(r);
  const a = t * TAU;
  const s = Math.sin(a);
  r.armU = 0.212;
  r.armF = 0.202;
  legCycle(r, a, 0.11, 0.15, 0.12, 0.05, 0.15);
  solveLegs(r, 0.075, 0.026);
  twistShoulders(r, 0.4 + s * 0.06);
  const bx = lerp(r.shR.x, r.chest.x, 0.32);
  const by = lerp(r.shR.y, r.chest.y, 0.32) - 0.008;
  weaponFromButt(r, w, bx, by, s * 0.04);
  gripHands(r, w, 0.022);
  set(r.head, bx - 0.088, -0.142);
  r.headAngle = 0;
}

function poseRun(r: Rig, w: WeaponDef, t: number): void {
  standBase(r);
  const a = t * TAU;
  const s = Math.sin(a);
  const c2 = Math.cos(a * 2);
  r.chest.y -= 0.055;
  r.neck.y -= 0.062;
  r.head.y -= 0.085;
  r.shL.y -= 0.055;
  r.shR.y -= 0.055;
  r.hip.y += 0.015;
  r.hipL.y += 0.015;
  r.hipR.y += 0.015;
  legCycle(r, a, 0.185, 0.375, 0.108, 0.05, 0.12);
  solveLegs(r, 0.095, 0.05);
  twistShoulders(r, s * 0.22);
  twistHips(r, -s * 0.16);
  const sway = s * 0.016;
  r.chest.x += sway;
  r.neck.x += sway;
  r.head.x += sway * 0.5;
  r.shL.x += sway;
  r.shR.x += sway;
  r.hip.x -= sway * 0.7;
  r.scale = 1 + c2 * 0.012;
  r.wpnA = -0.74 + s * 0.11;
  set(r.wpn, 0.15 + sway - s * 0.02, -0.035);
  gripHands(r, w);
  r.headAngle = -sway * 2;
}

function poseCrouchIdle(r: Rig, w: WeaponDef, t: number): void {
  crouchBase(r, 0);
  const b = Math.sin(t * TAU) * 0.006;
  r.chest.y -= b;
  r.head.y -= b * 0.6;
  set(r.ftL, -0.152, 0.202);
  r.ftAngL = -0.44;
  set(r.ftR, 0.156, 0.208);
  r.ftAngR = 0.48;
  solveLegs(r, 0.252, 0.118);
  r.wpnA = -0.3 + b;
  set(r.wpn, 0.126, -0.03 - b);
  gripHands(r, w);
}

function poseCrouchWalk(r: Rig, w: WeaponDef, t: number): void {
  crouchBase(r, 0.4);
  const a = t * TAU;
  const s = Math.sin(a);
  legCycle(r, a, 0.115, 0.16, 0.148, 0.208, 0.4);
  solveLegs(r, 0.248, 0.118);
  twistShoulders(r, s * 0.1);
  twistHips(r, -s * 0.08);
  const sway = Math.sin(a * 2) * 0.014;
  r.chest.x += sway;
  r.neck.x += sway;
  r.head.x += sway * 0.6;
  r.shL.x += sway;
  r.shR.x += sway;
  r.wpnA = -0.28 + s * 0.05;
  set(r.wpn, 0.126 + sway - s * 0.01, -0.032);
  gripHands(r, w);
  r.headAngle = -sway;
}

function poseCrouchRun(r: Rig, w: WeaponDef, t: number): void {
  crouchBase(r, 1);
  const a = t * TAU;
  const s = Math.sin(a);
  r.chest.y -= 0.03;
  r.neck.y -= 0.035;
  r.head.y -= 0.048;
  r.shL.y -= 0.03;
  r.shR.y -= 0.03;
  legCycle(r, a, 0.16, 0.26, 0.132, 0.215, 0.3);
  solveLegs(r, 0.268, 0.112);
  twistShoulders(r, s * 0.18);
  twistHips(r, -s * 0.13);
  const sway = s * 0.018;
  r.chest.x += sway;
  r.neck.x += sway;
  r.head.x += sway * 0.5;
  r.shL.x += sway;
  r.shR.x += sway;
  r.hip.x -= sway * 0.6;
  r.scale *= 1 + Math.cos(a * 2) * 0.01;
  r.wpnA = -0.6 + s * 0.09;
  set(r.wpn, 0.14 + sway - s * 0.015, -0.06);
  gripHands(r, w);
  r.headAngle = -sway * 1.5;
}

function poseAimStand(r: Rig, w: WeaponDef, t: number): void {
  standBase(r);
  r.armU = 0.215;
  r.armF = 0.205;
  const sway = Math.sin(t * TAU * 0.7) * 0.02;
  twistShoulders(r, 0.44);
  set(r.ftL, -0.195, -0.105);
  r.ftAngL = -0.24;
  set(r.ftR, 0.178, 0.138);
  r.ftAngR = 0.68;
  solveLegs(r, 0.075, 0.02);
  const bx = lerp(r.shR.x, r.chest.x, 0.3);
  const by = lerp(r.shR.y, r.chest.y, 0.3) - 0.01;
  weaponFromButt(r, w, bx, by, sway * 0.5);
  gripHands(r, w, 0.022);
  set(r.head, bx - 0.09, -0.145);
  r.headAngle = 0;
  r.shadowRX = 0.245;
  r.shadowRY = 0.235;
}

function poseAimCrouch(r: Rig, w: WeaponDef, t: number): void {
  crouchBase(r, 0.5);
  r.armU = 0.2;
  r.armF = 0.19;
  const sway = Math.sin(t * TAU * 0.7) * 0.018;
  twistShoulders(r, 0.4);
  set(r.ftL, -0.168, 0.215);
  r.ftAngL = -0.42;
  set(r.ftR, 0.162, 0.222);
  r.ftAngR = 0.52;
  solveLegs(r, 0.258, 0.118);
  const bx = lerp(r.shR.x, r.chest.x, 0.28);
  const by = lerp(r.shR.y, r.chest.y, 0.28) - 0.008;
  weaponFromButt(r, w, bx, by, sway * 0.5);
  gripHands(r, w, 0.022);
  set(r.head, bx - 0.088, -0.152);
  r.headAngle = 0;
}

function poseProne(r: Rig, w: WeaponDef, t: number): void {
  proneBase(r);
  const b = Math.sin(t * TAU * 0.6) * 0.006;
  set(r.ftL, -0.185, 0.408 + b);
  set(r.ftR, 0.208, 0.352 - b);
  r.ftAngL = -0.5;
  r.ftAngR = 0.62;
  midJoint(r.knL, r.hipL, r.ftL, -0.01, -0.045, 0.5);
  midJoint(r.knR, r.hipR, r.ftR, -0.01, 0.075, 0.5);
  weaponFromButt(r, w, 0.115, -0.16, -0.12);
  gripHands(r, w, 0.026, 0.8);
  r.head.x += 0.012 + b;
  r.headAngle = -0.14;
}

function poseProneAim(r: Rig, w: WeaponDef, t: number): void {
  proneBase(r);
  const b = Math.sin(t * TAU * 0.8) * 0.005;
  set(r.ftL, -0.2, 0.415);
  set(r.ftR, 0.235, 0.318);
  r.ftAngL = -0.55;
  r.ftAngR = 0.8;
  midJoint(r.knL, r.hipL, r.ftL, -0.005, -0.05, 0.5);
  midJoint(r.knR, r.hipR, r.ftR, 0.02, 0.1, 0.5);
  weaponFromButt(r, w, 0.108, -0.2 + b, 0);
  gripHands(r, w, 0.024, 0.78);
  set(r.head, 0.026, -0.338 + b);
  r.headAngle = 0.05;
  r.shadowRY = 0.45;
}

function poseCrawl(r: Rig, w: WeaponDef, t: number): void {
  proneBase(r);
  const a = t * TAU;
  const s = Math.sin(a);
  const kR = Math.max(0, s);
  const kL = Math.max(0, -s);
  const surge = Math.sin(a * 2) * 0.018;
  r.hip.y += surge;
  r.hipL.y += surge;
  r.hipR.y += surge;
  r.chest.y -= surge * 0.6;
  r.neck.y -= surge * 0.6;
  r.head.y -= surge * 0.7;
  r.shL.y -= surge * 0.6;
  r.shR.y -= surge * 0.6;
  twistShoulders(r, s * 0.24);
  twistHips(r, -s * 0.2);
  set(r.knR, r.hipR.x + 0.115 * kR, 0.245 + surge - 0.2 * kR);
  set(r.ftR, 0.185 + 0.075 * kR, 0.4 + surge - 0.235 * kR);
  r.ftAngR = 0.45 + kR * 0.5;
  set(r.knL, r.hipL.x - 0.115 * kL, 0.245 + surge - 0.2 * kL);
  set(r.ftL, -0.185 - 0.075 * kL, 0.4 + surge - 0.235 * kL);
  r.ftAngL = -0.45 - kL * 0.5;
  weaponFromButt(r, w, 0.135, -0.15 - surge, -0.05 + s * 0.07);
  weaponPoint(r.hdR, r, 0.026, 0.014);
  const armLen = r.armU + r.armF;
  solveArm(r.elR, r.shR, r.hdR, armLen, 1);
  const reach = kR;
  set(r.hdL, -0.15 - 0.03 * reach, -0.3 - 0.235 * reach);
  solveArm(r.elL, r.shL, r.hdL, armLen, -1);
  r.freeL = true;
  r.head.x += s * 0.022;
  r.headAngle = s * 0.16;
}

export const POSES: Record<PoseId, (r: Rig, w: WeaponDef, t: number) => void> = {
  idle: poseIdle,
  ready: poseReady,
  walk: poseWalk,
  walk_aim: poseWalkAim,
  run: poseRun,
  crouch_idle: poseCrouchIdle,
  crouch_walk: poseCrouchWalk,
  crouch_run: poseCrouchRun,
  aim_stand: poseAimStand,
  aim_crouch: poseAimCrouch,
  prone: poseProne,
  prone_aim: poseProneAim,
  crawl: poseCrawl,
};

/* ------------------------------------------------- independent orientations */

/** rotate the weapon (and the hands holding it) around the chest */
function applyWeaponOffset(r: Rig, d: number, w: WeaponDef): void {
  if (Math.abs(d) < 1e-4) return;
  const cx = r.chest.x;
  const cy = r.chest.y;
  const s = Math.sin(d);
  const c = Math.cos(d);
  rotAbout(r.wpn, cx, cy, s, c);
  r.wpnA += d;
  const fs = Math.sin(d * 0.35);
  const fc = Math.cos(d * 0.35);
  rotAbout(r.shL, cx, cy, fs, fc);
  rotAbout(r.shR, cx, cy, fs, fc);
  if (r.freeL) {
    weaponPoint(r.hdR, r, gripRear, 0.014);
    rotAbout(r.hdL, cx, cy, fs, fc);
    solveArms(r);
  } else {
    gripHands(r, w, gripRear, gripFore);
  }
}

/** turn the head; it also swings a little around the neck pivot */
function applyLookOffset(r: Rig, d: number): void {
  if (Math.abs(d) < 1e-4) return;
  r.headAngle += d;
  rotAbout(r.head, r.neck.x, r.neck.y, Math.sin(d * 0.55), Math.cos(d * 0.55));
}

/** attention/weapon deviation limits (radians) per stance */
const LOOK_LIMIT = [1.85, 1.75, 1.35];
const WEAPON_LIMIT = [1.4, 1.3, 0.85];

/** Build the full posed rig for a visual state. Mutates and returns `r`. */
export function buildRig(r: Rig, st: SoldierVisualState): Rig {
  const w = WEAPONS[st.weapon];
  POSES[st.pose](r, w, st.phase - Math.floor(st.phase));
  const dw = clamp(angleDelta(st.bodyAngle, st.weaponAngle), -WEAPON_LIMIT[r.stance], WEAPON_LIMIT[r.stance]);
  applyWeaponOffset(r, dw, w);
  const dl = clamp(angleDelta(st.bodyAngle, st.lookAngle), -LOOK_LIMIT[r.stance], LOOK_LIMIT[r.stance]);
  applyLookOffset(r, dl);
  return r;
}
