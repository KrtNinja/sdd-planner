#!/usr/bin/env bash
# Готовит рабочую папку eval: данные кейса из files/, правила — из репозитория,
# чтобы eval проверял скилл вместе с текущими правилами, а не с их устаревшей копией.
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../../.." && pwd)"
cp -R "$here/files/." .
{ printf '# AGENTS.md\n\n'; cat "$root/rules/AGENTS.planning.md"; } > AGENTS.md
# Lint — MCP-сервер, как в GigaCode, а не копия скрипта: без сервера скилл остановится на вопросе
# «MCP-сервер sdd-lint не отвечает» (правила планирования).
cat > .mcp.json <<JSON
{ "mcpServers": { "sdd-lint": { "command": "node", "args": ["$root/skills/sdd-lint/scripts/mcp.mjs"] } } }
JSON
