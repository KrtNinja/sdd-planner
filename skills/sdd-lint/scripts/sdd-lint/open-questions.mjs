// Открытые вопросы артефакта: список для обхода перед одобрением и запись вопроса из находки ревью («Затрудняюсь»).
import fs from 'node:fs';

import { hasSection, inSection, noneText, replaceSection, reqIds, scan } from './md.mjs';

const LIST_ITEM = /^\s*(?:[-*]|\d+[.)])\s+(?=\S)/;
const SPEC_RE = /^Открытые вопросы/;
const ADR_RE = /^Не выяснено/;

// Пункты раздела: элемент списка с продолжением на следующих строках; текст без списка — один пункт.
function sectionItems(file, md, re) {
  const ls = inSection(scan(md), re).filter((l) => !l.inCode && l.text.trim() && !/^\s*<!--/.test(l.text));
  if (!ls.length || noneText(ls.map((l) => l.text).join('\n'))) return [];
  const items = [];
  for (const l of ls) {
    if (LIST_ITEM.test(l.text) || !items.length) items.push({ file, n: l.n, text: l.text.replace(LIST_ITEM, '').trim() });
    else items[items.length - 1].text += ` ${l.text.trim()}`;
  }
  return items;
}

// Открытые вопросы, которые держат одобрение (SP-06, SL-10): spec — «Открытые вопросы»,
// slices — «Открытые вопросы к Dev Spec» в каждом slice. «Не выяснено» в ADR принятие не держит.
export function openQuestions(m, what) {
  if (what === 'spec') return m.spec ? sectionItems(m.specFile, m.spec.md, SPEC_RE) : [];
  if (what === 'slices') return [...m.slices.values()].sort((a, b) => a.num.localeCompare(b.num)).flatMap((sl) => sectionItems(sl.file, sl.md, SPEC_RE));
  return [];
}

// Куда пишется открытый вопрос из находки: spec; slice из «Где» (файл, AC-NNN-…, FR из «Основание»); ADR — «Не выяснено».
export function openTarget(m, key, r) {
  if (key === 'spec') return m.spec ? { file: m.specFile, re: SPEC_RE, title: 'Открытые вопросы' } : null;
  if (key === 'slices') {
    const text = `${r.where} ${r.what}`;
    let num = text.match(/(?:^|[\s/])(\d{3})-[\w-]+\.md/)?.[1] || text.match(/\bAC-(\d{3})-/)?.[1];
    if (!num) {
      const fr = reqIds(r.where)[0];
      num = fr ? [...m.slices.values()].find((s) => s.basis.has(fr))?.num : null;
    }
    const sl = num ? m.slices.get(num) : null;
    return sl ? { file: sl.file, re: SPEC_RE, title: 'Открытые вопросы к Dev Spec' } : null;
  }
  const a = m.featureAdrs.find((x) => `adr-${x.num}` === key);
  return a ? { file: a.file, re: ADR_RE, title: 'Не выяснено', adr: true } : null;
}

// Текст вопроса — из находки дословно: «Где» без имени файла и «Что не так». Номер R не пишем —
// после закрытия ревью его не будет, а «ревью R2» в spec — пометка правки (SP-22).
export function openText(r, adr = false) {
  const where = r.where.replace(/[\w./-]+\.md\b/g, '').replace(/^[\s,;:—–-]+|[\s,;:—–-]+$/g, '');
  const what = r.what.replace(/\s+/g, ' ').trim();
  return `${where ? `${where}: ` : ''}${adr ? `${what.replace(/[.\s]+$/, '')}. Блокирует ли slices — не решено.` : what}`;
}

// Дописывает пункт в раздел; «Нет.» заменяет; раздела нет — создаёт в конце файла. Возвращает номер строки пункта.
export function addOpenQuestion(target, text) {
  const md = fs.readFileSync(target.file, 'utf8');
  const item = `- ${text}`;
  const sc = scan(md);
  const body = inSection(sc, target.re).filter((l) => l.text.trim());
  let next;
  if (!hasSection(sc, target.re) || !body.length || noneText(body.map((l) => l.text).join('\n'))) next = replaceSection(md, target.re, target.title, item);
  else {
    const ls = md.split('\n');
    ls.splice(body[body.length - 1].n, 0, item);
    next = ls.join('\n');
  }
  // replaceSection у последнего раздела теряет перевод строки в конце файла — возвращаем.
  if (md.endsWith('\n') && !next.endsWith('\n')) next += '\n';
  fs.writeFileSync(target.file, next);
  return next.split('\n').indexOf(item) + 1;
}
