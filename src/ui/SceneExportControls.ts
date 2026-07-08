import type { SimulationState } from '../core/simulation/SimulationState';
import { downloadCurrentSceneJson, loadSceneJsonFromFile } from './SceneExport';

export function installSceneExportControls(state: SimulationState): void {
  const editorRoot = document.querySelector<HTMLElement>('.editor-scene-tools-slot')
    ?? document.querySelector<HTMLElement>('.editor-controls');

  if (!editorRoot) {
    return;
  }

  const title = document.createElement('div');
  title.textContent = 'Сохранение / загрузка';
  title.className = 'editor-group-title';

  const hint = document.createElement('div');
  hint.textContent = 'Можно скачать текущую сцену в JSON или загрузить JSON сцены обратно в редактор.';
  hint.className = 'editor-help-text';

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

  const row = document.createElement('div');
  row.className = 'editor-button-row';
  row.append(downloadButton, loadButton);

  editorRoot.append(title, hint, row, fileInput);
}
