import type { SimulationState } from '../core/simulation/SimulationState';
import { downloadCurrentSceneJson, loadSceneJsonFromFile } from './SceneExport';

export function installSceneExportControls(state: SimulationState): void {
  const editorRoot = document.querySelector<HTMLElement>('.editor-controls');

  if (!editorRoot) {
    return;
  }

  const title = document.createElement('div');
  title.textContent = 'Сохранение / загрузка';
  title.style.fontWeight = '700';
  title.style.fontSize = '12px';
  title.style.color = '#fff2a8';

  const hint = document.createElement('div');
  hint.textContent = 'Можно скачать текущую сцену в JSON или загрузить JSON сцены обратно в редактор.';
  hint.style.fontSize = '12px';
  hint.style.color = '#f6edcf';

  const downloadButton = document.createElement('button');
  downloadButton.type = 'button';
  downloadButton.textContent = 'Скачать JSON сцены';
  downloadButton.style.pointerEvents = 'auto';
  downloadButton.style.cursor = 'pointer';
  downloadButton.addEventListener('click', () => {
    downloadCurrentSceneJson(state);
  });

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json,.json';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';

    if (!file) {
      return;
    }

    void loadSceneJsonFromFile(state, file)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Не удалось загрузить JSON сцены.';
        state.editor.lastMessage = `Ошибка загрузки JSON: ${message}`;
      });
  });

  const loadButton = document.createElement('button');
  loadButton.type = 'button';
  loadButton.textContent = 'Загрузить JSON сцены';
  loadButton.style.pointerEvents = 'auto';
  loadButton.style.cursor = 'pointer';
  loadButton.addEventListener('click', () => {
    fileInput.click();
  });

  editorRoot.append(title, hint, downloadButton, loadButton, fileInput);
}
