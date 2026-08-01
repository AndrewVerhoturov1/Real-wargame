import './game/GameStyles';
import mapData from './data/maps/test_map.json';
import pressureZoneData from './data/pressure_zones/test_pressure_zones.json';
import unitsData from './data/units/test_units.json';
import type { TacticalMapData } from './core/map/MapModel';
import type { PressureZoneData } from './core/pressure/PressureZone';
import { createResolutionAwareInitialState } from './core/simulation/ResolutionAwareScene';
import type { UnitData } from './core/units/UnitModel';
import { collectGameApplicationElements, GameApplication } from './game/GameApplication';
import { installAppShellMenu } from './shared/AppShellMenu';

let application: GameApplication | null = null;

const shellMenuInstallation = installAppShellMenu({ mode: 'game' });
void bootstrap();

async function bootstrap(): Promise<void> {
  const state = createResolutionAwareInitialState(
    mapData as TacticalMapData,
    unitsData as UnitData[],
    pressureZoneData as PressureZoneData[],
  );
  application = await GameApplication.create({
    mode: 'game',
    state,
    elements: collectGameApplicationElements(),
  });
}

window.addEventListener('beforeunload', () => {
  shellMenuInstallation.destroy();
  application?.destroy();
  application = null;
});
