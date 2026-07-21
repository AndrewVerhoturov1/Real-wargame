# Проверка настроек тактических позиций

Этот файл фиксирует запуск штатной проверки интеграции через черновой PR №154 после разрешения пользователя на GitHub Actions.

Проверяется merge-состояние рабочей ветки `feature/20260721-tactical-position-basis` с актуальной `real-wargame-preview`.

Обязательные команды:

- `npx tsc`;
- `npm run tactical-position-settings:smoke`;
- `npm run graph-v2:smoke`;
- `npm run tactical-position:smoke`;
- `npm run node-contract-ui:smoke`;
- `npm run build`.

Этот документ не меняет параметры симуляции и нужен только для прослеживаемости проверки.
