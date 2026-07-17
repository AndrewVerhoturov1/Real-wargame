from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'src/main.ts'
content = path.read_text(encoding='utf-8')


def replace_exact(old: str, new: str, label: str) -> None:
    global content
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    content = content.replace(old, new, 1)


replace_exact(
    "import { installDangerLayerMovementPerformanceHarness } from './testing/DangerLayerMovementPerformanceHarness';\n",
    "import { installDangerLayerMovementPerformanceHarness } from './testing/DangerLayerMovementPerformanceHarness';\n"
    "import { installLiveWindowsPerformanceHarness } from './testing/LiveWindowsPerformanceHarness';\n",
    'main live performance harness import',
)
replace_exact(
    "  installDangerLayerMovementPerformanceHarness(state);\n",
    "  installDangerLayerMovementPerformanceHarness(state);\n"
    "  installLiveWindowsPerformanceHarness(state);\n",
    'main live performance harness install',
)
path.write_text(content, encoding='utf-8')
print('Installed live Windows performance harness in main bootstrap.')
