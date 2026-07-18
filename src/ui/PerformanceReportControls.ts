import {
  addPerformanceUserMarker,
  clearRecoveredPerformanceReport,
  getActivePerformanceStatus,
  loadRecoveredPerformanceReport,
} from '../core/debug/PerformanceTelemetryBridge';

export function installPerformanceReportControls(downloadReport: () => void): () => void {
  let destroyed = false;
  let observer: MutationObserver | null = null;
  let destroyMountedControls: (() => void) | null = null;

  const tryMount = (): boolean => {
    if (destroyed || destroyMountedControls) return Boolean(destroyMountedControls);
    const editorRoot = document.querySelector<HTMLElement>('.editor-scene-tools-slot')
      ?? document.querySelector<HTMLElement>('.editor-controls');
    if (!editorRoot) return false;
    destroyMountedControls = mountPerformanceReportControls(editorRoot, downloadReport);
    observer?.disconnect();
    observer = null;
    return true;
  };

  if (!tryMount()) {
    observer = new MutationObserver(() => { tryMount(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    observer?.disconnect();
    observer = null;
    destroyMountedControls?.();
    destroyMountedControls = null;
    window.removeEventListener('beforeunload', destroy);
  };
  window.addEventListener('beforeunload', destroy, { once: true });
  return destroy;
}

function mountPerformanceReportControls(editorRoot: HTMLElement, downloadReport: () => void): () => void {
  const title = element('div', 'Отладка производительности', 'editor-group-title');
  const hint = element(
    'div',
    'Performance Report v6 хранит динамику сцены, очереди, причины тяжёлой работы и последние 30 секунд перед зависанием.',
    'editor-help-text',
  );
  const status = element('div', 'v6 · захват запускается…', 'editor-help-text performance-report-status');
  status.dataset.performanceReportStatus = 'v6';

  const markerButton = button('Добавить метку производительности', () => {
    const label = window.prompt('Коротко опиши, что сейчас произошло:', 'Продолжил симуляцию после изменения сцены');
    if (label === null) return;
    if (!addPerformanceUserMarker(label)) status.textContent = 'Захват производительности ещё не готов.';
    else status.textContent = `Метка добавлена: ${label.slice(0, 80)}`;
  });
  markerButton.dataset.performanceMarker = 'add';

  const exportButton = button('Экспортировать Performance Report v6', downloadReport);
  exportButton.dataset.workspaceFileAction = 'performance';
  exportButton.dataset.performanceExport = 'v6';

  const recoveryRow = document.createElement('div');
  recoveryRow.className = 'performance-report-recovery-row';
  const recoveredButton = button('Экспортировать аварийный отчёт', () => {
    void loadRecoveredPerformanceReport().then((report) => {
      if (!report) {
        status.textContent = 'Аварийный checkpoint не найден.';
        return;
      }
      downloadJson(report, `real-wargame-performance-recovered-${fileTimestamp()}.json`);
      status.textContent = `Аварийный отчёт экспортирован; возможный потерянный хвост: ${report.summary.reportHealth.possibleMissingTailMs} мс.`;
    });
  });
  recoveredButton.dataset.performanceRecovery = 'export';
  const clearButton = button('Очистить checkpoint', () => {
    void clearRecoveredPerformanceReport().then(() => {
      status.textContent = 'Старый аварийный checkpoint удалён.';
    });
  });
  clearButton.dataset.performanceRecovery = 'clear';
  recoveryRow.append(recoveredButton, clearButton);

  editorRoot.append(title, hint, status, markerButton, exportButton, recoveryRow);
  const timer = window.setInterval(() => {
    const capture = getActivePerformanceStatus();
    if (!capture) return;
    status.textContent = [
      'v6',
      `${capture.runtimeSeconds.toFixed(1)} с`,
      `бойцов: ${capture.currentUnitCount} (макс. ${capture.maximumUnitCount})`,
      `dropped samples: ${capture.samplesDropped}`,
      `dropped events: ${capture.eventsDropped}`,
    ].join(' · ');
  }, 1000);

  return () => {
    window.clearInterval(timer);
    title.remove();
    hint.remove();
    status.remove();
    markerButton.remove();
    exportButton.remove();
    recoveryRow.remove();
  };
}

function button(label: string, action: () => void): HTMLButtonElement {
  const target = document.createElement('button');
  target.type = 'button';
  target.textContent = label;
  target.style.pointerEvents = 'auto';
  target.style.cursor = 'pointer';
  target.addEventListener('click', action);
  return target;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text: string, className: string): HTMLElementTagNameMap[K] {
  const target = document.createElement(tag);
  target.textContent = text;
  target.className = className;
  return target;
}

function downloadJson(value: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function fileTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
