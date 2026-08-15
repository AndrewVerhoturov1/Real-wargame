import type { UnitPosture } from '../../core/behavior/BehaviorModel';
import { getSelectedUnit, type SimulationState } from '../../core/simulation/SimulationState';
import type { CombatLabCommandResultV1 } from '../../core/testing/combat-lab';
import {
  requestCombatLabGameEditorOpen,
  type CombatLabSourceProfileLink,
} from '../game-editors/CombatLabGameEditorLinks';
import type { CombatLabVisualSession } from '../runtime/CombatLabVisualSession';
import {
  buildCombatLabLiveUnitSnapshot,
  type CombatLabLiveUnitSnapshotV1,
} from './CombatLabLiveUnitPresentation';

export interface CombatLabLiveUnitInspectorOptions {
  readonly host: HTMLElement;
  readonly state: SimulationState;
  readonly session: CombatLabVisualSession;
  readonly getRoleLabelRu: (unitId: string) => string | null;
  readonly editorEventRoot: HTMLElement;
}

const POSTURES: readonly { readonly value: UnitPosture; readonly labelRu: string }[] = Object.freeze([
  { value: 'standing', labelRu: 'Стоя' },
  { value: 'crouched', labelRu: 'Пригнувшись' },
  { value: 'prone', labelRu: 'Лёжа' },
]);

export class CombatLabLiveUnitInspector {
  private lastPresentationKey = '';
  private lastCommandResult: CombatLabCommandResultV1 | null = null;
  private lastCommandUnitId: string | null = null;
  private destroyed = false;

  private constructor(private readonly options: CombatLabLiveUnitInspectorOptions) {
    this.options.host.classList.add('polygon-live-unit-host');
    this.refresh(true);
  }

  static create(options: CombatLabLiveUnitInspectorOptions): CombatLabLiveUnitInspector {
    return new CombatLabLiveUnitInspector(options);
  }

  refresh(force = false): void {
    if (this.destroyed) return;
    const selectedUnit = getSelectedUnit(this.options.state);
    if (!selectedUnit) {
      const emptyKey = `empty:${this.options.state.selectedUnitId ?? 'none'}`;
      if (!force && this.lastPresentationKey === emptyKey) return;
      this.lastPresentationKey = emptyKey;
      this.lastCommandResult = null;
      this.lastCommandUnitId = null;
      this.renderEmpty();
      return;
    }

    const snapshot = buildCombatLabLiveUnitSnapshot(selectedUnit, {
      roleLabelRu: this.options.getRoleLabelRu(selectedUnit.id),
    });
    const commandKey = this.lastCommandUnitId === snapshot.unitId && this.lastCommandResult
      ? `${this.lastCommandResult.accepted}:${this.lastCommandResult.reasonCode}:${this.lastCommandResult.reasonRu}`
      : '';
    const presentationKey = `${snapshot.presentationKey}|${commandKey}`;
    if (!force && presentationKey === this.lastPresentationKey) return;
    this.lastPresentationKey = presentationKey;
    this.render(snapshot);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.options.host.classList.remove('polygon-live-unit-host');
    this.options.host.replaceChildren();
  }

  private renderEmpty(): void {
    const root = node('section', 'polygon-live-unit');
    root.append(
      node('div', 'polygon-live-unit__empty-title', 'Выберите бойца на карте'),
      node('p', 'polygon-live-unit__empty-copy', 'Здесь появится состояние настоящего UnitModel. Локальная копия бойца не создаётся.'),
    );
    this.options.host.replaceChildren(root);
  }

  private render(snapshot: CombatLabLiveUnitSnapshotV1): void {
    const root = node('section', 'polygon-live-unit');
    root.dataset.unitId = snapshot.unitId;

    const header = node('header', 'polygon-live-unit__header');
    const identity = node('div', 'polygon-live-unit__identity');
    identity.append(
      node('strong', 'polygon-live-unit__name', snapshot.labelRu),
      node('span', 'polygon-live-unit__meta', [snapshot.roleLabelRu, snapshot.typeLabelRu, snapshot.sideLabelRu]
        .filter(Boolean)
        .join(' · ')),
      node('span', 'polygon-live-unit__id', snapshot.unitId),
    );
    header.append(identity, badge(snapshot.capabilityLabelRu, `polygon-live-unit__capability ${snapshot.alive && snapshot.conscious ? 'is-ready' : 'is-alert'}`));

    const stats = node('div', 'polygon-live-unit__stats');
    stats.append(
      stat('Здоровье', percent(snapshot.health)),
      stat('Мораль', percent(snapshot.morale)),
      stat('Подавление', percent(snapshot.suppression)),
      stat('Усталость', percent(snapshot.fatigue)),
    );

    const postureSection = section('Поза');
    const postureRow = node('div', 'polygon-live-unit__postures');
    for (const posture of POSTURES) {
      const control = button(posture.labelRu, 'polygon-live-unit__posture');
      const active = snapshot.posture === posture.value;
      control.classList.toggle('is-active', active);
      control.setAttribute('aria-pressed', String(active));
      control.disabled = active || !snapshot.alive || !snapshot.conscious;
      control.addEventListener('click', () => this.requestPosture(snapshot.unitId, posture.value));
      postureRow.append(control);
    }
    postureSection.append(postureRow, node('div', 'polygon-live-unit__inline-status', `Сейчас: ${snapshot.postureLabelRu}`));
    const commandResult = this.renderCommandResult(snapshot.unitId);
    if (commandResult) postureSection.append(commandResult);

    const orderSection = section('Приказ игрока');
    orderSection.append(node('div', 'polygon-live-unit__primary-text', snapshot.playerOrderLabelRu));

    const actionSection = section('Действие сейчас');
    actionSection.append(node('div', 'polygon-live-unit__primary-text', snapshot.currentAction.labelRu));
    if (snapshot.currentAction.detailRu) {
      actionSection.append(node('div', 'polygon-live-unit__secondary-text', snapshot.currentAction.detailRu));
    }

    const weaponSection = section('Вооружение');
    if (snapshot.weapon) {
      weaponSection.append(
        node('div', 'polygon-live-unit__primary-text', snapshot.weapon.weaponLabelRu),
        keyValue('Боекомплект', `${snapshot.weapon.roundsLoaded} в оружии · ${snapshot.weapon.roundsReserve} в запасе`),
        keyValue('Готовность', snapshot.weaponReadiness.labelRu),
        node('div', 'polygon-live-unit__secondary-text', snapshot.weaponReadiness.reasonRu),
      );
    } else {
      weaponSection.append(
        node('div', 'polygon-live-unit__primary-text', snapshot.weaponReadiness.labelRu),
        node('div', 'polygon-live-unit__secondary-text', snapshot.weaponReadiness.reasonRu),
      );
    }

    const woundsSection = section('Ранения');
    woundsSection.append(keyValue('Потеря крови', formatBloodLoss(snapshot.bloodLoss)));
    if (snapshot.wounds.length === 0) {
      woundsSection.append(node('div', 'polygon-live-unit__secondary-text', 'Зафиксированных ранений нет.'));
    } else {
      const woundList = node('div', 'polygon-live-unit__wounds');
      for (const wound of snapshot.wounds) {
        woundList.append(node(
          'div',
          'polygon-live-unit__wound',
          `${wound.zoneLabelRu}: ${wound.severityLabelRu.toLowerCase()} · ${wound.bleedingLabelRu}`,
        ));
      }
      woundsSection.append(woundList);
    }

    const secondary = document.createElement('details');
    secondary.className = 'polygon-live-unit__secondary';
    secondary.append(
      node('summary', '', 'Вторичные сведения'),
      keyValue('Стресс', percent(snapshot.stress)),
      keyValue('Архетип', snapshot.archetypeId ?? 'Не указан'),
      keyValue('Средства первой помощи', String(snapshot.firstAidCharges)),
      keyValue('Сознание', snapshot.conscious ? 'В сознании' : 'Без сознания'),
    );

    const profiles = section('Связанные профили');
    if (snapshot.profileLinks.length === 0) {
      profiles.append(node('div', 'polygon-live-unit__secondary-text', 'Связанные authoritative-профили не указаны.'));
    } else {
      const profileList = node('div', 'polygon-live-unit__profile-list');
      for (const link of snapshot.profileLinks) profileList.append(this.profileLink(snapshot, link));
      profiles.append(profileList);
    }

    root.append(header, stats, postureSection, orderSection, actionSection, weaponSection, woundsSection, secondary, profiles);
    this.options.host.replaceChildren(root);
  }

  private requestPosture(unitId: string, targetPosture: UnitPosture): void {
    const selectedUnitId = this.options.state.selectedUnitId;
    if (!selectedUnitId || selectedUnitId !== unitId || !getSelectedUnit(this.options.state)) {
      this.lastCommandResult = {
        accepted: false,
        reasonCode: 'polygon_live_unit_selection_changed',
        reasonRu: 'Выбранный боец изменился. Команда не отправлена.',
        ownerToken: null,
      };
      this.lastCommandUnitId = unitId;
      this.refresh(true);
      return;
    }

    const result = this.options.session.executeInteractive({
      kind: 'posture',
      unitId: selectedUnitId,
      targetPosture,
    });
    this.lastCommandResult = result;
    this.lastCommandUnitId = selectedUnitId;
    this.refresh(true);
  }

  private renderCommandResult(unitId: string): HTMLElement | null {
    const result = this.lastCommandUnitId === unitId ? this.lastCommandResult : null;
    if (!result) return null;
    const element = node(
      'div',
      `polygon-live-unit__command-result ${result.accepted ? 'is-accepted' : 'is-rejected'}`,
      result.reasonRu,
    );
    element.dataset.reasonCode = result.reasonCode;
    return element;
  }

  private profileLink(snapshot: CombatLabLiveUnitSnapshotV1, link: CombatLabSourceProfileLink): HTMLButtonElement {
    const control = button(
      link.profileId ? `${link.labelRu}: ${link.profileId}` : `${link.labelRu}: источник не определён`,
      'polygon-live-unit__entity-link',
    );
    control.disabled = !link.profileId;
    if (link.profileId) {
      control.addEventListener('click', () => requestCombatLabGameEditorOpen(
        this.options.editorEventRoot,
        {
          editorId: link.editorId,
          profileId: link.profileId!,
          selectedUnitId: snapshot.unitId,
          returnTo: 'combat-lab:right-panel:unit',
        },
        control,
      ));
    }
    return control;
  }
}

function section(titleRu: string): HTMLElement {
  const element = node('section', 'polygon-live-unit__section');
  element.append(node('h3', 'polygon-live-unit__section-title', titleRu));
  return element;
}

function stat(labelRu: string, valueRu: string): HTMLElement {
  const element = node('div', 'polygon-live-unit__stat');
  element.append(node('span', '', labelRu), node('strong', '', valueRu));
  return element;
}

function keyValue(labelRu: string, valueRu: string): HTMLElement {
  const element = node('div', 'polygon-live-unit__key-value');
  element.append(node('span', '', labelRu), node('strong', '', valueRu));
  return element;
}

function badge(text: string, className: string): HTMLElement {
  return node('span', className, text);
}

function button(label: string, className = ''): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.className = className;
  return element;
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function percent(value: number): string {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function formatBloodLoss(value: number): string {
  const normalized = value <= 1 ? value * 100 : value;
  return percent(normalized);
}
