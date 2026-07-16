import { registerAiEditorSection } from './AiEditorSectionRegistry';
import {
  disposeMovementProfileEditorPanel,
  renderMovementProfiles,
  requestMovementProfileEditorLeave,
} from './MovementProfileEditorPanel';

registerAiEditorSection({
  id: 'movementProfiles',
  labelRu: 'Профили движения',
  order: 30,
  render: renderMovementProfiles,
  beforeLeave: requestMovementProfileEditorLeave,
  dispose: disposeMovementProfileEditorPanel,
});
