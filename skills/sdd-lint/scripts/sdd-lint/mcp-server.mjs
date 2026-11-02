// MCP-сервер sdd-lint функцией: строка JSON-RPC → строка ответа. Точка входа mcp.mjs только читает stdin и печатает.
import { run } from './run.mjs';

const VERSION = '0.7.0';

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
    'Вывод — карточка для человека (он уже видит её на экране, не пересказывай) и последняя строка «⚙ sdd: …» — что делать тебе, ' +
    'с кодом выхода в конце (0 — ок, 1 — ошибки, 2 — неверный вызов, 3 — ворота закрыты). Словарь строки ⚙ — в правилах планирования.',
  inputSchema: {
    type: 'object',
    properties: {
      args: { type: 'array', items: { type: 'string' }, description: 'Аргументы sdd-lint' },
    },
    additionalProperties: false,
  },
};

// Вывод — как на экране без цвета; на время вызова, потом окружение возвращается.
const LINT_ENV = { NO_COLOR: '1', FORCE_COLOR: '0', SDD_VIEW: 'screen' };

// sdd-lint в этом процессе: stdout, затем stderr. Необработанное исключение — код 1 и стек, как у node.
/** @param {string[]} args @returns {{ code: number, out: string }} */
function lint(args) {
  const saved = Object.fromEntries(Object.keys(LINT_ENV).map((k) => [k, process.env[k]]));
  Object.assign(process.env, LINT_ENV);
  try {
    const { code, chunks } = run(args);
    const text = (/** @type {1 | 2} */ fd) => chunks.filter(([f]) => f === fd).map(([, t]) => t).join('');
    return { code, out: [text(1), text(2)].filter(Boolean).join('\n').trimEnd() };
  } catch (e) {
    return { code: 1, out: String(e instanceof Error ? e.stack : e) };
  } finally {
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
}

// Код выхода — в строку ⚙: она последняя и единственная для агента. Нет её у команды (check, trace) — своя.
/** @param {string} out @param {number} code */
function withCode(out, code) {
  const lines = String(out).trimEnd().split('\n');
  const last = lines.length - 1;
  if (lines[last]?.startsWith('⚙ sdd:')) lines[last] += ` · код ${code}`;
  else lines.push('', `⚙ sdd: код ${code}`);
  return lines.join('\n').replace(/^\n+/, '');
}

/** @param {unknown} id @param {any} params */
function callTool(id, params) {
  if (params?.name !== TOOL.name) return { id, error: { code: -32602, message: `Нет инструмента ${params?.name}` } };
  const args = params.arguments?.args ?? [];
  if (!Array.isArray(args) || args.some((a) => typeof a !== 'string')) return { id, error: { code: -32602, message: 'args — массив строк' } };
  const r = lint(args);
  return { id, result: { content: [{ type: 'text', text: withCode(r.out, r.code) }] } };
}

// Результаты методов без побочных действий; tools/call — отдельно, он вызывает sdd-lint.
/** @type {Record<string, (params: any) => object>} */
const RESULTS = {
  initialize: (params) => ({
    protocolVersion: params?.protocolVersion ?? '2025-06-18',
    capabilities: { tools: {} },
    serverInfo: { name: 'sdd-lint', version: VERSION },
  }),
  ping: () => ({}),
  'tools/list': () => ({ tools: [TOOL] }),
};

// Ответ на сообщение JSON-RPC; на уведомление без id и на не-объект — null.
/** @param {any} msg */
function respond(msg) {
  if (!msg || typeof msg !== 'object') return null;
  const { id, method, params } = msg;
  if (method === 'tools/call') return callTool(id, params);
  if (Object.hasOwn(RESULTS, method)) return { id, result: RESULTS[method](params) };
  return id === undefined ? null : { id, error: { code: -32601, message: `Метод не поддерживается: ${method}` } };
}

// Строка stdin → строка ответа для stdout или null (пустая строка, уведомление).
/** @param {string} line @returns {string | null} */
export function replyTo(line) {
  if (!line.trim()) return null;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }
  const reply = respond(msg);
  return reply && JSON.stringify({ jsonrpc: '2.0', ...reply });
}
