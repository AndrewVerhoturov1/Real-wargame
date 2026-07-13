import { readFile, writeFile } from 'node:fs/promises';

async function patch(path, replacements) {
  let content = await readFile(path, 'utf8');
  let changed = false;
  for (const { from, to, label } of replacements) {
    if (to && content.includes(to)) continue;
    if (!content.includes(from)) {
      if (!to) continue;
      throw new Error(`Missing patch anchor for ${label} in ${path}`);
    }
    content = content.replace(from, to);
    changed = true;
  }
  if (changed) await writeFile(path, content, 'utf8');
  return changed;
}

const aiBridgeChanged = await patch('src/core/ai/AiGameBridge.ts', [
  {
    label: 'combat imports',
    from: "import { clampPercent, type UnitPosture } from '../behavior/BehaviorModel';\n",
    to: "import { clampPercent, type UnitPosture } from '../behavior/BehaviorModel';\nimport { requestFireAction } from '../combat/FireAction';\nimport { clearWeaponRuntime } from '../combat/WeaponModel';\n",
  },
  {
    label: 'remove synthetic shot sound import',
    from: "import { emitPerceptionSound } from '../perception/PerceptionSound';\n",
    to: '',
  },
  {
    label: 'weapon runtime reload sync',
    from: `      } else if (reloadEffect.type === 'complete_reload') {
        unit.behaviorRuntime.ammo = reloadEffect.targetAmmo;
        unit.behaviorRuntime.weaponReady = reloadEffect.targetAmmo > 0;
        unit.behaviorRuntime.currentAction = 'reload_complete';`,
    to: `      } else if (reloadEffect.type === 'complete_reload') {
        unit.behaviorRuntime.ammo = reloadEffect.targetAmmo;
        unit.behaviorRuntime.weaponReady = reloadEffect.targetAmmo > 0;
        clearWeaponRuntime(unit);
        unit.behaviorRuntime.currentAction = 'reload_complete';`,
  },
  {
    label: 'stateful fire action',
    from: `  } else if (effect.action === 'reload') {
    unit.behaviorRuntime.ammo = 30;
    unit.behaviorRuntime.weaponReady = true;
  } else if (effect.action === 'fire' || effect.action === 'suppress') {
    unit.behaviorRuntime.ammo = Math.max(0, unit.behaviorRuntime.ammo - 1);
    unit.behaviorRuntime.weaponReady = unit.behaviorRuntime.ammo > 0;
    emitPerceptionSound(state, {
      id: \`${'${effect.action}:${unit.id}:${nowMs}:${unit.behaviorRuntime.ammo}'}\`,
      kind: effect.action === 'suppress' ? 'automatic_fire' : 'rifle_shot',
      sourceId: unit.id,
      labelRu: effect.action === 'suppress' ? 'Автоматическая стрельба' : 'Одиночный выстрел',
      position: { ...unit.position },
      loudness: 1,
      createdSeconds: state.simulationTimeSeconds,
      durationSeconds: effect.action === 'suppress' ? 1.2 : 0.7,
    });
    const focusTarget = readPosition(blackboard.current_target) ?? readPosition(blackboard.remembered_enemy_position);
    if (focusTarget) {
      setFocusTarget(unit, 'current_target', Math.atan2(focusTarget.y - unit.position.y, focusTarget.x - unit.position.x));
      setAttentionMode(unit, 'engage', 'automatic');
    }
  }

  unit.behaviorRuntime.currentAction = effect.action;`,
    to: `  } else if (effect.action === 'reload') {
    unit.behaviorRuntime.ammo = 30;
    unit.behaviorRuntime.weaponReady = true;
    clearWeaponRuntime(unit);
  } else if (effect.action === 'fire') {
    const contact = getBestPerceptionContact(unit);
    if (contact) requestFireAction(state, unit, contact.id);
    else {
      unit.behaviorRuntime.reason = 'Нет личного контакта для стрельбы.';
      unit.behaviorRuntime.lastEvent = 'combat_fire_request_missing_contact';
    }
    return;
  } else if (effect.action === 'suppress') {
    unit.behaviorRuntime.reason = 'Подавляющий огонь будет добавлен после одиночной винтовочной стрельбы.';
    unit.behaviorRuntime.lastEvent = 'combat_suppression_not_available_v1';
    return;
  }

  unit.behaviorRuntime.currentAction = effect.action;`,
  },
  {
    label: 'unused wall-clock argument',
    from: `  nowMs: number,
): void {
  if (effect.action === 'move_to') {`,
    to: `  _nowMs: number,
): void {
  if (effect.action === 'move_to') {`,
  },
]);

const simulationStateChanged = await patch('src/core/simulation/SimulationState.ts', [
  {
    label: 'editor side type import',
    from: "import { findUnitAtGridPosition, normalizeUnits, type UnitData, type UnitModel, type UnitType } from '../units/UnitModel';",
    to: "import { findUnitAtGridPosition, normalizeUnits, type UnitData, type UnitModel, type UnitSide, type UnitType } from '../units/UnitModel';",
  },
  {
    label: 'editor side state field',
    from: `  unitType: UnitType;
  zoneShape: PressureZoneShape;`,
    to: `  unitType: UnitType;
  unitSide: UnitSide;
  zoneShape: PressureZoneShape;`,
  },
  {
    label: 'editor side default',
    from: `      unitType: 'infantry_squad',
      zoneShape: 'circle',`,
    to: `      unitType: 'infantry_squad',
      unitSide: 'blue',
      zoneShape: 'circle',`,
  },
  {
    label: 'spawn selected editor side',
    from: `      side: 'player',
      x: Math.max(0, Math.floor(grid.x)),`,
    to: `      side: state.editor.unitSide,
      x: Math.max(0, Math.floor(grid.x)),`,
  },
]);

const tacticalWorkspaceChanged = await patch('src/ui/TacticalWorkspace.ts', [
  {
    label: 'combat diagnostics imports',
    from: "import type { UnitPosture } from '../core/behavior/BehaviorModel';\n",
    to: "import type { UnitPosture } from '../core/behavior/BehaviorModel';\nimport { getCombatRuntime } from '../core/combat/CombatDamage';\nimport { getFireAction } from '../core/combat/FireAction';\nimport { getWeaponRuntime } from '../core/combat/WeaponModel';\n",
  },
  {
    label: 'unit side type import',
    from: "import { applyInitialStateToRuntime, type UnitModel } from '../core/units/UnitModel';",
    to: "import { applyInitialStateToRuntime, type UnitModel, type UnitSide } from '../core/units/UnitModel';",
  },
  {
    label: 'editor side selector markup',
    from: `        <button class="editor-place-button primary" data-action="editor-place" title="Включить постановку для открытой вкладки редактора">Поставить</button>
        <button data-action="ai-editor">Редактор ИИ</button><button data-action="new-game">Новая игра</button>`,
    to: `        <button class="editor-place-button primary" data-action="editor-place" title="Включить постановку для открытой вкладки редактора">Поставить</button>
        <label class="editor-unit-side-control"><span>Сторона бойца</span><select data-action="editor-unit-side"><option value="blue">Свои</option><option value="red">Противник</option></select></label>
        <button data-action="ai-editor">Редактор ИИ</button><button data-action="new-game">Новая игра</button>`,
  },
  {
    label: 'editor side selector query',
    from: `  const editorPlace = q<HTMLButtonElement>('[data-action="editor-place"]');
  const navigationProfile = q<HTMLSelectElement>('[data-action="unit-navigation-profile"]');`,
    to: `  const editorPlace = q<HTMLButtonElement>('[data-action="editor-place"]');
  const editorUnitSide = q<HTMLSelectElement>('[data-action="editor-unit-side"]');
  const navigationProfile = q<HTMLSelectElement>('[data-action="unit-navigation-profile"]');`,
  },
  {
    label: 'editor side selector listener',
    from: `  const turnUnitButton = q<HTMLButtonElement>('[data-action="turn-unit"]');

  moveExistingButton('#grid-toggle', display);`,
    to: `  const turnUnitButton = q<HTMLButtonElement>('[data-action="turn-unit"]');
  editorUnitSide.value = state.editor.unitSide;
  editorUnitSide.addEventListener('change', () => {
    state.editor.unitSide = (editorUnitSide.value === 'red' ? 'red' : 'blue') as UnitSide;
    state.editor.lastMessage = state.editor.unitSide === 'red' ? 'Новые бойцы будут противниками.' : 'Новые бойцы будут своими.';
    onChanged();
  });

  moveExistingButton('#grid-toggle', display);`,
  },
  {
    label: 'editor side selector visibility',
    from: `    sidebar.hidden = mode !== 'simulation';
    bottom.hidden = mode !== 'simulation';`,
    to: `    sidebar.hidden = mode !== 'simulation';
    bottom.hidden = mode !== 'simulation';
    editorUnitSide.closest<HTMLElement>('.editor-unit-side-control')!.hidden = mode !== 'editor';`,
  },
  {
    label: 'compact combat bottom diagnostics',
    from: `    q('[data-role="unit-name"]').textContent = unit?.labels.ru ?? 'Боец не выбран';
    q('[data-role="unit-meta"]').textContent = unit ? \`${'${unit.id} · ${postureLabel(unit.behaviorRuntime.posture)} · ${profileLabel(unit.behaviorProfile)}'}\` : 'Левый клик по солдату — выбрать';
    const values: Record<string, string> = unit ? {
      health: pct(unit.soldier.condition.health), morale: pct(unit.soldier.condition.morale), fatigue: pct(unit.soldier.condition.fatigue),
      stress: pct(unit.behaviorRuntime.stress), suppression: pct(unit.behaviorRuntime.suppression), ammo: String(Math.round(unit.behaviorRuntime.ammo)),
    } : { health:'—', morale:'—', fatigue:'—', stress:'—', suppression:'—', ammo:'—' };`,
    to: `    q('[data-role="unit-name"]').textContent = unit?.labels.ru ?? 'Боец не выбран';
    const combat = unit ? getCombatRuntime(unit) : null;
    const weapon = unit ? getWeaponRuntime(unit) : null;
    const fireAction = unit ? getFireAction(unit) : null;
    q('[data-role="unit-meta"]').textContent = unit
      ? \`${'${unit.id} · ${unit.side === \'red\' ? \'Противник\' : \'Свои\'} · ${postureLabel(unit.behaviorRuntime.posture)} · ${profileLabel(unit.behaviorProfile)} · ${combatCapabilityLabel(combat!.capability)}'}\`
      : 'Левый клик по солдату — выбрать';
    const values: Record<string, string> = unit ? {
      health: pct(unit.soldier.condition.health), morale: pct(unit.soldier.condition.morale), fatigue: pct(unit.soldier.condition.fatigue),
      stress: pct(unit.behaviorRuntime.stress), suppression: pct(unit.behaviorRuntime.suppression), ammo: \`${'${weapon!.roundsLoaded}+${weapon!.roundsReserve}'}\`,
    } : { health:'—', morale:'—', fatigue:'—', stress:'—', suppression:'—', ammo:'—' };`,
  },
  {
    label: 'fire phase bottom diagnostics',
    from: `    q('[data-role="action"]').textContent = \`Действие: ${'${unit ? actionLabel(unit.behaviorRuntime.currentAction) : \'—\'}'}\`;`,
    to: `    q('[data-role="action"]').textContent = \`Действие: ${'${unit ? actionLabel(unit.behaviorRuntime.currentAction) : \'—\'}'}${'${fireAction ? ` · стрельба: ${firePhaseLabel(fireAction.phase)}` : \'\'}'}\`;`,
  },
  {
    label: 'combat label helpers',
    from: `function infoPanel(): string {`,
    to: `function combatCapabilityLabel(value: ReturnType<typeof getCombatRuntime>['capability']): string {
  if (value === 'wounded') return 'ранен';
  if (value === 'severely_wounded') return 'тяжело ранен';
  if (value === 'incapacitated') return 'выведен из строя';
  if (value === 'dead') return 'погиб';
  return 'боеспособен';
}

function firePhaseLabel(value: NonNullable<ReturnType<typeof getFireAction>>['phase']): string {
  if (value === 'acquire_target') return 'выбор цели';
  if (value === 'turning') return 'поворот';
  if (value === 'readying_weapon') return 'подготовка оружия';
  if (value === 'aiming') return 'наведение';
  if (value === 'final_safety_check') return 'проверка линии огня';
  if (value === 'firing') return 'выстрел';
  if (value === 'recovering') return 'восстановление';
  if (value === 'cancelled') return 'отменено';
  return 'не удалось';
}

function infoPanel(): string {`,
  },
]);

console.log(JSON.stringify({ aiBridgeChanged, simulationStateChanged, tacticalWorkspaceChanged }));
