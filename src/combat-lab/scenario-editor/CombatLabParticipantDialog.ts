import { createDefaultCombatCatalogRegistry } from '../../core/infantry-combat/catalogs/CombatCatalogRegistry';
import type { DefinitionRef, LoadoutTemplateV1 } from '../../core/infantry-combat/catalogs/CombatCatalogTypes';
import type { UnitSideInput, UnitType } from '../../core/units/UnitModel';
import {
  createCombatLabParticipant,
  readCombatLabParticipantInitialDraft,
  updateCombatLabParticipantInitialState,
  type CombatLabExperimentV1,
  type CombatLabInitialHealthV1,
  type CombatLabInitialWoundV1,
} from '../../core/testing/combat-lab/experiment';
import type { CombatLabExperimentDraft } from './CombatLabExperimentDraft';

export interface CombatLabParticipantDialogOptions {
  readonly draft: CombatLabExperimentDraft;
  readonly roleId: string | null;
  readonly onSaved: (experiment: CombatLabExperimentV1, roleId: string) => void;
  readonly onError: (messageRu: string) => void;
}

interface PublishedLoadoutOption {
  readonly ref: DefinitionRef;
  readonly loadout: LoadoutTemplateV1;
  readonly titleRu: string;
  readonly capacityRounds: number;
  readonly ammoIds: readonly string[];
}

export function combatLabParticipantAllowsUnarmedSelection(roleId: string | null): boolean {
  return roleId === null;
}

export class CombatLabParticipantDialog {
  static open(options: CombatLabParticipantDialogOptions): CombatLabParticipantDialog {
    return new CombatLabParticipantDialog(options);
  }

  readonly root = document.createElement('dialog');
  private readonly status = document.createElement('div');
  private readonly reserveHost = document.createElement('div');
  private readonly woundHost = document.createElement('div');
  private readonly loadouts = publishedLoadouts();
  private readonly reserveInputs = new Map<string, HTMLInputElement>();
  private readonly woundInputs = new Map<CombatLabInitialWoundV1['zone'], { severity: HTMLSelectElement; hits: HTMLInputElement }>();
  private closed = false;

  private readonly name = input('text');
  private readonly roleId = input('text');
  private readonly unitId = input('text');
  private readonly side = select([['blue', 'Синие'], ['red', 'Красные']]);
  private readonly unitType = select([
    ['infantry_squad', 'Пехотинец'],
    ['scout_team', 'Разведчик'],
    ['support_team', 'Расчёт поддержки'],
  ]);
  private readonly x = numberInput(0, 0, 1_000_000, 0.1);
  private readonly y = numberInput(0, 0, 1_000_000, 0.1);
  private readonly facing = numberInput(0, -3600, 3600, 1);
  private readonly posture = select([['standing', 'Стоя'], ['crouched', 'Пригнувшись'], ['prone', 'Лёжа']]);
  private readonly loadout = document.createElement('select');
  private readonly loadedRounds = numberInput(0, 0, 100_000, 1);
  private readonly firstAid = numberInput(0, 0, 100_000, 1);
  private readonly healthMode = select([
    ['preserve_current', 'Использовать текущее состояние'],
    ['healthy', 'Здоров'],
    ['wound_set', 'Заданный набор ранений'],
  ]);
  private readonly bloodLoss = numberInput(0, 0, 1, 0.01);

  private constructor(private readonly options: CombatLabParticipantDialogOptions) {
    this.root.className = 'combat-lab-participant-dialog';
    this.status.className = 'combat-lab-editor-status';
    const creating = combatLabParticipantAllowsUnarmedSelection(options.roleId);
    if (creating) this.loadout.append(option('', 'Без комплекта'));
    for (const item of this.loadouts) this.loadout.append(option(refKey(item.ref), item.titleRu));
    this.loadout.addEventListener('change', () => this.renderLoadoutFields());
    this.healthMode.addEventListener('change', () => this.renderHealthFields());

    this.root.append(
      title(creating ? 'Создать бойца' : 'Изменить бойца'),
      section('Основное',
        field('Имя бойца', this.name),
        field('Идентификатор участника', this.roleId),
        field('Идентификатор бойца', this.unitId),
        field('Сторона', this.side),
        field('Тип бойца', this.unitType),
      ),
      section('Положение',
        field('X', this.x),
        field('Y', this.y),
        field('Направление, °', this.facing),
        field('Поза', this.posture),
      ),
      section('Вооружение и патроны',
        field('Опубликованный комплект', this.loadout),
        field('Патроны в оружии', this.loadedRounds),
        this.reserveHost,
      ),
      section('Здоровье и помощь',
        field('Средства первой помощи', this.firstAid),
        field('Начальное здоровье', this.healthMode),
        field('Потеря крови, 0..1', this.bloodLoss),
        this.woundHost,
      ),
      this.status,
      actions(
        button('Сохранить', () => this.save(), 'primary'),
        button('Отмена', () => this.root.close()),
      ),
    );
    this.roleId.disabled = !creating;
    this.unitId.disabled = !creating;
    this.fillInitialValues();
    this.root.addEventListener('close', () => this.destroy(), { once: true });
    document.body.append(this.root);
    this.root.showModal();
  }

  private fillInitialValues(): void {
    const experiment = this.options.draft.getExperiment();
    const role = this.options.roleId
      ? experiment.roles.find((candidate) => candidate.roleId === this.options.roleId) ?? null
      : null;
    if (!role) {
      const index = nextIndex(experiment.roles.map((candidate) => candidate.roleId), 'participant');
      this.name.value = `Боец №${experiment.roles.length + 1}`;
      this.roleId.value = `participant-${index}`;
      this.unitId.value = `combat-lab-participant-${nextIndex(sceneUnitIds(experiment), 'combat-lab-participant')}`;
      this.side.value = 'blue';
      this.unitType.value = 'infantry_squad';
      this.x.value = String(Math.max(0, Math.floor(experiment.sceneSnapshot.map.width / 2)));
      this.y.value = String(Math.max(0, Math.floor(experiment.sceneSnapshot.map.height / 2)));
      this.posture.value = 'standing';
      this.healthMode.value = 'healthy';
      this.loadout.value = this.loadouts[0] ? refKey(this.loadouts[0].ref) : '';
      this.renderLoadoutFields();
      this.renderHealthFields();
      return;
    }

    try {
      const initial = readCombatLabParticipantInitialDraft(experiment, role.roleId);
      this.name.value = role.titleRu;
      this.roleId.value = role.roleId;
      this.unitId.value = role.unitId;
      this.side.value = initial.side;
      this.unitType.value = initial.unitType;
      this.x.value = trimNumber(initial.x);
      this.y.value = trimNumber(initial.y);
      this.facing.value = trimNumber(initial.facingDegrees);
      this.posture.value = initial.posture;
      if (initial.loadoutRef) {
        this.loadout.value = refKey(initial.loadoutRef);
      } else {
        const currentUnarmed = option('', 'Без комплекта (текущее состояние)');
        currentUnarmed.disabled = true;
        this.loadout.prepend(currentUnarmed);
        this.loadout.value = '';
      }
      this.renderLoadoutFields(initial.reserves);
      this.loadedRounds.value = String(initial.loadedRounds);
      this.firstAid.value = String(initial.firstAidCharges);
      this.healthMode.value = 'preserve_current';
      this.bloodLoss.value = trimNumber(initial.bloodLoss);
      this.renderHealthFields(initial.wounds);
    } catch (error) {
      this.fail(error, 'Не удалось прочитать начальное состояние бойца.');
    }
  }

  private renderLoadoutFields(existing: readonly { ammoDefinitionId: string; rounds: number; maximumRounds: number }[] = []): void {
    this.reserveInputs.clear();
    const selected = this.selectedLoadout();
    const rows = document.createElement('div');
    rows.className = 'combat-lab-participant-dialog__reserves';
    if (!selected) {
      this.loadedRounds.value = '0';
      this.loadedRounds.max = '0';
      this.firstAid.max = '0';
      this.reserveHost.replaceChildren(note('Комплект не выбран. Оружие и запас патронов не создаются.'));
      return;
    }
    this.loadedRounds.max = String(selected.capacityRounds);
    if (Number(this.loadedRounds.value) > selected.capacityRounds || !this.loadedRounds.value) this.loadedRounds.value = String(selected.loadout.primary.loadedRounds);
    this.firstAid.max = String(selected.loadout.firstAidCharges);
    if (Number(this.firstAid.value) > selected.loadout.firstAidCharges || !this.firstAid.value) this.firstAid.value = String(selected.loadout.firstAidCharges);
    for (const ammoDefinitionId of selected.ammoIds) {
      const maximum = selected.loadout.maximumReserveRoundsByAmmoDefinitionId[ammoDefinitionId] ?? 0;
      const current = existing.find((entry) => entry.ammoDefinitionId === ammoDefinitionId)?.rounds
        ?? selected.loadout.reserveRoundsByAmmoDefinitionId[ammoDefinitionId]
        ?? 0;
      const control = numberInput(current, 0, maximum, 1);
      this.reserveInputs.set(ammoDefinitionId, control);
      rows.append(field(`Запас ${ammoDefinitionId}`, control));
    }
    this.reserveHost.replaceChildren(rows);
  }

  private renderHealthFields(existing: readonly CombatLabInitialWoundV1[] = []): void {
    const enabled = this.healthMode.value === 'wound_set';
    this.bloodLoss.disabled = !enabled;
    this.woundInputs.clear();
    const table = document.createElement('div');
    table.className = 'combat-lab-participant-dialog__wounds';
    for (const zone of ['head', 'torso', 'arms', 'legs'] as const) {
      const found = existing.find((candidate) => candidate.zone === zone) ?? null;
      const severity = select([['light', 'Лёгкое'], ['severe', 'Тяжёлое'], ['critical', 'Критическое']]);
      severity.value = found?.severity ?? 'light';
      severity.disabled = !enabled;
      const hits = numberInput(found?.hitCount ?? 0, 0, 100, 1);
      hits.disabled = !enabled;
      this.woundInputs.set(zone, { severity, hits });
      table.append(field(zoneLabel(zone), severity), field('Попаданий', hits));
    }
    this.woundHost.replaceChildren(enabled ? table : note(this.healthMode.value === 'healthy'
      ? 'Ранения и потеря крови будут очищены штатным путём.'
      : 'Существующие ранения и кровь останутся без изменений.'));
  }

  private save(): void {
    try {
      const current = this.options.draft.getExperiment();
      const titleRu = requiredText(this.name.value, 'Укажите имя бойца.');
      const loadoutRef = this.selectedLoadout()?.ref;
      const reserveRoundsByAmmoDefinitionId = Object.fromEntries(
        [...this.reserveInputs.entries()].map(([ammoId, control]) => [ammoId, integer(control.value, `Запас ${ammoId}`)]),
      );
      const initialHealth = this.readHealth();
      let next: CombatLabExperimentV1;
      let savedRoleId: string;
      if (this.options.roleId === null) {
        savedRoleId = requiredId(this.roleId.value, 'Идентификатор участника');
        next = createCombatLabParticipant(current, {
          roleId: savedRoleId,
          unitId: requiredId(this.unitId.value, 'Идентификатор бойца'),
          titleRu,
          side: this.side.value as UnitSideInput,
          unitType: this.unitType.value as UnitType,
          x: finite(this.x.value, 'Координата X'),
          y: finite(this.y.value, 'Координата Y'),
          facingDegrees: finite(this.facing.value, 'Направление'),
          posture: this.posture.value as 'standing' | 'crouched' | 'prone',
          ...(loadoutRef ? { loadoutRef, loadedRounds: integer(this.loadedRounds.value, 'Патроны в оружии'), reserveRoundsByAmmoDefinitionId, firstAidCharges: integer(this.firstAid.value, 'Средства первой помощи') } : {}),
          initialHealth,
        });
      } else {
        savedRoleId = this.options.roleId;
        next = updateCombatLabParticipantInitialState(current, savedRoleId, {
          titleRu,
          side: this.side.value as UnitSideInput,
          unitType: this.unitType.value as UnitType,
          x: finite(this.x.value, 'Координата X'),
          y: finite(this.y.value, 'Координата Y'),
          facingDegrees: finite(this.facing.value, 'Направление'),
          posture: this.posture.value as 'standing' | 'crouched' | 'prone',
          ...(loadoutRef ? { loadoutRef, loadedRounds: integer(this.loadedRounds.value, 'Патроны в оружии'), reserveRoundsByAmmoDefinitionId, firstAidCharges: integer(this.firstAid.value, 'Средства первой помощи') } : {}),
          initialHealth,
        });
      }
      this.options.draft.replaceExperiment(next);
      this.options.onSaved(next, savedRoleId);
      this.root.close();
    } catch (error) {
      this.fail(error, 'Не удалось сохранить бойца.');
    }
  }

  private readHealth(): CombatLabInitialHealthV1 {
    if (this.healthMode.value === 'healthy') return { mode: 'healthy' };
    if (this.healthMode.value === 'preserve_current') return { mode: 'preserve_current' };
    const wounds: CombatLabInitialWoundV1[] = [];
    for (const [zone, controls] of this.woundInputs) {
      const hitCount = integer(controls.hits.value, `Число попаданий: ${zoneLabel(zone)}`);
      if (hitCount > 0) wounds.push({ zone, severity: controls.severity.value as CombatLabInitialWoundV1['severity'], hitCount });
    }
    return { mode: 'wound_set', wounds, bloodLoss: finite(this.bloodLoss.value, 'Потеря крови') };
  }

  private selectedLoadout(): PublishedLoadoutOption | null {
    return this.loadouts.find((item) => refKey(item.ref) === this.loadout.value) ?? null;
  }

  private fail(error: unknown, fallback: string): void {
    const text = error instanceof Error && error.message ? error.message : fallback;
    this.status.textContent = text;
    this.status.classList.add('is-error');
    this.options.onError(text);
  }

  private destroy(): void {
    if (this.closed) return;
    this.closed = true;
    this.root.remove();
  }
}

function publishedLoadouts(): readonly PublishedLoadoutOption[] {
  const registry = createDefaultCombatCatalogRegistry();
  return Object.freeze(registry.listLoadoutTemplates()
    .filter((loadout) => loadout.status === 'published')
    .flatMap((loadout) => {
      try {
        const weapon = registry.resolveWeapon(loadout.primary.definition);
        const ammo = registry.resolveAmmo(weapon.ammo);
        if (weapon.status !== 'published' || ammo.status !== 'published') return [];
        return [{
          ref: Object.freeze({ definitionId: loadout.loadoutTemplateId, revision: loadout.revision }),
          loadout,
          titleRu: `${loadout.nameRu} · ${weapon.nameRu}`,
          capacityRounds: weapon.capacityRounds,
          ammoIds: Object.freeze([...new Set([...Object.keys(loadout.reserveRoundsByAmmoDefinitionId), ...Object.keys(loadout.maximumReserveRoundsByAmmoDefinitionId)])].sort()),
        }];
      } catch { return []; }
    })
    .sort((left, right) => left.titleRu.localeCompare(right.titleRu, 'ru')));
}

function section(titleText: string, ...children: HTMLElement[]): HTMLElement { const result = document.createElement('fieldset'); result.className = 'combat-lab-participant-dialog__section'; const legend = document.createElement('legend'); legend.textContent = titleText; result.append(legend, ...children); return result; }
function title(value: string): HTMLElement { const result = document.createElement('h2'); result.textContent = value; return result; }
function field(label: string, control: HTMLElement): HTMLLabelElement { const result = document.createElement('label'); result.className = 'combat-lab-field'; const span = document.createElement('span'); span.textContent = label; result.append(span, control); return result; }
function actions(...children: HTMLElement[]): HTMLElement { const result = document.createElement('div'); result.className = 'combat-lab-row'; result.append(...children); return result; }
function note(value: string): HTMLElement { const result = document.createElement('div'); result.className = 'combat-lab-editor-note'; result.textContent = value; return result; }
function button(label: string, onClick: () => void, className = ''): HTMLButtonElement { const result = document.createElement('button'); result.type = 'button'; result.textContent = label; result.className = className; result.addEventListener('click', onClick); return result; }
function input(type: string): HTMLInputElement { const result = document.createElement('input'); result.type = type; return result; }
function numberInput(value: number, minimum: number, maximum: number, step: number): HTMLInputElement { const result = input('number'); result.value = trimNumber(value); result.min = String(minimum); result.max = String(maximum); result.step = String(step); return result; }
function select(items: readonly (readonly [string, string])[]): HTMLSelectElement { const result = document.createElement('select'); for (const [value, label] of items) result.append(option(value, label)); return result; }
function option(value: string, label: string): HTMLOptionElement { const result = document.createElement('option'); result.value = value; result.textContent = label; return result; }
function refKey(ref: DefinitionRef): string { return `${ref.definitionId}@${ref.revision}`; }
function trimNumber(value: number): string { return String(Number(value.toFixed(6))); }
function finite(value: string, label: string): number { const result = Number(value); if (!Number.isFinite(result)) throw new Error(`${label}: требуется конечное число.`); return result; }
function integer(value: string, label: string): number { const result = finite(value, label); if (!Number.isInteger(result) || result < 0) throw new Error(`${label}: требуется целое неотрицательное число.`); return result; }
function requiredText(value: string, messageRu: string): string { const result = value.trim(); if (!result) throw new Error(messageRu); return result; }
function requiredId(value: string, label: string): string { const result = value.trim(); if (!/^[a-z0-9][a-z0-9:_-]*$/i.test(result)) throw new Error(`${label}: допустимы латинские буквы, цифры, двоеточие, дефис и подчёркивание.`); return result; }
function sceneUnitIds(experiment: CombatLabExperimentV1): string[] { return experiment.sceneSnapshot.units.flatMap((unit) => isRecord(unit) && typeof unit.id === 'string' ? [unit.id] : []); }
function nextIndex(ids: readonly string[], prefix: string): number { const used = new Set(ids); for (let index = 1; index < 1_000_000; index += 1) if (!used.has(`${prefix}-${index}`)) return index; throw new Error('Не удалось создать свободный идентификатор.'); }
function zoneLabel(zone: CombatLabInitialWoundV1['zone']): string { return zone === 'head' ? 'Голова' : zone === 'torso' ? 'Корпус' : zone === 'arms' ? 'Руки' : 'Ноги'; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
