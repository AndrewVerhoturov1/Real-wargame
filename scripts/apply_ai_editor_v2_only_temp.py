from pathlib import Path
import re

main_path = Path('src/ai-node-editor/main.ts')
text = main_path.read_text(encoding='utf-8')
replacements = [
    ("  version: 1 | 2;", "  version: 2;"),
    ("let editorGraph = loadStoredGraph() ?? normalizeGraph(graphData as unknown);", "let editorGraph = loadStoredGraph() ?? loadEditorGraphV2(graphData as unknown);"),
    ("          <span class=\"graph-version-badge ${editorGraph.version === 2 ? 'v2' : 'v1'}\">Graph v${editorGraph.version}</span>\n          <button id=\"migrate-graph\" class=\"ai-editor-button primary\" type=\"button\">Проверить и обновить формат графа</button>\n", ""),
    ("      ${editorGraph.version === 1 ? '<div class=\"graph-v1-warning\">Этот граф использует старый формат Graph v1. Нажмите «Проверить и обновить формат графа» — исходные данные будут сохранены.</div>' : ''}\n", ""),
    ("  document.querySelector<HTMLButtonElement>('#migrate-graph')?.addEventListener('click', migrateGraphFromUi);\n", ""),
    ("  editorGraph = normalizeGraph(graph);", "  editorGraph = loadEditorGraphV2(graph);"),
    ("function resetGraphToBundled(): void { editorGraph = normalizeGraph(graphData as unknown);", "function resetGraphToBundled(): void { editorGraph = loadEditorGraphV2(graphData as unknown);"),
    ("editorGraph = normalizeGraph(JSON.parse(String(reader.result)));", "editorGraph = loadEditorGraphV2(JSON.parse(String(reader.result)));"),
    ("validationText = `Imported ${file.name}`;", "validationText = `Импортирован ${file.name} · Graph v2`;"),
    ("version:raw.version===2?2:1", "version:2"),
]
for old, new in replacements:
    if old not in text:
        raise SystemExit(f'Expected main.ts fragment not found:\n{old}')
    text = text.replace(old, new, 1)

text, count = re.subn(
    r"\nfunction migrateGraphFromUi\(\): void \{.*?\n\}\n\nfunction openSelectedSubgraph",
    "\nfunction openSelectedSubgraph",
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit('Could not remove migrateGraphFromUi function.')

old_loader = "function loadStoredGraph(): EditableAiGraph | null { try { const raw = localStorage.getItem(GRAPH_STORAGE_KEY); return raw ? normalizeGraph(JSON.parse(raw)) : null; } catch { return null; } }"
new_loader = "function loadStoredGraph(): EditableAiGraph | null { try { const raw = localStorage.getItem(GRAPH_STORAGE_KEY); if (!raw) return null; const graph = loadEditorGraphV2(JSON.parse(raw)); localStorage.setItem(GRAPH_STORAGE_KEY, JSON.stringify(graph)); return graph; } catch { return null; } }\nfunction loadEditorGraphV2(value: unknown): EditableAiGraph { const migration = migrateAiGraphToV2(value); if (!migration.ok) throw new Error(migration.issues.map((issue) => issue.messageRu).join(' ')); return normalizeGraph(migration.graph); }"
if old_loader not in text:
    raise SystemExit('Stored graph loader fragment not found.')
text = text.replace(old_loader, new_loader, 1)
main_path.write_text(text, encoding='utf-8')

css_path = Path('src/ai-node-editor/ai-node-editor-authoring.css')
css = css_path.read_text(encoding='utf-8')
css, count = re.subn(
    r"\.graph-v1-warning\{[^}]*\}\.graph-version-badge\{[^}]*\}\.graph-version-badge\.v1\{[^}]*\}\.graph-version-badge\.v2\{[^}]*\}",
    "",
    css,
    count=1,
)
if count != 1:
    raise SystemExit('Graph v1/version badge CSS fragment not found.')
css_path.write_text(css, encoding='utf-8')

visual_path = Path('tests/ai-state-plan-visual.spec.ts')
visual = visual_path.read_text(encoding='utf-8')
old = "  const versionBadge = page.locator('.graph-version-badge');\n  if (await versionBadge.getAttribute('class').then((value) => value?.includes('v1') ?? false)) {\n    await page.locator('#migrate-graph').click();\n    await expect(versionBadge).toContainText('Graph v2');\n  }\n"
new = "  await expect(page.locator('#migrate-graph')).toHaveCount(0);\n  await expect(page.locator('.graph-v1-warning')).toHaveCount(0);\n"
if old not in visual:
    raise SystemExit('Graph migration browser precondition not found.')
visual_path.write_text(visual.replace(old, new, 1), encoding='utf-8')
