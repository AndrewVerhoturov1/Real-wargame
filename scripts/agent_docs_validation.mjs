import { validateAgentDocuments as validateCoreAgentDocuments } from './agent_docs_lib.mjs';
import { validateActiveMarkdownLinks } from './agent_docs_markdown_links.mjs';

export async function validateAgentDocuments(root) {
  const core = await validateCoreAgentDocuments(root);
  const markdown = await validateActiveMarkdownLinks(root);
  return {
    errors: [...core.errors, ...markdown.errors],
    warnings: [...core.warnings, ...markdown.warnings],
  };
}
