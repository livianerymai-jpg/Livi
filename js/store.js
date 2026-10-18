// Estado do app salvo no aparelho (IndexedDB) + arquivos (certificados).
import { today, addDays } from './logic/dates.js';
import { buildPlan, rootOf, nextAllowedDay } from './logic/planner.js';
import { codeFor } from './logic/grades.js';

import { V } from './variant.js';

const DB = V.storage;
const LS_KEY = V.storage + '-state';
let dbp;
function open() {
  dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('kv');
      r.result.createObjectStore('files');
    };
    r.onsuccess = () => {
      const db = r.result;
      // O iOS às vezes derruba a conexão quando o app vai para o fundo: abre outra na próxima vez
      db.onclose = () => (dbp = null);
      db.onversionchange = () => { db.close(); dbp = null; };
      res(db);
    };
    r.onerror = () => { dbp = null; rej(r.error); };
  });
  return dbp;
}
async function idb(store, mode, fn, retry = true) {
  try {
    const d = await open();
    return await new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const q = fn(t.objectStore(store));
      t.oncomplete = () => res(q?.result);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('gravação cancelada'));
    });
  } catch (e) {
    dbp = null; // conexão perdida (bug conhecido do Safari): reconecta e tenta de novo
    if (retry) return idb(store, mode, fn, false);
    throw e;
  }
}
export const files = {
  get: (id) => idb('files', 'readonly', (s) => s.get(id)),
  put: (id, blob) => idb('files', 'readwrite', (s) => s.put(blob, id)),
  del: (id) => idb('files', 'readwrite', (s) => s.delete(id)),
};

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, 12);

export const COLORS = ['#7a2e3a', '#34496b', '#4e6a4f', '#a8743a', '#6b4a7a', '#2f6b6b', '#b0574a', '#5a5f3a'];

export function defaultState() {
  const t = today();
  return {
    version: 1,
    settings: {
      name: '',
      semesterStart: t,
      semesterEnd: addDays(t, 120),
      bufferDays: 2,
      dailyCapacity: 4,
      offWeekdays: [],
      passing: 6,
      requiredHours: 200,
      autoReschedule: true,
      hourCategories: ['Eventos e congressos', 'Ligas acadêmicas', 'Pesquisa e extensão', 'Monitoria', 'Outros'],
      google: { clientId: '', calendarId: 'primary', calendarName: '', mode: 'popup', autoBackup: true },
    },
    subjects: [],
    exams: [],
    tasks: [],
    events: [],
    cards: [],
    lastSync: null,
    lastBackup: null,
    updatedAt: Date.now(),
  };
}

export const state = { data: defaultState() };
const listeners = new Set();
export const onSave = (fn) => listeners.add(fn);

function merge(base, saved) {
  const out = { ...base, ...saved };
  out.settings = { ...base.settings, ...(saved.settings || {}) };
  out.settings.google = { ...base.settings.google, ...(saved.settings?.google || {}) };
  migrate(out);
  return out;
}

export async function load() {
  // Duas cópias (IndexedDB + localStorage): usa a mais recente
  let fromDb = null;
  let fromLs = null;
  try { fromDb = await idb('kv', 'readonly', (s) => s.get('state')); } catch (e) { console.error(e); }
  try { fromLs = JSON.parse(localStorage.getItem(LS_KEY)); } catch {}
  const saved = [fromDb, fromLs].filter(Boolean).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  if (saved) state.data = merge(defaultState(), saved);
  return state.data;
}

let timer = null;
const errorListeners = new Set();
export const onSaveError = (fn) => errorListeners.add(fn);

function writeNow() {
  clearTimeout(timer);
  timer = null;
  const data = state.data;
  let lsOk = false;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
    lsOk = true;
  } catch (e) { console.error(e); }
  return idb('kv', 'readwrite', (s) => s.put(data, 'state')).catch((e) => {
    console.error(e);
    if (!lsOk) errorListeners.forEach((fn) => fn(e));
  });
}
export function save({ silent } = {}) {
  state.data.updatedAt = Date.now();
  clearTimeout(timer);
  timer = setTimeout(writeNow, 80);
  if (!silent) listeners.forEach((fn) => fn());
}
// grava na hora (ao sair do app)
export function flush() {
  if (timer) return writeNow();
}
export async function replaceAll(data) {
  state.data = merge(defaultState(), data);
  state.data.updatedAt = Date.now();
  await writeNow();
}

// Atualiza dados de versões antigas do app
function migrate(d) {
  for (const s of d.subjects) {
    s.studyWeekdays ??= [];
    s.gaps ??= null;
    s.grading.modules ??= [];
    s.grading.scale ??= 10;
    for (const c of s.grading.components) {
      // espaços "Prova 1/Prova 2" criados automaticamente e ainda vazios podem ser reaproveitados pelas provas
      if (c.auto === undefined) c.auto = !c.examId && /^P\d+$/.test(c.code) && /^Prova \d+$/.test(c.name) && (c.grade == null || c.grade === '');
    }
  }
  for (const e of d.exams) {
    e.kind ??= 'Prova';
    e.removed ??= [];
  }
  for (const s of d.subjects) syncExamComponents(s, d);
}

// ---------- provas ⇄ notas: cada prova/trabalho cadastrado vira um espaço de nota
export function allComponents(g) {
  return g.mode === 'modular' ? g.modules.flatMap((m) => m.components) : g.components;
}
export function syncExamComponents(s, d = D()) {
  const g = s.grading;
  const exams = d.exams.filter((e) => e.subjectId === s.id);
  const ids = new Set(exams.map((e) => e.id));
  const used = new Set(allComponents(g).map((c) => c.code));
  for (const e of exams) {
    let c = allComponents(g).find((x) => x.examId === e.id);
    if (!c) {
      let list = g.components;
      if (g.mode === 'modular') {
        if (!g.modules.length) g.modules.push({ id: uid(), name: 'Módulo 1', weight: 1, components: [] });
        list = (g.modules.find((m) => m.id === e.moduleId) || g.modules.at(-1)).components;
      }
      c = list.find((x) => x.auto && !x.examId);
      if (c) c.examId = e.id;
      else {
        c = { id: uid(), code: codeFor(e.title, used), name: e.title, weight: 1, max: g.mode === 'modular' ? Number(e.points) || 10 : 10, grade: null, examId: e.id };
        used.add(c.code);
        list.push(c);
      }
    }
    c.auto = false;
    c.name = e.title;
    if (e.weight !== '' && e.weight != null && Number.isFinite(Number(String(e.weight).replace(',', '.')))) c.weight = Number(String(e.weight).replace(',', '.'));
    if (g.mode === 'modular' && e.points) c.max = Number(e.points) || c.max;
    // prova mudou de módulo
    if (g.mode === 'modular' && e.moduleId) {
      const target = g.modules.find((m) => m.id === e.moduleId);
      if (target && !target.components.includes(c)) {
        for (const m of g.modules) m.components = m.components.filter((x) => x !== c);
        target.components.push(c);
      }
    }
  }
  // provas apagadas: remove o espaço vazio; se já tinha nota, mantém sem vínculo
  const keep = (c) => !c.examId || ids.has(c.examId) || (c.grade != null && c.grade !== '');
  for (const c of allComponents(g)) if (c.examId && !ids.has(c.examId) && c.grade != null && c.grade !== '') delete c.examId;
  if (g.mode === 'modular') for (const m of g.modules) m.components = m.components.filter(keep);
  else g.components = g.components.filter(keep);
}

// atalhos
export const D = () => state.data;
export const subject = (id) => D().subjects.find((s) => s.id === id);
export const exam = (id) => D().exams.find((e) => e.id === id);
export const subjectExams = (id) => D().exams.filter((e) => e.subjectId === id).sort((a, b) => a.date.localeCompare(b.date));
// título de uma tarefa: o conteúdo (ou os conteúdos associados) do bloco
export function contentTitle(t) {
  const e = exam(t.examId);
  if (!e) return '';
  const titles = e.contents.filter((c) => rootOf(e, c.id) === t.contentId).map((c) => c.title);
  return titles.join(' + ') || '(conteúdo removido)';
}

export function replan({ fresh = false } = {}) {
  const d = D();
  for (const s of d.subjects) syncExamComponents(s, d);
  const { tasks, warnings } = buildPlan({ subjects: d.subjects, exams: d.exams, tasks: d.tasks, today: today(), settings: d.settings, fresh });
  d.tasks = tasks;
  d.planWarnings = warnings;
  d.lastPlanDay = today();
  save();
  return warnings;
}

// ---------- ações nas tarefas do plano
const task = (id) => D().tasks.find((t) => t.id === id);
export function setTaskDone(id, done) {
  const t = task(id);
  if (!t) return;
  t.done = done;
  t.doneAt = done ? today() : null;
  // as próximas revisões se ajustam à data real em que você fez
  replan();
}
export function moveTask(id, date) {
  const t = task(id);
  if (!t) return;
  Object.assign(t, { date, pinned: true, done: false, doneAt: null });
  replan();
}
export function postponeTask(id) {
  const t = task(id);
  const next = nextAllowedDay(addDays(t.date < today() ? today() : t.date, 1), subject(t.subjectId), D().settings);
  moveTask(id, next);
  return next;
}
export function removeTask(id) {
  const t = task(id);
  if (!t) return;
  const e = exam(t.examId);
  if (t.kind === 'extra') D().tasks = D().tasks.filter((x) => x !== t);
  else if (e && !e.removed.includes(id)) e.removed.push(id);
  D().tasks = D().tasks.filter((x) => x.id !== id);
  replan();
}
export function addExtraReview(examId, unitId, date) {
  const e = exam(examId);
  D().tasks.push({ id: `${unitId}:extra:${uid()}`, examId, subjectId: e.subjectId, contentId: unitId, kind: 'extra', n: 50, date, pinned: true, done: false });
  replan();
}
// devolve o bloco ao planejamento automático (desfaz remoções e datas fixadas)
export function restoreUnit(examId, unitId) {
  const e = exam(examId);
  e.removed = e.removed.filter((id) => !id.startsWith(unitId + ':'));
  for (const t of D().tasks) if (t.contentId === unitId && !t.done) t.pinned = false;
  D().tasks = D().tasks.filter((t) => !(t.contentId === unitId && !t.done && t.kind !== 'extra'));
  replan();
}
export function restoreRemoved(examId, id) {
  const e = exam(examId);
  e.removed = e.removed.filter((x) => x !== id);
  replan();
}

// ---------- conteúdos
export function linkContent(examId, contentId, targetId) {
  const e = exam(examId);
  const c = e.contents.find((x) => x.id === contentId);
  const root = targetId ? rootOf(e, targetId) : null;
  if (root === contentId) return;
  // quem estava associado a este conteúdo passa a seguir o novo líder
  for (const x of e.contents) if (x.link === contentId) x.link = root || null;
  c.link = root;
  // tarefas antigas (não feitas) do conteúdo saem; o bloco do líder passa a incluí-lo
  D().tasks = D().tasks.filter((t) => !(t.contentId === contentId && !t.done));
  replan();
}
export function moveContent(fromExamId, contentId, toExamId) {
  const a = exam(fromExamId);
  const b = exam(toExamId);
  const c = a.contents.find((x) => x.id === contentId);
  for (const x of a.contents) if (x.link === contentId) x.link = null;
  a.contents = a.contents.filter((x) => x !== c);
  c.link = null;
  b.contents.push(c);
  a.dirty = b.dirty = true;
  D().tasks = D().tasks.filter((t) => !(t.contentId === contentId && !t.done)).map((t) => (t.contentId === contentId ? { ...t, examId: b.id } : t));
  replan();
}
export function deleteContent(examId, contentId) {
  const e = exam(examId);
  for (const x of e.contents) if (x.link === contentId) x.link = null;
  e.contents = e.contents.filter((x) => x.id !== contentId);
  e.removed = e.removed.filter((id) => !id.startsWith(contentId + ':'));
  e.dirty = true;
  D().tasks = D().tasks.filter((t) => t.contentId !== contentId);
  replan();
}

export function newSubject(name) {
  const d = D();
  const s = {
    id: uid(),
    name,
    professor: '',
    color: COLORS[d.subjects.length % COLORS.length],
    difficulty: 3,
    studyWeekdays: [],
    gaps: null,
    grading: { mode: 'ponderada', passing: d.settings.passing, formula: '', scale: 10, components: [], modules: [] },
    attendance: { totalHours: 60, minPct: 75, start: d.settings.semesterStart, end: d.settings.semesterEnd, schedule: [], records: {} },
  };
  d.subjects.push(s);
  return s;
}
