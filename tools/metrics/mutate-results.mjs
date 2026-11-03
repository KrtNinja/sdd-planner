// Полнота текущего прогона: исходники и формы из того же парсера, которым пользуется mutator.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const count = (n) => Number.isSafeInteger(n) && n >= 0;
const hash = (s) => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const text = (s) => typeof s === 'string' && s.length > 0;
const key = (f) => `${f.namespace}#${f.id}`;
const span = (f) => f && text(f.namespace) && text(f.id) && hash(f.hash)
  && count(f.line) && f.line > 0 && count(f['end-line']) && f['end-line'] >= f.line;
const require = (ok, message) => { if (!ok) throw new Error(`mutator: ${message}`); };

export function inventories(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.inventory.json')).sort().flatMap((f) => {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    require(data?.version === 1 && Array.isArray(data.files), `некорректная опись ${f}`);
    return data.files;
  });
}

export function verifyResults(snaps, expected, records, readSource) {
  const byFile = new Map();
  for (const record of records) {
    require(record && text(record.source) && hash(record.sha256) && Array.isArray(record.forms)
      && record.forms.every(span), 'некорректная опись исходников/форм');
    require(!byFile.has(record.source), `повтор исходника в описи: ${record.source}`);
    require(new Set(record.forms.map(key)).size === record.forms.length, `повтор формы: ${record.source}`);
    require(createHash('sha256').update(readSource(record.source)).digest('hex') === record.sha256,
      `опись не соответствует исходнику: ${record.source}`);
    byFile.set(record.source, record);
  }
  for (const file of expected) require(byFile.has(file), `нет описи выбранного файла: ${file}`);
  const actual = new Map();
  for (const snap of snaps) {
    require(snap && byFile.has(snap.source) && text(snap.namespace) && Array.isArray(snap.forms), 'снимок без описи или некорректной формы');
    for (const form of snap.forms) {
      const f = { ...form, namespace: snap.namespace };
      require(span(f) && form.file === snap.source && ['killed', 'survived', 'uncovered', 'sites'].every((k) => count(form[k]))
        && form.sites === form.killed + form.survived + form.uncovered, `некорректные счётчики/форма: ${snap.source}`);
      const id = `${snap.source}:${key(f)}`;
      require(!actual.has(id), `повтор результата: ${id}`);
      actual.set(id, f);
    }
  }
  let total = 0;
  for (const record of records) for (const form of record.forms) {
    const id = `${record.source}:${key(form)}`;
    const got = actual.get(id);
    require(got && ['hash', 'line', 'end-line'].every((k) => got[k] === form[k]), `нет актуального результата формы: ${id}`);
    total++;
  }
  require(actual.size === total, 'в снимке есть формы вне описи');
}
