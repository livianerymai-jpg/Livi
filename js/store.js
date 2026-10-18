// Estado do app salvo no aparelho (IndexedDB) + arquivos (certificados).
import { today, addDays } from './logic/dates.js';
import { buildPlan } from './logic/planner.js';

const DB = 'estudos-uff';
let dbp;
function open() {
  dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('kv');
      r.result.createObjectStore('files');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function idb(store, mode, fn) {
  const d = await open();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const q = fn(t.objectStore(store));
    t.oncomplete = () => res(q?.result);
    t.onerror = () => rej(t.error);
  });
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
  const saved = await idb('kv', 'readonly', (s) => s.get('state'));
  if (saved) state.data = merge(defaultState(), saved);
  return state.data;
}

let timer;
export function save({ silent } = {}) {
  state.data.updatedAt = Date.now();
  clearTimeout(timer);
  timer = setTimeout(() => idb('kv', 'readwrite', (s) => s.put(state.data, 'state')), 150);
  if (!silent) listeners.forEach((fn) => fn());
}
export async function replaceAll(data) {
  state.data = merge(defaultState(), data);
  await idb('kv', 'readwrite', (s) => s.put(state.data, 'state'));
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
