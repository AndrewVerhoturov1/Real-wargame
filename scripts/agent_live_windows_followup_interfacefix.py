from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'src/rendering/PixiAwarenessHeatmapRenderer.ts'
content = path.read_text(encoding='utf-8')
legacy = "  readonly markerUpdateCount: number;\n"
if content.count(legacy) != 1:
    raise RuntimeError(f'legacy markerUpdateCount interface field count: {content.count(legacy)}')
path.write_text(content.replace(legacy, '', 1), encoding='utf-8')
print('Removed stale markerUpdateCount from AwarenessOverlayDiagnostics.')
