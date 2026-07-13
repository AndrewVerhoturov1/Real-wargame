const STATEFUL_PREVIEW_NODE_TYPES = new Set([
  'SequenceWithMemory',
  'Wait',
  'MoveToBlackboardPosition',
  'Reload',
  'WaitForEvent',
  'Timeout',
  'Retry',
  'ReactiveSequence',
  'Subgraph',
]);

export function prepareGraphForInstantPreview(value) {
  if (!isRecord(value) || !Array.isArray(value.nodes)) return value;
  return {
    ...value,
    nodes: value.nodes.map((node) => {
      if (!isRecord(node)) return node;
      if (STATEFUL_PREVIEW_NODE_TYPES.has(node.type)) {
        return { ...node, type: 'ActionBranch', children: [] };
      }
      return node;
    }),
  };
}

export function hasStatefulPreviewNodes(value) {
  return isRecord(value)
    && Array.isArray(value.nodes)
    && value.nodes.some((node) => isRecord(node) && STATEFUL_PREVIEW_NODE_TYPES.has(node.type));
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
