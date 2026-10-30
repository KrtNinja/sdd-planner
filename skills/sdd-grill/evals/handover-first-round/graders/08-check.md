---
type: llm
focus: trace
weight: 1
---

Агент начал со `sdd_lint ["start", …]` и не спрашивал, где документация (источники названы в вызове). Создан docs/task-handover/_work/context.md: факты о ролях, исполнителе, событии task.updated и истории в audit — каждый со ссылкой `services/…/README.md:строка`; вызов `sdd_lint ["research","check","docs/task-handover"]` завершился с кодом 0.
