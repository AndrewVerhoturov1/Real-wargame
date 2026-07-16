import {
  EnvironmentProfileRegistry,
  type SurfaceMaterialDefinition,
  type VegetationMaterialDefinition,
} from '../core/map/EnvironmentMaterialProfile';
import {
  getEnvironmentProfileRegistry,
  saveEnvironmentProfileRegistry,
  subscribeEnvironmentProfileRegistry,
} from '../core/map/EnvironmentProfileStorage';

let registry = getEnvironmentProfileRegistry();
let selectedProfileId = registry.activeProfileId;
let selectedGroup: 'vegetation' | 'surfaces' = 'vegetation';
let selectedMaterialId = 'sparse_forest';
let subscribed = false;
let saveTimer: number | null = null;

export function renderEnvironmentProfiles(panel: HTMLElement): void {
  ensureSubscription(panel);
  const profile = registry.getProfile(selectedProfileId);
  const materials = selectedGroup === 'vegetation' ? profile.vegetation : profile.surfaces;
  if (!materials[selectedMaterialId]) selectedMaterialId = Object.keys(materials)[0] ?? '';
  const material = materials[selectedMaterialId];
  panel.innerHTML = `
    <div class="navigation-profile-layout environment-profile-layout">
      <aside class="navigation-profile-list-panel">
        <div class="navigation-profile-list-heading"><div><h2>Профили местности</h2><p>Физические материалы карты. Текстура не является источником игровых данных.</p></div><span>Формат v${registry.formatVersion}</span></div>
        <label class="navigation-profile-mode-select"><span>Активный профиль карты</span><select data-environment-profile-select>${registry.listProfiles().map((item) => `<option value="${attr(item.id)}" ${item.id === selectedProfileId ? 'selected' : ''}>${html(item.nameRu)}${item.builtIn ? ' · встроенный' : ''}</option>`).join('')}</select></label>
        <div class="navigation-profile-list-actions">
          <button type="button" data-environment-action="create">Создать копию</button>
          <button type="button" data-environment-action="rename">Переименовать</button>
          <button type="button" data-environment-action="reset">Сбросить</button>
          <button type="button" data-environment-action="delete" ${profile.builtIn ? 'disabled' : ''}>Удалить</button>
          <button type="button" data-environment-action="import">Импорт</button>
          <button type="button" data-environment-action="export">Экспорт</button>
          <input type="file" data-environment-import accept="application/json,.json" hidden />
        </div>
        <div class="navigation-profile-list-heading compact"><div><h3>Материалы</h3></div></div>
        <div class="environment-material-groups">
          <button type="button" data-environment-group="vegetation" class="${selectedGroup === 'vegetation' ? 'active' : ''}">Растительность</button>
          <button type="button" data-environment-group="surfaces" class="${selectedGroup === 'surfaces' ? 'active' : ''}">Поверхности</button>
        </div>
        <div class="navigation-profile-list">${Object.values(materials).map((item) => `<button type="button" data-environment-material="${attr(item.id)}" class="${item.id === selectedMaterialId ? 'active' : ''}"><strong>${html(item.nameRu)}</strong><span>${html(item.id)}</span></button>`).join('')}</div>
      </aside>
      <main class="navigation-profile-form-panel">
        <header class="navigation-profile-form-heading"><div><span class="navigation-profile-kicker">${selectedGroup === 'vegetation' ? 'Материал растительности' : 'Материал поверхности'} · ${html(profile.nameRu)}</span><h2>${html(material?.nameRu ?? '')}</h2><p>Изменения сохраняются автоматически и применяются в открытой игре без перезагрузки.</p></div><div class="environment-revision-badges"><span>Вид ${profile.revisions.presentation}</span><span>Обзор ${profile.revisions.visibility}</span><span>Огонь ${profile.revisions.fire}</span><span>Движение ${profile.revisions.movement}</span></div></header>
        ${selectedGroup === 'vegetation' ? renderVegetation(material as VegetationMaterialDefinition) : renderSurface(material as SurfaceMaterialDefinition)}
      </main>
    </div>`;
  bind(panel);
}

function renderVegetation(material: VegetationMaterialDefinition): string {
  return [
    section('Внешний вид', [
      colorField('presentation.colorTint', 'Цветовой оттенок', material.presentation.colorTint, 'Цвет непрерывной растровой текстуры.'),
      textField('presentation.textureId', 'Текстура', material.presentation.textureId, 'Идентификатор бесшовного или процедурного рисунка.'),
      numberField('presentation.coverage', 'Покрытие', material.presentation.coverage, 0, 1, 0.01, 'доля', 'Какая часть площади визуально заполнена растительностью.'),
      numberField('presentation.opacity', 'Непрозрачность', material.presentation.opacity, 0, 1, 0.01, 'доля', 'Прозрачность только изображения; не влияет на обзор.'),
      numberField('presentation.textureScale', 'Масштаб текстуры', material.presentation.textureScale, 0.1, 5, 0.05, '×', 'Размер непрерывного рисунка.'),
      numberField('presentation.noiseScale', 'Масштаб шума', material.presentation.noiseScale, 0, 5, 0.05, '×', 'Разнообразие рисунка без отдельных деревьев.'),
      numberField('presentation.edgeSoftness', 'Мягкость края', material.presentation.edgeSoftness, 0, 1, 0.01, 'доля', 'Сглаживание границы связного массива.'),
    ]),
    section('Видимость', [
      numberField('visibility.transmissionLossPerMeter', 'Потеря обзора', material.visibility.transmissionLossPerMeter, 0, 1, 0.001, 'на метр', 'Ослабление визуальной передачи в машинном поле.'),
      numberField('visibility.minimumTransmission', 'Минимальная передача', material.visibility.minimumTransmission, 0, 1, 0.01, 'доля', 'Нижняя граница передачи.'),
      numberField('visibility.targetConcealment', 'Маскировка цели', material.visibility.targetConcealment, 0, 100, 1, '%', 'Насколько трудно заметить цель в материале.'),
      numberField('visibility.localConcealment', 'Локальная маскировка', material.visibility.localConcealment, 0, 100, 1, '%', 'Маскировка бойца в текущей клетке.'),
    ]),
    section('Огонь', [
      numberField('fire.transmissionLossPerMeter', 'Ослабление огня', material.fire.transmissionLossPerMeter, 0, 1, 0.001, 'на метр', 'Ослабление огневой передачи независимо от визуальной.'),
      numberField('fire.protectionPerMeter', 'Защита на метр', material.fire.protectionPerMeter, 0, 10, 0.05, 'ед./м', 'Физическая защита толщи растительности.'),
      numberField('fire.maximumProtection', 'Максимальная защита', material.fire.maximumProtection, 0, 100, 1, '%', 'Предел накопленной защиты.'),
      numberField('fire.densityWeight', 'Вес плотности', material.fire.densityWeight, 0, 10, 0.05, 'вес', 'Плотность для тактической геометрии укрытия.'),
    ]),
    section('Движение', [
      numberField('movement.resistance', 'Сопротивление движению', material.movement.resistance, 0.05, 10, 0.05, '×', 'Физическое сопротивление, не тактическое предпочтение профиля маршрута.'),
      numberField('movement.tacticalConcealment', 'Тактическая маскировка', material.movement.tacticalConcealment, 0, 3, 0.05, 'вес', 'Потенциальная ценность маскировки для маршрута.'),
    ]),
  ].join('');
}

function renderSurface(material: SurfaceMaterialDefinition): string {
  return [
    section('Внешний вид', [
      colorField('presentation.colorTint', 'Цвет', material.presentation.colorTint, 'Базовый оттенок поверхности.'),
      textField('presentation.textureId', 'Текстура', material.presentation.textureId, 'Идентификатор текстуры поверхности.'),
      numberField('presentation.opacity', 'Непрозрачность', material.presentation.opacity, 0, 1, 0.01, 'доля', 'Визуальная непрозрачность.'),
      numberField('presentation.textureScale', 'Масштаб текстуры', material.presentation.textureScale, 0.1, 5, 0.05, '×', 'Размер рисунка.'),
      numberField('presentation.noiseScale', 'Масштаб шума', material.presentation.noiseScale, 0, 5, 0.05, '×', 'Процедурное разнообразие.'),
    ]),
    section('Движение', [
      numberField('movement.resistance', 'Сопротивление', material.movement.resistance, 0.05, 100, 0.05, '×', 'Физическое сопротивление поверхности.'),
      numberField('movement.physicalCost', 'Дополнительная цена', material.movement.physicalCost, -10, 100, 0.05, 'цена', 'Добавочная физическая цена, отдельная от тактики.'),
      checkboxField('movement.passable', 'Проходимость', material.movement.passable, 'Непроходимая поверхность не становится доступной из-за малого веса профиля.'),
    ]),
  ].join('');
}

function bind(panel: HTMLElement): void {
  panel.querySelector<HTMLSelectElement>('[data-environment-profile-select]')?.addEventListener('change', (event) => {
    selectedProfileId = (event.currentTarget as HTMLSelectElement).value;
    registry.setActiveProfile(selectedProfileId); saveEnvironmentProfileRegistry(registry); renderEnvironmentProfiles(panel);
  });
  panel.querySelectorAll<HTMLButtonElement>('[data-environment-group]').forEach((button) => button.addEventListener('click', () => { selectedGroup = button.dataset.environmentGroup as typeof selectedGroup; selectedMaterialId = selectedGroup === 'vegetation' ? 'sparse_forest' : 'field'; renderEnvironmentProfiles(panel); }));
  panel.querySelectorAll<HTMLButtonElement>('[data-environment-material]').forEach((button) => button.addEventListener('click', () => { selectedMaterialId = button.dataset.environmentMaterial ?? selectedMaterialId; renderEnvironmentProfiles(panel); }));
  panel.querySelectorAll<HTMLInputElement>('[data-environment-path]').forEach((input) => input.addEventListener('input', () => queueMaterialUpdate(panel, input)));
  panel.querySelectorAll<HTMLButtonElement>('[data-environment-action]').forEach((button) => button.addEventListener('click', () => handleAction(panel, button.dataset.environmentAction ?? '')));
  panel.querySelector<HTMLInputElement>('[data-environment-import]')?.addEventListener('change', (event) => void importRegistry(panel, event));
}

function queueMaterialUpdate(panel: HTMLElement, input: HTMLInputElement): void {
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const path = input.dataset.environmentPath ?? '';
    const value: unknown = input.type === 'checkbox' ? input.checked : input.type === 'color' ? Number.parseInt(input.value.slice(1), 16) : input.type === 'number' || input.type === 'range' ? Number(input.value) : input.value;
    const profile = registry.getProfile(selectedProfileId);
    if (selectedGroup === 'vegetation') {
      const current = profile.vegetation[selectedMaterialId];
      registry.updateVegetationMaterial(selectedProfileId, selectedMaterialId, setNested(current, path, value));
    } else {
      const current = profile.surfaces[selectedMaterialId];
      registry.updateSurfaceMaterial(selectedProfileId, selectedMaterialId, setNested(current, path, value));
    }
    saveEnvironmentProfileRegistry(registry);
    saveTimer = null;
    renderEnvironmentProfiles(panel);
  }, 80);
}

function handleAction(panel: HTMLElement, action: string): void {
  if (action === 'create') {
    const source = registry.getProfile(selectedProfileId); const nameRu = window.prompt('Название нового профиля:', `${source.nameRu} — копия`); if (!nameRu) return;
    const id = window.prompt('Технический id латиницей:', slugify(nameRu)); if (!id) return;
    try { const created = registry.createCustomProfile(id, id, nameRu, selectedProfileId); selectedProfileId = created.id; saveEnvironmentProfileRegistry(registry); renderEnvironmentProfiles(panel); } catch (error) { window.alert(String(error)); }
  } else if (action === 'rename') {
    const current = registry.getProfile(selectedProfileId); const ru = window.prompt('Новое русское название:', current.nameRu); if (!ru) return; const en = window.prompt('Новое английское название:', current.nameEn) || current.nameEn;
    registry.renameProfile(selectedProfileId, en, ru); saveEnvironmentProfileRegistry(registry); renderEnvironmentProfiles(panel);
  } else if (action === 'reset') {
    if (!window.confirm('Сбросить профиль к стандартным значениям?')) return; registry.resetProfile(selectedProfileId); saveEnvironmentProfileRegistry(registry); renderEnvironmentProfiles(panel);
  } else if (action === 'delete') {
    if (!window.confirm('Удалить пользовательский профиль?')) return; registry.deleteProfile(selectedProfileId); selectedProfileId = registry.activeProfileId; saveEnvironmentProfileRegistry(registry); renderEnvironmentProfiles(panel);
  } else if (action === 'export') download('real-wargame-environment-profiles.json', registry.exportJson());
  else if (action === 'import') panel.querySelector<HTMLInputElement>('[data-environment-import]')?.click();
}

async function importRegistry(panel: HTMLElement, event: Event): Promise<void> { const input = event.currentTarget as HTMLInputElement; const file = input.files?.[0]; input.value = ''; if (!file) return; try { registry = EnvironmentProfileRegistry.importJson(await file.text()); selectedProfileId = registry.activeProfileId; saveEnvironmentProfileRegistry(registry); renderEnvironmentProfiles(panel); } catch (error) { window.alert(`Не удалось импортировать профили: ${String(error)}`); } }
function ensureSubscription(panel: HTMLElement): void { if (subscribed) return; subscribed = true; subscribeEnvironmentProfileRegistry((next) => { registry = next; selectedProfileId = registry.hasProfile(selectedProfileId) ? selectedProfileId : registry.activeProfileId; if (!panel.hidden) renderEnvironmentProfiles(panel); }); }
function setNested<T extends object>(source: T, path: string, value: unknown): Partial<T> { const clone = structuredClone(source) as Record<string, any>; const parts = path.split('.'); let target = clone; for (const part of parts.slice(0, -1)) target = target[part]; target[parts[parts.length - 1]] = value; return clone as Partial<T>; }
function section(title: string, fields: string[]): string { return `<section class="navigation-profile-group"><h3>${title}</h3><div class="navigation-profile-field-grid">${fields.join('')}</div></section>`; }
function numberField(path: string, label: string, value: number, min: number, max: number, step: number, unit: string, help: string): string { return `<article class="navigation-profile-field"><div class="navigation-profile-field-title"><strong>${label}</strong><span>${unit}</span></div><p>${help}</p><div class="navigation-profile-field-control"><input type="range" data-environment-path="${attr(path)}" min="${min}" max="${max}" step="${step}" value="${value}"/><input type="number" data-environment-path="${attr(path)}" min="${min}" max="${max}" step="${step}" value="${value}"/></div></article>`; }
function textField(path: string, label: string, value: string, help: string): string { return `<article class="navigation-profile-field"><div class="navigation-profile-field-title"><strong>${label}</strong></div><p>${help}</p><input type="text" data-environment-path="${attr(path)}" value="${attr(value)}"/></article>`; }
function colorField(path: string, label: string, value: number, help: string): string { return `<article class="navigation-profile-field"><div class="navigation-profile-field-title"><strong>${label}</strong><span>#${value.toString(16).padStart(6, '0')}</span></div><p>${help}</p><input type="color" data-environment-path="${attr(path)}" value="#${value.toString(16).padStart(6, '0')}"/></article>`; }
function checkboxField(path: string, label: string, value: boolean, help: string): string { return `<article class="navigation-profile-field"><div class="navigation-profile-field-title"><strong>${label}</strong></div><p>${help}</p><label class="navigation-profile-mode-select"><input type="checkbox" data-environment-path="${attr(path)}" ${value ? 'checked' : ''}/> Разрешено</label></article>`; }
function download(name: string, content: string): void { const blob = new Blob([content], { type: 'application/json;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }
function slugify(value: string): string { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `environment_${Date.now().toString(36)}`; }
function html(value: string): string { return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char] ?? char)); }
function attr(value: string): string { return html(value); }
