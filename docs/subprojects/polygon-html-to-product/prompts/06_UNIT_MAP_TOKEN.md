# Prompt исполнителю ПЕШКА — новое отображение бойца на карте

Ты — исполнитель **ПЕШКА**.

В начале каждого отчёта напиши:

> Я — ПЕШКА. Отвечаю за визуальное отображение настоящего бойца на карте и уровни детализации знака.

## Контекст

Подпроект: «Перенос Полигона из HTML-прототипа в продукт».

Плановая база:

```text
repository: AndrewVerhoturov1/Real-wargame
base_branch: real-wargame-preview
base_commit: 26e5f7f3681a4cf03e58ae7137cfe67387a1e015
suggested_feature_branch: feature/20260817-polygon-unit-map-token
```

Перед созданием ветки заново получи exact current HEAD `real-wargame-preview`.

## Главная цель

Заменить текущее простое отображение `PixiUnitRenderer` на **принятую пользователем систему условных тактических знаков пехоты**, встроенную непосредственно в настоящий product renderer.

Это не отдельный прототип и не демонстрационная сцена. Каждый реальный `UnitModel` на карте должен использовать новый визуальный язык.

## Канонический визуальный контракт

Главный источник:

`docs/subprojects/soldier-topdown-appearance/UNIT_SYMBOL_SYSTEM.md`

Он уже принят пользователем и должен считаться базовым визуальным языком. Не возвращайся к фигуркам/человечкам и не придумывай другую систему без отдельного решения пользователя.

## Обязательные источники

Прочитай:

- `AGENTS.md`;
- `.agents/skills/real-wargame-orchestration/SKILL.md`;
- `.agents/skills/real-wargame-performance/SKILL.md`;
- `.agents/skills/real-wargame-screenshots/SKILL.md`;
- `docs/subprojects/polygon-html-to-product/INTEGRATION_STATUS.md`;
- `docs/subprojects/polygon-html-to-product/IMPLEMENTATION_WAVE_20260817.md`;
- `docs/subprojects/soldier-topdown-appearance/UNIT_SYMBOL_SYSTEM.md`;
- `docs/subprojects/polygon-prototype/ACCEPTED_INTERFACE_LINKAGE_V1.md`;
- `src/rendering/PixiUnitRenderer.ts`;
- `src/rendering/PixiApp.ts`;
- `src/core/units/UnitModel.ts`;
- camera/zoom APIs, необходимые для LOD;
- боевые runtime fields, которые уже используются renderer-ом для направления оружия/действия.

Старые ветки `feature/20260808-soldier-topdown-appearance*` можно изучать как research/prototype material, но они сильно разошлись с текущим preview. Не вливай их целиком и не возвращай отдельный prototype page в product flow.

## Что уже правильно в текущем renderer

`PixiUnitRenderer`:

- один owner отображения юнитов;
- persistent `views` по `unit.id`;
- reuse display objects вместо создания каждый frame;
- читает настоящие `UnitModel`;
- уже различает posture;
- оружие может вращаться по реальной aim solution либо facing;
- selection является presentation поверх canonical selected ids.

Сохрани эти архитектурные свойства.

## Требуемый визуальный язык

### Ближний масштаб

Основная форма по позе:

- стоя — круг;
- присел / движется пригнувшись — аккуратный скруглённый треугольник, вершиной по направлению корпуса;
- лёжа — вытянутый скруглённый прямоугольник вдоль тела.

Дополнительно там, где настоящий UnitModel даёт данные:

- маленькая точка направления корпуса;
- оружие с основанием внутри знака справа у условного плеча;
- реальное направление оружия отдельно от facing;
- роль/короткая подпись на ближнем масштабе;
- движение — один/два шеврона;
- aiming/fire indication;
- suppression — четыре маленьких угловых маркера;
- wound marker;
- commander star;
- смерть — серое полупрозрачное лежащее тело + небольшой крест, оружие скрыто.

### Средний масштаб

Сохранить:

- индивидуального бойца;
- позу;
- направление;
- оружие;
- ключевые состояния;
- commander marker;
- компактный aim/fire cue.

Убрать/уменьшить мелкий текст и второстепенный шум.

### Дальний масштаб

- обычный боец — маленький круг;
- пулемётчик/support — маленький квадрат, если роль/weapon owner это подтверждает;
- командир — звезда;
- убитый — приглушённый отдельный death mark;
- оружие/точная поза/направление скрываются.

Групповую область отделения реализуй только если на текущей базе есть надёжная squad identity/owner и это можно сделать bounded. Не создавай новый squad store ради графики.

## LOD

LOD должен зависеть от реального camera zoom/scale и иметь понятные пороги с hysteresis или другой защитой от дрожания, если это требуется.

Запрещено:

- пересоздавать весь знак каждый frame из-за микроскопического zoom change;
- читать DOM для определения масштаба;
- хранить gameplay state в renderer;
- создавать отдельные дубликаты unit views для каждого LOD.

## Данные, которых нет

Не выводи надпись/эффект, если product owner не даёт надёжную семантику.

Например:

- не угадывай commander по label;
- не угадывай weapon type по строке, если есть canonical identity;
- не рисуй wound, если реального wound status нет;
- не подделывай muzzle flash постоянным таймером без fire event/runtime signal.

В handoff перечисли, какие элементы принятого визуального контракта реально поддержаны текущей моделью, какие частично, какие требуют отдельной product capability.

## Selection

Selection highlight остаётся только presentation и читает canonical selected ids.

Можно привести highlight к новому дизайну, но нельзя менять selection store или input semantics — это ПУЛЬС.

## Производительность

Обязательно сохранить:

- persistent view reuse;
- bounded geometry rebuild по ключам/revisions;
- cleanup удалённых units;
- отсутствие allocations на каждый кадр без необходимости.

Добавь diagnostics/keys так, чтобы можно было доказать:

- неизменный unit не rebuild-ит геометрию каждый frame;
- смена posture перестраивает нужные части;
- смена LOD перестраивает только нужный view;
- удалённый unit освобождается.

Heavy performance run нужен только если фактический change risk по performance skill его требует; причину зафиксировать явно.

## Явно НЕ твоя зона

Не меняй:

- terrain/map presentation — КАРТА;
- selection semantics / Unit panel / posture commands — ПУЛЬС;
- Info/Attention/Memory — ЛИНЗА;
- editor logic — РЕДАКТОРЫ;
- right-click/context menu — КОНТЕКСТ;
- simulation combat semantics ради красивого эффекта.

## Проверки

Минимум:

1. renderer geometry unit tests/smoke для standing/crouched/prone/dead;
2. weapon direction follows real aim/facing source;
3. LOD near/medium/far;
4. selection highlight не меняет selection owner;
5. unchanged view reuse / bounded geometry rebuild;
6. removal/teardown;
7. TypeScript/noEmit;
8. production build;
9. risk-selected CI;
10. browser/screenshot QA exact final SHA.

Для визуальной QA подготовь сцену из **настоящих существующих units**, а не fake demo entities, и проверь минимум:

- разные позы;
- разные стороны;
- несколько weapon/role вариантов, которые реально доступны;
- selected/unselected;
- near/medium/far zoom;
- dead/incapacitated/stressed, если их можно получить штатным fixture/state без изменения production semantics.

## Критерии ACCEPT

- `PixiUnitRenderer` остаётся единственным product renderer owner;
- базовый язык строго соответствует `UNIT_SYMBOL_SYSTEM.md`;
- три LOD читаются и не шумят;
- weapon/facing/posture берутся из настоящих данных;
- нет fake soldiers;
- нет нового gameplay state;
- geometry reuse/performance не деградировали архитектурно;
- browser QA показывает реальные product units на настоящей карте;
- unsupported элементы визуального контракта честно перечислены.

## Возврат результата

Верни:

```text
executor: ПЕШКА
base_commit:
feature_branch:
current_commit:
visual_contract_coverage:
changed_files:
checks_run:
not_checked:
lod_contract:
performance_impact:
visual_qa:
unsupported_product_signals:
blockers:
next_integration_point: КАРТА + ПЕШКА + ПУЛЬС
preview_touched: no
main_touched: no
deployment_touched: no
```

Не делай merge/transfer/deployment самостоятельно.
