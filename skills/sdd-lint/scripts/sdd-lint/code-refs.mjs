// Ссылки на код в spec, slices, README и ADR (CD-*): требования не должны врать после переименований в коде.
// @ts-check
import { finding } from './findings.mjs';

/** @typedef {import('./model.mjs').Feature} Feature */

// Связь «требование → код» идёт из кода (AC-ID в названии теста), доки на код не ссылаются.
// brainstorming.md и _work/ — временные артефакты этапа, их не проверяем: в протоколе аналитик пишет что угодно.

const CODE_EXT = 'ts|tsx|js|jsx|mjs|cjs|py|java|kt|kts|go|cs|rs|rb|php|vue|svelte|swift|scala|sql|proto|graphql|gql|ya?ml|json|toml|xml|properties|gradle|sh';
const SRC_DIRS =
  'src|lib|libs|apps?|packages|internal|cmd|pkg|tests?|__tests__|specs?|' +
  'domain|application|infrastructure|infra|adapters|ports|components|modules|contracts|migrations|config';
const CODE_FILE = new RegExp(`\\.(?:${CODE_EXT})$`, 'i');
const SRC_PATH = new RegExp(`(?:^|/)(?:${SRC_DIRS})/`);
// «domain/errors/TaskErrors.ts», «task-transferred.message.json», «contracts/events/»
const FILE_RE = new RegExp(`(?<![\\w/.\\-])(?:[\\w.\\-]+/)*[\\w\\-]+(?:\\.[\\w\\-]+)*\\.(?:${CODE_EXT})(?![\\w\\-])`, 'g');
const DIR_RE = new RegExp(`(?<![\\w/.\\-])(?:${SRC_DIRS})/[\\w.\\-/]*`, 'g');
// «Node.js», «Vue.js» — имя продукта, не файл
const PRODUCT_JS = /^[A-Z][\w]*\.js$/;
// «create()», «service.transfer(dto)»; «API (…)» с пробелом — проза
const CALL_RE = /(?<![\w$.\-])([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\(([^()]*)\)/g;
const LINK_RE = /\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const URL_RE = /https?:\/\/[^\s)>\]]+/g;
// просмотр кода: GitHub и GitVerse (blob, tree, raw, content), GitLab (/-/blob/)
const CODE_VIEW = /\/(?:-\/)?(?:blob|tree|raw)\/|\/content\/[^/]+\//;
const IMAGE = /\.(?:png|jpe?g|gif|svg|webp)$/i;
// Блок без языка — FR и AC; mermaid — схема; text — пример вывода.
const PLAIN_LANGS = new Set(['', 'text', 'txt', 'plain', 'mermaid']);

// Внешние контракты (поля API и БД, DTO, события, коды ошибок) живут версиями и в доках допустимы,
// в том числе в AC: ответ по контракту наблюдаем на границе. Внутренние имена — классы, порты,
// адаптеры — меняются при рефакторинге; узнаём их по суффиксу. ADR тоже без них: он фиксирует выбор
// и его причины, а соглашения о коде живут в репозитории сервиса.
const INTERNAL_SUFFIX =
  'Service|Controller|Repository|Repo|Handler|Port|Adapter|Gateway|Factory|Manager|UseCase|Store|Component|Provider|Module|' +
  'Helper|Utils?|Impl|Mapper|Resolver|Middleware';
const INTERNAL_RE = new RegExp(`(?<![\\w-])[A-Z][a-z0-9]+[A-Za-z0-9]*?(?:${INTERNAL_SUFFIX})(?![\\w-])`, 'g');

/** @param {string} target */
function isCodeLink(target) {
  const t = target.split(/[#?]/)[0];
  if (/^https?:/i.test(target)) return CODE_VIEW.test(target) && !/\.md$/i.test(t);
  if (!t || /\.md$/i.test(t) || IMAGE.test(t)) return false;
  return CODE_FILE.test(t) || SRC_PATH.test(t) || /#L\d+/.test(target);
}

// Что в строке ссылается на код. Тексты «…» — копия продукта, адреса ссылок проверяет CD-02.
/** @param {string} text @returns {[string, string][]} */
export function codeRefs(text) {
  /** @type {[string, string][]} */
  const out = [];
  for (const m of text.matchAll(LINK_RE)) if (isCodeLink(m[1])) out.push(['CD-02', m[1]]);
  for (const m of text.replace(LINK_RE, ']').matchAll(URL_RE)) if (isCodeLink(m[0])) out.push(['CD-02', m[0]]);
  const plain = text.replace(LINK_RE, ']').replace(URL_RE, ' ').replace(/«[^«»]*»/g, ' ');
  const files = [...plain.matchAll(FILE_RE)].map((m) => m[0]).filter((x) => !PRODUCT_JS.test(x));
  const dirs = [...plain.matchAll(DIR_RE)].map((m) => m[0]).filter((d) => !files.some((f) => f.includes(d)));
  for (const x of [...files, ...dirs]) out.push(['CD-01', x]);
  // ВЫЗОВ(…) без точки и с аргументом — аббревиатура в прозе
  for (const m of plain.matchAll(CALL_RE)) if (!(/^[A-Z0-9]+$/.test(m[1]) && m[2].trim())) out.push(['CD-03', `${m[1]}(${m[2]})`]);
  return out;
}

/** @param {string} text */
export function internalNames(text) {
  let rest = text.replace(LINK_RE, ']').replace(URL_RE, ' ').replace(/«[^«»]*»/g, ' ');
  for (const [, x] of codeRefs(text)) rest = rest.split(x).join(' ');
  return [...new Set([...rest.matchAll(INTERNAL_RE)].map((m) => m[0]))];
}

const WHAT = { 'CD-01': 'путь или файл кода', 'CD-02': 'ссылка на код', 'CD-03': 'вызов из кода' };
/** @typedef {{ inAc?: boolean }} RefOpts */

// Строка: ссылки на код (каждая один раз) и внутренние имена — если их проверяем в этом месте.
/** @param {string} file @param {import('./model.mjs').Line} l @param {RefOpts} opts */
function lineRefs(file, l, { inAc = true }) {
  const refs = [...new Map(codeRefs(l.text).map((r) => [r.join(''), r])).values()];
  const internal = l.inCode && !inAc ? [] : internalNames(l.text);
  return [
    ...refs.map(([rule, x]) => finding(rule, file, l.n, `«${x}» — ${WHAT[/** @type {keyof typeof WHAT} */ (rule)]}`)),
    ...internal.map((x) => finding('CD-05', file, l.n, `«${x}» — внутреннее имя из кода`)),
  ];
}
// inAc — проверять ли внутренние имена в блоках кода (AC в slices; там их уже ловит SL-22).
/** @param {string} file @param {import('./model.mjs').Scan} sc @param {RefOpts} [opts] */
function checkFile(file, sc, opts = {}) {
  return [
    ...sc.blocks
      .filter((b) => !PLAIN_LANGS.has(b.lang))
      .map((b) => finding('CD-04', file, b.start, `блок кода «${b.lang}»`)),
    ...sc.lines.filter((l) => !/^\s*Статус:/.test(l.text)).flatMap((l) => lineRefs(file, l, opts)),
  ];
}

/** @param {Feature} m */
export function checkCodeRefs(m) {
  return [
    ...(m.spec ? checkFile(m.spec.file, m.spec.sc) : []),
    ...[...m.slices.values()].flatMap((sl) => checkFile(sl.file, sl.sc, { inAc: false })),
    ...(m.readmeSc ? checkFile(m.readmeFile, m.readmeSc) : []),
    ...m.featureAdrs.flatMap((a) => checkFile(a.file, a.sc)),
  ];
}
