import { registerAiEditorSection } from './AiEditorSectionRegistry';
import {
  getMovementProfileRegistry,
  subscribeMovementProfileRegistry,
} from './MovementProfileBrowserStorage';
import {
  disposeMovementProfileEditorPanel,
  renderMovementProfiles,
  requestMovementProfileEditorLeave,
} from './MovementProfileEditorPanel';
import { setMovementProfileSelectorProvider } from './MovementProfileSelectorProvider';

let selectorRegistry = getMovementProfileRegistry();
setMovementProfileSelectorProvider({
  listProfiles: () => selectorRegistry.listProfiles().map((profile) => ({
    id: profile.id,
    nameRu: profile.nameRu,
    revision: profile.revision,
  })),
});
const unsubscribeSelectorRegistry = subscribeMovementProfileRegistry((next) => {
  selectorRegistry = next;
});

registerAiEditorSection({
  id: 'movementProfiles',
  labelRu: 'Профили движения',
  order: 30,
  render: renderMovementProfiles,
  beforeLeave: requestMovementProfileEditorLeave,
  dispose: () => {
    unsubscribeSelectorRegistry();
    setMovementProfileSelectorProvider(null);
    disposeMovementProfileEditorPanel();
  },
});
