import { registerAiEditorSection } from './AiEditorSectionRegistry';
import {
  disposeEnvironmentProfileEditorPanel,
  renderEnvironmentProfiles,
  requestEnvironmentProfileEditorLeave,
} from './EnvironmentProfileEditorPanel';

registerAiEditorSection({
  id: 'environmentProfiles',
  labelRu: 'Профили местности',
  order: 25,
  render: renderEnvironmentProfiles,
  beforeLeave: requestEnvironmentProfileEditorLeave,
  dispose: disposeEnvironmentProfileEditorPanel,
});
