import {
  AI_NODE_TYPE_DEFINITIONS,
  type AiNodeTypeDefinition,
} from '../core/ai/AiNodeTypes';

const definitions = AI_NODE_TYPE_DEFINITIONS as unknown as Record<string, AiNodeTypeDefinition>;

if (!definitions.MoveToBlackboardPosition) {
  definitions.MoveToBlackboardPosition = {
    type: 'MoveToBlackboardPosition',
    category: 'action',
    label: 'Move to Memory Position',
    description: 'Moves toward a saved Blackboard position across multiple AI ticks and completes on arrival.',
    labelRu: 'Двигаться к позиции из памяти',
    descriptionRu: 'Движется к сохранённой позиции Blackboard несколько тиков ИИ и завершается после прибытия.',
    canHaveChildren: false,
  };
}
