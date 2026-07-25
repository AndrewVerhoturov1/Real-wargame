# Contact Investigation Preview Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перенести готовую ноду `InvestigateContact` на актуальный `real-wargame-preview` без изменения целевой ветки до отдельного разрешения.

**Architecture:** Новая интеграционная ветка создаётся от точного HEAD `real-wargame-preview`. В неё сливается проверенная feature-ветка; GitHub объединяет независимые AI/редакторские изменения с новым Stage 6, а общий `package.json` проверяется отдельно. Итог проходит exact-head CI и Preview до открытия готового PR в `real-wargame-preview`.

**Tech Stack:** Git, GitHub PR merge, TypeScript, Graph v2, Vite, GitHub Actions, Vercel Preview.

## Global Constraints

- Основа переноса: `real-wargame-preview @ a4398ecc031d96f93c06ecd3a84456776c493cbc`.
- Источник функциональности: `feature/20260724-suspected-contact-attention @ 210617e220cdb461bd232ae5e767e1959ce0d2e5`.
- Рабочая ветка: `integration/20260725-contact-investigation-preview-sync`.
- Не изменять `real-wargame-preview` и `main` до отдельной команды на merge.
- Сохранить все Stage 6-файлы и команды проверки из актуального Preview.
- Не расширять функциональность ноды при переносе.

---

### Task 1: Merge feature history onto current Preview

**Files:**
- Merge all files from `feature/20260724-suspected-contact-attention`.
- Resolve shared file: `package.json`.

- [ ] Создать временный PR из feature-ветки в интеграционную ветку.
- [ ] Проверить mergeability и выполнить merge только в интеграционную ветку.
- [ ] Убедиться, что интеграционная ветка содержит оба родителя: актуальный Preview и проверенную feature-ветку.

### Task 2: Verify combined tree

**Files:**
- Verify: `package.json`.
- Verify: `src/core/ai/**`, `src/ai-node-editor/**`, `public/ai-examples/**`.
- Verify: `src/core/infantry-combat/runtime/**`, Stage 6 smoke scripts.

- [ ] Сравнить интеграционную ветку с `real-wargame-preview`.
- [ ] Подтвердить отсутствие случайных изменений Stage 6.
- [ ] Запустить exact-head GitHub CI.
- [ ] Исправлять только конфликты/регрессии переноса.

### Task 3: Preview and handoff

- [ ] Развернуть exact-source Vercel Preview интеграционной ветки.
- [ ] Проверить Graph v2 editor, contact-investigation smoke, Stage 6 smoke, TypeScript и production build.
- [ ] Открыть отдельный PR интеграционной ветки в `real-wargame-preview`.
- [ ] Остановиться со статусом `READY FOR VERIFICATION`; не выполнять merge в Preview.
