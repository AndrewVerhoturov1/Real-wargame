import type { CombatLabBatchProgressV1 } from '../../core/testing/combat-lab';

export class CombatLabBatchProgressView {
  readonly root = document.createElement('section');
  private readonly status = document.createElement('p');
  private readonly progress = document.createElement('progress');
  private readonly detail = document.createElement('span');

  constructor(host: HTMLElement) {
    this.root.className = 'combat-lab-batch-progress-view';
    const heading = document.createElement('h3');
    heading.textContent = 'Ход серии';
    this.status.setAttribute('role', 'status');
    this.progress.min = 0;
    this.progress.max = 1;
    this.progress.value = 0;
    this.detail.className = 'combat-lab-batch-progress-detail';
    this.root.append(heading, this.status, this.progress, this.detail);
    host.append(this.root);
    this.setIdle();
  }

  setIdle(): void {
    this.root.dataset.state = 'idle';
    this.status.textContent = 'Серия не запущена.';
    this.progress.max = 1;
    this.progress.value = 0;
    this.detail.textContent = 'Выполнено: 0 из 0.';
  }

  setStarting(totalRuns: number): void {
    this.root.dataset.state = 'running';
    this.status.textContent = 'Подготовка рабочих потоков…';
    this.progress.max = Math.max(1, totalRuns);
    this.progress.value = 0;
    this.detail.textContent = `Выполнено: 0 из ${totalRuns}.`;
  }

  renderProgress(progress: CombatLabBatchProgressV1): void {
    this.root.dataset.state = 'running';
    this.status.textContent = 'Серия выполняется.';
    this.progress.max = Math.max(1, progress.totalRuns);
    this.progress.value = Math.min(progress.completedRuns, progress.totalRuns);
    const percent = progress.totalRuns > 0 ? Math.floor(progress.completedRuns / progress.totalRuns * 100) : 0;
    this.detail.textContent = `Выполнено: ${progress.completedRuns} из ${progress.totalRuns} (${percent}%).`;
  }

  setCancelling(): void {
    this.root.dataset.state = 'cancelling';
    this.status.textContent = 'Остановка серии после текущего блока прогонов…';
  }

  setCompleted(completedRuns: number): void {
    this.root.dataset.state = 'completed';
    this.status.textContent = 'Серия завершена.';
    this.progress.max = Math.max(1, completedRuns);
    this.progress.value = completedRuns;
    this.detail.textContent = `Выполнено: ${completedRuns} из ${completedRuns}.`;
  }

  setCancelled(completedRuns: number, totalRuns: number): void {
    this.root.dataset.state = 'cancelled';
    this.status.textContent = 'Серия отменена.';
    this.progress.max = Math.max(1, totalRuns);
    this.progress.value = Math.min(completedRuns, totalRuns);
    this.detail.textContent = `Выполнено до отмены: ${completedRuns} из ${totalRuns}.`;
  }

  setError(message: string): void {
    this.root.dataset.state = 'error';
    this.status.textContent = message;
  }

  destroy(): void {
    this.root.remove();
  }
}
