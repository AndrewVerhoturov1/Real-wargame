# Stage 5: детерминированное прицеливание, упреждение и отдача

## Назначение

Stage 5 заменяет линейное накопление `aimQuality` из Stage 3 на ограниченный физический слой:

```text
FireTask
  -> perception-only tracking 5 Гц
  -> AimSolutionRuntimeV1
  -> физическое наведение
  -> факторный расчёт
  -> диагностическая вероятность
  -> отдача до выстрела
  -> детерминированный угловой разброс
  -> окончательное направление projectile
```

`predictedHitProbability` является только фактом диагностики. Она не разрешает попадание, не выбирает исход столкновения и не изменяет пулю после `commitShot`.

## Владение состоянием

Состояние решения принадлежит активной `FireTaskRuntimeV1`:

- `AimTrackingRuntimeV1` — планировщик, два воспринимаемых образца и счётчик обновлений;
- `AimSolutionRuntimeV1` — воспринимаемая цель, оценённая скорость, упреждение, направления и качества;
- `AimFactorBreakdownV1` — полный диагностический расклад множителей.

Состояние отдачи принадлежит `InfantryWeaponInstanceV1`:

- `pitchOffsetRadians`;
- `yawOffsetRadians`;
- `lastUpdatedSeconds`;
- `sequence`.

Глобальная шина событий и второй источник боевой истины не создаются.

## Контракт perception-only

При наличии `contactId` расчёт читает только соответствующую запись из:

```text
shooter.perceptionKnowledge.contacts
```

Используются:

- `lastKnownPosition`;
- `lastObservedSeconds`;
- `lastUpdatedSeconds`;
- `confidence`;
- `uncertaintyCells`;
- `visibleNow`;
- `observedNow`;
- ранее сохранённые воспринимаемые образцы.

`sourceUnitId` не участвует в расчёте позиции или скорости. Код прицеливания не ищет цель в `state.units` и не читает её фактическое движение. Изменение истинной позиции без нового perception-образца не меняет `AimSolution`.

Для задачи без `contactId` `task.target` считается фиксированной воспринимаемой мировой точкой.

## Планировщик 5 Гц

Именованная константа:

```text
AIM_TRACKING_INTERVAL_SECONDS = 0.2
```

`AimTrackingRuntimeV1` сохраняет:

- `lastTrackingBoundarySeconds`;
- `nextTrackingBoundarySeconds`;
- `trackingUpdateCount`.

Тик обрабатывается как последовательность событий. Если граница 0,2 секунды совпадает с окончанием тика, она относится к этому тику. Большой тик проходит все положенные границы по возрастанию времени. Между границами новое perception-решение не вычисляется.

Время округляется до 12 знаков после запятой. Источником времени служит только время симуляции. После сохранения и загрузки следующая граница продолжается без пересчёта.

## Оценка воспринимаемой скорости

Ненулевая скорость появляется только после двух разных perception-образцов.

Для образцов `p0`, `p1`:

```text
rawVelocity = (p1 - p0) / (t1 - t0)
```

Правила:

- `dt <= 0` не создаёт новую оценку;
- модуль ограничен константой `MAX_ESTIMATED_TARGET_SPEED_METRES_PER_SECOND = 25`;
- первый корректный вектор принимается напрямую;
- последующие векторы сглаживаются:

```text
smoothed = old * (1 - alpha) + raw * alpha
alpha = AIM_VELOCITY_SMOOTHING_ALPHA = 0.5
```

Порядок массива контактов не влияет на результат: выбирается контакт по стабильному `contactId`.

## Упреждение и компенсация гравитации

Используются положение дульного среза, воспринимаемая позиция, оценённая скорость, скорость патрона и гравитация Stage 4.

Для каждого из трёх фиксированных уточнений:

```text
flightTime = distance(muzzle, predictedPoint) / muzzleVelocity
predictedXY = perceivedXY + estimatedVelocityXY * flightTime
predictedZ = perceivedZ
           + estimatedVelocityZ * flightTime
           + 0.5 * gravity * flightTime^2
```

Именованные константы:

- `AIM_LEAD_ITERATIONS = 3`;
- `STAGE3_GRAVITY_METRES_PER_SECOND_SQUARED = 9.81` — существующая гравитация projectile runtime.

Сопротивление воздуха, ветер и чтение будущей истинной траектории цели не добавляются.

## Физическое наведение и качества

Разделены три величины:

- `physicalAimQuality` — прогресс физического наведения;
- `solutionQuality` — качество perception/lead-решения;
- `usableAimQuality` — итог для порога.

```text
usableAimQuality = clamp01(physicalAimQuality * solutionQuality)
```

Физическое качество растёт непрерывно:

```text
physicalAimQuality += aimQualityPerSecond * factorAimRate * deltaSeconds
```

Текущее направление интерполируется от направления в начале сегмента к последнему `desiredDirection`. Новый perception-образец меняет желаемое направление, но не телепортирует оружие.

Commit разрешён только когда решение действительно и:

```text
usableAimQuality >= minimumSolutionQuality
```

Устаревание или рост неопределённости могут снова опустить итог ниже порога.

## Факторный расчёт

Production Stage 5 подключает:

- текущую позу;
- `movementRuntime.isMoving`;
- фактическую скорость `velocityCellsPerSecond * metersPerCell`;
- сохранённый `shootingSkill` в диапазоне `[0, 1]`;
- владение классом оружия: `untrained | trained | specialist`.

Используются параметры снимка оружия:

- `baseDispersionRadians`;
- `aimQualityPerSecond`;
- `movingDispersionMultiplier`;
- `postureDispersionMultiplier`;
- `recoilPitchRadiansPerShot`;
- `recoilYawRadiansPerShot`;
- `recoilRecoveryPerSecond`.

Общая эффективная дисперсия:

```text
effectiveDispersion = baseDispersion
  * postureMultiplier
  * movementMultiplier
  * skillMultiplier
  * proficiencyMultiplier
  * fatigueMultiplier
  * woundMultiplier
```

Каждый промежуточный множитель сохраняется в `AimFactorBreakdownV1`.

### Снимок навыка

При экипировке оружие получает неизменяемый `WeaponOperatorProfileV1`:

- `shootingSkill = weaponSkill / 100`;
- копию `proficiencyByWeaponClass` из loadout.

После экипировки runtime не зависит от изменяемого реестра каталогов. Старые сцены получают нейтральные значения `shootingSkill = 0.5` и `trained`.

### Stage 6-7 adapters

Чистый калькулятор принимает:

- `fatigue` в `[0, 1]`;
- `woundStabilityMultiplier`.

Production Stage 5 передаёт строго нейтральные значения:

```text
fatigue = 0
woundStabilityMultiplier = 1
```

Реальное состояние усталости или ран не создаётся.

## Движение

Если `allowFireWhileMoving === false` и `movementRuntime.isMoving === true`, `commitShot` возвращает `movement_forbidden` до любых авторитетных изменений.

Если огонь на ходу разрешён, движение увеличивает дисперсию и тем самым уменьшает диагностическую вероятность. Боец автоматически не останавливается.

## Диагностическая вероятность

Используется грубая человеческая цель с именованной константой:

```text
COARSE_HUMAN_TARGET_RADIUS_METRES = 0.45
```

Для радиуса рассеивания:

```text
spreadRadius = distance * tan(effectiveDispersion) + uncertaintyMetres
geometric = targetRadius^2 / (targetRadius^2 + spreadRadius^2)
freshness = 1 / (1 + contactAgeSeconds / 5)
probability = clamp01(
  geometric
  * usableAimQuality
  * solutionQuality
  * freshness
)
```

Формула монотонна по обязательным направлениям: рост качества не ухудшает результат; рост дальности, дисперсии, неопределённости и возраста контакта не улучшает его.

## Детерминированный угловой разброс

Seed выводится только из стабильной строки:

```text
shooterId + weaponInstanceId + shotId
```

Используются 32-битный FNV-1a и фиксированное целочисленное перемешивание. `Math.random`, `Date.now` и порядок массивов не участвуют.

Две равномерные величины преобразуются в диск:

```text
radius = sqrt(u1) * effectiveDispersion
angle = u2 * 2π
yaw = radius * cos(angle)
pitch = radius * sin(angle)
```

Смещения применяются в локальном базисе `forward/right/up`, затем направление нормализуется.

## Отдача

Перед выстрелом текущее состояние лениво восстанавливается по времени симуляции:

```text
recovery = recoilRecoveryPerSecond
         * recoilRecoveryMultiplier
         * elapsedSeconds
```

Pitch и yaw приближаются к нулю без сканирования всех оружий на каждом тике.

Порядок успешного выстрела:

1. восстановить существующую отдачу;
2. включить её в направление текущей пули;
3. зафиксировать направление пули;
4. после успешного создания projectile добавить новый импульс отдачи;
5. увеличить `recoil.sequence` ровно один раз.

Yaw-импульс получает детерминированный знак и величину из `shotId`. Поза, навык, владение, а также нейтральные fatigue/wound-входы участвуют через факторный расчёт.

Failed commit и `already_committed` не добавляют отдачу.

## Атомарный commit

До первой авторитетной мутации повторно проверяются:

- активная задача и владение каналом оружия;
- экземпляр оружия и режим;
- действительность и порог AimSolution;
- разрешение огня в движении;
- наличие патрона;
- дульное препятствие;
- риск для союзника;
- вместимость projectile pool;
- повторный `projectileId`;
- корректность projectile candidate.

Первая авторитетная мутация — успешное резервирование одного слота пули. После него одним логическим commit применяются:

```text
один shotId
один патрон
одна projectile
одна запись commit ledger
один импульс recoil
```

Commit record сохраняет:

- направление до разброса;
- pitch/yaw разброса;
- pitch/yaw существующей отдачи;
- окончательное направление;
- диагностическую вероятность;
- эффективную дисперсию.

После создания projectile её скорость и направление автономны. Tracking больше не может изменить эту пулю.

## Коридор риска для союзников

Перед commit строится дешёвый угловой коридор вокруг направления с учётом:

- текущей отдачи;
- эффективной дисперсии;
- дистанции до рассчитанной точки;
- углового размера hit shape союзника.

Кандидаты берутся только через существующий `CombatUnitSpatialIndex`. Полный перебор `state.units`, pathfinding и прогноз движения союзников не применяются.

## Сохранение и миграция

Новые структуры имеют собственные `schemaVersion`, но внешние Stage 3-4 контейнеры сохраняют прежние версии для совместимости.

Нормализаторы:

- создают `AimTrackingRuntimeV1` при загрузке Stage 4 задачи;
- создают нейтральный профиль навыка;
- создают нулевую отдачу;
- сохраняют следующий tracking boundary и perception-образцы;
- сохраняют прогресс физического наведения;
- сохраняют отдачу и её время;
- допускают старые commit records без Stage 5 полей;
- сохраняют новые поля при V1→V2 projectile migration;
- reconciliation восстанавливает безопасные нулевые диагностические поля, если запись приходится строить из старой пули.

После загрузки velocity не вычисляется из истинного состояния цели. Seed будущего выстрела остаётся тем же, потому что основан на стабильных идентификаторах.

## Производительный контур

- tracking выполняется только для бойцов с активной `FireTask`;
- perception-решение — не чаще пяти раз в секунду на задачу;
- состояние ограничено двумя образцами на задачу и одной структурой recoil на оружие;
- коридор союзников использует spatial broad phase;
- projectile hot loop, SoA pool, generation handles и capacity `4096` не изменены;
- в projectile substep новые выделения памяти не добавлены;
- diagnostics показывает `trackingUpdateCount`;
- stress smoke проверяет 128 активных задач и ровно 640 обновлений за одну секунду без преждевременных пуль.

## Границы Stage 5

Не реализованы:

- ранения и пробитие тела;
- production fatigue, кровопотеря и первая помощь;
- автоматический огонь и очереди;
- подавление;
- развёртывание пулемёта;
- перезарядка и вторичное оружие;
- Graph v2 и action ports;
- полноценный интерфейс;
- deployment.
