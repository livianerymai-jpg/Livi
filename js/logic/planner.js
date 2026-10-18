// Planejador de estudos com revisão espaçada.
//
// Base científica (resumo):
// - Efeito de espaçamento (Ebbinghaus; Cepeda et al., 2006/2008): revisar em intervalos
//   crescentes fixa melhor do que estudar tudo de uma vez. O melhor intervalo cresce
//   com a distância até a prova (~10–20% do tempo de retenção).
// - Prática de recuperação (Roediger & Karpicke, 2006): cada revisão deve ser
//   "tentar lembrar" (questões, flashcards, explicar em voz alta), não só reler.
// - Sono consolida a memória: a 1ª revisão fica no dia seguinte ao estudo.
// - Folga antes da prova: os últimos dias ficam livres para chegar descansada e segura.
import { addDays, diffDays, weekday, maxDate } from './dates.js';

// Revisões após o estudo inicial: +1, +3, +7, +14, +30 dias
export const INTERVALS = [1, 3, 7, 14, 30];
// Matérias mais difíceis ganham mais revisões
export const REVIEWS_BY_DIFFICULTY = { 1: 2, 2: 3, 3: 3, 4: 4, 5: 5 };
// Fração da janela usada para ver conteúdo novo (o resto fica para revisar)
const NEW_SHARE = { 1: 0.75, 2: 0.7, 3: 0.6, 4: 0.55, 5: 0.5 };
export const COST = { estudo: 1, revisao: 0.5, final: 0.5 };

export function buildPlan({ subjects, exams, tasks = [], today, settings = {} }) {
  const buffer = settings.bufferDays ?? 2;
  const cap = settings.dailyCapacity ?? 4;
  const off = new Set(settings.offWeekdays ?? []);
  const subjById = new Map(subjects.map((s) => [s.id, s]));
  const done = new Map(tasks.filter((t) => t.done).map((t) => [t.id, t]));
  const out = [...done.values()];
  const warnings = [];

  // Dias de folga: o dia da prova e os 'buffer' dias antes dela.
  // Nesses dias não há tarefas daquela prova e as outras matérias ficam com metade da carga.
  const folga = new Map();
  for (const ex of exams) {
    for (let i = 0; i <= buffer; i++) {
      const d = addDays(ex.date, -i);
      if (!folga.has(d)) folga.set(d, new Set());
      folga.get(d).add(ex.id);
    }
  }

  const load = new Map();
  const capacity = (d, examId) => {
    if (off.has(weekday(d))) return 0;
    const f = folga.get(d);
    if (f?.has(examId)) return 0;
    return f ? cap / 2 : cap;
  };
  const fits = (d, examId, cost) => (load.get(d) ?? 0) + cost <= capacity(d, examId) + 1e-9;
  const take = (d, cost) => load.set(d, (load.get(d) ?? 0) + cost);

  function slot(ideal, min, max, examId, cost, preferEarlier = false) {
    if (min > max) return null;
    if (ideal < min) ideal = min;
    if (ideal > max) ideal = max;
    const span = diffDays(min, max);
    for (let k = 0; k <= span; k++) {
      const cands = k === 0 ? [ideal] : preferEarlier ? [addDays(ideal, -k), addDays(ideal, k)] : [addDays(ideal, k), addDays(ideal, -k)];
      for (const d of cands) if (d >= min && d <= max && fits(d, examId, cost)) return d;
    }
    // Sem espaço: usa o dia possível menos carregado (o plano fica apertado)
    let best = null;
    for (let k = 0; k <= span; k++) {
      const d = addDays(min, k);
      if (capacity(d, examId) <= 0) continue;
      if (!best || (load.get(d) ?? 0) < (load.get(best) ?? 0)) best = d;
    }
    return best;
  }

  const upcoming = exams
    .filter((e) => e.date > today && e.contents?.length)
    .sort((a, b) => a.date.localeCompare(b.date) || (subjById.get(b.subjectId)?.difficulty ?? 3) - (subjById.get(a.subjectId)?.difficulty ?? 3));

  for (const exam of upcoming) {
    const diff = Math.min(5, Math.max(1, subjById.get(exam.subjectId)?.difficulty ?? 3));
    const nRev = REVIEWS_BY_DIFFICULTY[diff];
    const start = today;
    let end = addDays(exam.date, -(buffer + 1));
    if (end < start) {
      end = maxDate(start, addDays(exam.date, -1));
      warnings.push({ examId: exam.id, type: 'apertado', msg: 'Pouco tempo até a prova: a folga foi reduzida.' });
    }
    const window = diffDays(start, end) + 1;
    const newEnd = addDays(start, Math.max(0, Math.ceil(window * NEW_SHARE[diff]) - 1));
    const base = { examId: exam.id, subjectId: exam.subjectId };

    const pending = exam.contents.filter((c) => !done.has(`${c.id}:estudo`));
    const studyDate = new Map();
    pending.forEach((c, i) => {
      const ideal = addDays(start, Math.floor((i * (diffDays(start, newEnd) + 1)) / pending.length));
      const d = slot(ideal, start, newEnd, exam.id, COST.estudo) ?? slot(ideal, start, end, exam.id, COST.estudo) ?? start;
      take(d, COST.estudo);
      studyDate.set(c.id, d);
      out.push({ ...base, id: `${c.id}:estudo`, contentId: c.id, kind: 'estudo', n: 0, date: d, done: false });
    });

    for (const c of exam.contents) {
      const studied = done.get(`${c.id}:estudo`);
      let last = studied ? studied.doneAt || studied.date : studyDate.get(c.id);
      for (let n = 1; n <= nRev; n++) {
        const id = `${c.id}:rev${n}`;
        const prev = done.get(id);
        if (prev) {
          last = prev.doneAt || prev.date;
          continue;
        }
        const gap = INTERVALS[n - 1] - (INTERVALS[n - 2] ?? 0);
        const ideal = maxDate(addDays(last, gap), today);
        const min = maxDate(addDays(last, 1), today);
        if (min > end || ideal > end) break;
        const d = slot(ideal, min, end, exam.id, COST.revisao);
        if (!d) break;
        take(d, COST.revisao);
        out.push({ ...base, id, contentId: c.id, kind: 'revisao', n, date: d, done: false });
        last = d;
      }
      // Revisão final (antes da folga), se a última revisão ficou longe da prova
      const finalId = `${c.id}:final`;
      if (done.has(finalId)) continue;
      if (diffDays(last, end) >= 3) {
        const d = slot(end, maxDate(addDays(last, 1), today), end, exam.id, COST.final, true);
        if (d) {
          take(d, COST.final);
          out.push({ ...base, id: finalId, contentId: c.id, kind: 'final', n: 99, date: d, done: false });
        }
      }
    }
  }

  for (const [d, l] of load) {
    if (l > cap + 1e-9) warnings.push({ type: 'sobrecarga', date: d, msg: `Dia ${d} ficou acima da sua capacidade diária.` });
  }

  out.sort((a, b) => a.date.localeCompare(b.date) || a.n - b.n);
  return { tasks: out, warnings };
}

export function folgaDays(exams, buffer) {
  const map = new Map();
  for (const ex of exams) {
    for (let i = 1; i <= buffer; i++) map.set(addDays(ex.date, -i), ex);
  }
  return map;
}

export function taskLabel(t) {
  if (t.kind === 'estudo') return 'Estudar';
  if (t.kind === 'final') return 'Revisão final';
  return `Revisão ${t.n}`;
}
