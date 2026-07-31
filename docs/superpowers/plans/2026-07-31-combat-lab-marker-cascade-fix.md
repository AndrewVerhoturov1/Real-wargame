# Combat Lab Marker Cascade Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Исправить каскадное удаление метки так, чтобы прямые и транзитивные зависимости удалялись детерминированно без dangling `markerId` и без изменения нерелевантных данных.

**Architecture:** Сохранить существующий `createCombatLabMarkerCascadeResult()` как единственную точку каскада. Расширить начальный набор удаляемых шагов явной проверкой action/start/completion/repeat, затем использовать существующее транзитивное распространение `step_state`; после построения результата выполнить защитную проверку поддерживаемых ссылок.

**Tech Stack:** TypeScript, Node.js behavioral smoke scripts, GitHub Actions.

## Global Constraints

- Рабочая ветка: `worker/20260731-combat-lab-program-authoring`.
- Исходный HEAD: `6081e36931b3ee72a10f4b812a64912917ea987b`.
- Foundation SHA: `fa0c59e8a5b9b06a14c965bfc4d9e4e0edc651fd`.
- Не изменять `main`, `real-wargame-preview`, acceptance и ветки других исполнителей.
- Не создавать deployment и не сливать PR #219.
- Revision каскада увеличивается ровно один раз.

---

### Task 1: Behavioral regression coverage

**Files:**
- Modify: `scripts/combat_lab_marker_authoring_behavior_smoke.mjs`

**Interfaces:**
- Consumes: `createCombatLabMarkerCascadeResult(experiment, markerId)`.
- Produces: исполняемые проверки direct start/completion/repeat, success/stop, транзитивного `step_state`, сохранения нерелевантных данных и отсутствия dangling references.

- [ ] **Step 1: Добавить составной эксперимент с прямыми ссылками во всех поддерживаемых местах.**
- [ ] **Step 2: Проверить удаление цепочки A → B → C через `step_state`.**
- [ ] **Step 3: Проверить сброс success/stop и сохранение maximumSimulationSeconds.**
- [ ] **Step 4: Проверить deep equality нерелевантной дорожки, второй метки, defaults, batchDefaults, roles и sceneSnapshot.**
- [ ] **Step 5: Проверить отсутствие `markerId` во всех action/condition contracts.**
- [ ] **Step 6: Запустить smoke и подтвердить падение на старой реализации.**

### Task 2: Deterministic cascade implementation

**Files:**
- Modify: `src/combat-lab/scenario-editor/CombatLabMarkerReferenceSummary.ts`

**Interfaces:**
- Consumes: существующие `actionReferencesMarker`, `objectReferencesMarker`, `stepDependsOnRemovedStep`.
- Produces: полный каскад и защитную проверку отсутствия ссылок.

- [ ] **Step 1: Добавить `stepDirectlyReferencesMarker()` для action/start/completion/repeat.**
- [ ] **Step 2: Использовать helper при формировании начального множества удаляемых шагов.**
- [ ] **Step 3: Сбрасывать successCondition при прямой marker-ссылке или зависимости от удалённого шага.**
- [ ] **Step 4: Аналогично сбрасывать stopCondition с сохранением maximumSimulationSeconds.**
- [ ] **Step 5: После построения результата вызвать явную защитную проверку поддерживаемых action/condition ссылок.**
- [ ] **Step 6: Запустить marker smoke и подтвердить прохождение.**

### Task 3: Full verification and cleanup

**Files:**
- Temporarily create/delete: `.github/workflows/combat-lab-program-authoring-cascade-verify.yml`
- Update: PR #219 description only after successful verification.

**Interfaces:**
- Produces: новый зелёный GitHub Actions run на production snapshot и финальный HEAD, отличающийся только удалением временного workflow.

- [ ] **Step 1: Выполнить все команды continuation MD без `continue-on-error`.**
- [ ] **Step 2: Проверить `git diff --check`.**
- [ ] **Step 3: Зафиксировать tested production SHA и зелёный Actions run.**
- [ ] **Step 4: Удалить временный workflow отдельным коммитом.**
- [ ] **Step 5: Доказать, что между tested production SHA и final HEAD удалён только workflow.**
- [ ] **Step 6: Обновить PR #219, не сливая его.**
