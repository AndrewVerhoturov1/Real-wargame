# Handoff оркестратору — актуальная точка входа

Дата актуализации: 2026-08-18

Этот файл первоначально описывал six-X/checkpoint этап от 2026-08-17. Дальнейшую работу по подпроекту теперь продолжает **Кодекс**, а текущий подробный handoff перенесён в:

`docs/subprojects/polygon-html-to-product/CODEX_HANDOFF_20260818.md`

Текущий статус подпроекта:

`docs/subprojects/polygon-html-to-product/INTEGRATION_STATUS.md`

## Точная передаваемая product-идентичность

```text
repository: AndrewVerhoturov1/Real-wargame
base_branch: real-wargame-preview
base_commit: bd25f5debc312db7021b1515a525697ad248fff1
feature_branch: feat/20260817-polygon-editors-visual-parity
verified_product_sha: f695c9b1c035340de319e769b2ada4c993d2b83b
```

Документационные commits после `f695c9b1...` не меняют факт, что именно этот product snapshot прошёл финальные проверки и опубликован. При старте Кодекс обязан заново получить свежий remote HEAD ветки.

## Опубликованный Preview

```text
Vercel project: repo
deployment: dpl_5LcLrP6Me3RVCQ7ibQavpJRstXYF
URL: https://repo-mb33ew0x4-111s-projects-807221af.vercel.app/combat-lab.html
status: READY
sourceSha: f695c9b1c035340de319e769b2ada4c993d2b83b
verification: 31/31 Preview checks passed
browser audit: 32088591178 — SUCCESS
```

## Текущий рабочий принцип

Полигон переносится **поэлементно** из принятого HTML-прототипа в продукт.

Для каждого элемента необходимо разделять:

1. visual/presentation gap;
2. presentation-adapter на существующем owner;
3. owner/read-model dependency;
4. реально отсутствующую product capability.

HTML не становится новым runtime или registry. Реальные owners продукта остаются источником данных и команд.

## Главные незакрытые editor-зависимости

- `Типы поверхностей` — отсутствует standalone authoritative product owner; пункт остаётся `НЕДОСТУПНО`;
- `Профили местности` — требуется проверить aggregate Environment Profile owner/read-model;
- `Направленный рельеф` — нужны live silhouette/8-sector diagrams из authoritative values;
- остальные редакторы допускают дальнейшую presentation-полировку без создания второй истины.

## Границы для Кодекса

- не создавать fake data/registry/localStorage architecture ради визуальной похожести;
- не создавать второй selection/map/runtime/editor owner;
- не переносить в `real-wargame-preview` без отдельного GO пользователя;
- не трогать `main`;
- новый deploy — только по отдельному явному запросу;
- visual QA делать свежими screenshot exact SHA;
- после code-wave запускать TypeScript + `verify:preview` + production build.

## Исторические документы

Six-X/checkpoint история сохранена отдельно и не потеряна:

```text
docs/subprojects/polygon-html-to-product/CHECKPOINT_20260817_APPROACH_RESET.md
docs/subprojects/polygon-html-to-product/IMPLEMENTATION_WAVE_20260817.md
docs/subprojects/polygon-html-to-product/ARKA_IMPLEMENTATION_HANDOFF.md
docs/subprojects/polygon-html-to-product/ARKA_PLANNED_SCOPE_CHECK.md
docs/subprojects/polygon-html-to-product/LINZA_RIGHT_PANEL_CONTRACT.md
docs/subprojects/polygon-html-to-product/CHRONIST_EXPERIMENT_CONTRACT.md
```

Для следующей сессии **не начинать с этого исторического файла**. Начинать с `CODEX_HANDOFF_20260818.md` и затем читать `INTEGRATION_STATUS.md`.
