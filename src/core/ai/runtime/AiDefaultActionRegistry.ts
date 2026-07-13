import { AiActionRegistry } from './AiActionRegistry';
import { moveToBlackboardPositionLifecycle } from './actions/MoveToBlackboardPositionAction';
import { reloadActionLifecycle } from './actions/ReloadAction';
import { waitActionLifecycle } from './actions/WaitAction';
import { waitForEventActionLifecycle } from './actions/WaitForEventAction';

export const DEFAULT_AI_ACTION_REGISTRY = new AiActionRegistry()
  .register('Wait', waitActionLifecycle)
  .register('WaitForEvent', waitForEventActionLifecycle)
  .register('MoveToBlackboardPosition', moveToBlackboardPositionLifecycle)
  .register('Reload', reloadActionLifecycle);
