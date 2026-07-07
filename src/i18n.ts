export type Locale = 'en' | 'ru';

export interface StaticCopy {
  title: string;
  primaryInstruction: string;
  cameraInstruction: string;
  newFeatures: string;
}

export interface DebugCopy {
  mouseCell: string;
  selected: string;
  moveTarget: string;
  facing: string;
  zoom: string;
  map: string;
  none: string;
  outsideMap: string;
  noCombatScope: string;
  htmlLabels: string;
  languageToggle: string;
  languageToggleAria: string;
}

export interface GameCopy {
  static: StaticCopy;
  debug: DebugCopy;
}

export const UI_COPY: Record<Locale, GameCopy> = {
  en: {
    static: {
      title: 'Tactical Board Prototype v0.2',
      primaryInstruction: 'Left click a counter to select it. Right click the map to issue a move order.',
      cameraInstruction: 'Mouse wheel zooms. Middle mouse or Space + left drag pans.',
      newFeatures: 'Large map, crisp HTML labels, map objects, weapons and view cones are enabled.',
    },
    debug: {
      mouseCell: 'Mouse cell',
      selected: 'Selected',
      moveTarget: 'Move target',
      facing: 'Facing',
      zoom: 'Zoom',
      map: 'Map',
      none: 'none',
      outsideMap: 'outside map',
      noCombatScope: 'Scope: no combat, no AI, no pathfinding.',
      htmlLabels: 'Labels are rendered as HTML, not Pixi text textures.',
      languageToggle: 'Русский',
      languageToggleAria: 'Switch language to Russian',
    },
  },
  ru: {
    static: {
      title: 'Тактическая карта — прототип v0.2',
      primaryInstruction: 'Левый клик выбирает подразделение. Правый клик по карте отдаёт приказ движения.',
      cameraInstruction: 'Колесо мыши меняет масштаб. Средняя кнопка или Space + левое перетаскивание двигают карту.',
      newFeatures: 'Включены большая карта, чёткие HTML-подписи, объекты, оружие и сектора обзора.',
    },
    debug: {
      mouseCell: 'Клетка мыши',
      selected: 'Выбрано',
      moveTarget: 'Цель движения',
      facing: 'Направление взгляда',
      zoom: 'Масштаб',
      map: 'Карта',
      none: 'нет',
      outsideMap: 'вне карты',
      noCombatScope: 'Граница: без боя, без ИИ, без поиска пути.',
      htmlLabels: 'Подписи выводятся HTML-слоем, не Pixi-текстурами.',
      languageToggle: 'English',
      languageToggleAria: 'Переключить язык на английский',
    },
  },
};

export function nextLocale(locale: Locale): Locale {
  return locale === 'en' ? 'ru' : 'en';
}

export function formatDegrees(radians: number): string {
  const degrees = Math.round((radians * 180) / Math.PI);
  return `${degrees}°`;
}
