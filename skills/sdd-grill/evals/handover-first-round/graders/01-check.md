---
type: script
---

Создан docs/task-handover/brainstorming.md со «Статус: идёт», источник — services; решений человека в таблице нет.

```sh
q file docs/task-handover/brainstorming.md '^Статус: идёт$'
q file docs/task-handover/brainstorming.md '^Источники: services$'
q no-file docs/task-handover/brainstorming.md '^\| 1 \|.*\| (да|нет|[^|]{3,}) \|$'
```
