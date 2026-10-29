#!/usr/bin/env bash
# Готовит рабочую папку eval: данные кейса из files/, правила — из репозитория,
# чтобы eval проверял скилл вместе с текущими правилами, а не с их устаревшей копией.
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
root="$here/../../../.."
cp -R "$here/files/." .
{ printf '# AGENTS.md\n\n'; cat "$root/rules/AGENTS.planning.md"; } > AGENTS.md
# lint копировать не нужно: скиллы вызывают его через MCP или от папки скилла sdd-lint.
