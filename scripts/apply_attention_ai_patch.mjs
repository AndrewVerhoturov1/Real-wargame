import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content, 'utf8');
}

function replaceOnce(path, before, after) {
  const content = read(path);
  if (!content.includes(before)) throw new Error(`${path}: expected patch anchor not found`);
  if (content.includes(after)) return;
  write(path, content.replace(before, after));
}

function insertBefore(path, anchor, addition, duplicateMarker) {
  const content = read(path);
  if (duplicateMarker && content.includes(duplicateMarker)) return;
  const index = content.indexOf(anchor);
  if (index < 0) throw new Error(`${path}: insertion anchor not found`);
  write(path, `${content.slice(0, index)}${addition}${content.slice(index)}`);
}

insertBefore(
  'src/core/ai/AiNodeTypes.ts',
  "  SayMessage: {\n",
  `  SetAttentionMode: {\n    type: 'SetAttentionMode',\n    category: 'action',\n    label: 'Attention Mode',\n    description: 'Selects march, observation, search, or engagement attention without changing the profile coefficients.',\n    labelRu: 'Режим внимания',\n    descriptionRu: 'Выбирает марш, наблюдение, поиск или стрельбу, не меняя постоянные коэффициенты профиля.',\n    canHaveChildren: true,\n  },\n  SetSearchSector: {\n    type: 'SetSearchSector',\n    category: 'action',\n    label: 'Search Sector',\n    description: 'Starts deliberate visual search inside a selected direction and angular width.',\n    labelRu: 'Сектор поиска',\n    descriptionRu: 'Запускает осмысленный поиск цели в заданном направлении и угловом секторе.',\n    canHaveChildren: true,\n  },\n  ClearAttentionOverride: {\n    type: 'ClearAttentionOverride',\n    category: 'action',\n    label: 'Automatic Attention',\n    description: 'Returns attention control to automatic simulation rules.',\n    labelRu: 'Автоматическое внимание',\n    descriptionRu: 'Возвращает управление вниманием автоматическим правилам симуляции.',\n    canHaveChildren: true,\n  },\n`,
  "  SetAttentionMode: {\n",
);

insertBefore(
  'src/core/ai/AiGraphRunner.ts',
  "  | {\n      readonly type: 'say_message';\n",
  `  | {\n      readonly type: 'set_attention_mode';\n      readonly mode: 'march' | 'observe' | 'search' | 'engage';\n      readonly reason: string;\n      readonly reasonRu?: string;\n    }\n  | {\n      readonly type: 'set_search_sector';\n      readonly centerDegrees: number;\n      readonly arcDegrees: number;\n      readonly reason: string;\n      readonly reasonRu?: string;\n    }\n  | {\n      readonly type: 'clear_attention_override';\n      readonly reason: string;\n      readonly reasonRu?: string;\n    }\n`,
  "readonly type: 'set_attention_mode'",
);

insertBefore(
  'src/core/ai/AiGraphRunner.ts',
  "    case 'SayMessage':\n",
  `    case 'SetAttentionMode': {\n      const rawMode = readString(parameters.mode, 'observe');\n      const mode = rawMode === 'march' || rawMode === 'search' || rawMode === 'engage' ? rawMode : 'observe';\n      context.effects.push({\n        type: 'set_attention_mode',\n        mode,\n        reason: readString(parameters.reason, \`AI graph attention mode: \${mode}.\`),\n        reasonRu: readOptionalString(parameters.reasonRu) ?? \`AI-граф выбрал режим внимания: \${mode}.\`,\n      });\n      return true;\n    }\n    case 'SetSearchSector': {\n      const rawCenter = readNumber(parameters.centerDegrees, 0);\n      const centerDegrees = ((rawCenter % 360) + 360) % 360;\n      const arcDegrees = clampNumber(readNumber(parameters.arcDegrees, 120), 1, 360);\n      context.effects.push({\n        type: 'set_search_sector',\n        centerDegrees,\n        arcDegrees,\n        reason: readString(parameters.reason, 'AI graph selected a search sector.'),\n        reasonRu: readOptionalString(parameters.reasonRu) ?? 'AI-граф задал сектор поиска.',\n      });\n      return true;\n    }\n    case 'ClearAttentionOverride':\n      context.effects.push({\n        type: 'clear_attention_override',\n        reason: readString(parameters.reason, 'AI graph returned attention to automatic control.'),\n        reasonRu: readOptionalString(parameters.reasonRu) ?? 'AI-граф вернул автоматическое управление вниманием.',\n      });\n      return true;\n`,
  "case 'SetAttentionMode'",
);

replaceOnce(
  'src/core/ai/AiGameBridge.ts',
  "import { radiansToDegrees } from '../perception/AttentionModel';\n",
  "import { clearAttentionOverride, setAttentionMode, setFocusTarget, setSearchSector } from '../perception/AttentionController';\nimport { degreesToRadians, radiansToDegrees } from '../perception/AttentionModel';\n",
);

insertBefore(
  'src/core/ai/AiGameBridge.ts',
  "    if (effect.type === 'set_movement_mode') {\n",
  `    if (effect.type === 'set_attention_mode') {\n      setAttentionMode(unit, effect.mode, 'ai');\n      unit.behaviorRuntime.reason = effect.reasonRu ?? effect.reason;\n      unit.behaviorRuntime.lastEvent = 'ai_graph_set_attention_mode';\n      continue;\n    }\n\n    if (effect.type === 'set_search_sector') {\n      setSearchSector(unit, degreesToRadians(effect.centerDegrees), degreesToRadians(effect.arcDegrees), 'ai');\n      unit.behaviorRuntime.reason = effect.reasonRu ?? effect.reason;\n      unit.behaviorRuntime.lastEvent = 'ai_graph_set_search_sector';\n      continue;\n    }\n\n    if (effect.type === 'clear_attention_override') {\n      clearAttentionOverride(unit);\n      unit.behaviorRuntime.reason = effect.reasonRu ?? effect.reason;\n      unit.behaviorRuntime.lastEvent = 'ai_graph_clear_attention_override';\n      continue;\n    }\n\n`,
  "ai_graph_set_attention_mode",
);

replaceOnce(
  'src/core/ai/AiGameBridge.ts',
  "    best_contact_uncertainty: bestContact?.uncertaintyCells ?? 0,\n",
  "    best_contact_uncertainty: Math.round((bestContact?.uncertaintyCells ?? 0) * state.map.metersPerCell),\n",
);

replaceOnce(
  'src/core/ai/AiGameBridge.ts',
  `      durationSeconds: effect.action === 'suppress' ? 1.2 : 0.7,\n    });\n  }\n\n  unit.behaviorRuntime.currentAction = effect.action;\n`,
  `      durationSeconds: effect.action === 'suppress' ? 1.2 : 0.7,\n    });\n    const focusTarget = readPosition(blackboard.current_target) ?? readPosition(blackboard.remembered_enemy_position);\n    if (focusTarget) {\n      setFocusTarget(unit, 'current_target', Math.atan2(focusTarget.y - unit.position.y, focusTarget.x - unit.position.x));\n      setAttentionMode(unit, 'engage', 'automatic');\n    }\n  }\n\n  unit.behaviorRuntime.currentAction = effect.action;\n`,
);

replaceOnce(
  'src/core/ai/AiGraphValidation.ts',
  "    validateNodeParameters(nodeValue.parameters, issues, id);\n",
  "    validateNodeParameters(nodeValue.parameters, issues, id);\n    validateKnownNodeParameters(nodeValue, issues, id);\n",
);

insertBefore(
  'src/core/ai/AiGraphValidation.ts',
  "function validateBlackboardDefaults(defaultsValue: unknown, issues: AiGraphValidationIssue[]): void {\n",
  `function validateKnownNodeParameters(node: UnknownRecord, issues: AiGraphValidationIssue[], nodeId: string): void {\n  const parameters = isRecord(node.parameters) ? node.parameters : {};\n  if (node.type === 'SetAttentionMode') {\n    const mode = parameters.mode;\n    if (mode !== 'march' && mode !== 'observe' && mode !== 'search' && mode !== 'engage') {\n      issues.push(errorIssue('ATTENTION_MODE_INVALID', \`Node \${nodeId} must use march, observe, search, or engage.\`, \`Нода \${nodeId} должна использовать режим march, observe, search или engage.\`, nodeId));\n    }\n  }\n  if (node.type === 'SetSearchSector') {\n    if (typeof parameters.centerDegrees !== 'number' || !Number.isFinite(parameters.centerDegrees)) {\n      issues.push(errorIssue('SEARCH_CENTER_INVALID', \`Node \${nodeId} must have numeric centerDegrees.\`, \`У ноды \${nodeId} должен быть числовой centerDegrees.\`, nodeId));\n    }\n    if (typeof parameters.arcDegrees !== 'number' || parameters.arcDegrees < 1 || parameters.arcDegrees > 360) {\n      issues.push(errorIssue('SEARCH_ARC_INVALID', \`Node \${nodeId} arcDegrees must be from 1 to 360.\`, \`У ноды \${nodeId} arcDegrees должен быть от 1 до 360.\`, nodeId));\n    }\n  }\n}\n\n`,
  'function validateKnownNodeParameters',
);

replaceOnce(
  'src/core/ai/AiConceptValues.ts',
  "  value({ key:'enemyVisible', label:'Enemy visible', ru:'Враг виден', description:'Whether an active threat source is considered directly visible.', descriptionRu:'Считается ли активный источник угрозы прямо видимым.', type:'boolean', category:'perception', readiness:'simplified', limitation:'Uses sourceVisible on threat zones, not full enemy-unit detection.', limitationRu:'Использует sourceVisible у зоны угрозы, а не полное обнаружение вражеского юнита.', source:'ThreatEvaluation', sourceRu:'Текущая оценка угроз', defaultValue:false, mapFocus:'threat', nodes:'flag' }),\n",
  "  value({ key:'enemyVisible', label:'Enemy visible', ru:'Враг виден', description:'Whether the best subjective contact is visually identified right now.', descriptionRu:'Опознан ли лучший субъективный контакт зрительно прямо сейчас.', type:'boolean', category:'perception', source:'Perception knowledge', sourceRu:'Личное восприятие бойца', defaultValue:false, mapFocus:'threat', nodes:'flag' }),\n",
);

replaceOnce(
  'src/core/ai/AiConceptValues.ts',
  "  value({ key:'enemyKnown', label:'Enemy known', ru:'Враг известен', description:'Whether an active threat source is known or visible.', descriptionRu:'Известен ли активный источник угрозы или виден ли он.', type:'boolean', category:'perception', readiness:'simplified', limitation:'Represents current threat evaluation, not the complete long-term memory.', limitationRu:'Отражает текущую оценку угрозы, а не всю долговременную память.', source:'ThreatEvaluation', sourceRu:'Текущая оценка угроз', defaultValue:false, mapFocus:'memory', nodes:'flag' }),\n",
  "  value({ key:'enemyKnown', label:'Enemy known', ru:'Враг известен', description:'Whether the soldier has a subjective visual, sound, reported, or fire-pressure contact.', descriptionRu:'Есть ли у бойца субъективный зрительный, звуковой, переданный или понятый по обстрелу контакт.', type:'boolean', category:'perception', source:'Perception knowledge', sourceRu:'Личная память контактов бойца', defaultValue:false, mapFocus:'memory', nodes:'flag' }),\n",
);

insertBefore(
  'src/core/ai/AiConceptValues.ts',
  "  value({ key:'current_action',",
  `  value({ key:'attention_mode', label:'Attention mode', ru:'Режим внимания', description:'Current march, observation, search, or engagement attention mode.', descriptionRu:'Текущий режим внимания: марш, наблюдение, поиск цели или стрельба.', type:'text', category:'perception', source:'Attention runtime', sourceRu:'Текущее управление вниманием', defaultValue:'observe' }),\n  value({ key:'attention_focus_direction', label:'Attention focus direction', ru:'Направление фокуса внимания', description:'Current direction of the narrow attention focus.', descriptionRu:'Текущее направление узкого фокуса внимания.', type:'degrees', category:'perception', source:'Attention runtime', sourceRu:'Текущее управление вниманием', defaultValue:0, minimum:0, maximum:360, mapFocus:'unit', nodes:'numeric' }),\n  value({ key:'best_contact_stage', label:'Best contact stage', ru:'Стадия лучшего контакта', description:'Cue, suspicion, contact, identified, or confirmed stage of the best subjective contact.', descriptionRu:'Стадия лучшего субъективного контакта: признак, подозрение, контакт, опознано или подтверждено.', type:'text', category:'perception', source:'Perception knowledge', sourceRu:'Личная память контактов бойца', defaultValue:'none' }),\n  value({ key:'best_contact_confidence', label:'Best contact confidence', ru:'Уверенность в лучшем контакте', description:'Confidence in the best subjective contact.', descriptionRu:'Уверенность бойца в лучшем субъективном контакте.', type:'percent', category:'perception', source:'Perception knowledge', sourceRu:'Личная память контактов бойца', defaultValue:0, minimum:0, maximum:100, mapFocus:'memory', nodes:'numeric' }),\n  value({ key:'best_contact_uncertainty', label:'Best contact uncertainty', ru:'Неточность лучшего контакта', description:'Estimated positional uncertainty of the best contact in meters.', descriptionRu:'Оценочная неточность положения лучшего контакта в метрах.', type:'meters', category:'perception', source:'Perception knowledge', sourceRu:'Личная память контактов бойца', defaultValue:0, minimum:0, mapFocus:'memory', nodes:'numeric' }),\n  value({ key:'contact_visible_now', label:'Contact visible now', ru:'Контакт виден сейчас', description:'Whether the best contact is visually identified at this moment.', descriptionRu:'Опознан ли лучший контакт зрительно в данный момент.', type:'boolean', category:'perception', source:'Perception knowledge', sourceRu:'Личное восприятие бойца', defaultValue:false, mapFocus:'threat', nodes:'flag' }),\n  value({ key:'suspected_enemy_position', label:'Suspected enemy position', ru:'Предполагаемая позиция врага', description:'Last known or estimated position of the best subjective contact.', descriptionRu:'Последняя известная или предполагаемая позиция лучшего субъективного контакта.', type:'position', category:'perception', source:'Perception knowledge', sourceRu:'Личная память контактов бойца', defaultValue:null, mapFocus:'memory' }),\n`,
  "key:'attention_mode'",
);

insertBefore(
  'src/core/ai/AiConceptOperations.ts',
  "  operation({key:'continue_order'",
  `  { key:'set_attention_mode', kind:'action', category:'action', label:'Set attention mode', labelRu:'Выбрать режим внимания', description:'Selects a named attention mode without changing profile coefficients.', descriptionRu:'Выбирает режим внимания, не меняя постоянные коэффициенты профиля.', readiness:'ready', readinessExplanation:'Connected to the selected-soldier attention controller.', readinessExplanationRu:'Подключено к контроллеру внимания выбранного бойца.', source:'Graph effect', sourceRu:'Действие графа', mapFocus:'unit', nodeTemplates:[{ nodeType:'SetAttentionMode', label:'Create attention mode action', labelRu:'Создать выбор режима внимания', parameters:{ mode:'observe', reasonRu:'Переключить режим внимания.', cooldownSeconds:0, cooldownTiming:'after' } }] },\n  { key:'set_search_sector', kind:'action', category:'action', label:'Set search sector', labelRu:'Задать сектор поиска', description:'Starts deliberate visual search inside a selected sector.', descriptionRu:'Запускает осмысленный зрительный поиск внутри заданного сектора.', readiness:'ready', readinessExplanation:'Connected to the selected-soldier attention controller.', readinessExplanationRu:'Подключено к контроллеру внимания выбранного бойца.', source:'Graph effect', sourceRu:'Действие графа', mapFocus:'unit', nodeTemplates:[{ nodeType:'SetSearchSector', label:'Create search sector action', labelRu:'Создать сектор поиска', parameters:{ centerDegrees:0, arcDegrees:120, reasonRu:'Осмотреть указанный сектор.', cooldownSeconds:0, cooldownTiming:'after' } }] },\n  { key:'clear_attention_override', kind:'action', category:'action', label:'Return automatic attention', labelRu:'Вернуть автоматическое внимание', description:'Returns attention mode selection to automatic simulation rules.', descriptionRu:'Возвращает выбор режима внимания автоматическим правилам симуляции.', readiness:'ready', readinessExplanation:'Connected to the selected-soldier attention controller.', readinessExplanationRu:'Подключено к контроллеру внимания выбранного бойца.', source:'Graph effect', sourceRu:'Действие графа', mapFocus:'unit', nodeTemplates:[{ nodeType:'ClearAttentionOverride', label:'Create automatic attention action', labelRu:'Создать возврат автоматического внимания', parameters:{ cooldownSeconds:0, cooldownTiming:'after' } }] },\n`,
  "key:'set_attention_mode'",
);

insertBefore(
  'src/ai-node-editor/main.ts',
  "    case 'SayMessage': return { ...common, message: 'Under fire!', messageRu: 'Под огнём!', durationSeconds: 2 };\n",
  `    case 'SetAttentionMode': return { ...common, mode: 'observe', reasonRu: 'Переключить режим внимания.' };\n    case 'SetSearchSector': return { ...common, centerDegrees: 0, arcDegrees: 120, reasonRu: 'Осмотреть указанный сектор.' };\n    case 'ClearAttentionOverride': return common;\n`,
  "case 'SetAttentionMode': return",
);

console.log('Attention AI patch applied.');
