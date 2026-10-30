---
type: script
---

Папка — из имени файла задачи (docs/user-settings), протокол с «Запрос: файл …» и заголовком из файла; имя папки агент не придумывал.

```sh
q file docs/user-settings/brainstorming.md '^Запрос: файл docs/inbox/user-settings\.md$'
q file docs/user-settings/brainstorming.md '^# Панель настроек пользователя — Brainstorming'
q not-called sdd_lint start --slug
q features 2
```
