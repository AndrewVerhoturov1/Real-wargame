# PixiJS Skills Index

**Этот файл обязателен для чтения внешним web-chat и Codex при получении задач, связанных с PixiJS, canvas, 2D-графикой, сценой, ассетами, SVG, событиями, производительностью, миграцией на v8 и любыми смежными темами.**

## Расположение

Все PixiJS skills находятся в `.agents/skills/<skill-name>/SKILL.md`.
Справочные материалы (references) лежат в `.agents/skills/<skill-name>/references/`.

## Как читать

1. **Всегда начинайте с `.agents/skills/pixijs/SKILL.md`** — это точка входа, общая картина PixiJS, базовое использование.
2. Затем читайте **только релевантные** дополнительные skills (см. таблицу ниже).
3. Не читайте все skills подряд — это избыточно.

---

## Список установленных PixiJS skills

| Skill | Когда читать | Когда НЕ читать | Типичные задачи | Особые предупреждения |
|---|---|---|---|---|
| `pixijs` | Всегда при любом PixiJS task. | — | Общее понимание PixiJS, создание приложения, базовая настройка, сцена. | **Точка входа.** Содержит контекст для всех остальных skills. |
| `pixijs-application` | Создание/настройка `Application`. Запуск/остановка рендера, init options, background, resize. | Если задача только про графику, спайты или события без создания app. | `new Application()`, `app.init()`, HTML-структура, canvas sizing, background color. | Имеет references/application-options.md. |
| `pixijs-assets` | Загрузка текстур, spritesheet, SVG, шрифтов, видео, GIF. Управление кешем, бандлами, прогрессом загрузки, manifests. | Если ассеты уже загружены или задача не про ресурсы. | `Assets.load()`, `Assets.add()`, bundles, caching, прогресс-бары, compressed textures, spritesheet. | Имеет 11 references/~. **SVG — отдельный reference.** |
| `pixijs-scene-graphics` | Рисование примитивов (круги, прямоугольники, линии, полигоны). Кастомная векторная графика. | Если достаточно готовых спрайтов или текстур. | `Graphics` — circle, rect, poly, roundRect, fill, stroke, path, texture generation. | **Самый большой SKILL.md** (24.9 KB). Графика — часто используемая тема. |
| `pixijs-scene-container` | Группировка объектов. Добавление/удаление детей, sorting, culling, хит-тесты, трансформации контейнера. | Если работаете с одним объектом на сцене. | `Container`, `addChild`, `removeChild`, `sortableChildren`, `culling`, `hitArea`. | Важен для иерархии сцены и производительности. |
| `pixijs-scene-sprite` | Создание и настройка Sprite, AnimatedSprite, TilingSprite, NineSliceSprite. | Если графика рисуется через Graphics или используется Text. | `Sprite.from()`, anchor, tint, blendMode, scale, animation speed. | Имеет 4 references/~. AnimatedSprite — в references. |
| `pixijs-scene-text` | Вывод текста: `Text`, `BitmapText`, `HTMLText`, `SplitText`. Стили, шрифты, рендеринг. | Если текст не нужен. | `new Text()`, `TextStyle`, bitmap-шрифты, HTML-текст, split-text анимации. | Имеет 5 references/~. Разные бэкенды текста имеют разные возможности. |
| `pixijs-events` | Обработка событий мыши, тача, pointer. Interactive, hitArea, event modes. | Если проект не использует интерактивность. | `on('pointerdown')`, `eventMode`, `hitArea`, `cursor`, propagation. | **Interactive = false** по умолчанию в v8. |
| `pixijs-performance` | Оптимизация FPS, снижение нагрузки на GPU, culling, LOD, texture atlases, object pooling, render groups. | Если задача не про скорость или производительность устраивает. | FPS мониторинг, pool, culling, LOD, spritesheet packing, render groups. | Крупный skill (16 KB). Читать только при проблемах производительности. |
| `pixijs-migration-v8` | Переход с v7 на v8. Ломающие изменения, new API. | Если проект уже на v8. | `init()`, `Container` вместо `Stage`, event system changes, removed APIs. | **Критически важен** при мажорном апгрейде. |
| `pixijs-core-concepts` | Когда нужно глубже понять рендер-пайплайн, WebGL/WebGPU, render loop, renderers. | Если задача поверхностная (просто добавить спрайт). | Renderers, render loop, multi-view, shared ticker. | Имеет 2 references/~. Фундаментальный, но не обязателен для каждой задачи. |
| `pixijs-scene-core-concepts` | Понимание Container hierarchy, transforms, masking, layers, render groups, scene management. | Одноразовая простая графика без сложной сцены. | Constructor options, hierarchy, masking, layers, transforms, render groups. | **Имеет 7 references/~.** Обязателен для сложных сцен. |
| `pixijs-accessibility` | Добавление aria-labels, tabIndex, фокуса для экранных читалок. | Если доступность не требуется. | `accessibleTitle`, `accessibleHint`, `tabIndex`, focus. | Специфическая тема. |
| `pixijs-blend-modes` | Настройка режимов смешивания (multiply, screen, add и т.д.). | Если стандартный normal blend достаточен. | `blendMode`, `BLEND_MODES`. | Короткий skill. |
| `pixijs-color` | Работа с цветом: `Color` class, conversion, parsing. | Если цвета задаются hex-строками. | `Color`, `toRgba()`, `toHsl()`, parsing, conversion. | Полезен при динамической работе с цветом. |
| `pixijs-create` | Быстрое создание типовых объектов: sprite, text, graphics, container через утилиты create. | Если создаёте объекты вручную через `new`. | `create.sprite()`, `create.text()`, `create.graphics()`, `create.container()`. | Утилитарный skill. |
| `pixijs-custom-rendering` | Создание кастомных шейдеров, фильтров, собственных renderable объектов. | Если используете только встроенные примитивы. | Custom shader, `Shader`, `Filter`, custom renderable, uniform types. | Имеет reference uniform-types.md. |
| `pixijs-environments` | Выбор/настройка WebGL vs WebGPU, проверка поддержки, полифиллы. | Если среда фиксирована (только WebGL). | `detectRenderer`, `getSupportedEnvironments`, WebGPU setup. | Полезен для кросс-сред. |
| `pixijs-filters` | Применение встроенных фильтров (blur, glow, displacement) или создание своих. | Если фильтры не нужны. | `Filter`, `BlurFilter`, `GlowFilter`, chain, performance. | Фильтры могут влиять на производительность. |
| `pixijs-html-source` | Рендеринг HTML/CSS как текстуры через `HTMLSource`. | Если используете `HTMLText` (см. pixijs-scene-text). | `HTMLSource`, `createHTMLTexture`. | Специфический use case. |
| `pixijs-math` | Математические операции: `Point`, `Matrix`, `Transform`, `Rectangle`, interpolation. | Если математика простая (x, y координаты). | `Point`, `Matrix`, `Transform`, `Rectangle`, `lerp`, `clamp`. | Полезен для кастомных трансформаций и анимаций. |
| `pixijs-scene-dom-container` | Встраивание DOM-элементов в сцену PixiJS через `DOMContainer`. | Если DOM не нужен. | `DOMContainer`, mixed DOM/canvas. | Специфический гибридный use case. |
| `pixijs-scene-gif` | Рендеринг анимированных GIF как `AnimatedGIF`. | Если GIF не требуется. | `AnimatedGIF`, GIF playback controls. | Специализированный skill. |
| `pixijs-scene-mesh` | Создание Mesh, Plane, Rope, SimpleMesh для деформации изображений. | Если деформация не нужна. | `Mesh`, `Plane`, `Rope`, `SimpleMesh`, perspective distortion. | Имеет 5 references/~. |
| `pixijs-scene-particle-container` | Оптимизация большого количества спрайтов (particles). Пулл объектов, производительность. | Если спрайтов < 1000 или не нужны частицы. | `ParticleContainer`, pooling, `maxSize`, properties. | **Важно для particle-эффектов.** |
| `pixijs-ticker` | Управление игровым циклом: `Ticker`, `deltaTime`, FPS, приостановка. | Если используете `Application.ticker` по умолчанию. | `Ticker`, `add()`, `start()`, `stop()`, `deltaTime`, `FPS`, ` minFPS`, `maxFPS`. | Полезен для кастомного игрового цикла. |

---

## Быстрый выбор: сценарии

| Ситуация | Какие skills читать |
|---|---|
| Новая игра/приложение на PixiJS | `pixijs`, `pixijs-application`, `pixijs-core-concepts`, `pixijs-scene-core-concepts` |
| Добавить графику (фигуры) | `pixijs`, `pixijs-scene-graphics` |
| Добавить спрайты/анимацию | `pixijs`, `pixijs-scene-sprite`, `pixijs-assets` |
| Добавить текст | `pixijs`, `pixijs-scene-text` |
| Добавить интерактивность | `pixijs`, `pixijs-events` |
| Оптимизировать производительность | `pixijs`, `pixijs-performance`, `pixijs-scene-particle-container`, `pixijs-scene-container` |
| Миграция с v7 на v8 | `pixijs-migration-v8`, `pixijs` |
| Работа с ассетами (загрузка) | `pixijs-assets` |
| Кастомный рендеринг/шейдеры | `pixijs-custom-rendering` |

---

При любых сомнениях начинайте с `pixijs` — он даёт общий контекст и ссылки на нужные дополнительные skills.
