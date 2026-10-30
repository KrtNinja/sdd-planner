#!/usr/bin/env node
// Проверки для script-грейдеров evals: что агент вызвал, что сказал, какие файлы оставил.
// Грейдер — bash-блок в graders/NN-check.md, вызывает эти проверки как `q <проверка> …`; код 0 — пункт выполнен.
// Ход работы берётся из transcript.jsonl (stream-json GigaCode / Qwen Code), папка кейса — текущая.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LINT = path.join(ROOT, 'skills/sdd-lint/scripts/sdd-lint.mjs');

// stream-json → вызовы инструментов, текст агента, результаты. Схему событий не угадываем:
// ищем блоки tool_use / text / tool_result на любой глубине — так разбор переживёт смену формата.
export function parseTranscript(raw) {
  const tools = [];
  const texts = [];
  const results = [];
  let json = 0;
  const walk = (x, role) => {
    if (Array.isArray(x)) return x.forEach((y) => walk(y, role));
    if (!x || typeof x !== 'object') return;
    const r = x.type === 'assistant' || x.type === 'user' ? x.type : x.role || role;
    if (x.type === 'tool_use' && x.name) tools.push({ name: x.name, input: x.input ?? x.arguments ?? {} });
    else if (x.type === 'text' && typeof x.text === 'string' && r === 'assistant') texts.push(x.text);
    else if (x.type === 'tool_result') results.push(typeof x.content === 'string' ? x.content : JSON.stringify(x.content));
    else if (x.type === 'result' && typeof x.result === 'string') texts.push(x.result);
    for (const [k, v] of Object.entries(x)) if (k !== 'input' && v && typeof v === 'object') walk(v, r);
  };
  for (const line of (raw || '').split('\n')) {
    if (!line.trim().startsWith('{')) continue;
    try {
      walk(JSON.parse(line), null);
      json++;
    } catch {}
  }
  // Не stream-json — весь вывод считаем текстом агента.
  if (!json && raw) texts.push(raw);
  return { tools, texts: [...new Set(texts)], results };
}
// Ход работы по порядку — для trace.md и судьи: что сказал агент, что вызвал, что получил.
export function digest(raw, max = 400) {
  const out = [];
  const cut = (s) => (s.length > max ? `${s.slice(0, max)}… (+${s.length - max})` : s);
  const walk = (x, role) => {
    if (Array.isArray(x)) return x.forEach((y) => walk(y, role));
    if (!x || typeof x !== 'object') return;
    const r = x.type === 'assistant' || x.type === 'user' ? x.type : x.role || role;
    if (x.type === 'tool_use' && x.name) out.push(`→ ${x.name} ${cut(JSON.stringify(x.input ?? x.arguments ?? {}))}`);
    else if (x.type === 'text' && typeof x.text === 'string' && r === 'assistant') out.push(`агент: ${x.text.trim()}`);
    else if (x.type === 'tool_result') out.push(`← ${cut(typeof x.content === 'string' ? x.content : JSON.stringify(x.content))}`);
    for (const [k, v] of Object.entries(x)) if (k !== 'input' && v && typeof v === 'object') walk(v, r);
  };
  let json = 0;
  for (const line of (raw || '').split('\n')) {
    if (!line.trim().startsWith('{')) continue;
    try {
      walk(JSON.parse(line), null);
      json++;
    } catch {}
  }
  return json ? out.join('\n\n') : raw || '';
}
const argsOf = (t) => (Array.isArray(t.input?.args) ? t.input.args : typeof t.input === 'string' ? [t.input] : Object.values(t.input || {}).flat().map(String));
const matches = (t, name, want) => t.name.includes(name) && want.every((w) => argsOf(t).some((a) => a === w || a.startsWith(`${w} `)));
// Глоб с * внутри одного сегмента пути: docs/*/brainstorming.md.
function glob(pattern) {
  const parts = pattern.split('/');
  let cur = ['.'];
  for (const p of parts) {
    // * — любые символы, [0-9] — класс как в shell.
    const re = new RegExp(`^${p.replace(/[.+?^${}()|\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
    cur = cur.flatMap((d) => {
      try {
        return fs.readdirSync(d).filter((x) => re.test(x)).map((x) => path.join(d, x));
      } catch {
        return [];
      }
    });
  }
  return cur.map((x) => path.relative('.', x));
}

const CHECKS = {
  // Был вызов инструмента, в аргументах которого есть все перечисленные (start, --slug …).
  called: (tr, [name, ...want]) => tr.tools.some((t) => matches(t, name, want)) || `не было вызова ${name} ${want.join(' ')}`,
  'not-called': (tr, [name, ...want]) => !tr.tools.some((t) => matches(t, name, want)) || `был вызов ${name} ${want.join(' ')}`,
  // Первый вызов этого инструмента — с такими аргументами.
  first: (tr, [name, ...want]) => {
    const t = tr.tools.find((x) => x.name.includes(name));
    return (t && matches(t, name, want)) || `первый вызов ${name}: ${t ? JSON.stringify(argsOf(t)) : 'нет'}`;
  },
  // Сказал человеку: текст агента или вопрос в инструменте выбора.
  said: (tr, [re]) => [...tr.texts, ...tr.tools.filter((t) => !t.name.includes('sdd_lint')).map((t) => JSON.stringify(t.input))].some((x) => new RegExp(re, 'iu').test(x)) || `агент не сказал /${re}/`,
  'not-said': (tr, [re]) => {
    const hit = tr.texts.find((x) => new RegExp(re, 'iu').test(x));
    return !hit || `агент сказал /${re}/`;
  },
  file: (_tr, [pattern, re]) => {
    const files = glob(pattern);
    if (!files.length) return `нет файла ${pattern}`;
    return !re || files.some((f) => new RegExp(re, 'mu').test(fs.readFileSync(f, 'utf8'))) || `в ${files.join(', ')} нет /${re}/`;
  },
  'no-file': (_tr, [pattern, re]) => {
    const files = glob(pattern).filter((f) => !re || new RegExp(re, 'mu').test(fs.readFileSync(f, 'utf8')));
    return !files.length || `есть ${files.join(', ')}${re ? ` с /${re}/` : ''}`;
  },
  // Папок фич в docs/ (кроме adr) ровно n.
  features: (_tr, [n]) => {
    const got = fs.existsSync('docs') ? fs.readdirSync('docs').filter((x) => x !== 'adr' && fs.statSync(path.join('docs', x)).isDirectory()) : [];
    return got.length === Number(n) || `папок фич ${got.length}: ${got.join(', ') || '—'}`;
  },
  // sdd-lint с аргументами завершился с кодом 0.
  lint: (_tr, args) => {
    const r = spawnSync(process.execPath, [LINT, ...args], { encoding: 'utf8' });
    return r.status === 0 || `sdd-lint ${args.join(' ')} → код ${r.status}: ${(r.stdout + r.stderr).trim().split('\n')[0]}`;
  },
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [check, ...args] = process.argv.slice(2);
  if (!CHECKS[check]) {
    console.error(`Проверки: ${Object.keys(CHECKS).join(', ')}`);
    process.exit(2);
  }
  const tr = parseTranscript(fs.existsSync(process.env.EVAL_TRANSCRIPT || '') ? fs.readFileSync(process.env.EVAL_TRANSCRIPT, 'utf8') : '');
  const ok = CHECKS[check](tr, args);
  if (ok !== true) {
    console.error(ok);
    process.exit(1);
  }
}
