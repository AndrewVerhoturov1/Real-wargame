import { readFile, writeFile } from 'node:fs/promises';

const read = (file) => readFile(file, 'utf8');
const write = (file, content) => writeFile(file, content, 'utf8');
function replaceOnce(content, search, replacement, file) {
  const index = content.indexOf(search);
  if (index < 0) throw new Error(`Missing patch marker in ${file}: ${search.slice(0, 100)}`);
  if (content.indexOf(search, index + search.length) >= 0) throw new Error(`Ambiguous patch marker in ${file}`);
  return content.slice(0, index) + replacement + content.slice(index + search.length);
}
function insertBefore(content, marker, insertion, file) {
  return replaceOnce(content, marker, insertion + marker, file);
}

const queryContracts = `contract({type:'CreateCoverCandidates',category:'query',label:'Create Cover Candidates',labelRu:'Создать кандидаты укрытий',description:'Generates cover candidates without choosing a winner.',descriptionRu:'Создаёт кандидатов укрытий, не выбирая победителя.',childPolicy:'none',outputs:[port('query','tacticalQuery','Tactical query','Тактический запрос')],parameters:[requiredParameter('queryKey','string','Query key','Ключ запроса','cover_query'),requiredParameter('maxCandidates','number','Maximum candidates','Максимум кандидатов',24,{minimum:1,maximum:256,integer:true}),requiredParameter('searchRadiusMeters','number','Search radius','Радиус поиска',50,{minimum:0}),requiredParameter('maxCalculationMs','number','Calculation budget','Максимальное время расчёта',12,{minimum:0})]}),
contract({type:'FilterTacticalPositions',category:'query',label:'Filter Tactical Positions',labelRu:'Фильтр тактических позиций',description:'Applies explicit hard filters to generated positions.',descriptionRu:'Применяет явные жёсткие фильтры к созданным позициям.',childPolicy:'none',inputs:[port('query','tacticalQuery','Tactical query','Тактический запрос')],outputs:[port('query','tacticalQuery','Filtered query','Отфильтрованный запрос')],parameters:[requiredParameter('queryKey','string','Query key','Ключ запроса','cover_query'),requiredParameter('requireOnMap','boolean','Require map position','Позиция должна быть на карте',true),requiredParameter('requireRoute','boolean','Require route','Требовать маршрут',true),requiredParameter('minimumDistanceMeters','number','Minimum distance','Минимальная дистанция',0,{minimum:0}),requiredParameter('maximumDistanceMeters','number','Maximum distance','Максимальная дистанция',50,{minimum:0}),requiredParameter('requireDirectionalCover','boolean','Require directional protection','Требовать защиту от направления угрозы',true),requiredParameter('maxRouteDanger','number','Maximum route danger','Максимальная опасность маршрута',100,{minimum:0,maximum:100})]}),
contract({type:'ScoreTacticalPositions',category:'query',label:'Score Positions',labelRu:'Оценить позиции',description:'Calculates editable soft score components for every eligible position.',descriptionRu:'Считает редактируемые мягкие оценки для каждой допустимой позиции.',childPolicy:'none',inputs:[port('query','tacticalQuery','Filtered query','Отфильтрованный запрос')],outputs:[port('query','tacticalQuery','Scored query','Оценённый запрос')],parameters:[requiredParameter('queryKey','string','Query key','Ключ запроса','cover_query'),requiredParameter('protectionWeight','number','Protection weight','Вес защиты',1,{minimum:0}),requiredParameter('concealmentWeight','number','Concealment weight','Вес маскировки',.35,{minimum:0}),requiredParameter('distanceWeight','number','Distance weight','Вес расстояния',.4,{minimum:0}),requiredParameter('routeDangerWeight','number','Route danger weight','Вес опасности маршрута',.8,{minimum:0}),requiredParameter('slopeWeight','number','Slope weight','Вес прямого или обратного склона',.45,{minimum:0}),requiredParameter('orderAlignmentWeight','number','Order alignment weight','Вес соответствия приказу',.35,{minimum:0})]}),
contract({type:'SelectBestTacticalPosition',category:'query',label:'Select Best Position',labelRu:'Выбрать лучшую позицию',description:'Selects the highest scored eligible position and explicitly writes it to memory.',descriptionRu:'Выбирает допустимую позицию с лучшей оценкой и явно записывает её в память.',childPolicy:'none',inputs:[port('query','tacticalQuery','Scored query','Оценённый запрос')],outputs:[port('position','position','Winner position','Позиция победителя',false,true)],parameters:[requiredParameter('queryKey','string','Query key','Ключ запроса','cover_query'),requiredParameter('writeTo','string','Write winner to','Записать победителя в','best_cover_position')]}),
`;

const runnerFunctions = `function applyCreateCoverCandidates(context: ExecutionContext, parameters: Record<string, AiBlackboardValue>): boolean {
  const queryKey = readString(parameters.queryKey, 'cover_query');
  const budget = { maxCandidates: Math.max(1, Math.floor(readNumber(parameters.maxCandidates, 24))), searchRadiusMeters: Math.max(0, readNumber(parameters.searchRadiusMeters, 50)), maxCalculationMs: Math.max(0, readNumber(parameters.maxCalculationMs, 12)) };
  const generation = context.tacticalHost?.generateCoverCandidates?.({ unitId: context.unitId, blackboard: context.blackboard, ...budget }) ?? { candidates: [], elapsedMs: 0, stopReason: { code: 'host_unavailable' as const, reason: 'The tactical candidate host is unavailable.', reasonRu: 'Источник тактических кандидатов недоступен.' } };
  context.tacticalQueries[queryKey] = createTacticalQuery(queryKey, budget, generation);
  return true;
}
function applyFilterTacticalPositions(context: ExecutionContext, parameters: Record<string, AiBlackboardValue>): boolean {
  const queryKey = readString(parameters.queryKey, 'cover_query'); const query = context.tacticalQueries[queryKey]; if (!query) return false;
  context.tacticalQueries[queryKey] = filterTacticalQuery(query, { requireOnMap: readBoolean(parameters.requireOnMap, true), requireRoute: readBoolean(parameters.requireRoute, true), minimumDistanceMeters: Math.max(0, readNumber(parameters.minimumDistanceMeters, 0)), maximumDistanceMeters: Math.max(0, readNumber(parameters.maximumDistanceMeters, query.budget.searchRadiusMeters)), requireDirectionalCover: readBoolean(parameters.requireDirectionalCover, true), maxRouteDanger: clampNumber(readNumber(parameters.maxRouteDanger, 100), 0, 100) });
  return true;
}
function applyScoreTacticalPositions(context: ExecutionContext, parameters: Record<string, AiBlackboardValue>): boolean {
  const queryKey = readString(parameters.queryKey, 'cover_query'); const query = context.tacticalQueries[queryKey]; if (!query) return false;
  context.tacticalQueries[queryKey] = scoreTacticalQuery(query, { protection: Math.max(0, readNumber(parameters.protectionWeight, 1)), concealment: Math.max(0, readNumber(parameters.concealmentWeight, .35)), distance: Math.max(0, readNumber(parameters.distanceWeight, .4)), routeDanger: Math.max(0, readNumber(parameters.routeDangerWeight, .8)), slope: Math.max(0, readNumber(parameters.slopeWeight, .45)), orderAlignment: Math.max(0, readNumber(parameters.orderAlignmentWeight, .35)) });
  return true;
}
function applySelectBestTacticalPosition(context: ExecutionContext, parameters: Record<string, AiBlackboardValue>): boolean {
  const queryKey = readString(parameters.queryKey, 'cover_query'); const query = context.tacticalQueries[queryKey]; if (!query) return false;
  const selection = selectBestTacticalPosition(query); context.tacticalQueries[queryKey] = selection.query; if (!selection.winner) return false;
  writeMemory(context, readString(parameters.writeTo, 'best_cover_position'), { ...selection.winner.position }); return true;
}

`;

{
  const file = 'src/core/ai/contracts/AiNodeContractRegistry.ts'; let content = await read(file);
  content = insertBefore(content, "contract({type:'FindBestObject'", queryContracts, file);
  content = content.replace("description:'Finds tactical object.',descriptionRu:'Ищет тактический объект.'", "description:'Legacy non-cover object lookup. Cover selection uses the explicit tactical query pipeline.',descriptionRu:'Старый поиск объектов без укрытий. Укрытия выбираются явным конвейером тактического запроса.'");
  await write(file, content);
}

{
  const file = 'src/core/ai/AiGraphRunner.ts'; let content = await read(file);
  content = replaceOnce(content, "import type { AiBranchScore, AiGraph, AiNode, AiNodeId, ScoreBreakdownItem } from './AiGraph';\n", "import type { AiBranchScore, AiGraph, AiNode, AiNodeId, ScoreBreakdownItem } from './AiGraph';\nimport { cloneTacticalQueries, createTacticalQuery, filterTacticalQuery, scoreTacticalQuery, selectBestTacticalPosition, type TacticalQuery, type TacticalQueryGenerationRequest, type TacticalQueryGenerationResult } from './tactical/TacticalQuery';\n", file);
  content = replaceOnce(content, "  readonly tacticalCheck?: (checkKind: string, blackboard: AiGraphRunnerBlackboard) => boolean;\n}", "  readonly generateCoverCandidates?: (request: TacticalQueryGenerationRequest) => TacticalQueryGenerationResult;\n  readonly tacticalCheck?: (checkKind: string, blackboard: AiGraphRunnerBlackboard) => boolean;\n}", file);
  content = replaceOnce(content, "  readonly scores: readonly AiBranchScore[];\n  readonly effects: readonly AiGraphEffect[];", "  readonly scores: readonly AiBranchScore[];\n  readonly tacticalQueries: Readonly<Record<string, TacticalQuery>>;\n  readonly effects: readonly AiGraphEffect[];", file);
  content = replaceOnce(content, "  scores: AiBranchScore[];\n  trace: AiGraphTraceItem[];", "  scores: AiBranchScore[];\n  tacticalQueries: Record<string, TacticalQuery>;\n  trace: AiGraphTraceItem[];", file);
  content = replaceOnce(content, "  readonly trace: readonly AiGraphTraceItem[];\n  readonly selectedBranch: AiNode;", "  readonly trace: readonly AiGraphTraceItem[];\n  readonly tacticalQueries: Readonly<Record<string, TacticalQuery>>;\n  readonly selectedBranch: AiNode;", file);
  content = replaceOnce(content, "    effects: [],\n    scores: [],\n    trace: [],", "    effects: [],\n    scores: [],\n    tacticalQueries: {},\n    trace: [],", file);
  content = replaceOnce(content, "  context.cooldowns = { ...winner.cooldowns };\n  context.trace.push(...winner.trace);", "  context.cooldowns = { ...winner.cooldowns };\n  context.tacticalQueries = cloneTacticalQueries(winner.tacticalQueries);\n  context.trace.push(...winner.trace);", file);
  content = replaceOnce(content, "    scores: [],\n    trace: [],\n    score: 0,", "    scores: [],\n    tacticalQueries: cloneTacticalQueries(parent.tacticalQueries),\n    trace: [],\n    score: 0,", file);
  content = replaceOnce(content, "    trace: context.trace,\n    selectedBranch: branchNode,", "    trace: context.trace,\n    tacticalQueries: cloneTacticalQueries(context.tacticalQueries),\n    selectedBranch: branchNode,", file);
  content = replaceOnce(content, "    case 'TacticalCheck':\n      return evaluateTacticalCheck(context, parameters) === readBoolean(parameters.expected, true);\n    case 'FindBestObject':\n      applyFindBestObject(context, parameters);\n      return true;", "    case 'TacticalCheck':\n      return evaluateTacticalCheck(context, parameters) === readBoolean(parameters.expected, true);\n    case 'CreateCoverCandidates': return applyCreateCoverCandidates(context, parameters);\n    case 'FilterTacticalPositions': return applyFilterTacticalPositions(context, parameters);\n    case 'ScoreTacticalPositions': return applyScoreTacticalPositions(context, parameters);\n    case 'SelectBestTacticalPosition': return applySelectBestTacticalPosition(context, parameters);\n    case 'FindBestObject':\n      if (readString(parameters.objectKind, 'cover') === 'cover') { pushTrace(context, node, 'fail', 'Legacy cover lookup is disabled. Use the Tactical Query System nodes.', 'Старый скрытый поиск укрытия отключён. Используйте ноды Tactical Query System.'); return false; }\n      applyFindBestObject(context, parameters);\n      return true;", file);
  content = insertBefore(content, "function applyFindBestObject(context: ExecutionContext, parameters: Record<string, AiBlackboardValue>): void {", runnerFunctions, file);
  content = content.replace("    if (objectKind === 'cover') writeMemory(context, 'best_cover_position', normalizeBlackboardValue(found));\n", '');
  content = replaceOnce(content, "    scores: context.scores,\n    effects: context.effects,", "    scores: context.scores,\n    tacticalQueries: cloneTacticalQueries(context.tacticalQueries),\n    effects: context.effects,", file);
  await write(file, content);
}

{
  const file = 'src/core/ai/AiGraphRuntime.ts'; let content = await read(file);
  content = replaceOnce(content, "  scores: AiGraphRunnerResult['scores'];\n}", "  scores: AiGraphRunnerResult['scores'];\n  tacticalQueries: AiGraphRunnerResult['tacticalQueries'];\n}", file);
  content = replaceOnce(content, "    trace: runtimeTrace(selection?.trace ?? []),\n    scores: selection?.scores ?? [],", "    trace: runtimeTrace(selection?.trace ?? []),\n    scores: selection?.scores ?? [],\n    tacticalQueries: selection?.tacticalQueries ?? {},", file);
  content = replaceOnce(content, "    accumulator.scores = [...accumulator.scores, ...instant.scores];", "    accumulator.scores = [...accumulator.scores, ...instant.scores];\n    accumulator.tacticalQueries = instant.tacticalQueries;", file);
  content = replaceOnce(content, "    scores: accumulator.scores,\n    effects: accumulator.effects,", "    scores: accumulator.scores,\n    tacticalQueries: accumulator.tacticalQueries,\n    effects: accumulator.effects,", file);
  content = replaceOnce(content, "    scores: [],\n    effects: extra.effects ?? [],", "    scores: [],\n    tacticalQueries: {},\n    effects: extra.effects ?? [],", file);
  await write(file, content);
}

{
  const file = 'src/core/ai/AiGameBridge.ts'; let content = await read(file);
  content = replaceOnce(content, "import { findBestCoverForThreat } from '../cover/CoverEvaluation';", "import { generateCoverTacticalCandidates } from '../cover/CoverTacticalCandidates';", file);
  content = replaceOnce(content, "    findBestObject: (objectKind, _criteria, searchRadiusMeters) => {\n      if (objectKind !== 'cover') return null;\n      const threats = evaluateThreatsAtPosition(state.map, unit, state.pressureZones);\n      return findBestCoverForThreat(\n        state.map,\n        unit.position,\n        threats.targetPosition,\n        unit.behaviorRuntime.posture,\n        searchRadiusMeters / state.map.metersPerCell,\n      ).position;\n    },", "    generateCoverCandidates: (request) => {\n      const threats = evaluateThreatsAtPosition(state.map, unit, state.pressureZones);\n      return generateCoverTacticalCandidates({ map: state.map, unit, threatPosition: threats.targetPosition, orderTarget: unit.order?.target ?? null, searchRadiusMeters: request.searchRadiusMeters, maxCandidates: request.maxCandidates, maxCalculationMs: request.maxCalculationMs });\n    },", file);
  content = replaceOnce(content, "    const payload = {\n      version: 1,", "    const tacticalQueries = readTacticalQueryDebugSnapshot(unit.id, graph.id, result.tacticalQueries);\n    const payload = {\n      version: 1,", file);
  content = replaceOnce(content, "      scores: result.scores,\n      effects: result.effects,", "      scores: result.scores,\n      tacticalQueries,\n      effects: result.effects,", file);
  content = insertBefore(content, "function publishStatePlanDebug(", `function readTacticalQueryDebugSnapshot(unitId: string, graphId: string, current: AiGraphRuntimeResult['tacticalQueries']): AiGraphRuntimeResult['tacticalQueries'] {
  if (Object.keys(current).length > 0) return current;
  try { const raw = window.localStorage.getItem(DEBUG_STORAGE_KEY); if (!raw) return {}; const previous = JSON.parse(raw) as { unitId?: unknown; graphId?: unknown; tacticalQueries?: unknown }; if (previous.unitId !== unitId || previous.graphId !== graphId || !previous.tacticalQueries || typeof previous.tacticalQueries !== 'object') return {}; return previous.tacticalQueries as AiGraphRuntimeResult['tacticalQueries']; } catch { return {}; }
}

`, file);
  await write(file, content);
}

{
  const file = 'src/ai-node-editor/runtime-debug-overlay.ts'; let content = await read(file);
  content = insertBefore(content, 'interface RuntimeReactiveAbort {', `interface RuntimeTacticalCandidate { readonly id: string; readonly position: { readonly x: number; readonly y: number }; readonly source: { readonly label: string; readonly labelRu: string }; readonly totalScore: number; readonly excluded: boolean; readonly exclusionReasons: readonly { readonly reason: string; readonly reasonRu: string }[]; readonly scoreBreakdown: Readonly<Record<string, number>>; }
interface RuntimeTacticalQuery { readonly id: string; readonly kind: string; readonly status: string; readonly budget: { readonly maxCandidates: number; readonly searchRadiusMeters: number; readonly maxCalculationMs: number }; readonly candidates: readonly RuntimeTacticalCandidate[]; readonly elapsedMs: number; readonly stopReason?: { readonly reason: string; readonly reasonRu: string }; readonly winnerCandidateId?: string; }

`, file);
  content = replaceOnce(content, "  readonly scores: readonly RuntimeBranchScore[];\n  readonly effects: readonly unknown[];", "  readonly scores: readonly RuntimeBranchScore[];\n  readonly tacticalQueries?: Readonly<Record<string, RuntimeTacticalQuery>>;\n  readonly effects: readonly unknown[];", file);
  content = replaceOnce(content, "  const reactiveRows = payload.reactiveAbort", "  const tacticalQueryRows = renderTacticalQueryRows(payload);\n  const reactiveRows = payload.reactiveAbort", file);
  content = replaceOnce(content, "      <div><dt>Итог</dt><dd>${escapeHtml(payload.explanationRu ?? payload.explanation)}</dd></div>\n    </dl>\n    <ul>${scoreRows}</ul>", "      <div><dt>Итог</dt><dd>${escapeHtml(payload.explanationRu ?? payload.explanation)}</dd></div>\n    </dl>\n    ${tacticalQueryRows}\n    <ul>${scoreRows}</ul>", file);
  content = insertBefore(content, 'function removeExistingNodeDebug(): void {', `function renderTacticalQueryRows(payload: RuntimeDebugPayload): string {
  const queries = Object.values(payload.tacticalQueries ?? {}); if (queries.length === 0) return '';
  return queries.map((query) => { const winner = query.candidates.find((candidate) => candidate.id === query.winnerCandidateId); const candidates = query.candidates.map((candidate) => { const role = candidate.id === query.winnerCandidateId ? 'Победитель' : candidate.excluded ? 'Исключён' : 'Допущен'; const exclusion = candidate.exclusionReasons.length > 0 ? '<span><b>Причина исключения:</b> ' + escapeHtml(candidate.exclusionReasons.map((reason) => reason.reasonRu ?? reason.reason).join('; ')) + '</span>' : '<span>Причина исключения: нет</span>'; const breakdown = Object.entries(candidate.scoreBreakdown).map(([key, value]) => escapeHtml(tacticalScoreLabel(key)) + ': ' + roundScore(value)).join(' · '); return '<li class="' + (candidate.excluded ? 'veto' : '') + ' ' + (candidate.id === query.winnerCandidateId ? 'winner' : '') + '"><b>' + escapeHtml(candidate.source.labelRu ?? candidate.source.label) + ' — ' + role + '</b><span>Позиция: ' + roundScore(candidate.position.x) + ', ' + roundScore(candidate.position.y) + ' · Итог: ' + roundScore(candidate.totalScore) + '</span>' + exclusion + '<small>' + breakdown + '</small></li>'; }).join(''); const stop = query.stopReason?.reasonRu ?? query.stopReason?.reason ?? 'нет'; return '<section class="tactical-query-diagnostics"><h4>Тактический запрос</h4><dl><div><dt>Состояние</dt><dd>' + escapeHtml(query.status) + '</dd></div><div><dt>Кандидаты</dt><dd>' + query.candidates.length + ' из ' + query.budget.maxCandidates + '</dd></div><div><dt>Радиус поиска</dt><dd>' + roundScore(query.budget.searchRadiusMeters) + ' м</dd></div><div><dt>Время расчёта</dt><dd>' + roundScore(query.elapsedMs) + ' / ' + roundScore(query.budget.maxCalculationMs) + ' мс</dd></div><div><dt>Победитель</dt><dd>' + escapeHtml(winner?.source.labelRu ?? winner?.source.label ?? 'не выбран') + '</dd></div><div><dt>Досрочная остановка</dt><dd>' + escapeHtml(stop) + '</dd></div></dl><ul>' + candidates + '</ul></section>'; }).join('');
}
function tacticalScoreLabel(key: string): string { const labels: Record<string, string> = { protection: 'защита', concealment: 'маскировка', distance: 'расстояние', routeDanger: 'опасность маршрута', slope: 'склон', orderAlignment: 'соответствие приказу' }; return labels[key] ?? key; }

`, file);
  await write(file, content);
}

{
  const file = 'docs/subprojects/ai-single-unit-editor/subproject.json'; const data = JSON.parse(await read(file));
  data.updated_at = '2026-07-14';
  data.current_focus = 'Tactical Query System cover vertical slice is implemented on an isolated temporary branch: Graph v2 explicitly generates, filters, scores and selects cover positions.';
  data.next_step = 'Run the prepared visual QA only after explicit user approval. Do not transfer the temporary branch to real-wargame-preview without a separate command.';
  data.last_verified_runs = data.last_verified_runs ?? {};
  data.last_verified_runs.tactical_query_cover_v1 = { date: '2026-07-14', branch: 'feat/tactical-query-system-temp-2026-07-14', status: 'core_validated_visual_pending', confirmed: ['tactical-query:smoke','tactical-query-ui:smoke','graph-v2:smoke','runtime:smoke','pathfinding:smoke','directional-terrain:smoke','validate:ai-graph','docs:sync','build'], visual_qa_prepared: true, visual_qa_run: false };
  data.must_read_first = ['docs/subprojects/ai-single-unit-editor/TACTICAL_QUERY_SYSTEM_COVER_V1.md','docs/superpowers/plans/2026-07-14-tactical-query-system-cover-v1.md',...(data.must_read_first ?? []).filter((item) => !item.includes('TACTICAL_QUERY_SYSTEM_COVER_V1') && !item.includes('tactical-query-system-cover-v1'))];
  data.main_files = [...new Set([...(data.main_files ?? []),'src/core/ai/tactical/TacticalQuery.ts','src/core/cover/CoverTacticalCandidates.ts','src/core/ai/AiGraphRunner.ts','src/core/ai/AiGraphRuntime.ts','src/core/ai/AiGameBridge.ts','src/ai-node-editor/runtime-debug-overlay.ts'])];
  await write(file, JSON.stringify(data, null, 2) + '\n');
}

console.log('Applied Tactical Query System integration.');
