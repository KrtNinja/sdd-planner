// Бриф этапа slices для агента: требования, сервисы, ADR и с какого шага продолжать — печатает gate slices.
import { stubCount } from './cut.mjs';
import { rel } from './md.mjs';
import { registry } from './services.mjs';

const call = (...args) => `sdd_lint ${JSON.stringify(args)}`;
// Правило FR одной строкой: текст до «Пример:», первое предложение.
function gist(r) {
  const body = r.text.replace(/^\s*N?FR-\d+\s*/, '').split(/Пример:/)[0].replace(/\s+/g, ' ').trim();
  const first = body.match(/^.*?[.!?](?=\s|$)/)?.[0] || body;
  return first.length > 110 ? `${first.slice(0, 107)}…` : first;
}

export function slicesBrief(m) {
  const dir = rel(m.dir);
  const reqs = [...m.spec.reqs.values()].filter((r) => !r.deleted);
  const reg = registry(m);
  const out = [
    `Требования spec.md (${reqs.length}) — каждое должно попасть в «Основание» хотя бы одного slice:`,
    ...reqs.map((r) => `  ${r.id.padEnd(6)} ${gist(r)}`),
    reg ? `Сервисы: ${reg.list.join(', ')} — пиши их в «Половины» так же.` : 'Сервисы: в протоколе нет строки «Сервисы:» — назови сервисы сам по spec и ADR.',
    m.featureAdrs.length
      ? `ADR фичи (прочитай): ${m.featureAdrs.map((a) => `${rel(a.file)} «${a.status || '—'}» — ${(a.md.match(/^#\s+ADR-\d+:\s*(.*)$/m) || [])[1] || 'без названия'}`).join('; ')}`
      : 'ADR фичи: нет. Часть ждёт решения, которого ещё нет, — в плане «Р1 — ADR: <тема>».',
  ];
  if (m.slices.size) {
    const stubs = stubCount(m);
    out.push(
      stubs
        ? `Сейчас: файлы slices есть, заготовок «<…>» ${stubs} — продолжай с шага «Заполни заготовки».`
        : `Сейчас: файлы slices есть и заполнены — нарезку заново не начинай. Поправить поведение — через sdd-decide; закончить этап — ${call('done', dir)}.`,
    );
  } else if (m.plan) out.push(`Сейчас: план ${rel(m.planFile)} есть — продолжай с проверки: ${call('plan', dir)}.`);
  else out.push(`Сейчас: плана нет — начни с него: ${rel(m.planFile)}.`);
  return out.join('\n');
}
