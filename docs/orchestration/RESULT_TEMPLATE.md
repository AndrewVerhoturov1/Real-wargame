# Worker Result Template

Исполнитель возвращает этот отчёт вместе с воспроизводимыми изменениями.

```md
# Result

## Task

Краткое название и формулировка задачи.

## Status

`COMPLETED`, `PARTIAL`, `BLOCKED` или `RESEARCH_ONLY`.

## Understanding of the problem

Как понята проблема и какие предположения сделаны.

## Solution

Что реализовано или предлагается.

## Architecture

Почему выбран этот подход и как он связан с существующими системами.

## Performance impact

Этот раздел обязателен для любого изменения, способного повлиять на runtime. Для truly non-runtime задачи укажи `not applicable` и точную причину.

```text
hot path:
worst-case complexity:
main-thread work:
full-map builds:
shared prepared data:
worker and queue budget:
cache owner/key/limit:
invalidation revisions:
memory estimate:
stale-result rejection:
teardown:
before metrics:
after metrics:
performance scenario affected:
performance reason:
tested implementation head:
remaining performance risks:
```

Не используй фразу «изменение небольшое и не должно повлиять» вместо анализа. Не запускай performance только ради нового SHA.

## Verification selection

```text
change risk:
mandatory automatic checks:
risk-selected focused checks:
manual integration checks:
heavy checks deliberately not run:
why omitted heavy checks cannot detect a regression from this change:
TESTED_IMPLEMENTATION_HEAD: <40-char SHA or none>
PERFORMANCE_REASON: <concrete reason or none>
```

## Changed files

- `path/to/file`

## Result package

Один из вариантов:

- полные файлы с repo-relative путями;
- patch;
- изолированная ветка/PR и точный commit SHA.

## Checks actually run

- `<command>` — passed/failed;
- не указывать команды, которые не запускались.

## Not checked

Что не проверялось и почему. Пропущенная неприменимая тяжёлая проверка не является дефектом результата.

## Risks

Известные технические, поведенческие, performance и интеграционные риски.

## Integration notes

Что интегратор должен проверить, адаптировать или объединить с соседними результатами.

## Alternative approaches

Какие варианты рассматривались и почему не выбраны.

## Open questions

Нерешённые вопросы или решения, которые должен принять оркестратор/интегратор.
```
