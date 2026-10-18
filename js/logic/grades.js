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
  if (grading.mode === 'modular') return computeModular(grading);
  const passing = Number(grading.passing ?? 6);
  if (!grading.components.some((c) => c.code)) return { empty: true, passing, missing: [] };
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

// ---------- Sistema modular
// Cada módulo tem avaliações que valem pontos (ex.: Cognitiva 40, Tutoria 30, Habilidades 30).
// Nota do módulo = pontos obtidos / pontos possíveis × escala. Nota final = média (ponderada) dos módulos.
// Opcional: nota mínima em cada módulo.
export function computeModular(g) {
  const scale = Number(g.scale) || 10;
  const passing = Number(g.passing ?? (scale === 100 ? 60 : 6));
  const minModule = isNum(g.minModule) ? Number(g.minModule) : null;
  const modules = (g.modules || []).filter((m) => m.components?.length);
  if (!modules.length) return { empty: true, passing, scale, modules: [] };
  const mx = (c) => Number(c.max) || 10;
  const modGrade = (m, x) => {
    let got = 0;
    let max = 0;
    for (const c of m.components) {
      max += mx(c);
      got += isNum(c.grade) ? Math.min(Number(c.grade), mx(c)) : x * mx(c);
    }
    return max ? (got / max) * scale : 0;
  };
  const partial = (m) => {
    const known = m.components.filter((c) => isNum(c.grade));
    const max = known.reduce((s, c) => s + mx(c), 0);
    return max ? (known.reduce((s, c) => s + Math.min(Number(c.grade), mx(c)), 0) / max) * scale : null;
  };
  const wsum = modules.reduce((s, m) => s + (Number(m.weight) || 1), 0);
  const final = (x) => modules.reduce((s, m) => s + modGrade(m, x) * (Number(m.weight) || 1), 0) / wsum;
  const ok = (x) => final(x) >= passing - 1e-9 && (minModule == null || modules.every((m) => modGrade(m, x) >= minModule - 1e-9));
  const missing = modules.flatMap((m) => m.components).filter((c) => !isNum(c.grade));
  const partials = modules.map((m) => ({ id: m.id, name: m.name, grade: partial(m), full: m.components.every((c) => isNum(c.grade)) ? modGrade(m, 0) : null }));
  const known = partials.filter((p) => p.grade != null);
  const current = known.length ? known.reduce((s, p) => s + p.grade, 0) / known.length : null;
  const base = { passing, scale, minModule, modules: partials, current, missing };
  if (!missing.length) {
    const f = final(0);
    return { ...base, final: f, status: ok(0) ? 'aprovada' : 'reprovada' };
  }
  if (ok(0)) return { ...base, needed: 0, fraction: 0, status: 'garantida' };
  if (!ok(1)) return { ...base, needed: null, status: 'impossivel' };
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 50; k++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) hi = mid;
    else lo = mid;
  }
  const fraction = Math.ceil(hi * 1000 - 1e-6) / 1000;
  const neededByComp = missing.map((c) => ({ id: c.id, name: c.name, max: mx(c), pts: Math.ceil(fraction * mx(c) * 10 - 1e-6) / 10 }));
  const status = fraction <= 0.5 ? 'tranquilo' : fraction <= 0.75 ? 'atencao' : 'dificil';
  return { ...base, fraction, needed: fraction * scale, neededByComp, status };
}

// Código curto para usar em fórmulas: "N1" → N1, "Trabalho de anatomia" → TDA
export function codeFor(title, used = new Set()) {
  const clean = String(title || 'A').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const compact = clean.replace(/[^A-Z0-9]/g, '');
  let code = compact.length && compact.length <= 6 ? compact : clean.split(/[^A-Z0-9]+/).filter(Boolean).map((w) => (/^\d+$/.test(w) ? w : w[0])).join('') || 'A';
  if (/^\d/.test(code)) code = 'A' + code;
  let out = code;
  for (let i = 2; used.has(out); i++) out = code + i;
  return out;
}

export const GRADE_TEMPLATES = {
  duas: { label: '2 provas', mode: 'ponderada', components: [['P1', 'Prova 1', 1], ['P2', 'Prova 2', 1]] },
  tres: { label: '3 provas', mode: 'ponderada', components: [['P1', 'Prova 1', 1], ['P2', 'Prova 2', 1], ['P3', 'Prova 3', 1]] },
  trabalho: { label: '2 provas + trabalho', mode: 'ponderada', components: [['P1', 'Prova 1', 2], ['P2', 'Prova 2', 2], ['T', 'Trabalho', 1]] },
};

export const MODULAR_TEMPLATE = [
  ['Avaliação cognitiva', 40],
  ['Tutoria / desempenho', 30],
  ['Habilidades / prática', 30],
];
