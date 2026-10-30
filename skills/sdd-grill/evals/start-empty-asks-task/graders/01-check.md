---
type: script
---

Первый вызов sdd_lint — `start` без задачи: агент не придумывает задачу и не берёт её из файлов.

```sh
q first sdd_lint start
q not-called sdd_lint start --slug
```
