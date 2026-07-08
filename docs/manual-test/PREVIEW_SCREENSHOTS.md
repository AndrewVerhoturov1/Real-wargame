# Preview screenshots

Этот пакет добавляет автоматический съём скриншотов preview-ветки Real-Wargame.

## Что делает проверка

При пуше в `real-wargame-preview`, Pull Request в `real-wargame-preview` или ручном запуске workflow:

1. GitHub Actions забирает репозиторий.
2. Ставит Node.js и зависимости проекта.
3. Временно ставит Playwright test runner.
4. Ставит Chromium для Playwright.
5. Собирает проект через `npm run build`.
6. Запускает Vite dev server.
7. Открывает игру в Chromium.
8. Делает PNG-скриншоты в `artifacts/screenshots/`.
9. Загружает их в artifact `real-wargame-preview-screenshots`.

## Файлы

Ветка содержит:

```text
.github/workflows/preview-screenshots.yml
playwright.config.ts
tests/preview-screenshots.spec.ts
docs/manual-test/PREVIEW_SCREENSHOTS.md
```

## Как проверить

В GitHub открыть:

```text
Actions -> Preview screenshots -> Run workflow
```

После завершения открыть run и скачать artifact:

```text
real-wargame-preview-screenshots
```

Внутри должны быть:

```text
01-initial.png
02-selected-unit.png
03-move-order.png
04-after-movement.png
05-zoomed-map.png
```

## Важно

Этот вариант не меняет `package.json` и `package-lock.json`: Playwright test runner ставится только внутри GitHub Actions командой:

```text
npm install --no-save @playwright/test
```

Позже можно сделать более чистый вариант: добавить `@playwright/test` в `devDependencies` и обновить `package-lock.json` через `npm install`.
