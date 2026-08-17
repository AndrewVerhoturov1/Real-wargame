import type { UnitPosture } from '../../core/behavior/BehaviorModel';
import { getSelectedUnit, type SimulationState } from '../../core/simulation/SimulationState';
import type { CombatLabCommandResultV1 } from '../../core/testing/combat-lab';
import {
  requestCombatLabGameEditorOpen,
  type CombatLabSourceProfileLink,
} from '../game-editors/CombatLabGameEditorLinks';
import type { CombatLabVisualSession } from '../runtime/CombatLabVisualSession';
import type { CombatLabRightPanelSeamV1 } from './CombatLabRightPanelSeam';
import {
  buildCombatLabLiveUnitSnapshot,
  type CombatLabLiveUnitSnapshotV1,
} from './CombatLabLiveUnitPresentation';

export interface CombatLabLiveUnitInspectorOptions {
  readonly host: HTMLElement;
  readonly state: SimulationState;
  readonly session: CombatLabVisualSession;
  readonly rightPanel: Pick<CombatLabRightPanelSeamV1, 'isTabActive' | 'setHeader'>;
  readonly getRoleLabelRu: (unitId: string) => string | null;
  readonly editorEventRoot: HTMLElement;
}

const POSTURES: readonly {
  readonly value: UnitPosture;
  readonly labelRu: string;
  readonly icon: string;
}[] = Object.freeze([
  { value: 'standing', labelRu: 'Стоя', icon: '●' },
  { value: 'crouched', labelRu: 'Пригнув.', icon: '▲' },
  { value: 'prone', labelRu: 'Лёжа', icon: '▬' },
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
      if (this.options.rightPanel.isTabActive('unit')) {
        this.options.rightPanel.setHeader({ kickerRu: 'ВЫБРАННЫЙ ОБЪЕКТ', titleRu: 'Юнит не выбран' });
      }
      const emptyKey = `empty:${this.options.state.selectedUnitId ?? 'none'}`;
      if (!force && this.lastPresentationKey === emptyKey) return;
      this.lastPresentationKey = emptyKey;
      this.lastCommandResult = null;
      this.lastCommandUnitId = null;
      this.renderEmpty();
      return;
    }

    if (this.options.rightPanel.isTabActive('unit')) {
      this.options.rightPanel.setHeader({ kickerRu: 'ВЫБРАННЫЙ ОБЪЕКТ', titleRu: selectedUnit.labels.ru });
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
    const empty = node('div', 'polygon-live-unit-empty inspector-empty');
    const body = node('div');
    body.append(
      node('div', 'empty-state__icon', '◎'),
      node('strong', '', 'Выберите юнита на карте'),
      node('p', '', 'Здесь появится информация о его состоянии. Характеристики в этой панели не изменяются.'),
    );
    empty.append(body);
    this.options.host.replaceChildren(empty);
  }

  private render(snapshot: CombatLabLiveUnitSnapshotV1): void {
    const fragment = document.createDocumentFragment();
    fragment.append(this.renderIdentity(snapshot));

    const root = node('div', 'polygon-live-unit unit-tab');
    root.dataset.unitId = snapshot.unitId;

    const top = node('div', 'unit-compact-top');
    const statusClass = snapshot.alive && snapshot.conscious
      ? snapshot.suppression >= 35 ? 'is-warn' : ''
      : 'is-danger';
    top.append(
      node('span', `unit-tab__status ${statusClass}`.trim(), snapshot.capabilityLabelRu),
      node('span', 'unit-compact-meta', [snapshot.roleLabelRu, snapshot.typeLabelRu].filter(Boolean).join(' · ')),
    );

    const stats = node('div', 'unit-compact-stats');
    stats.append(
      compactStat('Здор.', snapshot.health),
      compactStat('Дух', snapshot.morale),
      compactStat('Подавл.', snapshot.suppression, snapshot.suppression >= 35),
      compactStat('Устал.', snapshot.fatigue, snapshot.fatigue >= 50),
    );

    const postureRow = compactRow('Поза');
    const postureGrid = node('div', 'unit-pose-grid');
    postureGrid.setAttribute('role', 'group');
    postureGrid.setAttribute('aria-label', 'Поза бойца');
    for (const posture of POSTURES) {
      const control = button('', 'unit-pose-button');
      const active = snapshot.posture === posture.value;
      control.classList.toggle('is-active', active);
      control.setAttribute('aria-pressed', String(active));
      control.disabled = !snapshot.alive || !snapshot.conscious;
      control.append(
        node('span', 'unit-pose-button__icon', posture.icon),
        node('span', '', posture.labelRu),
      );
      control.addEventListener('click', () => {
        if (!active) this.requestPosture(snapshot.unitId, posture.value);
      });
      postureGrid.append(control);
    }
    postureRow.append(postureGrid);

    const commandResult = this.renderCommandResult(snapshot.unitId);

    const order = node('div', 'unit-task-block unit-command-block');
    order.append(
      taskHead('Приказ игрока', snapshot.playerOrderStateRu),
      node('strong', 'unit-task-main', snapshot.playerOrderLabelRu),
      node('span', 'unit-task-detail', snapshot.playerOrderDetailRu),
    );

    const action = node('div', 'unit-task-block unit-action-block');
    action.append(
      taskHead('Действие сейчас', snapshot.currentAction.labelRu),
      node('strong', 'unit-task-main', snapshot.currentAction.labelRu),
      node('span', 'unit-task-detail', snapshot.currentAction.detailRu ?? 'Фактическое состояние читается из runtime.'),
    );

    const weaponRow = compactRow('Оружие');
    const weaponValue = node('div', 'unit-compact-value');
    if (snapshot.weapon) {
      weaponValue.append(
        node('strong', '', snapshot.weapon.weaponLabelRu),
        node('span', 'unit-compact-ammo', `${snapshot.weapon.roundsLoaded}/${snapshot.weapon.magazineCapacity} +${snapshot.weapon.roundsReserve}`),
        node('em', '', snapshot.weaponReadiness.labelRu),
      );
      weaponValue.title = snapshot.weaponReadiness.reasonRu;
    } else {
      weaponValue.append(
        node('strong', '', snapshot.weaponReadiness.labelRu),
        node('em', '', snapshot.weaponReadiness.labelRu),
      );
      weaponValue.title = snapshot.weaponReadiness.reasonRu;
    }
    weaponRow.append(weaponValue);

    const bodyRow = compactRow('Тело');
    const bodyValue = node('div', 'unit-compact-value');
    bodyValue.append(
      node('strong', '', snapshot.woundSummaryRu),
      node('span', '', `· потеря крови ${formatBloodLoss(snapshot.bloodLoss)}`),
    );
    bodyRow.append(bodyValue);

    const secondary = document.createElement('details');
    secondary.className = 'polygon-live-unit__secondary';
    secondary.append(node('summary', '', 'Дополнительно'));
    const dataList = document.createElement('dl');
    dataList.className = 'data-list';
    dataList.append(
      dataRow('ID', snapshot.unitId),
      dataRow('Сторона', snapshot.sideLabelRu),
      dataRow('Направление', `${Math.round(snapshot.facingDegrees)}°`),
      dataRow('Внимание', snapshot.attentionProfileId ?? '—'),
      dataRow('Движение', snapshot.movementProfileId ?? '—'),
      dataRow('Стресс', percent(snapshot.stress)),
      dataRow('Первая помощь', String(snapshot.firstAidCharges)),
    );
    if (snapshot.wounds.length > 0) {
      for (const wound of snapshot.wounds) {
        dataList.append(dataRow(
          wound.zoneLabelRu,
          `${wound.severityLabelRu} · ${wound.bleedingLabelRu}`,
        ));
      }
    }
    secondary.append(dataList);
    secondary.append(this.renderProfileLinks(snapshot));

    root.append(top, stats, postureRow);
    if (commandResult) root.append(commandResult);
    root.append(order, action, weaponRow, bodyRow, secondary);
    fragment.append(root);
    this.options.host.replaceChildren(fragment);
  }

  private renderIdentity(snapshot: CombatLabLiveUnitSnapshotV1): HTMLElement {
    const head = node('div', 'inspector-unit-head');
    const avatar = node('div', 'inspector-unit-avatar', avatarText(snapshot.labelRu));
    const text = node('div');
    text.append(
      node('div', 'inspector-unit-name', snapshot.labelRu),
      node('div', 'inspector-unit-meta', `${snapshot.typeLabelRu} · ${snapshot.sideLabelRu}`),
    );
    head.append(avatar, text);
    return head;
  }

  private requestPosture(unitId: string, targetPosture: UnitPosture): void {
    const selectedUnitId = this.options.state.selectedUnitId;
    if (!selectedUnitId || selectedUnitId !== unitId || !getSelectedUnit(this.options.state)) {
      this.lastCommandResult = Object.freeze({
        accepted: false,
        reasonCode: 'polygon_live_unit_selection_changed',
        reasonRu: 'Выбранный боец изменился. Команда не отправлена.',
        ownerToken: null,
      });
      this.lastCommandUnitId = unitId;
      this.refresh(true);
      return;
    }

    this.lastCommandResult = this.options.session.executeInteractive({
      kind: 'posture',
      unitId: selectedUnitId,
      targetPosture,
    });
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

  private renderProfileLinks(snapshot: CombatLabLiveUnitSnapshotV1): HTMLElement {
    const section = node('div', 'polygon-live-unit__profiles');
    section.append(node('div', 'polygon-live-unit__profiles-title', 'Связанные профили'));
    if (snapshot.profileLinks.length === 0) {
      section.append(node('div', 'polygon-live-unit__profiles-empty', 'Authoritative-профили не указаны.'));
      return section;
    }
    for (const link of snapshot.profileLinks) section.append(this.profileLink(snapshot, link));
    return section;
  }

  private profileLink(
    snapshot: CombatLabLiveUnitSnapshotV1,
    link: CombatLabSourceProfileLink,
  ): HTMLButtonElement {
    const control = button(
      link.profileId ? `${link.labelRu}: ${link.profileId}` : `${link.labelRu}: источник не определён`,
      'polygon-live-unit__profile-link',
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

function compactStat(labelRu: string, value: number, alert = false): HTMLElement {
  const element = node('div', `unit-compact-stat${alert ? ' is-alert' : ''}`);
  element.append(node('span', '', labelRu), node('strong', '', String(Math.round(value))));
  return element;
}

function compactRow(labelRu: string): HTMLElement {
  const element = node('div', 'unit-compact-row');
  element.append(node('label', '', labelRu));
  return element;
}

function taskHead(labelRu: string, stateRu: string): HTMLElement {
  const head = node('div', 'unit-task-head');
  head.append(node('span', '', labelRu), node('span', 'unit-task-state', stateRu));
  return head;
}

function dataRow(labelRu: string, valueRu: string): HTMLElement {
  const row = node('div', 'data-row');
  row.append(node('dt', '', labelRu), node('dd', '', valueRu));
  return row;
}

function avatarText(labelRu: string): string {
  const parts = labelRu.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toLocaleUpperCase('ru');
  return (parts[0] ?? '?').slice(0, 2).toLocaleUpperCase('ru');
}

function percent(value: number): string {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function formatBloodLoss(value: number): string {
  const normalized = value <= 1 ? value * 100 : value;
  return percent(normalized);
}

function button(label: string, className = ''): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.className = className;
  return element;
}

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}
