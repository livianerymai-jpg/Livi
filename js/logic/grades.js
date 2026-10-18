// Cálculo de notas configurável por matéria.
// Modo "ponderada": média ponderada pelos pesos.
// Modo "formula": fórmula livre com os códigos das avaliações, ex.: (P1 + P2*2 + T)/4, max(P1; P2), media(P1; P2; P3)

const FUNCS = {
  MAX: (...a) => Math.max(...a),
  MIN: (...a) => Math.min(...a),
  MEDIA: (...a) => a.reduce((s, x) => s + x, 0) / a.length,
  SOMA: (...a) => a.reduce((s, x) => s + x, 0),
};

function tokenize(src) {
  const tokens = [];
  const re = /\s*(?:(\d+(?:[.,]\d+)?)|([A-Za-zÀ-ú_][A-Za-zÀ-ú0-9_]*)|(.))/gy;
  let m;
  while (re.lastIndex < src.length && (m = re.exec(src))) {
    if (m[1]) tokens.push({ t: 'num', v: parseFloat(m[1].replace(',', '.')) });
    else if (m[2]) tokens.push({ t: 'id', v: m[2].toUpperCase() });
    else if (m[3] && m[3].trim()) tokens.push({ t: 'op', v: m[3] });
  }
  return tokens;
}

export function parseFormula(src) {
  const tokens = tokenize(String(src ?? ''));
  let i = 0;
  const ids = new Set();
  const peek = () => tokens[i];
  const eat = (v) => {
    const tk = tokens[i];
    if (!tk || tk.v !== v) throw new Error(`esperava "${v}"`);
    i++;
  };
  function expr() {
    let left = term();
    while (peek() && (peek().v === '+' || peek().v === '-')) {
      const op = tokens[i++].v;
      const right = term();
      const l = left;
      left = op === '+' ? (v) => l(v) + right(v) : (v) => l(v) - right(v);
    }
    return left;
  }
  function term() {
    let left = factor();
    while (peek() && (peek().v === '*' || peek().v === '/' || peek().v === '×')) {
      const op = tokens[i++].v;
      const right = factor();
      const l = left;
      left = op === '/' ? (v) => l(v) / right(v) : (v) => l(v) * right(v);
    }
    return left;
  }
  function factor() {
    const tk = tokens[i++];
    if (!tk) throw new Error('fórmula incompleta');
    if (tk.t === 'num') return () => tk.v;
    if (tk.v === '-') {
      const f = factor();
      return (v) => -f(v);
    }
    if (tk.v === '(') {
      const e = expr();
      eat(')');
      return e;
    }
    if (tk.t === 'id') {
      if (peek()?.v === '(') {
        const fn = FUNCS[tk.v];
        if (!fn) throw new Error(`função desconhecida: ${tk.v}`);
        i++;
        const args = [expr()];
        while (peek() && (peek().v === ';' || peek().v === ',')) {
          i++;
          args.push(expr());
        }
        eat(')');
        return (v) => fn(...args.map((a) => a(v)));
      }
      ids.add(tk.v);
      return (v) => {
        if (!(tk.v in v)) throw new Error(`código desconhecido: ${tk.v}`);
        return v[tk.v];
      };
    }
    throw new Error(`símbolo inesperado: ${tk.v}`);
  }
  const fn = expr();
  if (i < tokens.length) throw new Error(`símbolo inesperado: ${tokens[i].v}`);
  return { evaluate: fn, ids: [...ids] };
}

export function formulaOf(grading) {
  if (grading.mode === 'formula') return grading.formula || '';
  const comps = grading.components.filter((c) => c.code);
  const total = comps.reduce((s, c) => s + (Number(c.weight) || 0), 0) || 1;
  if (!comps.length) return '0';
  return `(${comps.map((c) => `${c.code}*${Number(c.weight) || 0}`).join(' + ')})/${total}`;
}

const isNum = (x) => x !== null && x !== undefined && x !== '' && Number.isFinite(Number(x));

// Resultado: média atual, quanto falta e situação
export function computeGrades(grading) {
  const passing = Number(grading.passing ?? 6);
  const comps = grading.components.filter((c) => c.code);
  const codes = new Set(comps.map((c) => c.code.toUpperCase()));
  let parsed;
  try {
    parsed = parseFormula(formulaOf(grading));
    for (const id of parsed.ids) if (!codes.has(id)) throw new Error(`código desconhecido: ${id}`);
  } catch (e) {
    return { error: e.message };
  }
  const missing = comps.filter((c) => !isNum(c.grade));
  const maxGrade = Math.max(10, ...comps.map((c) => Number(c.max) || 10));
  const f = (x) => {
    const vars = {};
    for (const c of comps) vars[c.code.toUpperCase()] = isNum(c.grade) ? Number(c.grade) : Math.min(x, Number(c.max) || 10);
    return parsed.evaluate(vars);
  };

  // média só com o que já saiu (para mostrar "média atual")
  let current = null;
  const known = comps.filter((c) => isNum(c.grade));
  if (known.length) {
    if (grading.mode !== 'formula') {
      const w = known.reduce((s, c) => s + (Number(c.weight) || 0), 0);
      current = w ? known.reduce((s, c) => s + Number(c.grade) * (Number(c.weight) || 0), 0) / w : null;
    } else if (!missing.length) current = f(0);
  }

  if (!missing.length) {
    const final = f(0);
    return { final, current: final, passing, status: final >= passing - 1e-9 ? 'aprovada' : 'reprovada', missing: [] };
  }
  if (f(0) >= passing - 1e-9) return { current, passing, needed: 0, status: 'garantida', missing };
  if (f(maxGrade) < passing - 1e-9) return { current, passing, needed: null, status: 'impossivel', missing };
  let lo = 0;
  let hi = maxGrade;
  for (let k = 0; k < 50; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) >= passing - 1e-9) hi = mid;
    else lo = mid;
  }
  const needed = Math.ceil(hi * 10 - 1e-6) / 10;
  const status = needed <= 5 ? 'tranquilo' : needed <= 7.5 ? 'atencao' : 'dificil';
  return { current, passing, needed, status, missing };
}

export const GRADE_TEMPLATES = {
  duas: { label: '2 provas', mode: 'ponderada', components: [['P1', 'Prova 1', 1], ['P2', 'Prova 2', 1]] },
  tres: { label: '3 provas', mode: 'ponderada', components: [['P1', 'Prova 1', 1], ['P2', 'Prova 2', 1], ['P3', 'Prova 3', 1]] },
  trabalho: { label: '2 provas + trabalho', mode: 'ponderada', components: [['P1', 'Prova 1', 2], ['P2', 'Prova 2', 2], ['T', 'Trabalho', 1]] },
  formula: { label: 'Fórmula própria', mode: 'formula', components: [['P1', 'Prova 1', 1], ['P2', 'Prova 2', 1], ['T', 'Trabalho', 1]], formula: '0,4*P1 + 0,4*P2 + 0,2*T' },
};
