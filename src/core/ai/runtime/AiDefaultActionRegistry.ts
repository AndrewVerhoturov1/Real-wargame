import { AiActionRegistry } from './AiActionRegistry';
import { moveToBlackboardPositionLifecycle } from './actions/MoveToBlackboardPositionAction';
import { waitActionLifecycle } from './actions/WaitAction';

export const DEFAULT_AI_ACTION_REGISTRY = new AiActionRegistry()
  .register('Wait', waitActionLifecycle)
  .register('MoveToBlackboardPosition', moveToBlackboardPositionLifecycle);
