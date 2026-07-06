# Подпроекты

Подпроект — это компактная карта одной длительной задачи. Она хранит только устойчивую цель, текущий фокус, границы чтения, ключевые файлы, проверки и важные сессии. Подпроект не заменяет исходный код, issue tracker или полный отчёт.

## Экономичный порядок чтения

Для начала читайте только:

1. `docs/subprojects/<id>/SUBPROJECT.md`
2. `docs/subprojects/<id>/subproject.json`
3. вывод одной подходящей команды:

       python scripts/subproject_context.py <id> --brief
       python scripts/subproject_context.py <id> --opencode

Не открывайте без причины весь репозиторий, каталоги raw telemetry, `_zworker_requests`, `_zworker_inbox`, `_opencode_reports`, старые отчёты и все перечисленные тесты сразу. Расширяйте контекст только по текущей задаче и по разделам `Must read first`, `Main files`, `Do not read by default`.

## Команды

    python scripts/subproject_context.py --list
    python scripts/subproject_context.py <id> --brief
    python scripts/subproject_context.py <id> --opencode
    python scripts/subproject_context.py <id> --files

## Формат

* `SUBPROJECT.md` — короткая human-readable память.
* `subproject.json` — структурированный источник для CLI.
* `test-program.md` — программа тестирования подпроекта (в каталоге подпроекта).
* `_template/` — минимальный шаблон для нового подпроекта.

## Draft skills

Следующие skills являются черновыми и должны загружаться только по явной необходимости:

* `subproject-bootstrap` — начать работу с минимального контекста подпроекта;
* `subproject-doc-delta` — обновить только изменившуюся память подпроекта;
* `subproject-context-script` — изменить CLI, JSON-контракт или его тесты;
* `subproject-create` — создать новый подпроект из `_template`.