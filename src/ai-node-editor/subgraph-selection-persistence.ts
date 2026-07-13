export {};

// The Russian human panel, the contract form, and the inspector are three views
// of the same Subgraph parameter. Keep them synchronized before the existing
// stateful-node change handler asks the main editor to save and re-render.
document.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement) || target.id !== 'stateful-subgraph-id') return;

  const selectedSubgraphId = target.value;
  const inspectorSubgraph = document.querySelector<HTMLSelectElement>('#inspector-subgraph-id');
  if (inspectorSubgraph) inspectorSubgraph.value = selectedSubgraphId;

  const contractSubgraph = document.querySelector<HTMLInputElement | HTMLSelectElement>(
    '.contract-parameter-field[data-param-id="subgraphId"]',
  );
  if (contractSubgraph) contractSubgraph.value = selectedSubgraphId;
}, true);

function normalizeBreadcrumbLabels(): void {
  const breadcrumb = document.querySelector<HTMLElement>('.graph-breadcrumb span');
  if (!breadcrumb) return;
  const labels = (breadcrumb.textContent ?? '').split(' → ').map((label) => label.trim()).filter(Boolean);
  const uniqueAdjacent = labels.filter((label, index) => index === 0 || label !== labels[index - 1]);
  const normalized = uniqueAdjacent.join(' → ');
  if (normalized && breadcrumb.textContent !== normalized) breadcrumb.textContent = normalized;
}

const breadcrumbObserver = new MutationObserver(() => normalizeBreadcrumbLabels());
breadcrumbObserver.observe(document.body, { childList: true, subtree: true });
normalizeBreadcrumbLabels();
