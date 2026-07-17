from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'scripts/tactical_workspace_smoke_pixijs8_baseline.mjs'
content = path.read_text(encoding='utf-8')
replacements = [
    ("  'buildAwarenessField', 'buildBestSafePositions', 'buildRouteKey',\n", "  'buildAwarenessField', 'buildRouteKey',\n", 'workspace awareness safe-position token'),
    ("  'buildAwarenessRenderKey', 'buildAwarenessWorldKey', 'buildAwarenessMarkerKey', 'lastMarkerInputKey',\n", "  'buildAwarenessRenderKey', 'buildAwarenessWorldKey',\n", 'workspace renderer marker helpers'),
    ("  'lastRasterKey', 'lastMarkerKey', 'markerUpdateCount',\n", "  'lastRasterKey',\n", 'workspace renderer marker state'),
    ("  'lastRequestedCanonicalThreatKey', 'rendererLocalBestWinner', 'lastAppliedFieldIdentity',\n", "  'lastRequestedCanonicalThreatKey', 'lastAppliedFieldIdentity',\n", 'workspace renderer safe winner'),
]
for old, new, label in replacements:
    if content.count(old) != 1:
        raise RuntimeError(f'{label}: expected one match, found {content.count(old)}')
    content = content.replace(old, new, 1)
path.write_text(content, encoding='utf-8')
print('Updated TacticalWorkspace smoke for worker raster without legacy safe-position markers.')
