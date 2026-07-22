import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const repoRoot = process.cwd();
const guardedFiles = [
  'src/core/combat/BallisticRaycast.ts',
  'src/core/combat/BallisticTrace.ts',
  'src/core/cover/SmallArmsCoverEvaluation.ts',
  'src/core/editor/GameEditorPlacement.ts',
  'src/core/map/MapRuntimeState.ts',
  'src/core/pathfinding/GridNavigation.ts',
  'src/core/spatial/MapObjectSpatialIndex.ts',
  'src/core/visibility/VisibilityStaticGrid.ts',
];

const violations = [];
for (const relativePath of guardedFiles) {
  const absolutePath = path.join(repoRoot, relativePath);
  const sourceText = await readFile(absolutePath, 'utf8');
  const sourceFile = ts.createSourceFile(relativePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  visit(sourceFile, sourceFile, relativePath);
}

assert.deepEqual(
  violations,
  [],
  `Independent size-dependent map-object center formulas are forbidden:\n${violations.join('\n')}`,
);
console.log('Map object geometry source contract smoke passed.');

function visit(node, sourceFile, relativePath) {
  if (ts.isBinaryExpression(node) && isForbiddenCenterFormula(node)) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    violations.push(`${relativePath}:${line + 1}:${character + 1} ${node.getText(sourceFile)}`);
  }
  ts.forEachChild(node, (child) => visit(child, sourceFile, relativePath));
}

function isForbiddenCenterFormula(expression) {
  if (expression.operatorToken.kind !== ts.SyntaxKind.PlusToken
    && expression.operatorToken.kind !== ts.SyntaxKind.MinusToken) {
    return false;
  }
  return axisPair(expression.left, expression.right) || axisPair(expression.right, expression.left);
}

function axisPair(positionExpression, halfSizeExpression) {
  const position = unwrap(positionExpression);
  const halfSize = unwrap(halfSizeExpression);
  if (!ts.isPropertyAccessExpression(position) || !ts.isBinaryExpression(halfSize)) return false;
  if (halfSize.operatorToken.kind !== ts.SyntaxKind.SlashToken) return false;

  const divisor = unwrap(halfSize.right);
  const size = unwrap(halfSize.left);
  if (!ts.isNumericLiteral(divisor) || Number(divisor.text) !== 2) return false;
  if (!ts.isPropertyAccessExpression(size)) return false;

  return (position.name.text === 'x' && size.name.text === 'widthCells')
    || (position.name.text === 'y' && size.name.text === 'heightCells');
}

function unwrap(node) {
  let current = node;
  while (ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isNonNullExpression(current)) {
    current = current.expression;
  }
  return current;
}
