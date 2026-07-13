# HANDOFF — Graph v2, типизированные контракты и подграфы

Updated: 2026-07-13  
Repository: `AndrewVerhoturov1/Real-wargame`  
Base branch: `real-wargame-preview`  
Isolated branch: `feat/ai-graph-v2-contracts-subgraphs-2026-07-13`  
Transfer status: **не переносить в preview без отдельной прямой команды пользователя**.

## Реализовано

- завершены `WaitForEvent`, `Timeout` и ограниченный `Retry`;
- создан единый реестр контрактов 36 типов нод;
- добавлены типизированные порты и строгая совместимость;
- добавлен Graph v2 и детерминированная миграция Graph v1;
- неизвестные старые данные сохраняются в `legacyMetadata`;
- проверяются параметры, диапазоны, enum, порты, дети, обязательные входы, достижимость, выходы, циклы и рекурсия подграфов;
- память разделена на пять областей;
- реализован вложенный runtime подграфов с snapshot/restore и единичным cleanup;
- добавлены четыре подграфа: `take_cover`, `reload_weapon`, `react_to_fire`, `move_and_observe`;
- редактор показывает типы портов, блокирует неверное соединение, строит параметры из контрактов, мигрирует Graph v1, открывает подграфы и показывает кликабельные ошибки;
- debug overlay показывает активный подграф, полный путь и ключи областей памяти;
- локальный engine preview принимает Graph v1/v2;
- добавлен сквозной сценарий `graph-v2-scenario:smoke`.

## Архитектурные границы

- `AiGraphRunner` остаётся чистым мгновенным вычислителем;
- `AiGraphRuntime` и composite runtime владеют длительным исполнением;
- `AiSubgraphRuntime` изолирует bindings и локальную память;
- `AiGameBridge` остаётся адаптером к живой игре;
- `SimulationTick` остаётся единственным владельцем физических координат;
- нет GOAP, HTN, произвольного параллелизма, TQS, Smart Objects или multi-agent scheduler.

## Автоматические проверки

Фокусные проверки, которые должны оставаться зелёными:

```text
npm run graph-v2:smoke
npm run runtime-modifiers:smoke
npm run subgraph:smoke
npm run graph-v2-scenario:smoke
npm run node-contract-ui:smoke
npm run validate:ai-graph
npm run runtime-session:smoke
npm run runtime-snapshot:smoke
npm run runtime-scene:smoke
npm run reactive-runtime:smoke
npm run editor:smoke
npm run engine:smoke
npm run build
```

Перед передачей выполнить полный набор из задания и обязательную реальную браузерную проверку. Свежие PNG должны соответствовать итоговому commit SHA и быть открыты/осмотрены.

## Ручная проверка

Полный список находится в:

```text
docs/subprojects/ai-single-unit-editor/GRAPH_V2_TYPED_CONTRACTS_AND_SUBGRAPHS.md
```

Ключевые пункты: предупреждение Graph v1, миграция, неверная связь, подграф и breadcrumb, кликабельная ошибка, активный подграф и области памяти, восстановление движения внутри подграфа.

## Ветка и перенос

`main` не менять. `real-wargame-preview` не менять. Временная ветка должна оставаться полностью готовой к отдельной команде переноса.
