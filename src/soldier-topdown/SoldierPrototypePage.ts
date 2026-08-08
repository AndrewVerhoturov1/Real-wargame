import './soldier-topdown-prototype.css';
import {
  POSE_LABELS,
  SOLDIER_POSES,
  SOLDIER_WEAPONS,
  WEAPON_LABELS,
  drawSoldierTopDown,
  type SoldierPoseId,
  type SoldierRenderOptions,
  type SoldierRenderState,
  type SoldierWeaponId,
} from './SoldierRenderer';

declare const __REAL_WARGAME_BUILD_IDENTITY__: {
  branch: string;
  commitSha: string;
  buildId: string;
  generatedAt: string;
};

const DIRECTIONS = [0, 45, 90, 135, 180, 225, 270, 315] as const;
const SIZES = [24, 32, 48, 64] as const;

type SceneId = 'manual' | 'directions' | 'weapons' | 'low' | 'ground' | 'split';

interface AppState {
  pose: SoldierPoseId;
  weapon: SoldierWeaponId;
  bodyDirection: number;
  attentionDirection: number;
  weaponDirection: number;
  size: number;
  paused: boolean;
  phase: number;
  showBodyDirection: boolean;
  showAttentionDirection: boolean;
  showWeaponDirection: boolean;
  showAttentionSector: boolean;
  selected: boolean;
  scene: SceneId;
  tab: 'gallery' | 'range';
}

const state: AppState = {
  pose: 'walk', weapon: 'mosin', bodyDirection: 0, attentionDirection: 0, weaponDirection: 0, size: 48,
  paused: false, phase: 0.12, showBodyDirection: false, showAttentionDirection: false,
  showWeaponDirection: false, showAttentionSector: false, selected: true, scene: 'manual', tab: 'gallery',
};

const root = document.querySelector<HTMLDivElement>('#soldier-prototype-root');
if (!root) throw new Error('Missing #soldier-prototype-root');

root.innerHTML = `
  <header class="prototype-header">
    <div>
      <p class="eyebrow">REAL WARGAME · VISUAL EXPERIMENT</p>
      <h1>Советская пехота · вид сверху</h1>
      <p class="subtitle">Плоские процедурные фигуры. Силуэт, поза и оружие важнее мелких деталей.</p>
    </div>
    <div class="build-id" id="build-id"></div>
  </header>
  <nav class="tabs" aria-label="Режим прототипа">
    <button type="button" class="tab active" data-tab="gallery">Галерея</button>
    <button type="button" class="tab" data-tab="range">Интерактивный полигон</button>
  </nav>
  <main>
    <section id="gallery-panel" class="panel-page active">
      <section class="intro-grid">
        <article class="info-card"><strong>Цель</strong><span>Человек должен читаться при 24–48 px без реалистичного спрайта.</span></article>
        <article class="info-card"><strong>Тело</strong><span>Каждая поза меняет суставы и общий силуэт, а не только подпись состояния.</span></article>
        <article class="info-card"><strong>Оружие</strong><span>Мосин длинный и тонкий, ППШ короче и тяжелее, ДП узнаётся по диску.</span></article>
      </section>
      <section>
        <div class="section-heading"><div><p class="eyebrow">01</p><h2>Все основные позы</h2></div><p>Одинаковый стрелок с винтовкой Мосина, 48 px, направление вверх.</p></div>
        <div id="pose-gallery" class="pose-gallery"></div>
      </section>
      <section class="matrix-section">
        <div class="section-heading"><div><p class="eyebrow">02</p><h2>Восемь направлений</h2></div><p>Проверка, что анатомия не работает только в одном повороте.</p></div>
        <div id="direction-gallery" class="direction-gallery"></div>
      </section>
      <section class="matrix-section">
        <div class="section-heading"><div><p class="eyebrow">03</p><h2>Оружие по силуэту</h2></div><p>Без подписей внутри игрового поля.</p></div>
        <div id="weapon-gallery" class="weapon-gallery"></div>
      </section>
      <section class="matrix-section">
        <div class="section-heading"><div><p class="eyebrow">04</p><h2>Масштаб</h2></div><p>64 / 48 / 32 / 24 px. При уменьшении детали уходят, поза и тип оружия остаются.</p></div>
        <div id="size-gallery" class="size-gallery"></div>
      </section>
    </section>

    <section id="range-panel" class="panel-page">
      <div class="range-layout">
        <aside class="control-panel">
          <div class="control-section"><p class="eyebrow">Состояние</p><label>Поза<select id="pose-select"></select></label><label>Оружие<select id="weapon-select"></select></label></div>
          <div class="control-section">
            <p class="eyebrow">Направления</p>
            <label>Корпус <output id="body-output">0°</output><input id="body-direction" type="range" min="0" max="315" step="45" value="0"></label>
            <label>Внимание <output id="attention-output">0°</output><input id="attention-direction" type="range" min="0" max="359" step="1" value="0"></label>
            <label>Оружие <output id="weapon-output">0°</output><input id="weapon-direction" type="range" min="0" max="359" step="1" value="0"></label>
            <div id="direction-buttons" class="chip-row"></div>
          </div>
          <div class="control-section"><p class="eyebrow">Размер</p><div id="size-buttons" class="chip-row"></div></div>
          <div class="control-section checks">
            <p class="eyebrow">Диагностика</p>
            <label><input id="diag-body" type="checkbox"> направление корпуса</label>
            <label><input id="diag-attention" type="checkbox"> направление внимания</label>
            <label><input id="diag-weapon" type="checkbox"> направление оружия</label>
            <label><input id="diag-sector" type="checkbox"> сектор внимания</label>
            <label><input id="selected" type="checkbox" checked> выделение</label>
          </div>
          <div class="control-section">
            <p class="eyebrow">Анимация</p>
            <button id="pause-button" type="button" class="primary-button">Пауза</button>
            <label>Фаза <output id="phase-output">12%</output><input id="phase-slider" type="range" min="0" max="100" step="1" value="12"></label>
          </div>
        </aside>
        <section class="range-stage-wrap">
          <div class="preset-bar" id="preset-bar"></div>
          <div class="range-stage" id="range-stage">
            <canvas id="range-canvas" width="1200" height="720"></canvas>
            <div class="stage-note"><strong id="stage-title">Ручная настройка</strong><span id="stage-detail">Управляйте тремя направлениями независимо.</span></div>
          </div>
          <div class="legend-strip">
            <span><i class="dot body"></i>корпус</span><span><i class="dot attention"></i>внимание</span><span><i class="dot weapon"></i>оружие</span>
            <span class="legend-hint">Цветные линии появляются только при включённой диагностике.</span>
          </div>
        </section>
      </div>
    </section>
  </main>
`;

const buildId = document.querySelector<HTMLDivElement>('#build-id');
if (buildId) {
  buildId.textContent = `${__REAL_WARGAME_BUILD_IDENTITY__.branch} · ${__REAL_WARGAME_BUILD_IDENTITY__.commitSha.slice(0, 12)}`;
  buildId.title = __REAL_WARGAME_BUILD_IDENTITY__.buildId;
}

const poseSelect = must<HTMLSelectElement>('#pose-select');
const weaponSelect = must<HTMLSelectElement>('#weapon-select');
const bodyDirection = must<HTMLInputElement>('#body-direction');
const attentionDirection = must<HTMLInputElement>('#attention-direction');
const weaponDirection = must<HTMLInputElement>('#weapon-direction');
const bodyOutput = must<HTMLOutputElement>('#body-output');
const attentionOutput = must<HTMLOutputElement>('#attention-output');
const weaponOutput = must<HTMLOutputElement>('#weapon-output');
const phaseOutput = must<HTMLOutputElement>('#phase-output');
const phaseSlider = must<HTMLInputElement>('#phase-slider');
const pauseButton = must<HTMLButtonElement>('#pause-button');
const canvas = must<HTMLCanvasElement>('#range-canvas');
const stage = must<HTMLDivElement>('#range-stage');
const stageTitle = must<HTMLElement>('#stage-title');
const stageDetail = must<HTMLElement>('#stage-detail');
const maybeCtx = canvas.getContext('2d');
if (!maybeCtx) throw new Error('Canvas 2D unavailable');
const ctx: CanvasRenderingContext2D = maybeCtx;

for (const pose of SOLDIER_POSES) {
  const option = document.createElement('option'); option.value = pose; option.textContent = POSE_LABELS[pose]; poseSelect.append(option);
}
for (const weapon of SOLDIER_WEAPONS) {
  const option = document.createElement('option'); option.value = weapon; option.textContent = WEAPON_LABELS[weapon]; weaponSelect.append(option);
}
poseSelect.value = state.pose; weaponSelect.value = state.weapon;

buildGallery(); buildDirectionButtons(); buildSizeButtons(); buildPresets(); bindControls(); resizeRangeCanvas();
const resizeObserver = new ResizeObserver(resizeRangeCanvas); resizeObserver.observe(stage);
let raf = 0, lastTime = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000)); lastTime = now;
  if (!state.paused) { state.phase = (state.phase + dt * animationSpeed(state.pose)) % 1; phaseSlider.value = String(Math.round(state.phase * 100)); phaseOutput.value = `${Math.round(state.phase * 100)}%`; }
  renderRange(); raf = requestAnimationFrame(frame);
}
raf = requestAnimationFrame(frame);
window.addEventListener('beforeunload', () => { cancelAnimationFrame(raf); resizeObserver.disconnect(); }, { once: true });

function must<T extends Element>(selector: string): T { const element = document.querySelector<T>(selector); if (!element) throw new Error(`Missing ${selector}`); return element; }
const deg = (value: number): number => (value * Math.PI) / 180;
function animationSpeed(pose: SoldierPoseId): number { switch (pose) { case 'walk': return 0.9; case 'run': return 1.7; case 'crouchMove': return 0.7; case 'crouchRun': return 1.35; case 'crawl': return 0.55; default: return 0.22; } }
function galleryPhase(pose: SoldierPoseId): number { switch (pose) { case 'walk': return 0.13; case 'run': return 0.16; case 'crouchMove': return 0.18; case 'crouchRun': return 0.16; case 'crawl': return 0.12; default: return 0; } }
function stateFor(pose: SoldierPoseId, weapon: SoldierWeaponId, size: number, bodyDeg = 0, attentionDeg = bodyDeg, weaponDeg = bodyDeg, phase = galleryPhase(pose)): SoldierRenderState {
  return { pose, weapon, size, phase, bodyDirection: deg(bodyDeg), attentionDirection: deg(attentionDeg), weaponDirection: deg(weaponDeg) };
}
function deviceScale(): number { return Math.min(2, window.devicePixelRatio || 1); }
function createCanvas(width: number, height: number, cssClass: string): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = width * deviceScale(); c.height = height * deviceScale(); c.style.width = `${width}px`; c.style.height = `${height}px`; c.className = cssClass;
  const cctx = c.getContext('2d'); if (cctx) cctx.scale(deviceScale(), deviceScale()); return c;
}
function drawCellBackground(cctx: CanvasRenderingContext2D, w: number, h: number) {
  cctx.fillStyle = '#777a68'; cctx.fillRect(0, 0, w, h); cctx.strokeStyle = 'rgba(30,34,27,0.12)'; cctx.lineWidth = 1;
  for (let x = 12; x < w; x += 12) { cctx.beginPath(); cctx.moveTo(x, 0); cctx.lineTo(x, h); cctx.stroke(); }
  for (let y = 12; y < h; y += 12) { cctx.beginPath(); cctx.moveTo(0, y); cctx.lineTo(w, y); cctx.stroke(); }
}

function buildGallery() {
  const poses = must<HTMLDivElement>('#pose-gallery');
  for (const pose of SOLDIER_POSES) {
    const card = document.createElement('article'); card.className = 'pose-card'; const c = createCanvas(138, 126, 'gallery-canvas'); const cctx = c.getContext('2d');
    if (cctx) { drawCellBackground(cctx, 138, 126); drawSoldierTopDown(cctx, 69, 66, stateFor(pose, 'mosin', 48), { showShadow: true }); }
    const title = document.createElement('strong'); title.textContent = POSE_LABELS[pose]; const code = document.createElement('span'); code.textContent = pose; card.append(c, title, code); poses.append(card);
  }
  const directions = must<HTMLDivElement>('#direction-gallery');
  for (const angle of DIRECTIONS) {
    const cell = document.createElement('article'); cell.className = 'direction-cell'; const c = createCanvas(106, 106, 'gallery-canvas compact'); const cctx = c.getContext('2d');
    if (cctx) { drawCellBackground(cctx, 106, 106); drawSoldierTopDown(cctx, 53, 54, stateFor('ready', 'mosin', 42, angle, angle, angle), { showShadow: true }); }
    const label = document.createElement('strong'); label.textContent = `${angle}°`; cell.append(c, label); directions.append(cell);
  }
  const weapons = must<HTMLDivElement>('#weapon-gallery');
  for (const weapon of SOLDIER_WEAPONS) {
    const cell = document.createElement('article'); cell.className = 'weapon-cell'; const c = createCanvas(170, 142, 'gallery-canvas'); const cctx = c.getContext('2d');
    if (cctx) { drawCellBackground(cctx, 170, 142); drawSoldierTopDown(cctx, 85, 76, stateFor('ready', weapon, 56), { showShadow: true }); }
    const title = document.createElement('strong'); title.textContent = WEAPON_LABELS[weapon]; const note = document.createElement('span'); note.textContent = weapon === 'mosin' ? 'длинный тонкий ствол' : weapon === 'ppsh41' ? 'короче + барабан' : 'диск + тяжёлый ствол'; cell.append(c, title, note); weapons.append(cell);
  }
  const sizes = must<HTMLDivElement>('#size-gallery');
  for (const size of SIZES) {
    const cell = document.createElement('article'); cell.className = 'size-cell'; const c = createCanvas(180, 128, 'gallery-canvas'); const cctx = c.getContext('2d');
    if (cctx) { drawCellBackground(cctx, 180, 128); drawSoldierTopDown(cctx, 48, 68, stateFor('run', 'mosin', size, 45, 45, 45, 0.14), { showShadow: true }); drawSoldierTopDown(cctx, 92, 68, stateFor('crouchRun', 'ppsh41', size, 45, 45, 45, 0.14), { showShadow: true }); drawSoldierTopDown(cctx, 136, 68, stateFor('proneAim', 'dp27', size, 45, 45, 45, 0), { showShadow: true }); }
    const title = document.createElement('strong'); title.textContent = `${size} px`; const note = document.createElement('span'); note.textContent = size === 24 ? 'минимальный силуэт' : size === 32 ? 'главная проверка' : size === 48 ? 'целевой крупный' : 'контроль деталей'; cell.append(c, title, note); sizes.append(cell);
  }
}

function buildDirectionButtons() {
  const holder = must<HTMLDivElement>('#direction-buttons');
  for (const angle of DIRECTIONS) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'chip'; button.textContent = `${angle}°`;
    button.addEventListener('click', () => { state.bodyDirection = angle; state.attentionDirection = angle; state.weaponDirection = angle; state.scene = 'manual'; syncControls(); }); holder.append(button);
  }
}
function buildSizeButtons() {
  const holder = must<HTMLDivElement>('#size-buttons');
  for (const size of SIZES) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'chip size-chip'; button.textContent = `${size}`; button.dataset.size = String(size);
    button.addEventListener('click', () => { state.size = size; state.scene = 'manual'; syncControls(); }); holder.append(button);
  }
  syncSizeButtons();
}
function buildPresets() {
  const holder = must<HTMLDivElement>('#preset-bar');
  const presets: Array<[SceneId, string, string]> = [
    ['manual', 'Ручной', 'Один основной боец + сравнение оружия'], ['directions', '8 направлений', 'Одна поза во всех восьми поворотах'], ['weapons', 'Оружие', 'Мосин / ППШ-41 / ДП-27 рядом'], ['low', 'Низкое движение', 'Обычный бег против пригнутого'], ['ground', 'Лёжа и ползком', 'Prone / prone aim / crawl'], ['split', 'Разные направления', 'Корпус, внимание и оружие разведены'],
  ];
  for (const [id, label, title] of presets) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'preset'; button.dataset.scene = id; button.textContent = label; button.title = title;
    button.addEventListener('click', () => { state.scene = id; if (id === 'split') { state.bodyDirection = 0; state.attentionDirection = 35; state.weaponDirection = 70; state.showBodyDirection = true; state.showAttentionDirection = true; state.showWeaponDirection = true; } syncControls(); }); holder.append(button);
  }
}
function bindControls() {
  document.querySelectorAll<HTMLButtonElement>('.tab').forEach((button) => button.addEventListener('click', () => { state.tab = button.dataset.tab === 'range' ? 'range' : 'gallery'; document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab === button)); must('#gallery-panel').classList.toggle('active', state.tab === 'gallery'); must('#range-panel').classList.toggle('active', state.tab === 'range'); if (state.tab === 'range') resizeRangeCanvas(); }));
  poseSelect.addEventListener('change', () => { state.pose = poseSelect.value as SoldierPoseId; state.scene = 'manual'; });
  weaponSelect.addEventListener('change', () => { state.weapon = weaponSelect.value as SoldierWeaponId; state.scene = 'manual'; });
  bindRange(bodyDirection, (value) => state.bodyDirection = value); bindRange(attentionDirection, (value) => state.attentionDirection = value); bindRange(weaponDirection, (value) => state.weaponDirection = value);
  bindCheck('#diag-body', (value) => state.showBodyDirection = value); bindCheck('#diag-attention', (value) => state.showAttentionDirection = value); bindCheck('#diag-weapon', (value) => state.showWeaponDirection = value); bindCheck('#diag-sector', (value) => state.showAttentionSector = value); bindCheck('#selected', (value) => state.selected = value);
  pauseButton.addEventListener('click', () => { state.paused = !state.paused; pauseButton.textContent = state.paused ? 'Продолжить' : 'Пауза'; pauseButton.classList.toggle('paused', state.paused); });
  phaseSlider.addEventListener('input', () => { state.phase = Number(phaseSlider.value) / 100; state.paused = true; pauseButton.textContent = 'Продолжить'; pauseButton.classList.add('paused'); phaseOutput.value = `${Math.round(state.phase * 100)}%`; });
}
function bindRange(input: HTMLInputElement, setter: (value: number) => void) { input.addEventListener('input', () => { setter(Number(input.value)); state.scene = 'manual'; syncControls(); }); }
function bindCheck(selector: string, setter: (value: boolean) => void) { const input = must<HTMLInputElement>(selector); input.addEventListener('change', () => { setter(input.checked); state.scene = state.scene === 'split' ? 'split' : 'manual'; }); }
function syncControls() {
  poseSelect.value = state.pose; weaponSelect.value = state.weapon; bodyDirection.value = String(state.bodyDirection); attentionDirection.value = String(state.attentionDirection); weaponDirection.value = String(state.weaponDirection);
  bodyOutput.value = `${state.bodyDirection}°`; attentionOutput.value = `${state.attentionDirection}°`; weaponOutput.value = `${state.weaponDirection}°`;
  must<HTMLInputElement>('#diag-body').checked = state.showBodyDirection; must<HTMLInputElement>('#diag-attention').checked = state.showAttentionDirection; must<HTMLInputElement>('#diag-weapon').checked = state.showWeaponDirection; must<HTMLInputElement>('#diag-sector').checked = state.showAttentionSector; must<HTMLInputElement>('#selected').checked = state.selected;
  syncSizeButtons(); document.querySelectorAll<HTMLButtonElement>('.preset').forEach((button) => button.classList.toggle('active', button.dataset.scene === state.scene));
}
function syncSizeButtons() { document.querySelectorAll<HTMLButtonElement>('.size-chip').forEach((button) => button.classList.toggle('active', Number(button.dataset.size) === state.size)); }
function resizeRangeCanvas() {
  const rect = stage.getBoundingClientRect(), dpr = deviceScale(), width = Math.max(480, Math.floor(rect.width)), height = Math.max(380, Math.floor(rect.height));
  if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) { canvas.width = Math.floor(width * dpr); canvas.height = Math.floor(height * dpr); canvas.style.width = `${width}px`; canvas.style.height = `${height}px`; }
}
function prepareRangeCanvas(): { width: number; height: number; dpr: number } {
  const dpr = deviceScale(), width = canvas.width / dpr, height = canvas.height / dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#747867'; ctx.fillRect(0, 0, width, height); ctx.strokeStyle = 'rgba(31,35,29,0.12)'; ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  for (let y = 0; y < height; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  return { width, height, dpr };
}
function renderRange() { const { width, height } = prepareRangeCanvas(); switch (state.scene) { case 'directions': renderDirectionsScene(width, height); break; case 'weapons': renderWeaponsScene(width, height); break; case 'low': renderLowScene(width, height); break; case 'ground': renderGroundScene(width, height); break; case 'split': renderSplitScene(width, height); break; default: renderManualScene(width, height); } }
function commonOptions(selected = false): SoldierRenderOptions { return { showShadow: true, showBodyDirection: state.showBodyDirection, showAttentionDirection: state.showAttentionDirection, showWeaponDirection: state.showWeaponDirection, showAttentionSector: state.showAttentionSector, attentionSectorRadians: Math.PI * 0.55, opacity: selected ? 1 : 0.98 }; }
function controlledState(overrides: Partial<SoldierRenderState> = {}): SoldierRenderState { return { pose: state.pose, weapon: state.weapon, phase: state.phase, bodyDirection: deg(state.bodyDirection), attentionDirection: deg(state.attentionDirection), weaponDirection: deg(state.weaponDirection), size: state.size, selected: state.selected, ...overrides }; }
function renderManualScene(width: number, height: number) {
  stageTitle.textContent = 'Ручная настройка'; stageDetail.textContent = `${POSE_LABELS[state.pose]} · ${WEAPON_LABELS[state.weapon]} · ${state.size} px`; const cy = height * 0.48;
  drawSoldierTopDown(ctx, width * 0.5, cy, controlledState(), commonOptions(true)); drawSoldierTopDown(ctx, width * 0.23, height * 0.68, stateFor('ready', 'ppsh41', 32, 315, 315, 315, state.phase), { showShadow: true, opacity: 0.82 }); drawSoldierTopDown(ctx, width * 0.77, height * 0.68, stateFor('ready', 'dp27', 32, 45, 45, 45, state.phase), { showShadow: true, opacity: 0.82 }); labelAt(width * 0.23, height * 0.68 + 52, 'ППШ · 32 px'); labelAt(width * 0.77, height * 0.68 + 52, 'ДП-27 · 32 px');
}
function renderDirectionsScene(width: number, height: number) {
  stageTitle.textContent = 'Восемь направлений'; stageDetail.textContent = `${POSE_LABELS[state.pose]} · ${WEAPON_LABELS[state.weapon]} · одинаковая фаза`;
  DIRECTIONS.forEach((angle, index) => { const col = index % 4, row = Math.floor(index / 4), x = width * (0.14 + col * 0.24), y = height * (0.31 + row * 0.42); drawSoldierTopDown(ctx, x, y, stateFor(state.pose, state.weapon, state.size, angle, angle, angle, state.phase), { showShadow: true }); labelAt(x, y + 55, `${angle}°`); });
}
function renderWeaponsScene(width: number, height: number) {
  stageTitle.textContent = 'Оружие читается силуэтом'; stageDetail.textContent = 'Три одинаковые позы и масштаб, меняется только оружие.';
  SOLDIER_WEAPONS.forEach((weapon, index) => { const x = width * (0.25 + index * 0.25), y = height * 0.48; drawSoldierTopDown(ctx, x, y, stateFor('ready', weapon, Math.max(48, state.size), 0, 0, 0, state.phase), { showShadow: true }); labelAt(x, y + 74, WEAPON_LABELS[weapon]); });
}
function renderLowScene(width: number, height: number) {
  stageTitle.textContent = 'Обычное и низкое движение'; stageDetail.textContent = 'Различие видно по ширине, коленям и наклону силуэта.';
  const entries: Array<[SoldierPoseId, string]> = [['walk', 'ходьба'], ['run', 'бег'], ['crouchMove', 'пригнувшись'], ['crouchRun', 'низкий бег']];
  entries.forEach(([pose, label], index) => { const x = width * (0.14 + index * 0.24), y = height * 0.48; drawSoldierTopDown(ctx, x, y, stateFor(pose, state.weapon, Math.max(40, state.size), 0, 0, 0, state.phase), { showShadow: true }); labelAt(x, y + 72, label); });
}
function renderGroundScene(width: number, height: number) {
  stageTitle.textContent = 'Лёжа, прицеливание и ползание'; stageDetail.textContent = 'Вытянутый корпус, локти и ноги формируют принципиально другой силуэт.';
  const entries: Array<[SoldierPoseId, SoldierWeaponId, string]> = [['prone', 'mosin', 'лежит'], ['proneAim', 'dp27', 'целится лёжа'], ['crawl', 'ppsh41', 'ползёт']];
  entries.forEach(([pose, weapon, label], index) => { const x = width * (0.25 + index * 0.25), y = height * 0.48; drawSoldierTopDown(ctx, x, y, stateFor(pose, weapon, Math.max(48, state.size), index * 45, index * 45, index * 45, state.phase), { showShadow: true }); labelAt(x, y + 82, label); });
}
function renderSplitScene(width: number, height: number) {
  stageTitle.textContent = 'Корпус, внимание и оружие не обязаны совпадать'; stageDetail.textContent = '0° корпус · 35° внимание · 70° оружие. Диагностические линии включены.';
  const opts: SoldierRenderOptions = { showShadow: true, showBodyDirection: true, showAttentionDirection: true, showWeaponDirection: true, showAttentionSector: state.showAttentionSector };
  drawSoldierTopDown(ctx, width * 0.5, height * 0.48, controlledState({ pose: 'ready', size: Math.max(56, state.size), bodyDirection: deg(0), attentionDirection: deg(35), weaponDirection: deg(70), selected: true }), opts);
  drawSoldierTopDown(ctx, width * 0.27, height * 0.67, stateFor('crouchAim', 'mosin', 36, 315, 345, 20, state.phase), opts); drawSoldierTopDown(ctx, width * 0.73, height * 0.67, stateFor('proneAim', 'dp27', 36, 45, 20, 75, state.phase), opts);
}
function labelAt(x: number, y: number, text: string) { ctx.save(); ctx.font = '600 12px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(239,238,220,0.86)'; ctx.fillText(text, x, y); ctx.restore(); }

syncControls();
