import type { UnitPosture } from '../core/behavior/BehaviorModel';
import { getSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';

const OPTIONS: Array<{ posture: UnitPosture; icon: string; label: string }> = [
  { posture: 'standing', icon: '▮', label: 'Стоя' },
  { posture: 'crouched', icon: '▰', label: 'Пригнулся' },
  { posture: 'prone', icon: '━', label: 'Лежит' },
];

export function installPostureControls(debugPanel: HTMLElement, state: SimulationState): void {
  const controls = document.createElement('div');
  controls.className = 'posture-controls';

  const title = document.createElement('div');
  title.className = 'posture-controls-title';
  title.textContent = 'Положение юнита';
  controls.appendChild(title);

  for (const option of OPTIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'posture-button';
    button.textContent = `${option.icon} ${option.label}`;
    button.addEventListener('click', () => {
      const selectedUnit = getSelectedUnit(state);

      if (!selectedUnit) {
        return;
      }

      selectedUnit.behaviorRuntime.previousPosture = selectedUnit.behaviorRuntime.posture;
      selectedUnit.behaviorRuntime.posture = option.posture;
      selectedUnit.behaviorRuntime.postureChangedBecause = `ручной выбор: ${option.label}`;
      selectedUnit.behaviorRuntime.lastEvent = `ручное положение: ${option.label}`;
      selectedUnit.behaviorRuntime.reason = `положение задано вручную: ${option.label}`;
    });
    controls.appendChild(button);
  }

  debugPanel.insertAdjacentElement('afterend', controls);
}
