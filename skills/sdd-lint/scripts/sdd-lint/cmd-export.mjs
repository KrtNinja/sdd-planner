// Команда export: требования фичи в JSON для зоны реализации — единственный интерфейс между зонами.
import { pos } from './args.mjs';
import { gateClosed } from './cmd-check.mjs';
import { loadFeature, runChecks } from './feature.mjs';
import { rel, uniq } from './md.mjs';
import { needDir } from './pick.mjs';
import { layers } from './readme.mjs';
import { stageOf } from './stage.mjs';

// Разметку markdown знает только планирование: реализация читает этот JSON, а не файлы slices.
// Тест ссылается на AC строкой <feature>/<AC-ID> — так AC-002-1 разных фич не смешиваются.
const AC_ID = 'AC-\\d{3}-[BF]?\\d+';

const serviceOfHeading = (h) => (h || '').replace(/[-–—\s]*половина.*$/i, '').trim().toLowerCase() || null;

function acOf(feature, ac) {
  const first = ac.text.split('\n').find((l) => l.includes(ac.id)) || '';
  const half = ac.side === 'F' ? 'frontend' : ac.side === 'B' ? 'backend' : 'common';
  return {
    id: ac.id,
    ref: `${feature}/${ac.id}`,
    name: first.slice(first.indexOf(ac.id) + ac.id.length).replace(/\(удал[её]н[^)]*\)/i, '').trim(),
    half,
    service: half === 'frontend' ? 'frontend' : half === 'backend' ? serviceOfHeading(ac.h2) : null,
    checks: ac.refs,
    line: ac.n,
    deleted: ac.deleted,
  };
}

// «tasks-core + frontend, принимаются вместе», «tasks-core, audit, frontend — у каждого…», «только tasks-core»
function servicesOf(sl, acs) {
  const head = (sl.halves || '').split(/,\s*(?=[а-яё])|\s[—–-]\s/i)[0];
  const named = head
    .split(/\s*[+,]\s*/)
    .map((s) => s.replace(/^только\s+/i, '').trim().toLowerCase())
    .filter((s) => /^[\w.-]+$/.test(s));
  return uniq([...named, ...acs.map((a) => a.service).filter(Boolean)]);
}

export function cmdExport() {
  const m = loadFeature(needDir(pos[0]));
  runChecks(m);
  const closed = gateClosed(m, 'build');
  const layerOf = new Map(layers(m).flatMap((ls, i) => ls.map((n) => [n, i + 1])));
  const slices = [...m.slices.values()].map((sl) => {
    const acs = sl.acs.map((a) => acOf(m.name, a));
    return {
      num: sl.num,
      title: sl.title,
      file: rel(sl.file),
      type: sl.type,
      deps: sl.deps,
      layer: layerOf.get(sl.num) ?? null,
      services: servicesOf(sl, acs),
      basis: [...sl.basis],
      acs,
    };
  });
  const out = {
    feature: m.name,
    dir: rel(m.dir),
    stage: stageOf(m).now,
    gate: { build: closed ? 'closed' : 'open', reason: closed ? closed[0] : null, hint: closed ? closed[1] : null },
    ref: { format: `${m.name}/<AC-ID>`, pattern: `${m.name}/${AC_ID}` },
    spec: m.spec ? { file: rel(m.spec.file), status: m.spec.status } : null,
    slicesStatus: m.slicesStatus,
    slices,
    adrs: m.featureAdrs.map((a) => ({ num: a.num, file: rel(a.file), status: a.status, title: ((a.md.match(/^#\s+ADR-\d+:\s*(.*)$/m) || [])[1] || '').trim() })),
  };
  console.log(JSON.stringify(out, null, 2));
  // Код как у gate build: 3 — реализацию начинать нельзя; JSON печатается всё равно.
  process.exit(closed ? 3 : 0);
}
