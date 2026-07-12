import { getAiConcept, getAiConceptsForNodeType, type AiConceptDefinition, type AiConceptNodeTemplate } from '../core/ai/AiConceptCatalog';
import type { AiBlackboardValue } from '../core/ai/AiBlackboard';
import { AI_NODE_TYPE_DEFINITIONS } from '../core/ai/AiNodeTypes';
import { installAiDictionaryPanel, type AiDictionarySnapshot } from '../ui/AiDictionaryPanel';

const DEBUG_STORAGE_KEY = 'real-wargame.ai-node-editor.debug.v1';
const GRAPH_STORAGE_KEY = 'real-wargame.ai-node-editor.graph.v6';
const POSITION_STORAGE_KEY = 'real-wargame.ai-node-editor.positions.v6';
const PENDING_NODE_KEY = 'real-wargame.ai-dictionary.pending-node.v1';
const FOCUS_KEY = 'real-wargame.ai-dictionary.focus.v1';
const SNAPSHOT_KEY = 'real-wargame.ai-dictionary.snapshot.v1';

type JsonValue = AiBlackboardValue;
type JsonObject = Record<string, JsonValue>;
interface StoredNode { id:string; type:string; displayName:string; displayNameRu:string; description?:string; descriptionRu?:string; children:string[]; parameters:JsonObject; }
interface StoredGraph { rootNodeId:string; blackboardDefaults?:JsonObject; nodes:StoredNode[]; [key:string]:unknown; }
interface RuntimeDebugPayload { kind?:string; unitId?:string; unitLabel?:string; nowMs?:number; blackboard?:JsonObject; }
interface PendingNodeRequest { conceptKey:string; nodeType:string; parameters:JsonObject; requestedAtMs:number; }
let enhancementScheduled=false;

const panel=installAiDictionaryPanel({
  mode:'editor', getSnapshot:readSnapshot, onAddNode:addNodeFromDictionary,
  onShowOnMap:(concept)=>{localStorage.setItem(FOCUS_KEY,JSON.stringify({conceptKey:concept.key,requestedAtMs:Date.now()}));window.open('/','_blank');return 'Открыта игра. В ней будет показан подходящий слой или точка.';},
});
const observer=new MutationObserver(scheduleEnhancement);observer.observe(document.body,{childList:true,subtree:true});
window.addEventListener('storage',(event)=>{if(event.key===DEBUG_STORAGE_KEY||event.key===SNAPSHOT_KEY)panel.refresh();});
scheduleEnhancement();window.setTimeout(applyPendingNodeRequest,300);

function scheduleEnhancement():void {if(enhancementScheduled)return;enhancementScheduled=true;window.requestAnimationFrame(()=>{enhancementScheduled=false;installOpenButton();enhanceHumanNodeSelectors();});}
function installOpenButton():void {
  const actions=document.querySelector<HTMLElement>('[data-editor-global-actions]');
  if(!actions||actions.querySelector('[data-action="ai-dictionary"]'))return;
  const button=document.createElement('button');
  button.type='button';
  button.className='navigation-profile-global-button';
  button.dataset.action='ai-dictionary';
  button.textContent='Словарь ИИ';
  button.title='Открыть интерактивный словарь значений, проверок и действий ИИ';
  button.addEventListener('click',()=>panel.open());
  actions.append(button);
}
function enhanceHumanNodeSelectors():void {populateConceptSelect('sourceKey',['BlackboardValueAbove','ParameterScore','StableThreshold','RandomChance']);populateConceptSelect('modifierKey',['RandomChance']);populateConceptSelect('flagKey',['FlagCheck']);}
function populateConceptSelect(parameterKey:string,nodeTypes:readonly string[]):void {const select=document.querySelector<HTMLSelectElement>(`.human-node-panel select[data-param-key="${parameterKey}"]`);if(!select||select.dataset.aiDictionaryEnhanced==='yes')return;const selected=select.value;const concepts=uniqueConcepts(nodeTypes.flatMap((nodeType)=>getAiConceptsForNodeType(nodeType))).filter((concept)=>parameterKey==='flagKey'?concept.valueType==='boolean':['percent','number','meters','degrees'].includes(concept.valueType??''));if(!concepts.length)return;select.innerHTML=concepts.map((concept)=>`<option value="${escapeHtml(concept.key)}">${escapeHtml(concept.labelRu)} · ${escapeHtml(concept.key)}</option>`).join('');if(concepts.some((concept)=>concept.key===selected))select.value=selected;select.dataset.aiDictionaryEnhanced='yes';select.closest('label')?.setAttribute('data-help','Список создан из единого Словаря ИИ. Русский перевод показан первым, английское техническое имя остаётся видимым для точности.');}

function readSnapshot():AiDictionarySnapshot {const shared=readJson<AiDictionarySnapshot>(SNAPSHOT_KEY);const debug=readJson<RuntimeDebugPayload>(DEBUG_STORAGE_KEY);if(debug?.kind==='ai-graph-runtime-debug'||shared?.unitId){return{unitId:shared?.unitId??debug?.unitId??null,unitLabel:shared?.unitLabel??debug?.unitLabel??debug?.unitId??'Выбранный боец',values:{...(shared?.values??{}),...(debug?.blackboard??{})},updatedAtMs:Math.max(shared?.updatedAtMs??0,debug?.nowMs??0,Date.now())};}const graph=readGraph();return{unitId:null,unitLabel:'Последний расчёт ИИ отсутствует',values:graph?.blackboardDefaults??{},updatedAtMs:Date.now()};}
function addNodeFromDictionary(concept:AiConceptDefinition,template:AiConceptNodeTemplate):void {const graph=readGraph();if(!graph)return;const selectedNodeId=document.querySelector<HTMLElement>('.graph-node.selected[data-node-id]')?.dataset.nodeId??graph.rootNodeId;const selectedNode=graph.nodes.find((node)=>node.id===selectedNodeId);const nodeId=makeUniqueNodeId(graph,template.nodeType);const definition=AI_NODE_TYPE_DEFINITIONS[template.nodeType as keyof typeof AI_NODE_TYPE_DEFINITIONS];graph.nodes.push({id:nodeId,type:template.nodeType,displayName:definition?.label??template.label,displayNameRu:definition?.labelRu??template.labelRu,description:concept.description,descriptionRu:concept.descriptionRu,children:[],parameters:{...template.parameters}});if(selectedNode&&!selectedNode.children.includes(nodeId))selectedNode.children.push(nodeId);localStorage.setItem(GRAPH_STORAGE_KEY,JSON.stringify(graph));const positions=readJson<Record<string,{x:number;y:number}>>(POSITION_STORAGE_KEY)??{};const selectedPosition=positions[selectedNodeId]??{x:90,y:140};positions[nodeId]={x:selectedPosition.x+270,y:selectedPosition.y+120};localStorage.setItem(POSITION_STORAGE_KEY,JSON.stringify(positions));localStorage.removeItem(PENDING_NODE_KEY);window.location.reload();}
function applyPendingNodeRequest():void {const request=readJson<PendingNodeRequest>(PENDING_NODE_KEY);if(!request||Date.now()-request.requestedAtMs>120000){localStorage.removeItem(PENDING_NODE_KEY);return;}const concept=getAiConcept(request.conceptKey);if(!concept)return;const template=concept.nodeTemplates.find((item)=>item.nodeType===request.nodeType)??{nodeType:request.nodeType,label:request.nodeType,labelRu:request.nodeType,parameters:request.parameters};addNodeFromDictionary(concept,{...template,parameters:request.parameters});}
function readGraph():StoredGraph|null{return readJson<StoredGraph>(GRAPH_STORAGE_KEY);}
function makeUniqueNodeId(graph:StoredGraph,type:string):string {const base=type.replace(/([a-z])([A-Z])/g,'$1_$2').toLowerCase();let index=1;while(graph.nodes.some((node)=>node.id===`${base}_${index}`))index+=1;return`${base}_${index}`;}
function uniqueConcepts(concepts:readonly AiConceptDefinition[]):AiConceptDefinition[]{return Array.from(new Map(concepts.map((concept)=>[concept.key,concept])).values());}
function readJson<T>(key:string):T|null {try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw) as T:null;}catch{return null;}}
function escapeHtml(value:string):string{return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
