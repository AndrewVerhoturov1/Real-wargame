## Summary

- добавляет FireTask V2 для `single`, `short_burst`, `long_burst` и `suppress`;
- использует опубликованные `weapon_ppsh41@1`, `ammo_762x25_tokarev@1` и `loadout_submachine_gunner@1` без новой ревизии каталога;
- фиксирует каждый патрон очереди отдельным атомарным `commitShot`;
- сохраняет темп оружия, частично выполненную очередь, отдачу, активные пули и незавершённые окна подавления;
- создаёт подавление только из физических `near_miss`, `near_impact` и `direct_hit`;
- исключает повторное подавление цели прямого попадания той же пулей;
- оставляет реакцию на подавление будущему Graph v2.

## Scope boundaries

Не изменялись Graph v2, `InvestigateContact`, внимание, редактор нод, примеры графов, интерфейс и рабочие процессы. Не добавлены пулемёт, установка оружия, помощник, автоматический поиск укрытия, автоматическая смена позы, deployment, Playwright или Chromium.

## Verification result

`PR Risk CI` run `#538` на кодовом HEAD `9696744e207bac166c96b4120bcd3bc3d8a44d25` завершён успешно:

- документация и политика репозитория — PASS;
- TypeScript — PASS;
- `combat-foundation:smoke` — PASS;
- Stage 8 smoke: автоматический огонь, опорные точки, физическое подавление, save/load и стресс `4096` пуль — PASS;
- perception smoke — PASS;
- production build — PASS;
- exact-head evidence decision — PASS.

Отдельный полный шлюз `npm run infantry-combat-stage8:verify` подготовлен для независимого ручного запуска. Браузерные и тяжёлые интерактивные проверки не запускались: интерфейс не изменён, а Stage 8 прямо исключает Playwright/Chromium.

TESTED_IMPLEMENTATION_HEAD: set-in-live-pr-body

## Performance impact

hot path: фиксированный баллистический подшаг, атомарная фиксация каждого патрона очереди и физическая агрегация подавления;

worst-case complexity: `O(projectile pool capacity + local spatial candidates + bounded suppression events)`; фиксированный проход пула 4096, без `projectile × all units`;

main-thread work: только существующий общий simulation/combat tick; отдельный таймер или второй интегратор не добавлен;

full-map builds: отсутствуют;

shared prepared data: существующие `CombatUnitSpatialIndex`, `MapObjectSpatialIndex`, крупная геометрия тела и пул физических пуль;

worker and queue budget: workers не добавлены; буфер подавления ограничен 32768 записями, максимум 8 событий на пулю за подшаг и 32 ближайших кандидата;

cache owner/key/limit: новых игровых кэшей нет; только runtime-owned восстанавливаемые scratch-буферы в `WeakMap`;

invalidation revisions: асинхронных результатов нет; всё авторитетное состояние сериализуется напрямую;

memory estimate: дополнительный `Float64Array(4096)` — 32768 байт; массив ссылок буфера на 32768 элементов — примерно 256 КиБ плюс ограниченные записи текущего подшага;

teardown: scratch-состояние освобождается вместе с runtime; долговременные источники истины не находятся в `WeakMap`;

before metrics: разрешённая основа `f7eea38163be07c70d83314b5b6f3a1ae1cb5855` со Stage 7;

after metrics: зелёный headless-сценарий с 4096 активными пулями и зелёный точный `PR Risk CI`;

exact-head enforced workflow: `PR Risk CI` на точном PR HEAD;

remaining risks: численные коэффициенты подавления требуют последующей калибровки на испытательном стенде, но архитектурные пределы и физическое происхождение событий зафиксированы тестами.
