// Planejador de estudos com revisão espaçada.
//
// Base científica (resumo):
// - Efeito de espaçamento (Ebbinghaus; Cepeda et al., 2006/2008): revisar em intervalos
//   crescentes fixa melhor do que estudar tudo de uma vez.
// - Prática de recuperação (Roediger & Karpicke, 2006): revisar = tentar lembrar.
// - Sono consolida a memória: a 1ª revisão fica, no mínimo, no dia seguinte.
// - Folga antes da prova: os últimos dias ficam livres para chegar descansada.
//
// Tudo é ajustável: espaçamento por matéria, dias da semana em que a matéria pode cair,
// datas fixadas à mão, revisões removidas, revisões extras e conteúdos associados
// (estudados e revisados juntos).
import { addDays, diffDays, weekday, maxDate } from './dates.js';

// Espaçamento = dias entre uma sessão e a próxima (estudo → 1ª revisão → 2ª …)
export const SPACING_PRESETS = {
  curto: { label: 'Curto', gaps: [1, 1, 2, 3] },
  padrao: { label: 'Padrão', gaps: [1, 2, 4, 7] },
  longo: { label: 'Longo', gaps: [2, 3, 5, 10] },
};
export function defaultGaps(difficulty = 3) {
  if (difficulty <= 2) return [1, 3, 6];
  if (difficulty >= 4) return [1, 1, 2, 4, 7];
  return [1, 2, 4, 7];
}
export const gapsOf = (subject) => (subject?.gaps?.length ? subject.gaps : defaultGaps(subject?.difficulty ?? 3));
export const cumulative = (gaps) => gaps.reduce((acc, g) => [...acc, (acc.at(-1) ?? 0) + g], []);

// Fração da janela usada para ver conteúdo novo (o resto fica para revisar)
const NEW_SHARE = { 1: 0.75, 2: 0.7, 3: 0.6, 4: 0.55, 5: 0.5 };
export const COST = { estudo: 1, revisao: 0.5, final: 0.5, extra: 0.5 };

// Conteúdos associados viram um bloco só; o "líder" é a raiz da associação.
export function rootOf(exam, contentId) {
  const byId = new Map(exam.contents.map((c) => [c.id, c]));
  let id = contentId;
  for (let i = 0; i < 20; i++) {
    const c = byId.get(id);
    if (!c?.link || !byId.has(c.link) || c.link === id) return id;
    id = c.link;
  }
  return id;
}
export function units(exam) {
  const out = new Map();
  for (const c of exam.contents) {
    const root = rootOf(exam, c.id);
    if (!out.has(root)) out.set(root, { id: root, contentIds: [] });
    const u = out.get(root);
    if (c.id === root) u.contentIds.unshift(c.id);
    else u.contentIds.push(c.id);
  }
  return [...out.values()];
}

export function buildPlan({ subjects, exams, tasks = [], today, settings = {}, fresh = false }) {
  const buffer = settings.bufferDays ?? 2;
  const cap = settings.dailyCapacity ?? 4;
  const off = new Set(settings.offWeekdays ?? []);
  const subjById = new Map(subjects.map((s) => [s.id, s]));
  const examById = new Map(exams.map((e) => [e.id, e]));
  const prevById = new Map(tasks.map((t) => [t.id, t]));
  const done = new Map(tasks.filter((t) => t.done).map((t) => [t.id, t]));
  const out = [...done.values()].filter((t) => examById.has(t.examId));
  const warnings = [];

  const folga = new Map();
  for (const ex of exams) {
    for (let i = 0; i <= buffer; i++) {
      const d = addDays(ex.date, -i);
      if (!folga.has(d)) folga.set(d, new Set());
      folga.get(d).add(ex.id);
    }
  }

  const folgaEnd = (examId) => examById.get(examId).date;
  const load = new Map();
  for (const t of out) if (t.date >= today) load.set(t.date, (load.get(t.date) ?? 0) + (COST[t.kind] ?? 0.5));
  const take = (d, cost) => load.set(d, (load.get(d) ?? 0) + cost);

  function makeSlotter(examId, allowed, tight) {
    const capacity = (d) => {
      if (!allowed(d)) return 0;
      const f = folga.get(d);
      if (f?.has(examId) && !(tight && d < folgaEnd(examId))) return 0;
      return f ? cap / 2 : cap;
    };
    const fits = (d, cost) => (load.get(d) ?? 0) + cost <= capacity(d) + 1e-9;
    return function slot(ideal, min, max, cost, preferEarlier = false) {
      if (min > max) return null;
      if (ideal < min) ideal = min;
      if (ideal > max) ideal = max;
      const span = diffDays(min, max);
      for (let k = 0; k <= span; k++) {
        const cands = k === 0 ? [ideal] : preferEarlier ? [addDays(ideal, -k), addDays(ideal, k)] : [addDays(ideal, k), addDays(ideal, -k)];
        for (const d of cands) if (d >= min && d <= max && fits(d, cost)) return d;
      }
      // sem espaço: dia permitido menos carregado (plano apertado)
      let best = null;
      for (let k = 0; k <= span; k++) {
        const d = addDays(min, k);
        if (capacity(d) <= 0) continue;
        if (!best || (load.get(d) ?? 0) < (load.get(best) ?? 0)) best = d;
      }
      return best;
    };
  }

  const upcoming = exams
    .filter((e) => e.date > today && e.contents?.length)
    .sort((a, b) => a.date.localeCompare(b.date) || (subjById.get(b.subjectId)?.difficulty ?? 3) - (subjById.get(a.subjectId)?.difficulty ?? 3));

  for (const exam of upcoming) {
    const subj = subjById.get(exam.subjectId);
    const diff = Math.min(5, Math.max(1, subj?.difficulty ?? 3));
    const gaps = gapsOf(subj);
    const removed = new Set(exam.removed || []);
    const start = today;
    let end = addDays(exam.date, -(buffer + 1));
    const tight = end < start;
    if (tight) {
      end = maxDate(start, addDays(exam.date, -1));
      warnings.push({ examId: exam.id, type: 'apertado', msg: 'Pouco tempo até a prova: a folga foi reduzida.' });
    }
    const base = (d) => !off.has(weekday(d));
    let allowed = (d) => base(d) && (!subj?.studyWeekdays?.length || subj.studyWeekdays.includes(weekday(d)));
    let anyAllowed = false;
    for (let d = start; d <= end; d = addDays(d, 1)) if (allowed(d)) { anyAllowed = true; break; }
    if (!anyAllowed) {
      allowed = base;
      if (subj?.studyWeekdays?.length) warnings.push({ examId: exam.id, type: 'semDia', msg: 'Nenhum dia de estudo desta matéria cabe antes da prova; usei outros dias.' });
    }
    const slot = makeSlotter(exam.id, allowed, tight);
    const window = diffDays(start, end) + 1;
    const newEnd = addDays(start, Math.max(0, Math.ceil(window * NEW_SHARE[diff]) - 1));
    const meta = { examId: exam.id, subjectId: exam.subjectId };
    const isPinned = (p) => p && !p.done && p.pinned && p.date >= today;
    const prevOk = (p, min, max) => !fresh && p && !p.done && p.date >= min && p.date <= max;
    const push = (t, cost) => {
      take(t.date, cost);
      out.push({ ...meta, done: false, ...t });
    };

    const us = units(exam);
    const studyDate = new Map();
    const pending = us.filter((u) => !done.has(`${u.id}:estudo`) && !removed.has(`${u.id}:estudo`));
    pending.forEach((u, i) => {
      const id = `${u.id}:estudo`;
      const prev = prevById.get(id);
      let date;
      if (isPinned(prev)) date = prev.date;
      else {
        const spread = addDays(start, Math.floor((i * (diffDays(start, newEnd) + 1)) / pending.length));
        const ideal = prevOk(prev, start, end) ? prev.date : spread;
        date = slot(ideal, start, prevOk(prev, start, end) ? end : newEnd, COST.estudo) ?? slot(ideal, start, end, COST.estudo);
      }
      if (!date) return;
      push({ id, contentId: u.id, kind: 'estudo', n: 0, date, pinned: isPinned(prev) }, COST.estudo);
      studyDate.set(u.id, date);
    });

    for (const u of us) {
      const studied = done.get(`${u.id}:estudo`);
      let last = studied ? studied.doneAt || studied.date : studyDate.get(u.id) ?? addDays(today, -1);
      for (let n = 1; n <= gaps.length; n++) {
        const id = `${u.id}:rev${n}`;
        const prevDone = done.get(id);
        if (prevDone) { last = prevDone.doneAt || prevDone.date; continue; }
        if (removed.has(id)) continue;
        const prev = prevById.get(id);
        if (isPinned(prev)) {
          push({ id, contentId: u.id, kind: 'revisao', n, date: prev.date, pinned: true }, COST.revisao);
          last = prev.date;
          continue;
        }
        const min = maxDate(addDays(last, 1), today);
        let ideal = maxDate(addDays(last, gaps[n - 1]), today);
        if (prevOk(prev, min, end)) ideal = prev.date;
        if (min > end || ideal > end) break;
        const d = slot(ideal, min, end, COST.revisao);
        if (!d) break;
        push({ id, contentId: u.id, kind: 'revisao', n, date: d }, COST.revisao);
        last = d;
      }
      // revisão final logo antes da folga, se a última sessão ficou longe da prova
      const finalId = `${u.id}:final`;
      if (done.has(finalId) || removed.has(finalId)) continue;
      const prev = prevById.get(finalId);
      if (isPinned(prev)) {
        push({ id: finalId, contentId: u.id, kind: 'final', n: 99, date: prev.date, pinned: true }, COST.final);
        continue;
      }
      if (diffDays(last, end) >= 3) {
        const min = maxDate(addDays(last, 1), today);
        const d = slot(prevOk(prev, min, end) ? prev.date : end, min, end, COST.final, true);
        if (d) push({ id: finalId, contentId: u.id, kind: 'final', n: 99, date: d }, COST.final);
      }
    }
  }

  // revisões extras (criadas à mão): mantém; se ficou para trás, leva para o próximo dia possível
  for (const t of tasks) {
    if (t.kind !== 'extra' || t.done || !examById.has(t.examId)) continue;
    let date = t.date;
    if (date < today && settings.autoReschedule !== false) {
      const subj = subjById.get(t.subjectId);
      const ok = (d) => !off.has(weekday(d)) && (!subj?.studyWeekdays?.length || subj.studyWeekdays.includes(weekday(d)));
      date = today;
      for (let i = 0; i < 14 && !ok(date); i++) date = addDays(date, 1);
    }
    take(date, COST.extra);
    out.push({ ...t, date });
  }

  for (const [d, l] of load) {
    if (d >= today && l > cap + 1e-9) warnings.push({ type: 'sobrecarga', date: d, msg: `Dia ${d} ficou acima da sua capacidade diária.` });
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || (a.n ?? 50) - (b.n ?? 50));
  return { tasks: out, warnings };
}

// próximo dia em que a matéria pode ser estudada, a partir de 'from' (inclusive)
export function nextAllowedDay(from, subject, settings = {}) {
  const off = new Set(settings.offWeekdays ?? []);
  let d = from;
  for (let i = 0; i < 21; i++) {
    const w = weekday(d);
    if (!off.has(w) && (!subject?.studyWeekdays?.length || subject.studyWeekdays.includes(w))) return d;
    d = addDays(d, 1);
  }
  return from;
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
  if (t.kind === 'extra') return 'Revisão extra';
  return `Revisão ${t.n}`;
}
