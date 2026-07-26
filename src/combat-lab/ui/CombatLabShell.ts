import { selectUnit } from '../../core/simulation/SimulationState';
import {
  COMBAT_LAB_SCENARIO_IDS,
  cancelCombatLabWeaponAction,
  getCombatLabScenarioDefinition,
  listCombatLabScenarioDefinitions,
  runCombatLabScenario,
  type CombatLabCommandResultV1,
  type CombatLabDiagnosticLayerId,
  type CombatLabRoleV1,
} from '../../core/testing/combat-lab';
import type { FireMode } from '../../core/infantry-combat/catalogs/CombatCatalogTypes';
import type { UnitPosture } from '../../core/behavior/BehaviorModel';
import type { CombatLabRenderer } from '../rendering/CombatLabRenderer';
import { COMBAT_LAB_VISUAL_SPEEDS, type CombatLabVisualSession } from '../runtime/CombatLabVisualSession';

const LAYER_LABELS: Record<CombatLabDiagnosticLayerId, string> = {
  active_projectiles: 'Активные пули',
  projectile_trails: 'Короткие следы пуль',
  impacts: 'Последние impacts',
  last_hit_zone: 'Зона последнего попадания',
  aim_direction: 'Направление прицеливания',
  target_point: 'Фактическая точка цели',
  dp27_sector: 'Сектор ДП-27',
  dp27_anchor: 'Якорь ДП-27',
  suppression_events: 'События подавления',
  distances: 'Контрольные расстояния',
  unit_ids: 'Идентификаторы участников',
};

export interface CombatLabLayoutV1 {
  readonly root: HTMLElement;
  readonly top: HTMLElement;
  readonly left: HTMLElement;
  readonly map: HTMLElement;
  readonly right: HTMLElement;
  readonly bottom: HTMLElement;
}

export function createCombatLabLayout(root: HTMLElement): CombatLabLayoutV1 {
  root.replaceChildren();
  const top = element('header', 'combat-lab-top');
  const body = element('div', 'combat-lab-body');
  const left = element('aside', 'combat-lab-left');
  const map = element('main', 'combat-lab-map');
  const right = element('aside', 'combat-lab-right');
  const bottom = element('footer', 'combat-lab-bottom');
  body.append(left, map, right);
  root.append(top, body, bottom);
  return { root, top, left, map, right, bottom };
}

export class CombatLabShell {
  private readonly scenarioSelect = document.createElement('select');
  private readonly seedInput = numberInput(1, 4_294_967_295, 1);
  private readonly shooterSelect = document.createElement('select');
  private readonly targetSelect = document.createElement('select');
  private readonly helperSelect = document.createElement('select');
  private readonly firstAidActorSelect = document.createElement('select');
  private readonly firstAidTargetSelect = document.createElement('select');
  private readonly ammoSourceSelect = document.createElement('select');
  private readonly ammoTargetSelect = document.createElement('select');
  private readonly targetXInput = numberInput(0, 10000, 0.1);
  private readonly targetYInput = numberInput(0, 10000, 0.1);
  private readonly modeSelect = document.createElement('select');
  private readonly suppressRadiusInput = numberInput(0.5, 20, 0.5);
  private readonly aimQualityInput = numberInput(0, 1, 0.05);
  private readonly transferRoundsInput = numberInput(1, 1000, 1);
  private readonly firstAidZoneSelect = document.createElement('select');
  private readonly diagnostics = element('pre', 'combat-lab-diagnostics');
  private readonly instructions = element('div', 'combat-lab-instructions');
  private readonly journal = element('div', 'combat-lab-journal');
  private readonly status = element('div', 'combat-lab-status');
  private readonly pauseButton = button('Продолжить', () => this.togglePause());
  private readonly programButton = button('Рекомендуемый запуск', () => this.toggleProgram());
  private readonly restoreButton = button('Восстановить', () => this.restoreCheckpoint());
  private readonly deleteCheckpointButton = button('Удалить точку', () => this.deleteCheckpoint());
  private lastRefreshMs = 0;

  constructor(
    private readonly layout: CombatLabLayoutV1,
    private readonly session: CombatLabVisualSession,
    private readonly renderer: CombatLabRenderer,
  ) {
    this.buildTopBar();
    this.buildLeftPanel();
    this.buildRightPanel();
    this.buildBottomBar();
    this.refreshScenarioControls();
    this.refreshAll();
  }

  refreshLive(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastRefreshMs < 120) return;
    this.lastRefreshMs = now;
    const snapshot = this.session.getSnapshot();
    this.pauseButton.textContent = snapshot.paused ? 'Продолжить' : 'Пауза';
    this.programButton.classList.toggle('active', snapshot.programEnabled);
    this.restoreButton.disabled = !snapshot.checkpointAvailable;
    this.deleteCheckpointButton.disabled = !snapshot.checkpointAvailable;
    this.diagnostics.textContent = buildDiagnostics(this.session);
    this.journal.replaceChildren(...snapshot.eventJournal.slice(-80).reverse().map((entry) => element('div', 'combat-lab-journal-entry', entry)));
    this.status.textContent = `${snapshot.scenarioId}@${snapshot.scenarioRevision} · seed ${snapshot.seed} · ${snapshot.simulatedSeconds.toFixed(3)} с · ${snapshot.interactive ? 'INTERACTIVE' : 'ЧИСТЫЙ'} · ${snapshot.paused ? 'пауза' : `×${snapshot.speed}`}`;
  }

  private buildTopBar(): void {
    const title = element('div', 'combat-lab-title');
    title.append(element('strong', '', 'Испытательный полигон'), element('span', '', 'Stage 3–9 · производственная физика'));
    for (const definition of listCombatLabScenarioDefinitions()) {
      this.scenarioSelect.append(option(definition.scenarioId, definition.titleRu));
    }
    this.scenarioSelect.value = this.session.definition.scenarioId;
    this.seedInput.value = String(this.session.seed);
    const newVisual = button('Новый visual run', () => this.startVisualRun(), 'primary');
    const headless = button('Чистый headless run', () => this.runHeadless());
    const step = button('Один шаг', () => { this.session.stepOnce(); this.renderer.forceRender(); this.refreshAll(); });
    const speed = document.createElement('select');
    for (const value of COMBAT_LAB_VISUAL_SPEEDS) speed.append(option(String(value), `×${value}`));
    speed.value = '1';
    speed.addEventListener('change', () => { this.session.setSpeed(Number(speed.value)); this.refreshAll(); });
    const save = button('Сохранить точку', () => { this.session.saveCheckpoint(); this.refreshAll(); });
    this.layout.top.append(
      title,
      fieldInline('Стенд', this.scenarioSelect),
      fieldInline('Seed', this.seedInput),
      newVisual,
      headless,
      this.pauseButton,
      step,
      fieldInline('Скорость', speed),
      this.programButton,
      save,
      this.restoreButton,
      this.deleteCheckpointButton,
    );
  }

  private buildLeftPanel(): void {
    this.layout.left.append(sectionTitle('Каталог стендов'), this.instructions, sectionTitle('Диагностические слои'));
    const layers = element('div', 'combat-lab-layer-list');
    for (const [layerId, label] of Object.entries(LAYER_LABELS) as Array<[CombatLabDiagnosticLayerId, string]>) {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = this.renderer.isLayerEnabled(layerId);
      input.addEventListener('change', () => this.renderer.setLayerEnabled(layerId, input.checked));
      const row = document.createElement('label');
      row.append(input, document.createTextNode(label));
      layers.append(row);
    }
    this.layout.left.append(layers);
  }

  private buildRightPanel(): void {
    for (const [value, label] of [
      ['single', 'Одиночный'], ['short_burst', 'Короткая очередь'], ['long_burst', 'Длинная очередь'], ['suppress', 'Подавление'],
    ] as const) this.modeSelect.append(option(value, label));
    this.suppressRadiusInput.value = '5';
    this.aimQualityInput.value = '0.5';
    this.transferRoundsInput.value = '30';
    this.firstAidZoneSelect.append(option('', 'Автоматический приоритет'));
    for (const zone of ['head', 'torso', 'arms', 'legs']) this.firstAidZoneSelect.append(option(zone, zone));

    const fireSection = panel('Прицеливание и огонь');
    fireSection.append(
      field('Стрелок', this.shooterSelect),
      field('Цель-боец или точка', this.targetSelect),
      field('X точки, м', this.targetXInput),
      field('Y точки, м', this.targetYInput),
      field('Режим', this.modeSelect),
      field('Радиус suppress, м', this.suppressRadiusInput),
      field('Минимальное качество', this.aimQualityInput),
      row(
        button('Открыть огонь', () => this.openFire(), 'primary'),
        button('Прекратить задачу', () => this.cancelAction('fire')),
      ),
    );

    const postureSection = panel('Поза и движение');
    postureSection.append(row(
      button('Стоя', () => this.changePosture('standing')),
      button('Пригнувшись', () => this.changePosture('crouched')),
      button('Лёжа', () => this.changePosture('prone')),
    ));

    const weaponSection = panel('Оружейные действия');
    weaponSection.append(
      field('Явный помощник', this.helperSelect),
      row(
        button('Перезарядить', () => this.reload()),
        button('Отменить reload', () => this.cancelAction('reload')),
      ),
      row(
        button('Установить ДП-27', () => this.deploy(true)),
        button('Снять ДП-27', () => this.deploy(false)),
        button('Отменить', () => this.cancelAction('deployment')),
      ),
    );

    const transferSection = panel('Передача патронов');
    transferSection.append(
      field('Источник', this.ammoSourceSelect),
      field('Получатель', this.ammoTargetSelect),
      field('Количество', this.transferRoundsInput),
      row(
        button('Передать патроны', () => this.transfer()),
        button('Отменить transfer', () => this.cancelAction('transfer')),
      ),
    );

    const aidSection = panel('Первая помощь');
    aidSection.append(
      field('Оказывающий помощь', this.firstAidActorSelect),
      field('Получатель', this.firstAidTargetSelect),
      field('Зона', this.firstAidZoneSelect),
      row(
        button('Начать первую помощь', () => this.firstAid()),
        button('Отменить помощь', () => this.cancelAction('first_aid', this.firstAidActorSelect.value)),
      ),
    );

    this.layout.right.append(fireSection, postureSection, weaponSection, transferSection, aidSection, sectionTitle('Диагностика'), this.diagnostics);
  }

  private buildBottomBar(): void {
    this.layout.bottom.append(this.status, this.journal);
  }

  private refreshScenarioControls(): void {
    const definition = this.session.definition;
    this.instructions.replaceChildren(
      element('h3', '', definition.titleRu),
      element('p', '', definition.descriptionRu),
      orderedList(definition.manualStepsRu),
      element('code', '', `${definition.scenarioId}@${definition.revision}`),
    );
    fillRoleSelect(this.shooterSelect, definition.roles, 'shooter');
    fillRoleSelect(this.targetSelect, definition.roles, 'target', true, 'Точка по координатам');
    fillRoleSelect(this.helperSelect, definition.roles, 'assistant', true, 'Без помощника');
    fillRoleSelect(this.firstAidActorSelect, definition.roles, 'first_aid_actor');
    fillRoleSelect(this.firstAidTargetSelect, definition.roles, 'first_aid_target');
    fillRoleSelect(this.ammoSourceSelect, definition.roles, 'ammo_source');
    fillRoleSelect(this.ammoTargetSelect, definition.roles, 'ammo_target');
    const targetRole = definition.roles.find((role) => role.selectableAs.includes('target'));
    if (targetRole) this.applyTargetPointFromUnit(targetRole.unitId);
    this.updateFireModes();
  }

  private refreshAll(): void {
    this.updateFireModes();
    this.refreshLive(true);
  }

  private startVisualRun(): void {
    const scenarioId = this.scenarioSelect.value;
    const seed = validSeed(this.seedInput.value, getCombatLabScenarioDefinition(scenarioId).defaultSeed);
    this.session.startNewRun(scenarioId, seed);
    this.renderer.clearHistory();
    for (const layerId of this.session.definition.visualPreset.recommendedLayerIds) this.renderer.setLayerEnabled(layerId, true);
    this.refreshScenarioControls();
    this.renderer.forceRender();
    this.refreshAll();
  }

  private runHeadless(): void {
    const scenarioId = this.scenarioSelect.value;
    const definition = getCombatLabScenarioDefinition(scenarioId);
    const seed = validSeed(this.seedInput.value, definition.defaultSeed);
    const result = runCombatLabScenario({
      schemaVersion: 1,
      scenarioId,
      scenarioRevision: definition.revision,
      seed,
      maximumSimulationSeconds: definition.defaultStopCondition.maximumSimulationSeconds,
      stopCondition: definition.defaultStopCondition,
      mode: 'headless',
    });
    this.status.textContent = `HEADLESS: ${result.stopReason}, ${result.simulatedSeconds.toFixed(3)} с, event ${result.eventDigest}, state ${result.finalStateDigest}`;
    this.diagnostics.textContent = JSON.stringify(result, null, 2);
  }

  private togglePause(): void { this.session.togglePaused(); this.refreshAll(); }
  private toggleProgram(): void { this.session.enableRecommendedProgram(!this.session.getSnapshot().programEnabled); this.refreshAll(); }
  private restoreCheckpoint(): void { if (this.session.restoreCheckpoint()) { this.renderer.clearHistory(); this.renderer.forceRender(); } this.refreshAll(); }
  private deleteCheckpoint(): void { this.session.deleteCheckpoint(); this.refreshAll(); }

  private openFire(): void {
    const targetUnitId = this.targetSelect.value === '__point__' ? null : this.targetSelect.value || null;
    this.execute({
      kind: 'fire',
      shooterUnitId: this.shooterSelect.value,
      targetUnitId,
      targetPointMetres: targetUnitId ? null : {
        xMetres: finite(this.targetXInput.value), yMetres: finite(this.targetYInput.value), zMetres: 1,
      },
      mode: this.modeSelect.value as FireMode,
      targetRadiusMetres: finite(this.suppressRadiusInput.value),
      minimumSolutionQuality: finite(this.aimQualityInput.value),
    });
  }

  private changePosture(targetPosture: UnitPosture): void {
    this.execute({ kind: 'posture', unitId: this.shooterSelect.value, targetPosture });
  }
  private reload(): void {
    this.execute({ kind: 'reload', unitId: this.shooterSelect.value, helperUnitId: this.helperSelect.value || null });
  }
  private deploy(deploy: boolean): void {
    this.execute({ kind: deploy ? 'deploy' : 'undeploy', unitId: this.shooterSelect.value, helperUnitId: this.helperSelect.value || null });
  }
  private transfer(): void {
    this.execute({
      kind: 'transfer', sourceUnitId: this.ammoSourceSelect.value, targetUnitId: this.ammoTargetSelect.value,
      requestedRounds: Math.max(1, Math.trunc(finite(this.transferRoundsInput.value))),
    });
  }
  private firstAid(): void {
    this.execute({
      kind: 'first_aid', actorUnitId: this.firstAidActorSelect.value, targetUnitId: this.firstAidTargetSelect.value,
      zone: (this.firstAidZoneSelect.value || null) as 'head' | 'torso' | 'arms' | 'legs' | null,
    });
  }

  private cancelAction(action: 'fire' | 'reload' | 'deployment' | 'transfer' | 'first_aid', unitId = this.shooterSelect.value): void {
    this.session.markInteractive();
    this.showResult(cancelCombatLabWeaponAction(this.session.state, unitId, action));
  }

  private execute(command: Parameters<CombatLabVisualSession['executeInteractive']>[0]): void {
    this.showResult(this.session.executeInteractive(command));
  }

  private showResult(result: CombatLabCommandResultV1): void {
    this.status.textContent = `${result.accepted ? 'Принято' : 'Отказ'}: ${result.reasonRu} [${result.reasonCode}]`;
    this.renderer.forceRender();
    this.refreshAll();
  }

  private applyTargetPointFromUnit(unitId: string): void {
    const unit = this.session.state.units.find((candidate) => candidate.id === unitId);
    if (!unit) return;
    this.targetXInput.value = (unit.position.x * this.session.state.map.metersPerCell).toFixed(2);
    this.targetYInput.value = (unit.position.y * this.session.state.map.metersPerCell).toFixed(2);
  }

  private updateFireModes(): void {
    const unit = this.session.state.units.find((candidate) => candidate.id === this.shooterSelect.value);
    const modes = new Set(unit?.infantryCombatRuntime.primaryWeapon?.resolved.weapon.availableFireModes ?? []);
    for (const optionElement of this.modeSelect.options) optionElement.disabled = !modes.has(optionElement.value as FireMode);
    if (!modes.has(this.modeSelect.value as FireMode)) this.modeSelect.value = [...modes][0] ?? 'single';
    selectUnit(this.session.state, unit?.id ?? null);
  }
}

function buildDiagnostics(session: CombatLabVisualSession): string {
  const state = session.state;
  const snapshot = session.getSnapshot();
  const selected = state.units.find((unit) => unit.id === state.selectedUnitId) ?? state.units[0];
  const weapon = selected?.infantryCombatRuntime.primaryWeapon;
  const task = selected?.infantryCombatRuntime.activeFireTask;
  const reload = selected?.infantryCombatRuntime.ammoInventory.activeReload;
  const transfer = selected?.infantryCombatRuntime.ammoInventory.activeTransfer;
  const aid = selected?.infantryCombatRuntime.medical.activeFirstAidAction;
  const physiology = selected?.infantryCombatRuntime.physiology;
  const suppression = selected?.infantryCombatRuntime.suppression;
  const diagnostics = state.infantryCombatProjectiles.diagnostics;
  return JSON.stringify({
    run: {
      scenarioId: snapshot.scenarioId, revision: snapshot.scenarioRevision, seed: snapshot.seed,
      simulatedSeconds: snapshot.simulatedSeconds, mode: snapshot.interactive ? 'interactive' : 'clean',
      eventDigest: snapshot.eventDigest, finalStateDigest: snapshot.finalStateDigest,
    },
    selectedUnit: selected ? { name: selected.labels.ru, unitId: selected.id, posture: selected.behaviorRuntime.posture, movement: selected.movementRuntime } : null,
    weapon: weapon ? {
      name: weapon.resolved.weapon.labels.ru, revision: weapon.resolved.weapon.revision,
      deployment: weapon.deployment, roundsInWeapon: weapon.roundsInWeapon,
      reserve: selected?.infantryCombatRuntime.ammoInventory.reserves,
      recoil: weapon.recoil, automaticFire: weapon.automaticFire,
    } : null,
    fireTask: task ? {
      phase: task.phase, mode: task.mode, aimQuality: task.aimQuality,
      factors: task.aimTracking.solution.factors, nextShotBoundarySeconds: task.nextShotBoundarySeconds,
      lastShotId: task.committedShotId, resultCode: task.resultCode,
    } : null,
    reload,
    transfer,
    firstAid: aid,
    wounds: selected?.infantryCombatRuntime.wounds.slots,
    blood: physiology?.blood,
    fatigue: physiology?.fatigue,
    suppression,
    projectiles: {
      active: state.infantryCombatProjectiles.activeProjectiles.length,
      impacts: state.infantryCombatProjectiles.impacts.slice(-5),
      nearMiss: diagnostics.emittedNearMissCount,
      nearImpact: diagnostics.emittedNearImpactCount,
      directHit: diagnostics.emittedDirectHitCount,
      overflow: diagnostics.eventOverflowCount + diagnostics.suppressionEventOverflowCount,
      resize: diagnostics.poolResizeCount,
      counters: diagnostics,
    },
    metrics: snapshot.metrics,
    lastCommandResult: snapshot.lastCommandResult,
  }, null, 2);
}

function fillRoleSelect(select: HTMLSelectElement, roles: readonly CombatLabRoleV1[], kind: CombatLabRoleV1['selectableAs'][number], includeEmpty = false, emptyLabel = 'Не выбрано'): void {
  select.replaceChildren();
  if (includeEmpty) select.append(option(kind === 'target' ? '__point__' : '', emptyLabel));
  for (const role of roles.filter((candidate) => candidate.selectableAs.includes(kind))) select.append(option(role.unitId, `${role.titleRu} · ${role.unitId}`));
}
function panel(title: string): HTMLElement { const result = element('section', 'combat-lab-panel'); result.append(sectionTitle(title)); return result; }
function sectionTitle(text: string): HTMLElement { return element('h2', 'combat-lab-section-title', text); }
function field(label: string, control: HTMLElement): HTMLLabelElement { const result = document.createElement('label'); result.className = 'combat-lab-field'; result.append(element('span', '', label), control); return result; }
function fieldInline(label: string, control: HTMLElement): HTMLLabelElement { const result = field(label, control); result.classList.add('inline'); return result; }
function row(...children: HTMLElement[]): HTMLElement { const result = element('div', 'combat-lab-row'); result.append(...children); return result; }
function button(text: string, handler: () => void, className = ''): HTMLButtonElement { const result = document.createElement('button'); result.type = 'button'; result.textContent = text; result.className = className; result.addEventListener('click', handler); return result; }
function option(value: string, text: string): HTMLOptionElement { const result = document.createElement('option'); result.value = value; result.textContent = text; return result; }
function numberInput(min: number, max: number, step: number): HTMLInputElement { const result = document.createElement('input'); result.type = 'number'; result.min = String(min); result.max = String(max); result.step = String(step); return result; }
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] { const result = document.createElement(tag); result.className = className; if (text) result.textContent = text; return result; }
function orderedList(items: readonly string[]): HTMLOListElement { const list = document.createElement('ol'); for (const item of items) list.append(element('li', '', item)); return list; }
function finite(value: string): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function validSeed(value: string, fallback: number): number { const parsed = Number(value); if (!Number.isFinite(parsed)) return fallback; const seed = Math.trunc(parsed) >>> 0; return seed || fallback; }
