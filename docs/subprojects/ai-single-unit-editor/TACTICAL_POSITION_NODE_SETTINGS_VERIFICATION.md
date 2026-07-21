# Проверка настроек тактических позиций

Этот файл фиксирует штатную проверку интеграции через черновой PR №154 после разрешения пользователя на GitHub Actions.

Проверяется merge-состояние рабочей ветки `feature/20260721-tactical-position-basis` с актуальной `real-wargame-preview`.

Обязательные команды:

- `npx tsc`;
- `npm run tactical-position-settings:smoke`;
- `npm run graph-v2:smoke`;
- `npm run tactical-position:smoke`;
- `npm run node-contract-ui:smoke`;
- `npm run build`;
- `npm run verify:preview` перед ручным Vercel Preview.

Отдельная регрессия проверяет, что старый программный запрос с `maxRouteExpansions = 48` не расширяет больше 48 клеток. Управляемая карта теста явно задаёт направленные поля и значения по позам, поэтому результат не зависит от версии Node или построителя общей статической основы.

Этот документ не меняет параметры симуляции и нужен только для прослеживаемости проверки.
