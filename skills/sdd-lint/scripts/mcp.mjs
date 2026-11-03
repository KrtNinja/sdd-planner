#!/usr/bin/env node
// MCP-сервер (stdio) для sdd-lint: один инструмент sdd_lint, аргументы — как у скрипта.
// Запускает его сам CLI по манифесту расширения, поэтому путь к скрипту вне проекта
// не попадает в shell-команды агента и не упирается в проверку workspace.
// Без зависимостей: JSON-RPC 2.0 построчно по stdin/stdout.
// @ts-check
//
// Здесь только чтение и печать. Ответы — в sdd-lint/mcp-server.mjs: sdd-lint вызывается там функцией run().
import readline from 'node:readline';
import { replyTo } from './sdd-lint/mcp-server.mjs';

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const reply = replyTo(line);
  if (reply) process.stdout.write(`${reply}\n`);
});
