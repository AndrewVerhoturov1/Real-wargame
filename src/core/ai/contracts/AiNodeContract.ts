import type { AiBlackboardValue } from '../AiBlackboard';
import type { AiPortDefinition, AiPortValueKind } from './AiPortTypes';
export type AiNodeCategory = 'flow' | 'condition' | 'score' | 'query' | 'action' | 'memory' | 'debug' | 'subgraph';
export type AiNodeChildPolicy = 'none' | 'one' | 'many';
export type AiNodeLifecycleKind = 'instant' | 'stateful' | 'composite' | 'modifier';
export type AiParameterValueKind = AiPortValueKind | 'enum';
export interface AiParameterOption { readonly value: string; readonly label: string; readonly labelRu: string; }
export interface AiParameterDefinition {
  readonly id: string; readonly kind: AiParameterValueKind; readonly label: string; readonly labelRu: string;
  readonly description?: string; readonly descriptionRu?: string; readonly required?: boolean; readonly nullable?: boolean;
  readonly defaultValue?: AiBlackboardValue; readonly minimum?: number; readonly maximum?: number; readonly integer?: boolean;
  readonly options?: readonly AiParameterOption[];
}
export interface AiNodeContract {
  readonly type: string; readonly category: AiNodeCategory; readonly label: string; readonly labelRu: string;
  readonly description: string; readonly descriptionRu: string; readonly inputs: readonly AiPortDefinition[];
  readonly outputs: readonly AiPortDefinition[]; readonly parameters: readonly AiParameterDefinition[];
  readonly childPolicy: AiNodeChildPolicy; readonly lifecycle: AiNodeLifecycleKind;
}
