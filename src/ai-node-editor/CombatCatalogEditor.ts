import { registerAiEditorSection } from './AiEditorSectionRegistry';
import {
  COMBAT_CATALOG_STORAGE_KEY,
  CombatCatalogStorageAdapter,
  type CombatCatalogKeyValueStorage,
} from '../core/infantry-combat/catalogs';

type CatalogKind = 'ammo' | 'weapon' | 'loadout';

const storage = new CombatCatalogStorageAdapter(resolveBrowserStorage());
const load = storage.load();
let activeKind: CatalogKind = 'ammo';

registerAiEditorSection({
  id: 'combatCatalogs',
  labelRu: 'Вооружение',
  order: 35,
  render: (panel) => {
    panel.dataset.combatCatalogWorkbench = 'true';
    render(panel);
  },
});

function render(panel: HTMLElement): void {
  panel.innerHTML = `
    <div class="combat-catalog-editor" data-combat-catalog-editor>
      <header class="combat-catalog-toolbar">
        <div>
          <span class="combat-catalog-kicker">Статичные данные проекта · bundle revision ${load.registry.toData().revision}</span>
          <h1>Вооружение</h1>
          <p>Каталоги хранятся отдельно от графа поведения.</p>
        </div>
      </header>
      <div class="combat-catalog-subtabs">
        ${tab('ammo', 'Боеприпасы')}
        ${tab('weapon', 'Оружие')}
        ${tab('loadout', 'Комплекты снаряжения')}
      </div>
      <section class="combat-catalog-empty-form">
        <h2>${kindLabel(activeKind)}</h2>
        <p>Форма будет установлена следующим узким шагом.</p>
        <small>Ключ хранения: <code>${COMBAT_CATALOG_STORAGE_KEY}</code></small>
      </section>
    </div>
  `;
  panel.querySelectorAll<HTMLButtonElement>('[data-combat-kind]').forEach((button) => {
    button.addEventListener('click', () => {
      activeKind = button.dataset.combatKind as CatalogKind;
      render(panel);
    });
  });
}

function tab(kind: CatalogKind, label: string): string {
  return `<button type="button" data-combat-kind="${kind}" class="${activeKind === kind ? 'active' : ''}">${label}</button>`;
}

function kindLabel(kind: CatalogKind): string {
  if (kind === 'ammo') return 'Боеприпасы';
  if (kind === 'weapon') return 'Оружие';
  return 'Комплекты снаряжения';
}

function resolveBrowserStorage(): CombatCatalogKeyValueStorage {
  try {
    return window.localStorage;
  } catch {
    return new VolatileKeyValueStorage();
  }
}

class VolatileKeyValueStorage implements CombatCatalogKeyValueStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}
