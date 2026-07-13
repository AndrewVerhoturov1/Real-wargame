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
