export function installPerformanceReportControls(downloadReport: () => void): void {
  const editorRoot = document.querySelector<HTMLElement>('.editor-controls');

  if (!editorRoot) {
    return;
  }

  const title = document.createElement('div');
  title.textContent = 'Отладка производительности';
  title.style.fontWeight = '700';
  title.style.fontSize = '12px';
  title.style.color = '#fff2a8';

  const hint = document.createElement('div');
  hint.textContent = 'После тормозов нажми кнопку и пришли скачанный JSON. В нём будут FPS, время кадра, время отрисовки, зум, число предметов, юнитов, зон и данные браузера.';
  hint.style.fontSize = '12px';
  hint.style.color = '#f6edcf';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Скачать отчёт производительности';
  button.style.pointerEvents = 'auto';
  button.style.cursor = 'pointer';
  button.addEventListener('click', downloadReport);

  editorRoot.append(title, hint, button);
}
