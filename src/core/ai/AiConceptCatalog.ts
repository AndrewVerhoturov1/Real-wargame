import type { AiBlackboardValue } from './AiBlackboard';
import { AI_OPERATION_CONCEPTS } from './AiConceptOperations';
import { AI_VALUE_CONCEPTS } from './AiConceptValues';
import { matchesAiConceptValueType, type AiBlackboardValidationReport, type AiConceptDefinition } from './AiConceptTypes';

export * from './AiConceptTypes';
export const AI_CONCEPT_CATALOG:readonly AiConceptDefinition[]=[...AI_VALUE_CONCEPTS,...AI_OPERATION_CONCEPTS];
const BY_KEY=new Map(AI_CONCEPT_CATALOG.map((concept)=>[concept.key,concept]));
const ALIASES=new Map<string,string>();
for(const concept of AI_CONCEPT_CATALOG) for(const alias of concept.aliases??[]) ALIASES.set(alias,concept.key);

export function getAiConcept(key:string):AiConceptDefinition|undefined { return BY_KEY.get(key)??BY_KEY.get(ALIASES.get(key)??''); }
export function getAiConceptsForNodeType(nodeType:string):readonly AiConceptDefinition[] { return AI_CONCEPT_CATALOG.filter((concept)=>concept.nodeTemplates.some((template)=>template.nodeType===nodeType)); }
export function getAiValueConcepts():readonly AiConceptDefinition[] { return AI_CONCEPT_CATALOG.filter((concept)=>concept.kind==='value'); }
export function resolveAiConceptKey(key:string):string { return ALIASES.get(key)??key; }

export function validateAiBlackboardSnapshot(snapshot:Readonly<Record<string,AiBlackboardValue>>):AiBlackboardValidationReport {
  const unknownKeys:string[]=[]; const typeMismatches:string[]=[]; const present=new Set<string>();
  for(const [rawKey,value] of Object.entries(snapshot)) {
    const key=resolveAiConceptKey(rawKey); const concept=BY_KEY.get(key);
    if(!concept||concept.kind!=='value') { if(!rawKey.startsWith('stable:')&&!rawKey.endsWith('_rule')&&!rawKey.startsWith('user_')) unknownKeys.push(rawKey); continue; }
    present.add(key); if(!matchesAiConceptValueType(value,concept.valueType)) typeMismatches.push(rawKey);
  }
  const missingKeys=AI_CONCEPT_CATALOG.filter((concept)=>concept.kind==='value'&&concept.readiness!=='planned'&&concept.defaultValue!==undefined&&!present.has(concept.key)).map((concept)=>concept.key);
  return {valid:unknownKeys.length===0&&typeMismatches.length===0,unknownKeys,missingKeys,typeMismatches};
}
