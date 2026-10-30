// Текущий этап фичи и блок «Следующий шаг».
import fs from 'node:fs';

import { pendingAdrs } from './adr.mjs';
import { skill, lintCmd } from './config.mjs';
import { neededAdrs, stubCount } from './cut.mjs';
import { rel, approved } from './md.mjs';
import { openBlockers, reviewKey } from './review.mjs';
import { legacyPaths, workFiles } from './work.mjs';

// Временные артефакты этапа планирования: нужны, пока требования пишутся, в merge не идут. Убирает их /sdd-close.
// Протокол лежит в папке фичи, остальное — в _work/; старые review/ и slices/plan.md close тоже убирает.
export function tempArtifacts(m) {
  const old = legacyPaths(m);
  return [
    m.protocol ? rel(m.protocolFile) : null,
    workFiles(m).length ? `${rel(m.workDir)}/` : null,
    fs.existsSync(old.review) ? `${rel(old.review)}/` : null,
    fs.existsSync(old.plan) ? rel(old.plan) : null,
  ].filter(Boolean);
}

function handoff(m, what) {
  const dir = rel(m.dir);
  const target = what === 'spec' ? rel(m.specFile) : `${dir}/slices/`;
  const human = what === 'spec' ? `${skill('humanizer', target)}` : `${skill('humanizer')} по каждому файлу в ${target}`;
  const guard = lintCmd('guard', what === 'spec' ? target : dir);
  const rv = m.reviews.get(what);
  const open = openBlockers(rv);
  return [
    `по желанию убрать следы ИИ из прозы: ${human}, затем ${guard}`,
    rv ? `ревью уже было: ${rel(rv.file)}; повторить в чистом контексте — ${skill('sdd-review', m.name, what)}` : `ревью в чистом контексте: ${skill('sdd-review', m.name, what)}`,
    ...(open.length ? [blockersStep(m, rv, open)] : []),
    `одобрить: ${lintCmd('approve', what, dir)}`,
  ];
}
export function blockersStep(m, rv, open) {
  const ids = open.map((r) => r.id);
  return `закрыть блокеры ревью ${ids.join(', ')} (${rel(rv.file)}): решение — ${skill('sdd-decide', m.name, ids[0], '"<решение>"')}, правка — исправьте файл и впишите «исправлено» в колонку «Решение»`;
}
function adrSteps(m) {
  return pendingAdrs(m).flatMap((a) => {
    const rv = m.reviews.get(reviewKey('adr', a.num));
    const open = openBlockers(rv);
    return [
      rv ? `ADR ${a.num} «${a.status || '—'}» — ревью уже было: ${rel(rv.file)}` : `ADR ${a.num} «${a.status || '—'}» — ревью: ${skill('sdd-review', m.name, 'adr', a.num)}`,
      ...(open.length ? [blockersStep(m, rv, open)] : []),
      `ADR ${a.num} — принять: ${lintCmd('approve', 'adr', rel(m.dir), a.num)}`,
    ];
  });
}
// «Р1 — ADR: <тема>» в slices — ADR ещё не заведён: предложить его написать.
const newAdrSteps = (m) => neededAdrs(m).map((x) => `написать ADR «${x.topic}» (slice ${x.num}): ${skill('sdd-adr', m.name, `"${x.topic}"`)}`);
export function stageOf(m) {
  const st = (now, next = []) => ({ now, next: [...next, ...newAdrSteps(m), ...adrSteps(m)] });
  // Неодобренный spec важнее всего ниже: после /sdd-decide он возвращается «на ревью»,
  // и одобрение slices относилось к другой его версии.
  if (m.slices.size && m.spec && !approved(m.spec.status))
    return st(
      approved(m.slicesStatus)
        ? `Dev Spec «${m.spec.status || '—'}», а slices уже есть — после одобрения spec проверьте и одобрите slices заново`
        : `Dev Spec «${m.spec.status || '—'}» — slices ждут его одобрения`,
      handoff(m, 'spec'),
    );
  if (m.slices.size && approved(m.slicesStatus)) {
    const pending = pendingAdrs(m);
    return pending.length
      ? { now: `Slices одобрены. Перед реализацией примите ADR: ${pending.map((a) => a.num).join(', ')}`, next: adrSteps(m) }
      : tempArtifacts(m).length
        ? { now: 'Slices одобрены, ADR приняты', next: [`перед merge убрать временные артефакты (${tempArtifacts(m).join(', ')}): ${skill('sdd-close', m.name)}`] }
        : { now: 'Планирование завершено: slices одобрены, ADR приняты, временные артефакты убраны', next: [] };
  }
  const stubs = m.slices.size ? stubCount(m) : 0;
  if (stubs) return st(`Slices созданы по плану, заготовок «<…>» не заполнено: ${stubs}`, [`заполнить заготовки: ${skill('sdd-slices', m.name)}`]);
  if (m.slices.size) return st('Slices на ревью', handoff(m, 'slices'));
  if (m.plan && m.spec && approved(m.spec.status)) return st(`План нарезки ждёт согласия (${rel(m.planFile)})`, [`согласовать нарезку: ${skill('sdd-slices', m.name)}`]);
  if (m.spec && approved(m.spec.status)) return st('Dev Spec одобрен', [skill('sdd-slices', m.name)]);
  if (m.spec) return st(`Dev Spec «${m.spec.status || '—'}»`, handoff(m, 'spec'));
  if (m.protocol && /готов/i.test(m.protocol.status || '')) return st('Протокол готов', [skill('sdd-spec', m.name)]);
  if (m.protocol) return st('Brainstorming идёт', [`продолжить: ${skill('sdd-grill', m.name)}`]);
  return st('Brainstorming не начат', [skill('sdd-grill', m.name)]);
}
export function stageText({ now, next }) {
  if (!next.length) return now;
  if (next.length === 1) return `${now}. Следующий шаг: ${next[0]}`;
  return `${now}. Следующий шаг:\n${next.map((x, i) => `  ${i + 1}. ${x}`).join('\n')}`;
}
