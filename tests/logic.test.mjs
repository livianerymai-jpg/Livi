import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan } from '../js/logic/planner.js';
import { computeGrades, parseFormula } from '../js/logic/grades.js';
import { attendanceSummary, classDates } from '../js/logic/attendance.js';
import { ankiAddURL, examRecommendation, slug } from '../js/logic/anki.js';
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

test('anki: URL e recomendação', () => {
  const url = ankiAddURL({ front: 'O que é GLUT?', back: 'Transportador', type: 'basic' },
    { basicType: 'Básico', basicFront: 'Frente', basicBack: 'Verso', deckPrefix: 'UFF' },
    { name: 'Citologia' }, { title: 'N2', date: '2026-10-21' });
  assert.ok(url.startsWith('anki://x-callback-url/addnote?'));
  assert.ok(url.includes('fldFrente=O%20que%20%C3%A9%20GLUT%3F'));
  assert.ok(url.includes('deck=UFF%3A%3ACitologia'));
  assert.ok(decodeURIComponent(url).includes('prova::citologia::n2'));
  assert.equal(slug('Saúde Coletiva'), 'saude_coletiva');
  assert.equal(examRecommendation({ cards: 40, exam: { date: addDays('2026-10-18', 12) }, today: '2026-10-18', bufferDays: 2 }).newPerDay, 4);
});
