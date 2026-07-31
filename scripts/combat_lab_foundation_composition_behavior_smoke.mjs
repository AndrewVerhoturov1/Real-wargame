import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import ts from 'typescript';

const bridgePath = 'src/combat-lab/CombatLabFoundationBridge.ts';
await assert.rejects(
  access(bridgePath),
  (error) => error?.code === 'ENOENT',
  'The implicit foundation bridge must be physically removed.',
);

const paths = {
  main: 'src/combat-lab/main.ts',
  extension: 'src/combat-lab/CombatLabExtension.ts',
  participant: 'src/combat-lab/scenario-editor/CombatLabParticipantEditor.ts',
  role: 'src/combat-lab/scenario-editor/CombatLabRoleEditor.ts',
  scene: 'src/combat-lab/scenario-editor/CombatLabScenePanel.ts',
};
const sources = Object.fromEntries(await Promise.all(
  Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, 'utf8')]),
));

const mainFile = parse(paths.main, sources.main);
const extensionFile = parse(paths.extension, sources.extension);
const participantFile = parse(paths.participant, sources.participant);
const roleFile = parse(paths.role, sources.role);
const sceneFile = parse(paths.scene, sources.scene);

assert.equal(importsModule(mainFile, './CombatLabExtension'), true, 'main.ts must import CombatLabExtension directly.');
assert.equal(importsModule(mainFile, './CombatLabFoundationBridge'), false, 'main.ts must not import the removed bridge.');
assert.equal(countCalls(mainFile, 'CombatLabExtension.create'), 1, 'main.ts must install CombatLabExtension directly once.');
assert.equal(countCalls(mainFile, 'createCombatLabFoundationExtension'), 0);

const extensionClass = findClass(extensionFile, 'CombatLabExtension');
const properties = new Set(extensionClass.members
  .filter(ts.isPropertyDeclaration)
  .map((member) => member.name.getText(extensionFile)));
for (const property of ['workspaceServices', 'unregisterWorkspaceServices', 'removeSelectionTickerListener']) {
  assert.equal(properties.has(property), true, `CombatLabExtension must own typed ${property}.`);
}
assert.equal(countCalls(extensionFile, 'CombatLabWorkspaceServices.create'), 1, 'Workspace services must be created once in the extension.');
assert.equal(countCalls(extensionFile, 'registerCombatLabWorkspaceServices'), 1, 'The one services object must be registered once.');
assert.equal(countCalls(extensionFile, 'context.addTickerListener'), 1, 'Selection synchronization must use one owned ticker listener.');
assert.match(sources.extension, /registerCombatLabWorkspaceServices\(\s*this\.workspace\.root,\s*this\.workspaceServices,/s);
assert.match(sources.extension, /\(\) => this\.workspaceServices\.selection\.syncFromState\(\)/);

const destroyMethod = findMethod(extensionClass, extensionFile, 'destroy');
const teardownMethod = findMethod(extensionClass, extensionFile, 'teardownFoundationServices');
const destroyText = destroyMethod.getText(extensionFile);
const teardownText = teardownMethod.getText(extensionFile);
assert.ok(destroyText.indexOf('this.teardownFoundationServices()') < destroyText.indexOf('this.batchPanel.destroy()'),
  'Foundation teardown must run before the ordinary extension teardown.');
assertOrder(teardownText, [
  'this.workspaceServices.mapTools.cancel()',
  'this.removeSelectionTickerListener',
  'this.unregisterWorkspaceServices',
  'this.workspaceServices.destroy()',
]);
assert.match(teardownText, /runTeardownStep/g, 'Every foundation teardown step must be isolated.');

const forbiddenFoundationCoupling = [
  'CombatLabExtensionFoundationInternals',
  'as unknown as CombatLabExtensionFoundationInternals',
  "querySelector<HTMLElement>('.combat-lab-stage10-program-host')",
  "querySelector<HTMLElement>('.combat-lab-stage10-scene-host')",
  'nextElementSibling',
  "closest<HTMLElement>('[data-map-mode]')",
  "closest<HTMLElement>('.combat-lab-participant-card[data-role-id]')",
  "root.addEventListener('click'",
  'statusObserver',
];
for (const token of forbiddenFoundationCoupling) {
  assert.equal(sources.extension.includes(token), false, `Forbidden foundation coupling remains: ${token}`);
}

const mutationObservers = collectNodes(extensionFile, ts.isNewExpression)
  .filter((node) => node.expression.getText(extensionFile) === 'MutationObserver');
assert.equal(mutationObservers.length, 1, 'Only the existing focused diagnostics observer may remain.');
assert.equal(ancestorFunctionName(mutationObservers[0], extensionFile), 'installLegacyMetricsView');
assert.match(sources.extension, /observer\.observe\(diagnostics,/,
  'The remaining observer must watch diagnostics, not map-mode status.');

assert.match(sources.extension, /onMapModeChanged: \(mode\) => \{/);
assert.match(sources.extension, /this\.workspaceServices\.mapTools\.setPersistentMode\(/);
assert.match(sources.extension, /this\.workspaceServices\.mapTools\.refreshStatus\(\)/);
assert.doesNotMatch(findMethod(extensionClass, extensionFile, 'updateInteractionState').getText(extensionFile), /mapModeStatus\.textContent/,
  'Only the map-tool coordinator may own its status host text.');

assert.equal(interfaceHasProperty(participantFile, 'CombatLabParticipantEditorOptions', 'onSelectRole'), true);
assert.equal(interfaceHasProperty(roleFile, 'CombatLabRoleEditorOptions', 'onSelectRole'), true);
assert.equal(interfaceHasProperty(sceneFile, 'CombatLabScenePanelOptions', 'onSelectRole'), true);
assert.match(sources.participant, /this\.options\.onSelectRole\?\.\(role\.roleId\)/);
assert.match(sources.role, /onSelectRole: options\.onSelectRole/);
assert.match(sources.scene, /onSelectRole: options\.onSelectRole/);
assert.match(sources.extension, /onSelectRole: \(roleId\) => this\.selectRoleUnit\(roleId\)/);
assert.match(sources.extension, /this\.workspaceServices\.selection\.select\(\{/);
assert.doesNotMatch(sources.extension, /\bselectUnit\(/, 'CombatLabExtension must select participants only through the canonical controller.');
assert.match(sources.extension, /this\.workspaceServices\.selection\.reconcileFromState\(\)/,
  'Experiment replacement must force role-mapping reconciliation.');

console.log('Combat Lab explicit foundation composition behavior smoke passed.');

function parse(path, source) {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  assert.equal(file.parseDiagnostics.length, 0, `${path} must parse without TypeScript syntax errors.`);
  return file;
}

function importsModule(file, moduleName) {
  return file.statements.some((statement) => ts.isImportDeclaration(statement)
    && statement.moduleSpecifier.text === moduleName);
}

function findClass(file, name) {
  const result = file.statements.find((statement) => ts.isClassDeclaration(statement)
    && statement.name?.text === name);
  assert.ok(result, `Class ${name} must exist.`);
  return result;
}

function findMethod(classNode, file, name) {
  const result = classNode.members.find((member) => ts.isMethodDeclaration(member)
    && member.name.getText(file) === name);
  assert.ok(result, `Method ${name} must exist.`);
  return result;
}

function countCalls(file, expressionText) {
  return collectNodes(file, ts.isCallExpression)
    .filter((node) => node.expression.getText(file) === expressionText).length;
}

function collectNodes(root, predicate) {
  const result = [];
  const visit = (node) => {
    if (predicate(node)) result.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return result;
}

function ancestorFunctionName(node, file) {
  let current = node.parent;
  while (current) {
    if (ts.isFunctionDeclaration(current)) return current.name?.getText(file) ?? null;
    current = current.parent;
  }
  return null;
}

function interfaceHasProperty(file, interfaceName, propertyName) {
  const declaration = file.statements.find((statement) => ts.isInterfaceDeclaration(statement)
    && statement.name.text === interfaceName);
  assert.ok(declaration, `Interface ${interfaceName} must exist.`);
  return declaration.members.some((member) => member.name?.getText(file) === propertyName);
}

function assertOrder(source, tokens) {
  let previous = -1;
  for (const token of tokens) {
    const current = source.indexOf(token);
    assert.ok(current >= 0, `Expected teardown token: ${token}`);
    assert.ok(current > previous, `Teardown token is out of order: ${token}`);
    previous = current;
  }
}
