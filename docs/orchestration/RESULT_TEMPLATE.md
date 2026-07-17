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
exact-head enforced workflow:
remaining performance risks:
```

Не используй фразу «изменение небольшое и не должно повлиять» вместо анализа.

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

Что не проверялось и почему.

## Risks

Известные технические, поведенческие, performance и интеграционные риски.

## Integration notes

Что интегратор должен проверить, адаптировать или объединить с соседними результатами.

## Alternative approaches

Какие варианты рассматривались и почему не выбраны.

## Open questions

Нерешённые вопросы или решения, которые должен принять оркестратор/интегратор.
```
