import type { SimulationState } from '../core/simulation/SimulationState';
import { downloadCurrentSceneJson } from './SceneExport';

export function installSceneExportControls(state: SimulationState): void {
  const editorRoot = document.querySelector<HTMLElement>('.editor-controls');

  if (!editorRoot) {
    return;
  }

  const title = document.createElement('div');
  title.textContent = 'Сохранение';
  title.style.fontWeight = '700';
  title.style.fontSize = '12px';
  title.style.color = '#fff2a8';

  const hint = document.createElement('div');
  hint.textContent = 'Скачивает текущую сцену в JSON: карта, предметы, юниты и зоны. Файл можно отдать Codex, чтобы закрепить изменения в проекте.';
  hint.style.fontSize = '12px';
  hint.style.color = '#f6edcf';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Скачать JSON сцены';
  button.style.pointerEvents = 'auto';
  button.style.cursor = 'pointer';
  button.addEventListener('click', () => {
    downloadCurrentSceneJson(state);
  });

  editorRoot.append(title, hint, button);
}
