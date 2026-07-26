export type EditorLanguageMode = 'ru' | 'en' | 'both';

export type EditorTextKey =
  | 'editorTitle'
  | 'palette'
  | 'hide'
  | 'addNode'
  | 'inspector'
  | 'validate'
  | 'evaluate'
  | 'export'
  | 'import'
  | 'reset'
  | 'fit'
  | 'compact'
  | 'detailed'
  | 'all'
  | 'favorites'
  | 'searchNodes'
  | 'emptyPalette'
  | 'select'
  | 'addChildAction'
  | 'duplicate'
  | 'setLinkSource'
  | 'linkSourceToThis'
  | 'centerView'
  | 'unlinkOutgoing'
  | 'unlinkIncoming'
  | 'unlinkAllIncoming'
  | 'deleteNode'
  | 'removeLink'
  | 'flowInput'
  | 'flowOutput'
  | 'saveNode'
  | 'links'
  | 'dangerZone'
  | 'deleteSelectedNode'
  | 'console'
  | 'graphJson'
  | 'mainGraph'
  | 'backToParent'
  | 'paletteNote'
  | 'graphHelp';

export const PALETTE_FAVORITES_STORAGE_KEY = 'real-wargame.ai-node-editor.favorites.v1';

type TextPair = Readonly<{ ru: string; en: string }>;

const TEXT: Readonly<Record<EditorTextKey, TextPair>> = {
  editorTitle: { ru: 'Редактор ИИ солдата', en: 'Soldier AI Node Editor' },
  palette: { ru: 'Палитра', en: 'Palette' },
  hide: { ru: 'Скрыть', en: 'Hide' },
  addNode: { ru: '+ Нода', en: '+ Node' },
  inspector: { ru: 'Инспектор', en: 'Inspector' },
  validate: { ru: 'Проверить', en: 'Validate' },
  evaluate: { ru: 'Вычислить', en: 'Evaluate' },
  export: { ru: 'Экспорт', en: 'Export' },
  import: { ru: 'Импорт', en: 'Import' },
  reset: { ru: 'Сбросить', en: 'Reset' },
  fit: { ru: 'Вместить', en: 'Fit' },
  compact: { ru: 'Компактно', en: 'Compact' },
  detailed: { ru: 'Подробно', en: 'Detailed' },
  all: { ru: 'Все', en: 'All' },
  favorites: { ru: '★ Избранное', en: '★ Favorites' },
  searchNodes: { ru: 'Поиск нод…', en: 'Search nodes…' },
  emptyPalette: { ru: 'Подходящих нод нет.', en: 'No matching nodes.' },
  select: { ru: 'Выбрать', en: 'Select' },
  addChildAction: { ru: 'Добавить дочернее действие', en: 'Add child action' },
  duplicate: { ru: 'Дублировать', en: 'Duplicate' },
  setLinkSource: { ru: 'Назначить источником связи', en: 'Set as link source' },
  linkSourceToThis: { ru: 'Связать источник с этой нодой', en: 'Link source to this node' },
  centerView: { ru: 'Показать по центру', en: 'Center view' },
  unlinkOutgoing: { ru: 'Удалить исходящие связи', en: 'Remove outgoing links' },
  unlinkIncoming: { ru: 'Удалить входящие связи', en: 'Remove incoming links' },
  unlinkAllIncoming: { ru: 'Удалить все входящие связи', en: 'Remove all incoming links' },
  deleteNode: { ru: 'Удалить ноду', en: 'Delete node' },
  removeLink: { ru: 'Удалить связь', en: 'Remove link' },
  flowInput: { ru: 'Вход управления', en: 'Flow input' },
  flowOutput: { ru: 'Выход управления', en: 'Flow output' },
  saveNode: { ru: 'Сохранить ноду', en: 'Save node' },
  links: { ru: 'Связи', en: 'Links' },
  dangerZone: { ru: 'Опасная зона', en: 'Danger zone' },
  deleteSelectedNode: { ru: 'Удалить выбранную ноду', en: 'Delete selected node' },
  console: { ru: 'Проверка', en: 'Console' },
  graphJson: { ru: 'JSON графа', en: 'Graph JSON' },
  mainGraph: { ru: 'Главный граф', en: 'Main graph' },
  backToParent: { ru: '← К родительскому графу', en: '← Back to parent graph' },
  paletteNote: { ru: 'Универсальные ноды. Нажмите строку, чтобы добавить.', en: 'Universal nodes. Click a row to add one.' },
  graphHelp: { ru: 'Колесо — масштаб · пустое поле — перемещение · порт справа — связь', en: 'Wheel — zoom · empty field — pan · right port — link' },
};

const CATEGORY_LABELS: Readonly<Record<string, TextPair>> = {
  flow: { ru: 'Управление', en: 'Flow' },
  condition: { ru: 'Условия', en: 'Conditions' },
  score: { ru: 'Оценки', en: 'Scores' },
  query: { ru: 'Запросы', en: 'Queries' },
  action: { ru: 'Действия', en: 'Actions' },
  memory: { ru: 'Память', en: 'Memory' },
  subgraph: { ru: 'Подграфы', en: 'Subgraphs' },
  debug: { ru: 'Отладка', en: 'Debug' },
};

export function loadFavoriteNodeTypes(validTypes: ReadonlySet<string>): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PALETTE_FAVORITES_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return new Set();
    const favorites = new Set(
      parsed.filter((value): value is string => typeof value === 'string' && validTypes.has(value)),
    );
    saveFavoriteNodeTypes(favorites);
    return favorites;
  } catch {
    return new Set();
  }
}

export function saveFavoriteNodeTypes(favorites: ReadonlySet<string>): void {
  try {
    localStorage.setItem(PALETTE_FAVORITES_STORAGE_KEY, JSON.stringify([...new Set(favorites)].sort()));
  } catch {
    // Editor preferences must never prevent graph authoring when storage is unavailable.
  }
}

export function getEditorText(key: EditorTextKey, mode: EditorLanguageMode): string {
  return formatPair(TEXT[key], mode);
}

export function getCategoryLabel(category: string, mode: EditorLanguageMode): string {
  const pair = CATEGORY_LABELS[category] ?? { ru: category, en: category };
  return formatPair(pair, mode);
}

function formatPair(pair: TextPair, mode: EditorLanguageMode): string {
  if (mode === 'en') return pair.en;
  if (mode === 'both') return `${pair.ru} / ${pair.en}`;
  return pair.ru;
}
