## Summary

- добавляет FireTask V2 для `single`, `short_burst`, `long_burst` и `suppress`;
- использует опубликованные `weapon_ppsh41@1`, `ammo_762x25_tokarev@1` и `loadout_submachine_gunner@1` без новой ревизии каталога;
- фиксирует каждый патрон очереди отдельным атомарным `commitShot`;
- сохраняет темп оружия, частично выполненную очередь, отдачу, активные пули и незавершённые окна подавления;
- создаёт подавление только из физических `near_miss`, `near_impact` и `direct_hit`;
- оставляет реакцию на подавление будущему Graph v2.

## Scope boundaries

Не изменялись Graph v2, `InvestigateContact`, внимание, редактор нод, примеры графов, интерфейс и рабочие процессы. Не добавлены пулемёт, установка оружия, помощник, автоматический поиск укрытия, автоматическая смена позы, deployment, Playwright или Chromium.

## Verification selection

- обязательные автоматические проверки `PR Risk CI`;
- `npm run infantry-combat-stage8:smoke`;
- `npm run infantry-combat-stage8:forbidden-scan`;
- `npm run infantry-combat-stage8:verify`;
- сохранённые проверки Stage 5–7, каталогов, физических действий, движения, восприятия и Graph v2;
- TypeScript и один production build;
- браузерные и тяжёлые интерактивные проверки не запускаются: интерфейс и браузерный сценарий не изменены, а задание прямо исключает Playwright/Chromium.

TESTED_IMPLEMENTATION_HEAD: none

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

after metrics: обязательный headless-сценарий с 4096 активными пулями и точный `PR Risk CI`;

exact-head enforced workflow: `PR Risk CI` на точном PR HEAD;

remaining risks: численные коэффициенты подавления требуют последующей калибровки на испытательном стенде, но архитектурные пределы и физическое происхождение событий зафиксированы тестами.
