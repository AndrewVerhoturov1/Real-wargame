# Development and localization language rules

## Mandatory rule

Real-Wargame is developed with **English as the canonical development language**.

Use English for:

- TypeScript identifiers, types, interfaces, functions and file names;
- data-contract keys and serialized field names;
- technical comments and developer-facing descriptions;
- canonical labels stored in the base fields such as `label` and `description`;
- commit messages and automated-test names.

Every human-facing feature must also have a **complete Russian version**.

Use the established overlay pattern:

```text
label / description / reason     — canonical English development text
labelRu / descriptionRu / reasonRu — complete Russian translation
```

## Default user language

**Russian is the default user-interface language.**

English remains available through a visible language switch. A new control, panel, tooltip, warning, validation message, status, action, help text or exported user-facing report is not complete until both languages exist.

## Interaction rule

The primary user is not expected to edit source code, JSON or technical keys manually.

Whenever practical, provide:

- buttons instead of terminal commands;
- select lists instead of free-form technical key input;
- interactive explanations instead of requiring source-code inspection;
- direct links between the AI Dictionary, the live soldier, the map and the node editor;
- safe defaults and automatic migration for older data.

Developer-only JSON may remain available as an advanced secondary view, but it must not be the normal way to configure gameplay or AI behavior.

## Review checklist

A feature is incomplete when any answer is “no”:

1. Are canonical code and data names in English?
2. Does every visible English string have a full Russian translation?
3. Does the interface open in Russian by default?
4. Can the user perform the normal workflow without editing code or JSON?
5. Are simplified or planned mechanics clearly marked instead of being presented as fully working?
