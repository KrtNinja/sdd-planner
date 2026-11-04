// Снимок связанных файлов обнаруживает изменения; их смысл оценивает модель.
// @ts-check
import path from 'node:path';
import { read, scan } from './md.mjs';
import { questionDigest } from './registry-format.mjs';

/** @typedef {import('./model.mjs').Feature} Feature */
/** @typedef {import('./flow-format.mjs').FlowRecord} Question */
/** @param {Feature} m @param {string} id */
function address(m, id) {
  if (id.startsWith('contract:')) {
    const relative = id.slice(9).split('#')[0];
    const file = path.resolve(m.dir, relative);
    if (!file.startsWith(m.dir + path.sep)) throw new Error('Контракт вне фичи');
    if (!scan(read(file) || '').lines.some((l) => !l.inCode && l.text.includes(`<a id="${id.split('#')[1]}"></a>`))) return null;
    return { id, file, n: 1 };
  }
  return m.flow.graph?.byId.get(id) || null;
}

/** @param {Feature} m @param {string[]} ids */
export function questionContext(m, ids) {
  return ids.map((id) => {
    const a = address(m, id);
    const md = a ? read(a.file) : null;
    return { id, file: a ? path.relative(m.dir, a.file) : null, n: a?.n || null,
      hash: md === null ? null : questionDigest(md), text: linkedText(m, id, md) };
  });
}

/** @param {Feature} m @param {Question} q */
export function contextChanges(m, q) {
  const current = questionContext(m, q.refs.map((r) => r.id));
  /** @type {{id: string, hash: string | null, file: string | null}[] | null} */
  const saved = JSON.parse(q.fields.Снимок || 'null');
  const changes = current.filter((c) => !saved?.some((s) => s.id === c.id && s.hash === c.hash && s.file === c.file));
  return { current, changes, baseline: saved !== null };
}

/** @param {Question} q */
export function originalAnswer(q) {
  return q.fields.ОтветJSON ? JSON.parse(q.fields.ОтветJSON) : q.fields.Ответ || q.fields.Исключение || '';
}

/** @param {Feature} m @param {string} id @param {string | null} md */
function linkedText(m, id, md) {
  const req = m.spec?.reqs.get(id);
  if (req) return req.text;
  const ac = [...m.slices.values()].flatMap((s) => s.acs).find((a) => a.id === id);
  if (ac) return ac.text;
  const record = m.flow.records.find((r) => r.id === id);
  if (!record || md === null) return md;
  return recordSection(md, record.n);
}

/** @param {string} md @param {number} n */
function recordSection(md, n) {
  const lines = scan(md).lines;
  const raw = md.split(/\r?\n/);
  const level = raw[n - 1].indexOf(' ');
  const end = lines.find((l) => l.n > n && !l.inCode && (l.text.match(/^#+(?= )/)?.[0].length || 7) <= level);
  return raw.slice(n - 1, end ? end.n - 1 : raw.length).join('\n');
}
