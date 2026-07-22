import { validateAgentDocuments as validateCoreAgentDocuments } from './agent_docs_lib.mjs';
import { validateActiveMarkdownLinks } from './agent_docs_markdown_links.mjs';

const FATAL_CORE_ERRORS = [
  'unable to load canonical metadata:',
  'docs/ai/repo-context.json: active subproject not found:',
];

function isFatalCoreError(error) {
  return FATAL_CORE_ERRORS.some((prefix) => error.startsWith(prefix))
    || error === 'docs/ai/repo-context.json: missing required field activeSubprojects';
}

export async function validateAgentDocuments(root) {
  const core = await validateCoreAgentDocuments(root);
  const markdown = await validateActiveMarkdownLinks(root);
  const fatalErrors = core.errors.filter(isFatalCoreError);
  const advisoryErrors = core.errors.filter((error) => !isFatalCoreError(error));

  return {
    errors: fatalErrors,
    warnings: [
      ...core.warnings,
      ...advisoryErrors,
      ...markdown.errors,
      ...markdown.warnings,
    ],
  };
}
