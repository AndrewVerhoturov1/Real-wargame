import type { UnitPosture } from '../../core/behavior/BehaviorModel';
import type { FireMode } from '../../core/infantry-combat/catalogs/CombatCatalogTypes';
import { getEffectiveCombatCapabilities, validateMachineGunAssistant } from '../../core/infantry-combat/runtime';
import { selectUnit } from '../../core/simulation/SimulationState';
import type { UnitModel } from '../../core/units/UnitModel';
import {
  cancelCombatLabWeaponAction,
  getCombatLabScenarioDefinition,
  listCombatLabScenarioDefinitions,
  runCombatLabScenario,
  type CombatLabCommandResultV1,
  type CombatLabDiagnosticLayerId,
  type CombatLabRoleV1,
  type CombatLabScriptCommandV1,
} from '../../core/testing/combat-lab';
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

interface CombatLabUiSelectionV1 {
  readonly shooterUnitId: string;
  readonly targetUnitId: string | null;
  readonly targetPointMetres: { readonly xMetres: number; readonly yMetres: number };
  readonly helperUnitId: string | null;
  readonly firstAidActorUnitId: string;
  readonly firstAidTargetUnitId: string;
  readonly ammoSourceUnitId: string;
  readonly ammoTargetUnitId: string;
}

export function createCombatLabLayout(root: HTMLElement): CombatLabLayoutV1 {
  root.replaceChildren();
  const top = node('header', 'combat-lab-top');
  const body = node('div', 'combat-lab-body');
  const left = node('aside', 'combat-lab-left');
  const map = node('main', 'combat-lab-map');
  const right = node('aside', 'combat-lab-right');
  const bottom = node('footer', 'combat-lab-bottom');
  body.append(left, map, right);
  root.append(top, body, bottom);
  return { root, top, left, map, right, bottom };
}

export class CombatLabShell {
  private readonly scenario = select();
  private readonly seed = numberInput(1, 4_294_967_295, 1);
  private readonly shooter = select();
  private readonly target = select();
  private readonly helper = select();
  private readonly aidActor = select();
  private readonly aidTarget = select();
  private readonly ammoSource = select();
  private readonly ammoTarget = select();
  private readonly targetX = numberInput(0, 10_000, 0.1);
  private readonly targetY = numberInput(0, 10_000, 0.1);
  private readonly mode = select();
  private readonly suppressRadius = numberInput(0.5, 20, 0.5);
  private readonly aimQuality = numberInput(0, 1, 0.05);
  private readonly transferRounds = numberInput(1, 1000, 1);
  private readonly aidZone = select();
  private readonly instructions = node('div', 'combat-lab-instructions');
  private readonly diagnostics = node('pre', 'combat-lab-diagnostics');
  private readonly status = node('div', 'combat-lab-status');
  private readonly journal = node('div', 'combat-lab-journal');
  private readonly pause = button('Продолжить', () => this.togglePause());
  private readonly program = button('Рекомендуемый запуск', () => this.toggleProgram());
  private readonly restore = button('Восстановить', () => this.restoreCheckpoint());
  private readonly removeCheckpoint = button('Удалить точку', () => this.deleteCheckpoint());
  private lastRefreshMs = 0;

  constructor(
    private readonly layout: CombatLabLayoutV1,
    private readonly session: CombatLabVisualSession,
    private readonly renderer: CombatLabRenderer,
  ) {
    this.buildTop();
    this.buildLeft();
    this.buildRight();
    this.layout.bottom.append(this.status, this.journal);
    this.shooter.addEventListener('change', () => {
      this.updateFireModes();
      this.renderer.forceRender();
      this.refreshLive(true);
    });
    this.target.addEventListener('change', () => {
      if (this.target.value !== '__point__') this.setPointFromUnit(this.target.value);
      this.refreshLive(true);
    });
    for (const control of [this.helper, this.aidActor, this.aidTarget, this.ammoSource, this.ammoTarget]) {
      control.addEventListener('change', () => this.refreshLive(true));
    }
    for (const control of [this.targetX, this.targetY]) control.addEventListener('input', () => this.refreshLive(true));
    this.refreshScenarioControls();
    this.refreshLive(true);
  }

  refreshLive(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastRefreshMs < 120) return;
    this.lastRefreshMs = now;
    const snapshot = this.session.getSnapshot();
    this.pause.textContent = snapshot.paused ? 'Продолжить' : 'Пауза';
    this.program.classList.toggle('active', snapshot.programEnabled);
    this.restore.disabled = !snapshot.checkpointAvailable;
    this.removeCheckpoint.disabled = !snapshot.checkpointAvailable;
    this.status.textContent = `${snapshot.scenarioId}@${snapshot.scenarioRevision} · seed ${snapshot.seed} · ${snapshot.simulatedSeconds.toFixed(3)} с · ${snapshot.interactive ? 'INTERACTIVE' : 'ЧИСТЫЙ'} · ${snapshot.paused ? 'пауза' : `×${snapshot.speed}`}`;
    this.diagnostics.textContent = JSON.stringify(buildDiagnostics(this.session, this.readSelection()), null, 2);
    this.journal.replaceChildren(
      ...snapshot.eventJournal.slice(-80).reverse().map((entry) => node('div', 'combat-lab-journal-entry', entry)),
    );
  }

  private buildTop(): void {
    const title = node('div', 'combat-lab-title');
    title.append(node('strong', '', 'Испытательный полигон'), node('span', '', 'Stage 3–9 · производственная физика'));
    for (const definition of listCombatLabScenarioDefinitions()) this.scenario.append(option(definition.scenarioId, definition.titleRu));
    this.scenario.value = this.session.definition.scenarioId;
    this.seed.value = String(this.session.seed);
    const speed = select();
    for (const value of COMBAT_LAB_VISUAL_SPEEDS) speed.append(option(String(value), `×${value}`));
    speed.value = '1';
    speed.addEventListener('change', () => {
      this.session.setSpeed(Number(speed.value));
      this.refreshLive(true);
    });
    this.layout.top.append(
      title,
      inlineField('Стенд', this.scenario),
      inlineField('Seed', this.seed),
      button('Новый visual run', () => this.startVisualRun(), 'primary'),
      button('Чистый headless run', () => this.runHeadless()),
      this.pause,
      button('Один шаг', () => {
        this.session.stepOnce();
        this.renderer.forceRender();
        this.refreshLive(true);
      }),
      inlineField('Скорость', speed),
      this.program,
      button('Сохранить точку', () => {
        this.session.saveCheckpoint();
        this.refreshLive(true);
      }),
      this.restore,
      this.removeCheckpoint,
    );
  }

  private buildLeft(): void {
    this.layout.left.append(sectionTitle('Каталог стендов'), this.instructions, sectionTitle('Диагностические слои'));
    const list = node('div', 'combat-lab-layer-list');
    for (const [layerId, label] of Object.entries(LAYER_LABELS) as Array<[CombatLabDiagnosticLayerId, string]>) {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = this.renderer.isLayerEnabled(layerId);
      input.addEventListener('change', () => this.renderer.setLayerEnabled(layerId, input.checked));
      const row = document.createElement('label');
      row.append(input, document.createTextNode(label));
      list.append(row);
    }
    this.layout.left.append(list);
  }

  private buildRight(): void {
    for (const [value, label] of [
      ['single', 'Одиночный'],
      ['short_burst', 'Короткая очередь'],
      ['long_burst', 'Длинная очередь'],
      ['suppress', 'Подавление'],
    ] as const) this.mode.append(option(value, label));
    this.suppressRadius.value = '5';
    this.aimQuality.value = '0.5';
    this.transferRounds.value = '30';
    this.aidZone.append(option('', 'Автоматический приоритет'));
    for (const zone of ['head', 'torso', 'arms', 'legs']) this.aidZone.append(option(zone, zone));

    this.layout.right.append(
      panel(
        'Прицеливание и огонь',
        field('Стрелок', this.shooter),
        field('Цель-боец или точка', this.target),
        field('X точки, м', this.targetX),
        field('Y точки, м', this.targetY),
        field('Режим', this.mode),
        field('Радиус suppress, м', this.suppressRadius),
        field('Минимальное качество', this.aimQuality),
        actionRow(
          button('Открыть огонь', () => this.openFire(), 'primary'),
          button('Прекратить задачу', () => this.cancel('fire')),
        ),
      ),
      panel(
        'Поза',
        actionRow(
          button('Стоя', () => this.posture('standing')),
          button('Пригнувшись', () => this.posture('crouched')),
          button('Лёжа', () => this.posture('prone')),
        ),
      ),
      panel(
        'Оружейные действия',
        field('Явный помощник', this.helper),
        actionRow(
          button('Перезарядить', () => this.reload()),
          button('Отменить reload', () => this.cancel('reload')),
        ),
        actionRow(
          button('Установить ДП-27', () => this.deployment('deploy')),
          button('Снять ДП-27', () => this.deployment('undeploy')),
          button('Отменить', () => this.cancel('deployment')),
        ),
      ),
      panel(
        'Передача патронов',
        field('Источник', this.ammoSource),
        field('Получатель', this.ammoTarget),
        field('Количество', this.transferRounds),
        actionRow(
          button('Передать патроны', () => this.transfer()),
          button('Отменить transfer', () => this.cancel('transfer', this.ammoSource.value)),
        ),
      ),
      panel(
        'Первая помощь',
        field('Оказывающий помощь', this.aidActor),
        field('Получатель', this.aidTarget),
        field('Зона', this.aidZone),
        actionRow(
          button('Начать первую помощь', () => this.firstAid()),
          button('Отменить помощь', () => this.cancel('first_aid', this.aidActor.value)),
        ),
      ),
      sectionTitle('Диагностика'),
      this.diagnostics,
    );
  }

  private refreshScenarioControls(): void {
    const definition = this.session.definition;
    this.instructions.replaceChildren(
      node('h3', '', definition.titleRu),
      node('p', '', definition.descriptionRu),
      orderedList(definition.manualStepsRu),
      node('code', '', `${definition.scenarioId}@${definition.revision}`),
    );
    fillRoles(this.shooter, definition.roles, 'shooter');
    fillRoles(this.target, definition.roles, 'target', true, 'Точка по координатам');
    fillRoles(this.helper, definition.roles, 'assistant', true, 'Без помощника');
    fillRoles(this.aidActor, definition.roles, 'first_aid_actor');
    fillRoles(this.aidTarget, definition.roles, 'first_aid_target');
    fillRoles(this.ammoSource, definition.roles, 'ammo_source');
    fillRoles(this.ammoTarget, definition.roles, 'ammo_target');
    const firstTarget = definition.roles.find((role) => role.selectableAs.includes('target'));
    if (firstTarget) {
      this.target.value = firstTarget.unitId;
      this.setPointFromUnit(firstTarget.unitId);
    }
    this.updateFireModes();
  }

  private startVisualRun(): void {
    const definition = getCombatLabScenarioDefinition(this.scenario.value);
    this.session.startNewRun(definition.scenarioId, validSeed(this.seed.value, definition.defaultSeed));
    this.renderer.clearHistory();
    for (const layer of this.session.definition.visualPreset.recommendedLayerIds) this.renderer.setLayerEnabled(layer, true);
    this.refreshScenarioControls();
    this.renderer.forceRender();
    this.refreshLive(true);
  }

  private runHeadless(): void {
    const definition = getCombatLabScenarioDefinition(this.scenario.value);
    const result = runCombatLabScenario({
      schemaVersion: 1,
      scenarioId: definition.scenarioId,
      scenarioRevision: definition.revision,
      seed: validSeed(this.seed.value, definition.defaultSeed),
      maximumSimulationSeconds: definition.defaultStopCondition.maximumSimulationSeconds,
      stopCondition: definition.defaultStopCondition,
      mode: 'headless',
    });
    this.status.textContent = `HEADLESS: ${result.stopReason} · ${result.simulatedSeconds.toFixed(3)} с · ${result.eventDigest} · ${result.finalStateDigest}`;
    this.diagnostics.textContent = JSON.stringify(result, null, 2);
  }

  private togglePause(): void {
    this.session.togglePaused();
    this.refreshLive(true);
  }

  private toggleProgram(): void {
    this.session.enableRecommendedProgram(!this.session.getSnapshot().programEnabled);
    this.refreshLive(true);
  }

  private restoreCheckpoint(): void {
    if (this.session.restoreCheckpoint()) {
      this.renderer.clearHistory();
      this.renderer.forceRender();
    }
    this.refreshLive(true);
  }

  private deleteCheckpoint(): void {
    this.session.deleteCheckpoint();
    this.refreshLive(true);
  }

  private openFire(): void {
    const targetUnitId = this.target.value === '__point__' ? null : this.target.value || null;
    this.execute({
      kind: 'fire',
      shooterUnitId: this.shooter.value,
      targetUnitId,
      targetPointMetres: targetUnitId
        ? null
        : { xMetres: finite(this.targetX.value), yMetres: finite(this.targetY.value), zMetres: 1 },
      mode: this.mode.value as FireMode,
      targetRadiusMetres: finite(this.suppressRadius.value),
      minimumSolutionQuality: finite(this.aimQuality.value),
    });
  }

  private posture(targetPosture: UnitPosture): void {
    this.execute({ kind: 'posture', unitId: this.shooter.value, targetPosture });
  }

  private reload(): void {
    this.execute({ kind: 'reload', unitId: this.shooter.value, helperUnitId: this.helper.value || null });
  }

  private deployment(kind: 'deploy' | 'undeploy'): void {
    this.execute({ kind, unitId: this.shooter.value, helperUnitId: this.helper.value || null });
  }

  private transfer(): void {
    this.execute({
      kind: 'transfer',
      sourceUnitId: this.ammoSource.value,
      targetUnitId: this.ammoTarget.value,
      requestedRounds: Math.max(1, Math.trunc(finite(this.transferRounds.value))),
    });
  }

  private firstAid(): void {
    this.execute({
      kind: 'first_aid',
      actorUnitId: this.aidActor.value,
      targetUnitId: this.aidTarget.value,
      zone: (this.aidZone.value || null) as 'head' | 'torso' | 'arms' | 'legs' | null,
    });
  }

  private execute(command: CombatLabScriptCommandV1): void {
    this.show(this.session.executeInteractive(command));
  }

  private cancel(
    action: 'fire' | 'reload' | 'deployment' | 'transfer' | 'first_aid',
    unitId = this.shooter.value,
  ): void {
    this.session.markInteractive();
    this.show(cancelCombatLabWeaponAction(this.session.state, unitId, action));
  }

  private show(result: CombatLabCommandResultV1): void {
    this.status.textContent = `${result.accepted ? 'Принято' : 'Отказ'}: ${result.reasonRu} [${result.reasonCode}]`;
    this.renderer.forceRender();
    this.refreshLive(true);
  }

  private setPointFromUnit(unitId: string): void {
    const unit = this.session.state.units.find((candidate) => candidate.id === unitId);
    if (!unit) return;
    this.targetX.value = (unit.position.x * this.session.state.map.metersPerCell).toFixed(2);
    this.targetY.value = (unit.position.y * this.session.state.map.metersPerCell).toFixed(2);
  }

  private updateFireModes(): void {
    const unit = this.session.state.units.find((candidate) => candidate.id === this.shooter.value);
    const modes = new Set(unit?.infantryCombatRuntime.primaryWeapon?.resolved.weapon.availableFireModes ?? []);
    for (const item of this.mode.options) {
      item.disabled = !modes.has(item.value as FireMode);
      item.title = item.disabled ? 'Режим не опубликован для выбранного оружия.' : '';
    }
    if (!modes.has(this.mode.value as FireMode)) this.mode.value = [...modes][0] ?? 'single';
    selectUnit(this.session.state, unit?.id ?? null);
  }

  private readSelection(): CombatLabUiSelectionV1 {
    return {
      shooterUnitId: this.shooter.value,
      targetUnitId: this.target.value === '__point__' ? null : this.target.value || null,
      targetPointMetres: { xMetres: finite(this.targetX.value), yMetres: finite(this.targetY.value) },
      helperUnitId: this.helper.value || null,
      firstAidActorUnitId: this.aidActor.value,
      firstAidTargetUnitId: this.aidTarget.value,
      ammoSourceUnitId: this.ammoSource.value,
      ammoTargetUnitId: this.ammoTarget.value,
    };
  }
}

function buildDiagnostics(
  session: CombatLabVisualSession,
  selection: CombatLabUiSelectionV1,
): Record<string, unknown> {
  const state = session.state;
  const snapshot = session.getSnapshot();
  const shooter = findUnit(state.units, selection.shooterUnitId);
  const target = selection.targetUnitId ? findUnit(state.units, selection.targetUnitId) : null;
  const helper = selection.helperUnitId ? findUnit(state.units, selection.helperUnitId) : null;
  const selected = shooter ?? state.units[0] ?? null;
  const combat = selected?.infantryCombatRuntime;
  const weapon = combat?.primaryWeapon;
  const projectileDiagnostics = state.infantryCombatProjectiles.diagnostics;
  const assistantValidation = shooter ? validateMachineGunAssistant(state, shooter, selection.helperUnitId) : null;
  const targetPoint = target
    ? { xMetres: target.position.x * state.map.metersPerCell, yMetres: target.position.y * state.map.metersPerCell }
    : selection.targetPointMetres;

  return {
    run: {
      scenarioId: snapshot.scenarioId,
      revision: snapshot.scenarioRevision,
      seed: snapshot.seed,
      simulatedSeconds: snapshot.simulatedSeconds,
      kind: snapshot.interactive ? 'interactive' : 'clean',
      eventDigest: snapshot.eventDigest,
      finalStateDigest: snapshot.finalStateDigest,
    },
    selection: {
      shooter: unitIdentity(shooter),
      target: target ? unitIdentity(target) : { kind: 'point', ...targetPoint },
      targetDistanceMetres: shooter ? round(distanceToPointMetres(state.map.metersPerCell, shooter, targetPoint)) : null,
      helper: unitIdentity(helper),
      helperDistanceMetres: shooter && helper ? round(distanceBetweenUnits(state.map.metersPerCell, shooter, helper)) : null,
      helperValidation: assistantValidation
        ? { valid: assistantValidation.valid, reasonCode: assistantValidation.reasonCode, reasonRu: assistantValidation.reasonRu }
        : null,
      firstAidActorUnitId: selection.firstAidActorUnitId || null,
      firstAidTargetUnitId: selection.firstAidTargetUnitId || null,
      ammoSourceUnitId: selection.ammoSourceUnitId || null,
      ammoTargetUnitId: selection.ammoTargetUnitId || null,
    },
    selectedUnit: selected
      ? {
          name: selected.labels.ru,
          unitId: selected.id,
          posture: selected.behaviorRuntime.posture,
          movement: selected.movementRuntime,
          capabilities: getEffectiveCombatCapabilities(selected),
          physicalChannels: selected.behaviorRuntime.physicalActionCoordinator.activeLeases,
        }
      : null,
    weapon: weapon
      ? {
          name: weapon.resolved.weapon.nameRu,
          definitionId: weapon.resolved.weapon.weaponDefinitionId,
          revision: weapon.resolved.weapon.revision,
          deployment: weapon.deployment,
          roundsInWeapon: weapon.roundsInWeapon,
          reserve: combat?.ammoInventory.reserves,
          recoil: weapon.recoil,
          automaticFire: weapon.automaticFire,
          assistantDeployMultiplier: weapon.resolved.weapon.assistantDeployMultiplier,
          assistantReloadMultiplier: weapon.resolved.weapon.assistantReloadMultiplier,
        }
      : null,
    fireTask: combat?.activeFireTask ?? null,
    lastFireResult: combat?.lastFireResult ?? null,
    lastShotCommit: combat?.lastShotCommit ?? null,
    reload: combat?.ammoInventory.activeReload ?? null,
    transfer: combat?.ammoInventory.activeTransfer ?? null,
    lastWeaponActionResult: combat?.ammoInventory.lastActionResult ?? null,
    firstAid: combat?.medical.activeFirstAidAction ?? null,
    firstAidCharges: combat?.medical.firstAidCharges ?? 0,
    lastFirstAidResult: combat?.medical.lastFirstAidResult ?? null,
    wounds: combat?.wounds.slots ?? [],
    blood: combat?.physiology.blood ?? null,
    fatigue: combat?.physiology.fatigue ?? null,
    suppression: combat?.suppression ?? null,
    projectiles: {
      active: state.infantryCombatProjectiles.activeProjectiles.length,
      impacts: state.infantryCombatProjectiles.impacts.slice(-5),
      nearMiss: projectileDiagnostics.emittedNearMissCount,
      nearImpact: projectileDiagnostics.emittedNearImpactCount,
      directHit: projectileDiagnostics.emittedDirectHitCount,
      overflow: projectileDiagnostics.eventOverflowCount + projectileDiagnostics.suppressionEventOverflowCount,
      resize: projectileDiagnostics.poolResizeCount,
      counters: projectileDiagnostics,
    },
    metrics: snapshot.metrics,
    lastCommandResult: snapshot.lastCommandResult,
  };
}

function unitIdentity(unit: UnitModel | null): { readonly name: string; readonly unitId: string } | null {
  return unit ? { name: unit.labels.ru, unitId: unit.id } : null;
}

function findUnit(units: readonly UnitModel[], unitId: string): UnitModel | null {
  return units.find((unit) => unit.id === unitId) ?? null;
}

function distanceBetweenUnits(metresPerCell: number, left: UnitModel, right: UnitModel): number {
  return Math.hypot(right.position.x - left.position.x, right.position.y - left.position.y) * metresPerCell;
}

function distanceToPointMetres(
  metresPerCell: number,
  unit: UnitModel,
  point: { readonly xMetres: number; readonly yMetres: number },
): number {
  return Math.hypot(
    point.xMetres - unit.position.x * metresPerCell,
    point.yMetres - unit.position.y * metresPerCell,
  );
}

function fillRoles(
  selectElement: HTMLSelectElement,
  roles: readonly CombatLabRoleV1[],
  kind: CombatLabRoleV1['selectableAs'][number],
  includeEmpty = false,
  emptyLabel = 'Не выбрано',
): void {
  selectElement.replaceChildren();
  if (includeEmpty) selectElement.append(option(kind === 'target' ? '__point__' : '', emptyLabel));
  for (const role of roles.filter((candidate) => candidate.selectableAs.includes(kind))) {
    selectElement.append(option(role.unitId, `${role.titleRu} · ${role.unitId}`));
  }
}

function panel(title: string, ...children: HTMLElement[]): HTMLElement {
  const result = node('section', 'combat-lab-panel');
  result.append(sectionTitle(title), ...children);
  return result;
}
function sectionTitle(text: string): HTMLElement { return node('h2', 'combat-lab-section-title', text); }
function field(label: string, control: HTMLElement): HTMLLabelElement {
  const result = document.createElement('label');
  result.className = 'combat-lab-field';
  result.append(node('span', '', label), control);
  return result;
}
function inlineField(label: string, control: HTMLElement): HTMLLabelElement {
  const result = field(label, control);
  result.classList.add('inline');
  return result;
}
function actionRow(...children: HTMLElement[]): HTMLElement {
  const result = node('div', 'combat-lab-row');
  result.append(...children);
  return result;
}
function button(text: string, action: () => void, className = ''): HTMLButtonElement {
  const result = document.createElement('button');
  result.type = 'button';
  result.textContent = text;
  result.className = className;
  result.addEventListener('click', action);
  return result;
}
function select(): HTMLSelectElement { return document.createElement('select'); }
function option(value: string, text: string): HTMLOptionElement {
  const result = document.createElement('option');
  result.value = value;
  result.textContent = text;
  return result;
}
function numberInput(min: number, max: number, step: number): HTMLInputElement {
  const result = document.createElement('input');
  result.type = 'number';
  result.min = String(min);
  result.max = String(max);
  result.step = String(step);
  return result;
}
function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  result.className = className;
  result.textContent = text;
  return result;
}
function orderedList(items: readonly string[]): HTMLOListElement {
  const list = document.createElement('ol');
  for (const item of items) list.append(node('li', '', item));
  return list;
}
function finite(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function validSeed(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 0xffff_ffff) return fallback;
  return parsed;
}
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
