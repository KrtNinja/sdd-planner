// Чтение EDN без зависимостей: его зовут и ub-gate, и mutate.mjs в CI до npm install.
// Подмножество EDN, которое пишут crapper/dryer/mutator: карты, векторы, строки, ключевые слова, числа, nil.
export function readEdn(text) {
  let i = 0;
  const ws = () => { while (i < text.length && /[\s,]/.test(text[i])) i++; };
  const value = () => {
    ws();
    const c = text[i];
    if (c === '{' || c === '[') return coll(c === '{' ? '}' : ']', c === '{');
    if (c === '"') { const m = text.slice(i).match(/^"((?:[^"\\]|\\.)*)"/); i += m[0].length; return JSON.parse(m[0]); }
    const m = text.slice(i).match(/^[^\s,{}[\]]+/);
    i += m[0].length;
    const atom = m[0];
    if (atom === 'nil') return null;
    if (atom === 'true' || atom === 'false') return atom === 'true';
    if (atom.startsWith(':')) return atom.slice(1);
    return Number.isNaN(Number(atom)) ? atom : Number(atom);
  };
  const coll = (close, isMap) => {
    i++;
    const items = [];
    for (ws(); text[i] !== close; ws()) items.push(value());
    i++;
    if (!isMap) return items;
    if (items.length % 2) throw new Error('EDN: у ключа нет значения');
    const o = {};
    for (let k = 0; k < items.length; k += 2) o[items[k]] = items[k + 1];
    return o;
  };
  const result = value();
  ws();
  if (i !== text.length) throw new Error('EDN: данные после значения');
  return result;
}
