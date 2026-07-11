export function prepareGraphForInstantPreview(value) {
  if (!isRecord(value) || !Array.isArray(value.nodes)) return value;
  return {
    ...value,
    nodes: value.nodes.map((node) => {
      if (!isRecord(node)) return node;
      if (node.type === 'SequenceWithMemory') {
        return { ...node, type: 'ActionBranch', children: [] };
      }
      if (node.type === 'Wait') {
        return { ...node, type: 'ActionBranch', children: [] };
      }
      return node;
    }),
  };
}

export function hasStatefulPreviewNodes(value) {
  return isRecord(value)
    && Array.isArray(value.nodes)
    && value.nodes.some((node) => isRecord(node) && (node.type === 'SequenceWithMemory' || node.type === 'Wait'));
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
