import { readFile, writeFile } from 'node:fs/promises';

const path = 'src/ui/TacticalWorkspace.ts';
let content = await readFile(path, 'utf8');
let changed = false;

function replace(label, from, to) {
  if (content.includes(to)) return;
  if (!content.includes(from)) throw new Error(`Missing patch anchor for ${label}`);
  content = content.replace(from, to);
  changed = true;
}

replace(
  'manual fire imports',
  "import { getFireAction } from '../core/combat/FireAction';\n",
  "import { getFireAction, requestFireAction } from '../core/combat/FireAction';\nimport { getBestPerceptionContact } from '../core/perception/PerceptionSystem';\n",
);

replace(
  'manual fire button markup',
  `<button data-action="evaluate">Один расчёт ИИ</button><button class="primary" data-action="execute">Рассчитать и выполнить</button>
        <button data-action="clear-order">Очистить приказ</button><button data-action="reset-unit">Сбросить бойца</button>`,
  `<button data-action="evaluate">Один расчёт ИИ</button><button class="primary" data-action="execute">Рассчитать и выполнить</button>
        <button class="primary" data-action="fire-contact">Огонь по контакту</button><button data-action="clear-order">Очистить приказ</button><button data-action="reset-unit">Сбросить бойца</button>`,
);

replace(
  'manual fire button query',
  `  const turnUnitButton = q<HTMLButtonElement>('[data-action="turn-unit"]');
  editorUnitSide.value = state.editor.unitSide;`,
  `  const turnUnitButton = q<HTMLButtonElement>('[data-action="turn-unit"]');
  const fireContactButton = q<HTMLButtonElement>('[data-action="fire-contact"]');
  editorUnitSide.value = state.editor.unitSide;`,
);

replace(
  'manual fire listener',
  `  q<HTMLButtonElement>('[data-action="execute"]').onclick = () => { aiBridge.tickNow(); update(false); onChanged(); };
  q<HTMLButtonElement>('[data-action="clear-order"]').onclick = () => { const unit = getSelectedUnit(state); if (unit) unit.order = null; update(false); onChanged(); };`,
  `  q<HTMLButtonElement>('[data-action="execute"]').onclick = () => { aiBridge.tickNow(); update(false); onChanged(); };
  fireContactButton.onclick = () => {
    const unit = getSelectedUnit(state);
    const contact = unit ? getBestPerceptionContact(unit) : null;
    if (!unit || !contact || !requestFireAction(state, unit, contact.id)) {
      if (unit) {
        unit.behaviorRuntime.reason = contact ? unit.behaviorRuntime.reason : 'Нет личного контакта для стрельбы.';
        unit.behaviorRuntime.lastEvent = contact ? unit.behaviorRuntime.lastEvent : 'combat_fire_request_missing_contact';
      }
    }
    update(false);
    onChanged();
  };
  q<HTMLButtonElement>('[data-action="clear-order"]').onclick = () => { const unit = getSelectedUnit(state); if (unit) unit.order = null; update(false); onChanged(); };`,
);

replace(
  'manual fire button state',
  `    turnUnitButton.disabled = !unit;
    const commandTool = getUnitCommandToolState(state);`,
  `    turnUnitButton.disabled = !unit;
    const bestFireContact = unit ? getBestPerceptionContact(unit) : null;
    fireContactButton.disabled = !unit || !bestFireContact?.visibleNow || Boolean(getFireAction(unit));
    fireContactButton.title = bestFireContact
      ? \`Личный контакт: ${'${bestFireContact.labelRu}'} · уверенность ${'${Math.round(bestFireContact.confidence)}'}%\`
      : 'Сначала боец должен сам обнаружить противника.';
    const commandTool = getUnitCommandToolState(state);`,
);

if (changed) await writeFile(path, content, 'utf8');
console.log(JSON.stringify({ changed }));
