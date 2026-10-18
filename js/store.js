// Estado do app salvo no aparelho (IndexedDB) + arquivos (certificados).
import { today, addDays } from './logic/dates.js';
import { buildPlan } from './logic/planner.js';

const DB = 'estudos-uff';
const LS_KEY = 'estudos-uff-state';
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
      hourCategories: ['Eventos e congressos', 'Ligas acadêmicas', 'Pesquisa e extensão', 'Monitoria', 'Outros'],
      google: { clientId: '', calendarId: 'primary', calendarName: '', mode: 'popup', autoBackup: true },
      anki: { profile: '', deckPrefix: 'UFF', basicType: 'Básico', basicFront: 'Frente', basicBack: 'Verso', clozeType: 'Omissão de Palavras', clozeText: 'Texto', clozeExtra: 'Verso Extra' },
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
  out.settings.anki = { ...base.settings.anki, ...(saved.settings?.anki || {}) };
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

// atalhos
export const D = () => state.data;
export const subject = (id) => D().subjects.find((s) => s.id === id);
export const exam = (id) => D().exams.find((e) => e.id === id);
export const subjectExams = (id) => D().exams.filter((e) => e.subjectId === id).sort((a, b) => a.date.localeCompare(b.date));
export function contentTitle(t) {
  const e = exam(t.examId);
  return e?.contents.find((c) => c.id === t.contentId)?.title ?? '';
}

export function replan() {
  const d = D();
  const { tasks, warnings } = buildPlan({ subjects: d.subjects, exams: d.exams, tasks: d.tasks, today: today(), settings: d.settings });
  d.tasks = tasks;
  d.planWarnings = warnings;
  save();
  return warnings;
}

export function newSubject(name) {
  const d = D();
  const s = {
    id: uid(),
    name,
    professor: '',
    color: COLORS[d.subjects.length % COLORS.length],
    difficulty: 3,
    grading: { mode: 'ponderada', passing: d.settings.passing, formula: '', components: [
      { id: uid(), code: 'P1', name: 'Prova 1', weight: 1, max: 10, grade: null },
      { id: uid(), code: 'P2', name: 'Prova 2', weight: 1, max: 10, grade: null },
    ] },
    attendance: { totalHours: 60, minPct: 75, start: d.settings.semesterStart, end: d.settings.semesterEnd, schedule: [], records: {} },
  };
  d.subjects.push(s);
  return s;
}
