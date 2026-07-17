export {};

interface NumericOption {
  value: string;
  labelRu: string;
  labelEn: string;
}

interface StoredNode {
  id?: string;
  parameters?: Record<string, unknown>;
}

interface StoredGraph {
  nodes?: StoredNode[];
}

const GRAPH_STORAGE_KEY = 'real-wargame.ai-node-editor.graph.v6';

const TEST_LAB_NUMERIC_OPTIONS: readonly NumericOption[] = [
  { value: 'threatDistance', labelRu: 'Расстояние до главной угрозы', labelEn: 'Distance to main threat' },
  { value: 'directionToThreat', labelRu: 'Направление на угрозу', labelEn: 'Direction to threat' },
  { value: 'threatAngle', labelRu: 'Угол сектора угрозы', labelEn: 'Threat sector angle' },
  { value: 'coverProtection', labelRu: 'Текущая защита укрытия', labelEn: 'Current cover protection' },
  { value: 'bestCoverQuality', labelRu: 'Качество лучшего укрытия', labelEn: 'Best cover quality' },
  { value: 'currentPositionDanger', labelRu: 'Опасность текущей позиции', labelEn: 'Current position danger' },
  { value: 'currentExpectedProtection', labelRu: 'Ожидаемая защита позиции', labelEn: 'Current expected protection' },
  { value: 'routeDanger', labelRu: 'Опасность текущего маршрута', labelEn: 'Current route danger' },
  { value: 'threatConfidence', labelRu: 'Уверенность в главной угрозе', labelEn: 'Main threat confidence' },
];

function extendNumericSelectors(): void {
  const selectedNode = readSelectedStoredNode();
  const language = document.documentElement.lang === 'en' ? 'en' : 'ru';

  document.querySelectorAll<HTMLSelectElement>(
    '.human-node-panel select[data-param-key="sourceKey"], .human-node-panel select[data-param-key="modifierKey"]',
  ).forEach((select) => {
    for (const item of TEST_LAB_NUMERIC_OPTIONS) {
      if (select.querySelector(`option[value="${item.value}"]`)) continue;

      const option = document.createElement('option');
      option.value = item.value;
      option.textContent = language === 'ru'
        ? `${item.labelRu} · ${item.value}`
        : `${item.labelEn} · ${item.value}`;
      select.appendChild(option);
    }

    const key = select.dataset.paramKey;
    const storedValue = key ? selectedNode?.parameters?.[key] : undefined;
    if (typeof storedValue === 'string' && TEST_LAB_NUMERIC_OPTIONS.some((item) => item.value === storedValue)) {
      select.value = storedValue;
    }
  });
}

function readSelectedStoredNode(): StoredNode | undefined {
  const selectedNodeId = document.querySelector<HTMLElement>('.graph-node.selected[data-node-id]')?.dataset.nodeId;
  if (!selectedNodeId) return undefined;

  try {
    const raw = localStorage.getItem(GRAPH_STORAGE_KEY);
    if (!raw) return undefined;
    const graph = JSON.parse(raw) as StoredGraph;
    return graph.nodes?.find((node) => node.id === selectedNodeId);
  } catch {
    return undefined;
  }
}

const observer = new MutationObserver(() => extendNumericSelectors());
observer.observe(document.body, { childList: true, subtree: true });
extendNumericSelectors();
