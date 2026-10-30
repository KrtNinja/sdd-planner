#!/usr/bin/env node
// MCP-сервер (stdio) для sdd-lint: один инструмент sdd_lint, аргументы — как у скрипта.
// Запускает его сам CLI по манифесту расширения, поэтому путь к скрипту вне проекта
// не попадает в shell-команды агента и не упирается в проверку workspace.
// Без зависимостей: JSON-RPC 2.0 построчно по stdin/stdout.
import { execFile } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const LINT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sdd-lint.mjs');
const VERSION = '0.6.0';

const TOOL = {
  name: 'sdd_lint',
  description:
    'Запускает sdd-lint из корня репозитория с доками. args — аргументы командной строки скрипта ' +
    'по одному элементу: [] — фичи и этапы, ["docs/comments"] — проверка фичи, ' +
    '["start","<что человек написал после /sdd-grill>"] — старт brainstorming по шагам, ' +
    '["research","fact","docs/comments","<вопрос>"] — задание сабагенту найти факт, ' +
    '["fix","docs/comments"] — после правки: номера, ссылки, README скриптом и проверка, ' +
    '["done","docs/comments"] — конец этапа: fix, «на ревью» и вопрос этапа, ["plan","docs/comments"] — проверка плана нарезки, ' +
    '["gate","spec","docs/comments"], ["approve","slices","docs/comments"], ' +
    '["export","docs/comments"] — требования в JSON для реализации, ["help","gen"]. ' +
    'Возвращает вывод скрипта и код выхода (0 — ок, 1 — ошибки, 2 — неверный вызов, 3 — ворота закрыты).',
  inputSchema: {
    type: 'object',
    properties: {
      args: { type: 'array', items: { type: 'string' }, description: 'Аргументы sdd-lint' },
    },
    additionalProperties: false,
  },
};

const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');

const runLint = (args) =>
  new Promise((resolve) => {
    execFile(
      process.execPath,
      [LINT, ...args],
      { cwd: process.cwd(), env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' }, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code = err ? (typeof err.code === 'number' ? err.code : null) : 0;
        resolve({ code, out: [stdout, stderr].filter(Boolean).join('\n').trimEnd(), spawnError: code === null ? String(err) : null });
      },
    );
  });

const handle = async ({ id, method, params }) => {
  switch (method) {
    case 'initialize':
      return send({
        id,
        result: {
          protocolVersion: params?.protocolVersion ?? '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'sdd-lint', version: VERSION },
        },
      });
    case 'ping':
      return send({ id, result: {} });
    case 'tools/list':
      return send({ id, result: { tools: [TOOL] } });
    case 'tools/call': {
      if (params?.name !== TOOL.name) return send({ id, error: { code: -32602, message: `Нет инструмента ${params?.name}` } });
      const args = params.arguments?.args ?? [];
      if (!Array.isArray(args) || args.some((a) => typeof a !== 'string'))
        return send({ id, error: { code: -32602, message: 'args — массив строк' } });
      const r = await runLint(args);
      if (r.spawnError) return send({ id, result: { isError: true, content: [{ type: 'text', text: r.spawnError }] } });
      return send({ id, result: { content: [{ type: 'text', text: `${r.out}\n\n[код выхода: ${r.code}]` }] } });
    }
    default:
      if (id !== undefined) send({ id, error: { code: -32601, message: `Метод не поддерживается: ${method}` } });
  }
};

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return send({ id: null, error: { code: -32700, message: 'Parse error' } });
  }
  handle(msg).catch((e) => msg.id !== undefined && send({ id: msg.id, error: { code: -32603, message: String(e) } }));
});
