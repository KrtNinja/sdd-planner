---
type: script
---

Начал со start и не спрашивал, где документация; факты из services собраны в _work/context.md и проходят research check.

```sh
q first sdd_lint start
q not-said 'Есть дополнительная документация'
q file docs/task-handover/_work/context.md 'services/[a-z-]+/README\.md:[0-9]+'
q lint research check docs/task-handover
```
