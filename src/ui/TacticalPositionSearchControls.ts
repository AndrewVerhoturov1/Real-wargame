import type { SimulationState } from '../core/simulation/SimulationState';
import { getTacticalPositionSearchService } from '../core/tactical/TacticalPositionSearchService';

export function installTacticalPositionSearchControls(
  state: SimulationState,
  onChanged: () => void,
): () => void {
  const service = getTacticalPositionSearchService(state);
  let destroyed = false;
  let scheduled = false;
  let section: HTMLElement | null = null;
  let status: HTMLElement | null = null;

  const renderStatus = (): void => {
    if (destroyed) return;
    ensureMounted();
    if (!status) return;
    const unitId = state.selectedUnitId;
    if (!unitId) {
      status.textContent = 'Выберите бойца.';
      status.dataset.state = 'idle';
      return;
    }
    const request = service?.readLatestForUnit(unitId);
    if (!request) {
      status.textContent = 'Запрос ещё не создан.';
      status.dataset.state = 'idle';
      return;
    }
    status.dataset.state = request.status;
    if (request.status === 'queued') status.textContent = 'Запрос создан.';
    else if (request.status === 'calculating' && request.reasonCode === 'field_preparing') status.textContent = 'Поле готовится…';
    else if (request.status === 'calculating') status.textContent = 'Поиск выполняется…';
    else if (request.status === 'ready' && (request.result?.candidates.length ?? 0) > 0) {
      status.textContent = `Поиск выполнен: ${request.result!.candidates.length} позиций.`;
    } else if (request.status === 'ready') status.textContent = 'Позиции не найдены.';
    else if (request.status === 'stale') status.textContent = 'Результат устарел. Создайте новый запрос.';
    else if (request.status === 'cancelled') status.textContent = 'Запрос отменён.';
    else status.textContent = `Ошибка: ${request.reasonRu ?? 'поиск не выполнен'}`;
  };

  const scheduleRender = (): void => {
    if (scheduled || destroyed) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      renderStatus();
    });
  };

  const ensureMounted = (): void => {
    if (section?.isConnected) return;
    const shell = document.querySelector<HTMLElement>('.tactical-workspace-shell');
    const sidebarBody = shell?.querySelector<HTMLElement>('[data-role="sidebar-body"]');
    if (!sidebarBody) return;

    section = document.createElement('section');
    section.className = 'workspace-panel-section tactical-position-search-controls';
    section.dataset.role = 'tactical-position-search-controls';
    const title = document.createElement('h3');
    title.textContent = 'Поиск тактических позиций';
    const description = document.createElement('p');
    description.textContent = 'Поиск и движение — разные действия. Команда только создаёт bounded-запрос для выбранного бойца.';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'primary';
    button.textContent = 'Найти позиции';
    button.addEventListener('click', () => {
      const unitId = state.selectedUnitId;
      const unit = unitId ? state.units.find((candidate) => candidate.id === unitId) : null;
      if (!unit || !service) {
        state.editor.lastMessage = unit ? 'Сервис поиска тактических позиций недоступен.' : 'Сначала выберите бойца.';
        renderStatus();
        return;
      }
      const request = service.enqueueCoverSearch(unit);
      state.editor.lastMessage = `Запрос тактических позиций создан: ${request.requestId}`;
      renderStatus();
      onChanged();
    });
    status = document.createElement('p');
    status.className = 'tactical-position-search-status';
    status.dataset.role = 'tactical-position-search-status';
    section.append(title, description, button, status);
    sidebarBody.prepend(section);
  };

  const unsubscribe = service?.subscribe(() => {
    renderStatus();
    onChanged();
  }) ?? (() => undefined);
  const observer = new MutationObserver(scheduleRender);
  observer.observe(document.body, { childList: true, subtree: true });
  renderStatus();

  return () => {
    destroyed = true;
    observer.disconnect();
    unsubscribe();
    section?.remove();
    section = null;
    status = null;
  };
}
