// Перенос ссылок по точной карте строк; снимки решений Q остаются неизменными.
// @ts-check
import path from 'node:path';
import { scan } from './md.mjs';

/** @typedef {{spec: string, target: string, start: number, stop: number, replacement: number, anchors: Set<string>}} Move */
/** @param {string} md */
export function scenarioAnchors(md) {
  const anchors = new Set();
  for (const l of proseLines(md)) {
    const explicit = l.text.match(/<a id="([^"]+)"><\/a>/);
    if (explicit) anchors.add(explicit[1]);
    const heading = l.text.match(/^#{1,6} (.+)/);
    if (heading) anchors.add(heading[1].toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/ /g, '-'));
  }
  return anchors;
}

/** @param {string} fragment @param {Move} move @returns {{file: string, fragment: string}} */
function destination(fragment, move) {
  const range = fragment.match(/^L(\d+)-L(\d+)$/);
  if (range) return relocateRange(range, move);
  const match = fragment.match(/^L(\d+)$/);
  if (!match) return { file: move.anchors.has(fragment) ? move.target : move.spec, fragment };
  const n = Number(match[1]);
  if (n > move.start && n <= move.stop) return { file: move.target, fragment: `L${n - move.start}` };
  const shifted = n > move.stop ? n - (move.stop - move.start) + move.replacement : n;
  return { file: move.spec, fragment: `L${shifted}` };
}

/** @param {string} href @param {string} source @param {string} output @param {Move} move */
function relocateHref(href, source, output, move) {
  const hash = href.indexOf('#');
  if (hash < 0) return href;
  const base = href.slice(0, hash);
  if (base.includes(':')) return href;
  const resolved = base ? path.resolve(path.dirname(source), base) : source;
  if (resolved !== move.spec) return href;
  const dest = destination(href.slice(hash + 1), move);
  const file = dest.file === output ? '' : path.relative(path.dirname(output), dest.file).split(path.sep).join('/');
  return `${file}#${dest.fragment}`;
}

/** @param {string} md @param {string} source @param {string} output @param {Move} move */
export function relocateScenarioLinks(md, source, output, move) {
  const raw = md.split('\n');
  for (const l of scan(md).lines) {
    if (l.inCode || /^(?:Пакет|Согласование|Снимок|ОтветJSON|ОтветыJSON|Действия):/.test(l.text)) continue;
    raw[l.n - 1] = l.text.replace(/(\]\()([^\s)]+)(\s+["'][^\n]*?["']\)|\))/g,
      (_, open, href, close) => open + relocateHref(href, source, output, move) + close)
      .replace(/^(\s*\[[^\]]+\]:\s*)(\S+)/, (_, lead, href) => lead + relocateHref(href, source, output, move));
  }
  return raw.join('\n');
}

/** @param {RegExpMatchArray} range @param {Move} move @returns {{file: string, fragment: string}} */
function relocateRange(range, move) {
  const first = destination(`L${range[1]}`, move);
  const last = destination(`L${range[2]}`, move);
  const spansSection = Number(range[1]) <= move.start && Number(range[2]) > move.stop;
  if (first.file !== last.file || spansSection) throw new Error('Ссылка пересекает границу раздела сценариев: разделите её перед переносом');
  return { file: first.file, fragment: `${first.fragment}-${last.fragment}` };
}

// Определения ссылок могли оставаться вне раздела: разворачиваем только ссылки в переносимом тексте.
/** @param {string} section @param {string} spec */
export function inlineScenarioReferences(section, spec) {
  const definitions = new Map();
  for (const line of proseLines(spec)) {
    const match = line.text.match(/^\s*\[([^\]]+)\]:\s*(\S+(?:\s+["'][^\n]*["'])?)\s*$/);
    if (match) definitions.set(match[1].toLowerCase(), match[2]);
  }
  const raw = section.split('\n');
  for (const line of proseLines(section).filter((l) => !/^\s*\[[^\]]+\]:/.test(l.text))) {
    raw[line.n - 1] = line.text.replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (all, label, key) => {
      const href = definitions.get((key || label).toLowerCase());
      if (!href) throw new Error(`Нет определения ссылки ${key || label}; исправьте перед переносом`);
      return `[${label}](${href})`;
    }).replace(/\[([^\]]+)\](?![(:\[])/g, (all, label) => {
      const href = definitions.get(label.toLowerCase());
      return href ? `[${label}](${href})` : all;
    });
  }
  return raw.join('\n');
}

/** @param {string} md */
const proseLines = (md) => scan(md).lines.filter((l) => !l.inCode);
