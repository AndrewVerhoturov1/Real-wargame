import { DEFAULT_AI_NODE_CONTRACT_REGISTRY } from './contracts/AiNodeContractRegistry';
import type { AiNodeCategory } from './contracts/AiNodeContract';
export type { AiNodeCategory } from './contracts/AiNodeContract';
export interface AiNodeTypeDefinition {readonly type:string;readonly category:AiNodeCategory;readonly label:string;readonly description:string;readonly labelRu:string;readonly descriptionRu:string;readonly canHaveChildren:boolean;}
export const AI_NODE_TYPE_DEFINITIONS=Object.fromEntries(DEFAULT_AI_NODE_CONTRACT_REGISTRY.list().map(c=>[c.type,{type:c.type,category:c.category,label:c.label,description:c.description,labelRu:c.labelRu,descriptionRu:c.descriptionRu,canHaveChildren:c.childPolicy!=='none'}])) as Readonly<Record<string,AiNodeTypeDefinition>>;
export type AiNodeType=string;
export function isAiNodeType(value:string):value is AiNodeType{return DEFAULT_AI_NODE_CONTRACT_REGISTRY.has(value);}
export function getAiNodeTypeDefinition(type:AiNodeType):AiNodeTypeDefinition{const d=AI_NODE_TYPE_DEFINITIONS[type];if(!d)throw new Error(`Unknown AI node type: ${type}`);return d;}
