import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, units } from '../js/logic/planner.js';
import { computeGrades, parseFormula, computeModular, codeFor } from '../js/logic/grades.js';
import { attendanceSummary, classDates } from '../js/logic/attendance.js';
import { addDays, diffDays } from '../js/logic/dates.js';

const subjects = [
  { id: 'cito', name: 'Citologia', difficulty: 5 },
  { id: 'histo', name: 'Histologia', difficulty: 2 },
];
const mk = (n, p) => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, title: `${p} ${i}` }));
const exams = [
  { id: 'e1', subjectId: 'cito', title: 'N2', date: '2026-11-10', contents: mk(6, 'c') },
  { id: 'e2', subjectId: 'histo', title: 'N2', date: '2026-11-13', contents: mk(5, 'h') },
];
const settings = { bufferDays: 2, dailyCapacity: 4, offWeekdays: [] };

test('plano respeita a folga antes da prova e a ordem estudo → revisões', () => {
  const { tasks } = buildPlan({ subjects, exams, today: '2026-10-18', settings });
  for (const t of tasks) {
    const exam = exams.find((e) => e.id === t.examId);
    assert.ok(diffDays(t.date, exam.date) > settings.bufferDays, `${t.id} em ${t.date} invade a folga de ${exam.date}`);
    assert.ok(t.date >= '2026-10-18');
  }
  for (const c of exams[0].contents) {
    const mine = tasks.filter((t) => t.contentId === c.id);
    const study = mine.find((t) => t.kind === 'estudo');
    assert.ok(study);
    for (const r of mine.filter((t) => t.kind !== 'estudo')) assert.ok(r.date > study.date);
    const dates = mine.map((t) => t.date);
    assert.deepEqual([...dates].sort(), dates, 'revisões em ordem');
  }
});

test('matéria difícil recebe mais revisões', () => {
  const { tasks } = buildPlan({ subjects, exams, today: '2026-10-18', settings });
  const revs = (id) => tasks.filter((t) => t.contentId === id && t.kind !== 'estudo').length;
  assert.ok(revs('c0') > revs('h0'), `${revs('c0')} vs ${revs('h0')}`);
});

test('tarefas feitas são mantidas e as revisões seguem a data real', () => {
  const first = buildPlan({ subjects, exams, today: '2026-10-18', settings }).tasks;
  const study = first.find((t) => t.id === 'c0:estudo');
  const doneTask = { ...study, done: true, doneAt: '2026-10-20' };
  const { tasks } = buildPlan({ subjects, exams, tasks: [doneTask], today: '2026-10-21', settings });
  assert.ok(tasks.find((t) => t.id === 'c0:estudo').done);
  const r1 = tasks.find((t) => t.id === 'c0:rev1');
  assert.ok(r1.date >= '2026-10-21');
});

test('dias sem estudo ficam vazios', () => {
  const { tasks } = buildPlan({ subjects, exams, today: '2026-10-18', settings: { ...settings, offWeekdays: [0] } });
  for (const t of tasks) assert.notEqual(new Date(t.date + 'T12:00').getDay(), 0);
});

test('prova muito perto ainda gera plano', () => {
  const { tasks, warnings } = buildPlan({ subjects, exams: [{ ...exams[0], date: '2026-10-20' }], today: '2026-10-18', settings });
  assert.ok(tasks.length > 0);
  assert.ok(warnings.some((w) => w.type === 'apertado'));
});

test('notas: média ponderada e quanto falta', () => {
  const r = computeGrades({ mode: 'ponderada', passing: 6, components: [
    { code: 'P1', weight: 1, grade: 9 }, { code: 'P2', weight: 1, grade: 8.5 }, { code: 'P3', weight: 1, grade: null },
  ] });
  assert.equal(r.needed, 0.5);
  assert.equal(r.status, 'tranquilo');
  assert.equal(r.current, 8.75);
});

test('notas: fórmula própria com vírgula e max', () => {
  const g = { mode: 'formula', passing: 7, formula: '0,4*max(P1; P2) + 0,6*T', components: [
    { code: 'P1', grade: 5 }, { code: 'P2', grade: 6 }, { code: 'T', grade: null },
  ] };
  const r = computeGrades(g);
  assert.equal(r.needed, 7.7);
  assert.throws(() => parseFormula('(P1 + '));
  assert.ok(computeGrades({ ...g, formula: 'P1 + X' }).error);
});

test('notas: aprovada e impossível', () => {
  assert.equal(computeGrades({ mode: 'ponderada', passing: 6, components: [{ code: 'P1', weight: 1, grade: 7 }] }).status, 'aprovada');
  assert.equal(computeGrades({ mode: 'ponderada', passing: 6, components: [{ code: 'P1', weight: 3, grade: 0 }, { code: 'P2', weight: 1, grade: null }] }).status, 'impossivel');
});

test('presença: limite de 25%', () => {
  const att = { start: '2026-08-03', end: '2026-08-30', schedule: [{ weekday: 1, hours: 2 }, { weekday: 3, hours: 2 }], totalHours: 60, minPct: 75,
    records: { '2026-08-03': 'F', '2026-08-05': 'P', '2026-08-10': 'F' } };
  assert.equal(classDates(att).length, 8);
  const s = attendanceSummary(att, '2026-08-12');
  assert.equal(s.limit, 15);
  assert.equal(s.absent, 4);
  assert.equal(s.remaining, 11);
  assert.equal(s.canMiss, 5);
});

const wd = (d) => new Date(d + 'T12:00').getDay();
const base = () => ({ subjects: structuredClone(subjects), exams: structuredClone(exams), today: '2026-10-18', settings });

test('matéria com dia fixo só cai naquele dia da semana', () => {
  const b = base();
  b.subjects[1].studyWeekdays = [2]; // terça
  b.exams[1].date = '2026-11-30';
  const { tasks } = buildPlan(b);
  const mine = tasks.filter((t) => t.subjectId === 'histo');
  assert.ok(mine.length > 0);
  for (const t of mine) assert.equal(wd(t.date), 2, `${t.id} em ${t.date}`);
});

test('espaçamento personalizado é respeitado como mínimo entre sessões', () => {
  const b = base();
  b.subjects[0].gaps = [2, 4];
  b.exams[0].date = '2026-12-15';
  const { tasks } = buildPlan(b);
  const c0 = tasks.filter((t) => t.contentId === 'c0').sort((x, y) => x.date.localeCompare(y.date));
  const revs = c0.filter((t) => t.kind === 'revisao');
  assert.equal(revs.length, 2);
  assert.ok(diffDays(c0[0].date, revs[0].date) >= 2);
  assert.ok(diffDays(revs[0].date, revs[1].date) >= 4);
});

test('data fixada à mão, revisão removida e revisão extra sobrevivem ao replanejamento', () => {
  const b = base();
  const first = buildPlan(b).tasks;
  const r1 = first.find((t) => t.id === 'c1:rev1');
  const moved = { ...r1, date: '2026-11-05', pinned: true };
  b.exams[0].removed = ['c2:rev1'];
  const extra = { id: 'c3:extra:x', examId: 'e1', subjectId: 'cito', contentId: 'c3', kind: 'extra', n: 50, date: '2026-10-30', pinned: true, done: false };
  const { tasks } = buildPlan({ ...b, tasks: [...first.filter((t) => t.id !== 'c1:rev1'), moved, extra] });
  assert.equal(tasks.find((t) => t.id === 'c1:rev1').date, '2026-11-05');
  assert.ok(!tasks.some((t) => t.id === 'c2:rev1'));
  assert.equal(tasks.find((t) => t.id === 'c3:extra:x').date, '2026-10-30');
  for (const t of tasks.filter((x) => x.contentId === 'c1' && x.n > 1 && x.kind === 'revisao')) assert.ok(t.date > '2026-11-05');
});

test('replanejar no dia seguinte não bagunça o que já estava marcado', () => {
  const b = base();
  const day1 = buildPlan(b).tasks;
  const done = day1.filter((t) => t.date === '2026-10-18').map((t) => ({ ...t, done: true, doneAt: '2026-10-18' }));
  const rest = day1.filter((t) => t.date !== '2026-10-18');
  const day2 = buildPlan({ ...b, today: '2026-10-19', tasks: [...done, ...rest] }).tasks;
  const same = rest.filter((t) => day2.find((x) => x.id === t.id)?.date === t.date).length;
  assert.ok(same / rest.length > 0.8, `só ${same}/${rest.length} ficaram na mesma data`);
});

test('tarefa atrasada é reagendada para hoje ou depois', () => {
  const b = base();
  const day1 = buildPlan(b).tasks;
  const day3 = buildPlan({ ...b, today: '2026-10-20', tasks: day1 }).tasks;
  assert.ok(day3.every((t) => t.done || t.date >= '2026-10-20'));
});

test('conteúdos associados são estudados e revisados juntos', () => {
  const b = base();
  b.exams[0].contents[1].link = 'c0';
  b.exams[0].contents[2].link = 'c1'; // cadeia: c2 → c1 → c0
  assert.deepEqual(units(b.exams[0])[0].contentIds, ['c0', 'c1', 'c2']);
  const { tasks } = buildPlan(b);
  assert.ok(!tasks.some((t) => t.contentId === 'c1' || t.contentId === 'c2'));
  assert.ok(tasks.some((t) => t.contentId === 'c0' && t.kind === 'estudo'));
});

test('sistema modular: pontos por módulo e mínimo por módulo', () => {
  const g = { mode: 'modular', scale: 100, passing: 60, minModule: 60, modules: [
    { id: 'a', name: 'M1', weight: 1, components: [{ id: 1, name: 'Cog', max: 40, grade: 30 }, { id: 2, name: 'Tut', max: 30, grade: 25 }, { id: 3, name: 'Hab', max: 30, grade: null }] },
    { id: 'b', name: 'M2', weight: 1, components: [{ id: 4, name: 'Cog', max: 40, grade: null }, { id: 5, name: 'Tut', max: 30, grade: null }] },
  ] };
  const r = computeGrades(g);
  assert.equal(r.fraction, 0.6);
  assert.deepEqual(r.neededByComp.map((x) => x.pts), [18, 24, 18]);
  g.modules[1].components.forEach((c) => (c.grade = c.max));
  g.modules[0].components[2].grade = 10; // M1 = 65
  const r2 = computeModular(g);
  assert.equal(r2.status, 'aprovada');
  assert.equal(codeFor('Trabalho de anatomia'), 'TDA');
});
