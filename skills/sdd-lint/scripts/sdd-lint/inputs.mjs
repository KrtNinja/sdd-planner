// Источники фичи — «Источники:» протокола: задача, макеты, документы, которые человек передал к запросу.
import fs from 'node:fs';
import path from 'node:path';

import { header, headerLine, uniq } from './md.mjs';

// Не путать с sources.mjs: там «Из протокола:» — откуда требование spec пришло в протокол.
export const SOURCES_KEY = 'Источники';
const NONE_RE = /^(нет|нету|ничего|ничего нет|не будет|-|—)$/i;
const URL_RE = /https?:\/\/[^\s<>«»"'`]+/giu;
const TRIM_END = /[.,;:!?)\]»"'`]+$/u;
const TRIM_START = /^[(«"'`[]+/u;
const unquote = (s) => s.replace(/^[«"']+|[»"']+$/g, '').trim();

export const isUrl = (s) => /^https?:\/\//i.test(s);
// Путь относительно корня репозитория (текущей папки) или null, если он вне репозитория.
const inRepo = (p) => {
  const r = path.relative(process.cwd(), path.resolve(process.cwd(), p));
  return r.startsWith('..') || path.isAbsolute(r) ? null : r.split(path.sep).join('/') || '.';
};

// Значение «Источники:»: null — строки нет или заготовка «<…>», 'none' — «нет», иначе список.
export function parseSourcesLine(raw) {
  if (raw == null) return null;
  const v = raw.trim();
  if (!v || v.startsWith('<')) return null;
  if (NONE_RE.test(unquote(v))) return 'none';
  return uniq(v.split(/,\s+/).map((x) => x.trim()).filter(Boolean));
}
export const protocolSources = (p) => parseSourcesLine(header(p?.md, SOURCES_KEY));
export const sourcesLine = (p) => headerLine(p?.md, SOURCES_KEY);
export const protocolReady = (p) => /готов/i.test(p?.status || '');
// Вопрос об источниках ещё не задан: протокол есть, brainstorming идёт, «Источники:» пусто.
export const sourcesPending = (m) => !!m.protocol && !protocolReady(m.protocol) && protocolSources(m.protocol) == null;

// Что не так с источником из «Источники:»: null — ссылка или файл/папка в репозитории.
export function sourceProblem(s) {
  if (isUrl(s)) return null;
  const r = inRepo(s.replace(/^@/, ''));
  if (r == null) return 'вне репозитория';
  return fs.existsSync(r) ? null : 'не ссылка и не файл в репозитории';
}
export const sourceKind = (s) => (isUrl(s) ? 'ссылка' : fs.existsSync(s) && fs.statSync(s).isDirectory() ? 'папка' : 'файл');

// Аргументы скилла или ответ человека → ссылки и пути. Остальной текст (фраза запроса, пояснения) — не источник.
// Путь — «@…» (так его дописывает Tab в GigaCode) или токен с «/», который есть на диске.
// Пути — относительно корня репозитория; файл вне репозитория и несуществующий «@путь» — в rejected с причиной.
export function extractSources(args, featureDir) {
  const found = [];
  const rejected = [];
  let none = false;
  const own = new Set([featureDir, path.join(featureDir, 'brainstorming.md')].map((f) => path.resolve(f)));
  const addPath = (raw, explicit) => {
    const p = raw.replace(/^@/, '');
    if (!fs.existsSync(p)) {
      if (explicit) rejected.push({ src: raw, why: 'нет такого файла' });
      return;
    }
    const r = inRepo(p);
    if (r == null) rejected.push({ src: raw, why: 'файл вне репозитория' });
    else if (!own.has(path.resolve(p))) found.push(r);
  };
  for (const a of args) {
    const t = (a || '').trim();
    if (!t) continue;
    if (NONE_RE.test(unquote(t))) {
      none = true;
      continue;
    }
    // Аргумент целиком — путь (в том числе с пробелами в имени): начинается с @ или содержит «/».
    if (!isUrl(t) && (t.startsWith('@') || t.includes('/')) && fs.existsSync(t.replace(/^@/, ''))) {
      addPath(t, true);
      continue;
    }
    for (const u of t.match(URL_RE) || []) found.push(u.replace(TRIM_END, ''));
    for (const w of t.replace(URL_RE, ' ').split(/\s+/)) {
      const tok = w.replace(TRIM_START, '').replace(TRIM_END, '');
      // «@anna» — упоминание, а не файл: путь с @ узнаём по «/» или расширению. Без @ — слово с «/»:
      // с расширением файла это путь (нет файла — скажем), без него («фронт/бэк») — просто текст.
      if (/^@[^@\s]*[/.]/.test(tok)) addPath(tok, true);
      else if (!tok.startsWith('@') && tok.includes('/') && !isUrl(tok)) addPath(tok, /\.\w{1,5}$/.test(tok));
    }
  }
  return { found: uniq(found), rejected, none };
}

// «Источники: …» в протоколе: заменить строку или вставить после «Запрос:» (нет его — после «Статус:» или заголовка).
export function writeSourcesLine(md, value) {
  const ls = md.split('\n');
  const line = `${SOURCES_KEY}: ${value}`;
  const at = headerLine(md, SOURCES_KEY);
  if (at) ls[at - 1] = line;
  else ls.splice(headerLine(md, 'Запрос') || headerLine(md, 'Статус') || 1, 0, '', line);
  return ls.join('\n');
}
