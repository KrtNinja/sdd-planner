#!/usr/bin/env bash
# Готовит рабочую папку eval: данные кейса из files/, правила и lint — из репозитория,
# чтобы eval проверял скилл вместе с текущими правилами, а не с их устаревшей копией.
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
root="$here/../../../.."
cp -R "$here/files/." .
{ printf '# AGENTS.md\n\n'; cat "$root/rules/AGENTS.planning.md"; } > AGENTS.md
# lint рядом с доками нужен, только если скиллы вызывают его как scripts/sdd-lint.mjs;
# в ветках, где lint лежит в скилле sdd-lint, его найдут от папки скилла.
if [ -f "$root/scripts/sdd-lint.mjs" ]; then
  mkdir -p scripts
  cp "$root/scripts/sdd-lint.mjs" scripts/
fi
