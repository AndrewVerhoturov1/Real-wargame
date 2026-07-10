import fs from 'node:fs';

// Triggered after the append workflow exists on the preview branch.
const path = 'docs/subprojects/ai-single-unit-editor/HANDOFF.md';
let content = fs.readFileSync(path, 'utf8');
const marker = '## Единый игровой редактор сцены Stage 6';
if (!content.includes(marker)) {
  content += `

${marker}

Встроенный редактор карты больше не устанавливает старые разрозненные панели \`EditorControls\` и \`TerrainBrushControls\`. Текущий вход:

\`\`\`text
src/main.ts
  → installGameEditorWorkbench(...)
  → вкладки Предмет / Боец / Угроза / Рельеф / Сцена
\`\`\`

Главные файлы:

\`\`\`text
src/core/editor/GameEditorDrafts.ts
src/core/editor/GameEditorPlacement.ts
src/ui/GameEditorWorkbench.ts
src/game-editor.css
scripts/game_editor_smoke.mjs
docs/manual-test/GAME_EDITOR_WORKBENCH_STAGE_6.md
\`\`\`

Рабочий цикл редактора:

\`\`\`text
настроить шаблон будущего экземпляра
→ включить «Ставить предмет / бойца / угрозу» или кисть
→ кликнуть по карте
→ перейти к выбору
→ выбрать экземпляр
→ «Взять параметры выбранного»
→ изменить значения
→ «Применить к выбранному»
\`\`\`

Шаблон предмета хранит размеры, поворот, физическую высоту, защиту, маскировку, простреливаемость и допустимую позу. Шаблон бойца хранит профиль, скорость, обзор, позу, боезапас, стресс/подавление, черты и состояние. Шаблон угрозы хранит обычную область или направленный огонь со всеми параметрами сектора. Рельеф поддерживает круглую и квадратную кисть для высоты и леса.

Слой сохранения/загрузки и отчёт производительности используют постоянный \`.editor-scene-tools-slot\`, который показывается только во вкладке \`Сцена\`.

Старые исходные файлы редактора пока остаются в репозитории для истории и совместимости, но из \`main.ts\` не устанавливаются. Не возвращать их параллельную установку.

Проверки:

\`\`\`text
npm run game-editor:smoke
npm run lab:smoke
npm run editor:smoke
npm run engine:smoke
npm run validate:ai-graph
npm run build
\`\`\`

Визуальная проверка остаётся ручной: запустить \`Run-Real-Wargame-Lab.bat\`, открыть режим редактора и пройти \`docs/manual-test/GAME_EDITOR_WORKBENCH_STAGE_6.md\`.
`;
  fs.writeFileSync(path, content, 'utf8');
}
