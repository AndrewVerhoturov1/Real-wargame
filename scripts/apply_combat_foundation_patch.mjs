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

console.log(JSON.stringify({ aiBridgeChanged }));
