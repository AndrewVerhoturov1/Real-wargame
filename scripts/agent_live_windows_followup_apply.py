from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_exact(content: str, old: str, new: str, label: str) -> str:
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one exact match, found {count}")
    return content.replace(old, new, 1)


def replace_regex(content: str, pattern: str, replacement: str, label: str, flags: int = re.S) -> str:
    updated, count = re.subn(pattern, replacement, content, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{label}: expected one regex match, found {count}")
    return updated


def remove_exact(content: str, value: str, label: str) -> str:
    return replace_exact(content, value, "", label)


# AI decisions must not synchronously request the legacy full-map awareness/safe-position report.
path = "src/core/ai/AiGameBridge.ts"
content = read(path)
content = remove_exact(
    content,
    "import { buildSoldierAwarenessReport } from '../knowledge/SoldierAwarenessGrid';\n",
    "AiGameBridge awareness import",
)
content = replace_exact(
    content,
    "  const awareness = buildSoldierAwarenessReport(state, unit);\n  const bestSafe = awareness.bestSafePositions[0];\n",
    "  const currentExpectedProtection = Math.max(\n"
    "    strongest?.expectedProtection ?? 0,\n"
    "    threats.strongestKnown?.expectedProtection ?? 0,\n"
    "  );\n"
    "  const currentThreatConfidence = Math.max(\n"
    "    bestContact?.confidence ?? 0,\n"
    "    ...unit.tacticalKnowledge.threats.map((threat) => threat.confidence),\n"
    "  );\n",
    "AiGameBridge bounded tactical values",
)
content = replace_exact(
    content,
    "    currentPositionDanger: awareness.currentPosition.danger,\n"
    "    currentExpectedProtection: awareness.currentPosition.expectedProtection,\n"
    "    bestSafePositionScore: Math.max(0, Math.round(bestSafe?.score ?? 0)),\n"
    "    distanceToBestSafePosition: Math.round((bestSafe?.distanceCells ?? 9999) * state.map.metersPerCell),\n"
    "    routeDanger: awareness.routeDanger,\n"
    "    threatConfidence: Math.round(bestContact?.confidence ?? awareness.threatConfidence),\n",
    "    currentPositionDanger: clampPercent(threats.danger),\n"
    "    currentExpectedProtection: clampPercent(currentExpectedProtection),\n"
    "    routeDanger: clampPercent(threats.danger),\n"
    "    threatConfidence: Math.round(currentThreatConfidence),\n",
    "AiGameBridge safe-position blackboard removal",
)
write(path, content)


# Delete the legacy safe-position list and top-8 scan from the awareness report API.
path = "src/core/knowledge/SoldierAwarenessGrid.ts"
content = read(path)
content = replace_regex(
    content,
    r"\nexport interface SoldierSafePosition \{.*?\n\}\n\nexport interface SoldierAwarenessReport",
    "\nexport interface SoldierAwarenessReport",
    "SoldierSafePosition interface",
)
content = remove_exact(content, "  bestSafePositions: SoldierSafePosition[];\n", "awareness report safe positions")
content = remove_exact(content, "  bestSafePositions: SoldierSafePosition[];\n", "cached awareness safe positions")
content = remove_exact(content, "const MAX_SAFE_POSITIONS = 8;\n", "safe position max")
content = remove_exact(content, "const SAFE_SEARCH_RADIUS_METERS = 120;\n", "safe position radius")
content = remove_exact(content, "const SAFE_DISTANCE_PENALTY_PER_METER = 0.18;\n", "safe position penalty")
content = remove_exact(content, "      bestSafePositions: [],\n", "safe position cache init")
content = remove_exact(
    content,
    "    cached.bestSafePositions = buildBestSafePositions(state.map, cached.field.cells, unit.position);\n",
    "safe position refresh",
)
content = remove_exact(content, "    bestSafePositions: cached.bestSafePositions,\n", "safe position report result")
content = replace_regex(
    content,
    r"\nfunction buildBestSafePositions\(.*?\n\}\n\nexport function evaluateRouteDanger",
    "\nexport function evaluateRouteDanger",
    "safe position top-8 implementation",
)
write(path, content)


# Tactical workspace must consume bounded current-unit values, never rebuild a 64k-cell report.
path = "src/ui/TacticalWorkspace.ts"
content = read(path)
content = remove_exact(
    content,
    "import { buildSoldierAwarenessReport } from '../core/knowledge/SoldierAwarenessGrid';\n",
    "workspace awareness import",
)
content = replace_exact(
    content,
    "import { getCell, resolveObjectCoverProperties } from '../core/map/MapModel';\n",
    "import { getCell, resolveObjectCoverProperties } from '../core/map/MapModel';\n"
    "import { evaluateThreatsAtPosition } from '../core/pressure/ThreatEvaluation';\n",
    "workspace threat evaluation import",
)
new_render_danger = r'''function renderDanger(target: HTMLElement, state: SimulationState, unit: UnitModel, onChanged: () => void, rerender: () => void): void {
  const threats = evaluateThreatsAtPosition(state.map, unit, state.pressureZones);
  const currentProtection = Math.max(
    threats.strongest?.expectedProtection ?? 0,
    threats.strongestKnown?.expectedProtection ?? 0,
  );
  const threatConfidence = unit.tacticalKnowledge.threats.length > 0
    ? Math.max(...unit.tacticalKnowledge.threats.map((threat) => threat.confidence))
    : 0;
  const selected = getSelectedSimulationCover(state);
  target.innerHTML = `${heading('Слой опасности','Красное — известная опасность. Полная карта строится фоновым worker; панель читает только текущую позицию бойца.')}${legend([['legend-danger-high','крайне опасно'],['legend-danger-medium','опасно'],['legend-danger-low','умеренная опасность']])}${grid([['Текущая опасность',pct(threats.danger)],['Подавление',pct(threats.suppression)],['Защита позиции',pct(currentProtection)],['Оценка активного маршрута',unit.order?pct(threats.danger):'нет маршрута'],['Уверенность в угрозах',pct(threatConfidence)]])}<section class="workspace-panel-section"><h3>Известные укрытия</h3><div data-role="cover-list"></div></section>`;
  if (selected) {
    const object = state.map.objects.find((item) => item.id === selected.id);
    const props = object ? resolveObjectCoverProperties(object) : null;
    const threat = unit.tacticalKnowledge.threats[0];
    const card = document.createElement('section');
    card.className = 'selected-cover-card';
    card.innerHTML = `<h3>${esc(selected.labelRu)}</h3>${grid([['Расстояние',`${Math.round(selected.distanceMeters)} м`],['Ожидаемая защита',pct(props?.coverProtection??selected.quality)],['Надёжность',pct(props?.coverReliability??selected.quality)],['Маскировка',pct(props?.concealment??0)],['Сторона защиты',threat?direction(Math.atan2(threat.y-selected.y,threat.x-selected.x)*180/Math.PI):'нет известной угрозы'],['Угроза',threat?.labelRu??'неизвестна']])}`;
    const move = button('Приказать двигаться сюда','primary full-width');
    move.onclick = () => { issueMoveOrderToSelectedUnit(state,{x:selected.x,y:selected.y}); onChanged(); };
    card.append(move);
    target.prepend(card);
  }
  const list = target.querySelector<HTMLElement>('[data-role="cover-list"]')!;
  const covers = getSimulationCovers(state).slice(0,12);
  if (!covers.length) list.innerHTML = empty('Известных укрытий пока нет.');
  for (const cover of covers) {
    const item = button(`${cover.labelRu} · ${Math.round(cover.distanceMeters)} м · ${Math.round(cover.quality)}/100`,'cover-list-card');
    item.classList.toggle('selected',selected?.id===cover.id);
    item.onclick = () => { setSelectedSimulationCover(state,cover.id); rerender(); onChanged(); };
    list.append(item);
  }
}

function renderStealth(target: HTMLElement, state: SimulationState, unit: UnitModel, _onChanged: () => void): void {
  const cell = getCell(state.map, Math.floor(unit.position.x), Math.floor(unit.position.y));
  const concealment = resolveLocalConcealment(cell?.terrain ?? state.map.defaultTerrain, cell?.forest ?? 0);
  const confidence = unit.tacticalKnowledge.threats.length > 0
    ? Math.max(...unit.tacticalKnowledge.threats.map((threat) => threat.confidence))
    : 0;
  target.innerHTML = `${heading('Слой скрытности','Полная карта скрытности рисуется фоновым worker. Автоматический поиск безопасных и скрытых позиций удалён как легаси.')}${legend([['legend-stealth-best','очень трудно заметить'],['legend-stealth-good','хорошая скрытность'],['legend-stealth-medium','заметен'],['legend-stealth-bad','хорошо заметен']])}${grid([['Скрытность клетки',pct(concealment)],['Открытость',pct(100-concealment)],['Поза',postureLabel(unit.behaviorRuntime.posture)],['Тип клетки',terrain(cell?.terrain ?? state.map.defaultTerrain,cell?.forest ?? 0)],['Уверенность',pct(confidence)]])}`;
}

'''
content = replace_regex(
    content,
    r"function renderDanger\(.*?\nfunction memoryPanel",
    new_render_danger + "function memoryPanel",
    "workspace legacy awareness panels",
)
content = replace_exact(
    content,
    "function terrain(x:string,forest:number):string{if(forest===2)return 'густой лес';if(forest===1)return 'редкий лес';return ({field:'открытое поле',forest:'лесная почва',road:'дорога',swamp:'болото',rough:'пересечённая местность',water:'вода'} as Record<string,string>)[x]??x;}\n",
    "function terrain(x:string,forest:number):string{if(forest===2)return 'густой лес';if(forest===1)return 'редкий лес';return ({field:'открытое поле',forest:'лесная почва',road:'дорога',swamp:'болото',rough:'пересечённая местность',water:'вода'} as Record<string,string>)[x]??x;}\n"
    "function resolveLocalConcealment(terrainKind:string,forest:number):number{if(forest===2)return 72;if(forest===1)return 38;if(terrainKind==='forest')return 24;if(terrainKind==='rough')return 12;if(terrainKind==='swamp')return 8;return 0;}\n",
    "workspace local concealment helper",
)
write(path, content)


# Renderer no longer performs local safe-position scans or draws safe-position markers.
path = "src/rendering/PixiAwarenessHeatmapRenderer.ts"
content = read(path)
content = replace_exact(
    content,
    "import { BufferImageSource, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';",
    "import { BufferImageSource, Container, Sprite, Text, Texture } from 'pixi.js';",
    "renderer Graphics import",
)
content = replace_regex(
    content,
    r"import type \{\n  SoldierAwarenessCell,\n  SoldierSafePosition,\n\} from '../core/knowledge/SoldierAwarenessGrid';",
    "import type { SoldierAwarenessCell } from '../core/knowledge/SoldierAwarenessGrid';",
    "renderer safe position import",
    flags=0,
)
content = remove_exact(content, "type SafePositions = SoldierSafePosition[];\n", "renderer safe positions alias")
content = replace_regex(
    content,
    r"\ninterface LocalDerivedSnapshot \{.*?\n\}\n",
    "\n",
    "renderer local derived snapshot",
)
content = remove_exact(content, "  readonly rendererLocalBestSafePositions: readonly SoldierSafePosition[];\n", "renderer diagnostic safe list")
content = remove_exact(content, "  readonly rendererLocalBestWinner: SoldierSafePosition | null;\n", "renderer diagnostic safe winner")
content = remove_exact(content, "const MAX_SAFE_POSITIONS = 8;\n", "renderer safe max")
content = remove_exact(content, "const SAFE_SEARCH_RADIUS_METERS = 120;\n", "renderer safe radius")
content = remove_exact(content, "const SAFE_DISTANCE_PENALTY_PER_METER = 0.18;\n", "renderer safe penalty")
content = remove_exact(content, "const ROUTE_SAMPLE_STEP_METERS = 5;\n", "renderer route sample")
content = remove_exact(content, "  private readonly markerGraphics = new Graphics();\n", "renderer marker graphics")
content = remove_exact(content, "  private lastMarkerInputKey = '';\n", "renderer marker input key")
content = remove_exact(content, "  private lastMarkerKey = '';\n", "renderer marker key")
content = remove_exact(content, "  private safePositions: SafePositions = [];\n", "renderer safe positions state")
content = remove_exact(content, "  private latestLocalSnapshot: LocalDerivedSnapshot | null = null;\n", "renderer local snapshot state")
content = remove_exact(content, "  private markerUpdateCount = 0;\n", "renderer marker counter")
content = remove_exact(content, "      this.lastMarkerInputKey = 'hidden';\n", "renderer hidden marker input")
content = remove_exact(content, "      this.lastMarkerKey = 'hidden';\n", "renderer hidden marker key")
content = remove_exact(content, "    const markerInputKey = buildAwarenessMarkerInputKey(state, unit, mode);\n", "renderer marker input build")
content = replace_regex(
    content,
    r"    this.latestLocalSnapshot = \{.*?    \};\n\n",
    "",
    "renderer local snapshot creation",
)
content = replace_regex(
    content,
    r"\n    if \(\n      markerInputKey !== this\.lastMarkerInputKey.*?    this\.updateMarkers\(mode, state\.map\.cellSize\);",
    "",
    "renderer local marker update",
)
content = remove_exact(content, "    this.latestLocalSnapshot = null;\n", "renderer destroy local snapshot")
content = remove_exact(content, "    this.safePositions = [];\n", "renderer destroy safe positions")
content = remove_exact(content, "    this.markerGraphics.destroy();\n", "renderer destroy marker graphics")
content = remove_exact(content, "    const positions = this.safePositions.map(cloneSafePosition);\n", "renderer diagnostic safe clone")
content = remove_exact(content, "      markerUpdateCount: this.markerUpdateCount,\n", "renderer diagnostic marker count")
content = remove_exact(content, "      rendererLocalBestSafePositions: positions,\n", "renderer diagnostic safe positions")
content = remove_exact(content, "      rendererLocalBestWinner: positions[0] ?? null,\n", "renderer diagnostic safe winner")
content = remove_exact(content, "        if (this.latestLocalSnapshot) this.updateLocalDerived(this.latestLocalSnapshot);\n", "renderer worker local scan")
content = remove_exact(content, "        this.updateMarkers(this.currentMode, this.latestLocalSnapshot?.cellSize ?? 1);\n", "renderer worker marker update")
content = replace_regex(
    content,
    r"\n  private updateLocalDerived\(.*?\n  private updatePendingDepth",
    "\n  private updatePendingDepth",
    "renderer local derived methods",
)
content = remove_exact(content, "      this.lastMarkerInputKey = '';\n", "renderer raster marker input reset")
content = remove_exact(content, "      this.lastMarkerKey = '';\n", "renderer raster marker reset")
content = replace_exact(
    content,
    "      this.container.addChild(this.rasterSprite, this.markerGraphics, this.title);",
    "      this.container.addChild(this.rasterSprite, this.title);",
    "renderer children",
)
content = replace_regex(
    content,
    r"\n  private drawSafePositionMarkers\(.*?\n  private publishDiagnostics",
    "\n  private publishDiagnostics",
    "renderer marker drawing",
)
content = replace_regex(
    content,
    r"\nexport function buildAwarenessMarkerKey\(.*?\n\}\n\nexport function createAwarenessTexture",
    "\nexport function createAwarenessTexture",
    "renderer marker key export",
)
content = replace_regex(
    content,
    r"\nfunction buildAwarenessMarkerInputKey\(.*?\n\}\n\nfunction buildPendingWorldSnapshot",
    "\nfunction buildPendingWorldSnapshot",
    "renderer marker input helper",
)
content = replace_regex(
    content,
    r"\nfunction buildBestSafePositionsFromWorldField\(.*?\nfunction buildPixelLut",
    "\nfunction buildPixelLut",
    "renderer safe position implementation",
)
write(path, content)


# Ensure the active source tree contains no safe-position feature identifiers.
for source_path in (ROOT / "src").rglob("*.ts"):
    source = source_path.read_text(encoding="utf-8")
    for forbidden in (
        "bestSafePositions",
        "SoldierSafePosition",
        "bestSafePositionScore",
        "distanceToBestSafePosition",
        "rendererLocalBestSafePositions",
        "rendererLocalBestWinner",
        "buildBestSafePositionsFromWorldField",
        "drawSafePositionMarkers",
    ):
        if forbidden in source:
            raise RuntimeError(f"legacy safe-position identifier {forbidden!r} remains in {source_path.relative_to(ROOT)}")

print("Applied live Windows performance follow-up: removed legacy safe positions and full-map AI/UI consumers.")
