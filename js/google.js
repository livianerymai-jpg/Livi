// Google Agenda (sincronização nos dois sentidos) + backup no Google Drive.
// Usa OAuth no próprio aparelho: nenhum servidor intermediário vê seus dados.
import { D, save, exam as getExam, subject as getSubject, uid } from './store.js';
import { addDays, iso, pad, today } from './logic/dates.js';
import { V } from './variant.js';

const SCOPES = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive.appdata';
const API = 'https://www.googleapis.com/calendar/v3';
const TOKEN_KEY = V.token;
const BACKUP_NAME = V.storage + '-backup.json';

let token = null;
let expiresAt = 0;
try {
  const t = JSON.parse(localStorage.getItem(TOKEN_KEY));
  if (t && t.expiresAt > Date.now()) ({ token, expiresAt } = t);
} catch {}

function setToken(t, seconds) {
  token = t;
  expiresAt = Date.now() + (Number(seconds) || 3600) * 1000;
  try { localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, expiresAt })); } catch {}
}
export const isConnected = () => !!token && Date.now() < expiresAt - 30000;
export const wasConnected = () => !!D().settings.google.connectedOnce;

export function disconnect() {
  token = null;
  expiresAt = 0;
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
  D().settings.google.connectedOnce = false;
  save();
}

// Volta do login no modo "redirecionamento": o token chega no #hash da URL
export function handleRedirect() {
  if (!location.hash.includes('access_token=')) return false;
  const p = new URLSearchParams(location.hash.slice(1));
  setToken(p.get('access_token'), p.get('expires_in'));
  D().settings.google.connectedOnce = true;
  save({ silent: true });
  history.replaceState(null, '', location.pathname + '#ajustes');
  return true;
}

let gisPromise;
function loadGIS() {
  gisPromise ??= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = res;
    s.onerror = () => rej(new Error('Sem internet para falar com o Google.'));
    document.head.append(s);
  });
  return gisPromise;
}

export async function connect() {
  const g = D().settings.google;
  if (!g.clientId) throw new Error('Cole o "ID do cliente" do Google em Ajustes primeiro.');
  if (g.mode === 'redirect') {
    const p = new URLSearchParams({
      client_id: g.clientId,
      redirect_uri: location.origin + location.pathname,
      response_type: 'token',
      scope: SCOPES,
      include_granted_scopes: 'true',
      prompt: g.connectedOnce ? '' : 'consent',
    });
    location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + p;
    return new Promise(() => {});
  }
  await loadGIS();
  await new Promise((res, rej) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: g.clientId,
      scope: SCOPES,
      callback: (r) => {
        if (r.error) return rej(new Error(r.error_description || r.error));
        setToken(r.access_token, r.expires_in);
        res();
      },
      error_callback: (e) => rej(new Error(e?.message || 'Login cancelado.')),
    });
    client.requestAccessToken({ prompt: g.connectedOnce ? '' : 'consent' });
  });
  g.connectedOnce = true;
  save({ silent: true });
}

async function api(method, url, body, raw) {
  if (!isConnected()) throw Object.assign(new Error('Conecte o Google novamente.'), { needAuth: true });
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body && !raw ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? (raw ? body : JSON.stringify(body)) : undefined,
  });
  if (res.status === 401) {
    token = null;
    throw Object.assign(new Error('A conexão com o Google expirou. Toque em "Conectar".'), { needAuth: true });
  }
  if (res.status === 204 || res.status === 410) return null;
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).error?.message || msg; } catch {}
    throw new Error(`Google: ${msg}`);
  }
  return method === 'GET' && url.includes('alt=media') ? res.text() : res.json();
}

// ---------- agendas
export async function listCalendars() {
  const r = await api('GET', `${API}/users/me/calendarList?minAccessRole=writer`);
  return r.items.map((c) => ({ id: c.id, name: c.summaryOverride || c.summary, primary: !!c.primary, color: c.backgroundColor }));
}
export async function createCalendar(name) {
  return api('POST', `${API}/calendars`, { summary: name, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
}

// ---------- conversão evento local <-> Google
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
function plusHour(t) {
  const [h, m] = t.split(':').map(Number);
  return `${pad(Math.min(23, h + 1))}:${pad(m)}`;
}
function timesToGoogle({ date, endDate, startTime, endTime }) {
  if (!startTime) return { start: { date }, end: { date: addDays(endDate || date, 1) } };
  return {
    start: { dateTime: `${date}T${startTime}:00`, timeZone: tz() },
    end: { dateTime: `${endDate || date}T${endTime || plusHour(startTime)}:00`, timeZone: tz() },
  };
}
function timesFromGoogle(item) {
  if (item.start?.date) return { date: item.start.date, endDate: addDays(item.end.date, -1), startTime: '', endTime: '' };
  const s = new Date(item.start.dateTime);
  const e = new Date(item.end?.dateTime || item.start.dateTime);
  return { date: iso(s), endDate: iso(e), startTime: `${pad(s.getHours())}:${pad(s.getMinutes())}`, endTime: `${pad(e.getHours())}:${pad(e.getMinutes())}` };
}

function eventBody(ev) {
  return {
    summary: ev.title,
    location: ev.location || '',
    description: ev.notes || '',
    ...timesToGoogle(ev),
    extendedProperties: { private: { liviType: 'evento', liviHours: String(ev.hours || ''), liviCat: ev.category || '', liviCert: ev.cert || '', liviStatus: ev.status || '' } },
  };
}
function examBody(ex) {
  const s = getSubject(ex.subjectId);
  return {
    summary: `📝 ${ex.kind || 'Prova'}: ${s?.name || ''} – ${ex.title}`,
    description: ex.contents?.length ? 'Conteúdos:\n' + ex.contents.map((c) => '• ' + c.title).join('\n') : '',
    ...timesToGoogle({ date: ex.date, startTime: ex.time || '' }),
    extendedProperties: { private: { liviType: 'prova', liviExamId: ex.id } },
  };
}

// ---------- sincronização
let syncing = null;
export function sync() {
  syncing ??= doSync().finally(() => (syncing = null));
  return syncing;
}

async function doSync() {
  const d = D();
  const cal = encodeURIComponent(d.settings.google.calendarId || 'primary');
  const base = `${API}/calendars/${cal}/events`;

  // 1) envia o que mudou aqui
  for (const ev of [...d.events]) {
    if (!ev.dirty) continue;
    if (ev.deleted) {
      if (ev.gcalId) await api('DELETE', `${base}/${ev.gcalId}`).catch((e) => { if (!/not found|deleted/i.test(e.message)) throw e; });
      d.events = d.events.filter((x) => x !== ev);
      continue;
    }
    const r = ev.gcalId ? await api('PATCH', `${base}/${ev.gcalId}`, eventBody(ev)) : await api('POST', base, eventBody(ev));
    Object.assign(ev, { gcalId: r.id, updated: r.updated, dirty: false });
  }
  for (const ex of d.exams) {
    if (!ex.dirty) continue;
    const r = ex.gcalId ? await api('PATCH', `${base}/${ex.gcalId}`, examBody(ex)).catch(() => api('POST', base, examBody(ex))) : await api('POST', base, examBody(ex));
    Object.assign(ex, { gcalId: r.id, updated: r.updated, dirty: false });
  }
  for (const gid of d.deletedExamEvents || []) await api('DELETE', `${base}/${gid}`).catch(() => {});
  d.deletedExamEvents = [];

  // 2) traz o que está no Google
  const timeMin = new Date(addDays(today(), -150) + 'T00:00:00').toISOString();
  const timeMax = new Date(addDays(today(), 400) + 'T00:00:00').toISOString();
  const items = [];
  let pageToken = '';
  do {
    const q = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', maxResults: '2500', timeMin, timeMax, showDeleted: 'false' });
    if (pageToken) q.set('pageToken', pageToken);
    const r = await api('GET', `${base}?${q}`);
    items.push(...r.items);
    pageToken = r.nextPageToken;
  } while (pageToken);

  const seen = new Set();
  for (const it of items) {
    if (it.status === 'cancelled') continue;
    seen.add(it.id);
    const priv = it.extendedProperties?.private || {};
    if (priv.liviType === 'prova') {
      const ex = d.exams.find((e) => e.gcalId === it.id) || getExam(priv.liviExamId);
      if (ex && !ex.dirty) {
        const t = timesFromGoogle(it);
        if (ex.date !== t.date) ex.dateMovedInGoogle = true;
        Object.assign(ex, { gcalId: it.id, date: t.date, time: t.startTime, updated: it.updated });
      }
      continue;
    }
    let ev = d.events.find((e) => e.gcalId === it.id);
    if (ev?.dirty) continue;
    const fields = {
      gcalId: it.id,
      title: it.summary || '(sem título)',
      location: it.location || '',
      notes: it.description || '',
      ...timesFromGoogle(it),
      updated: it.updated,
      recurring: !!it.recurringEventId,
      link: it.htmlLink,
    };
    if (priv.liviType === 'evento') Object.assign(fields, { hours: Number(priv.liviHours) || 0, category: priv.liviCat || '', cert: priv.liviCert || '', status: priv.liviStatus || '' });
    if (ev) Object.assign(ev, fields);
    else d.events.push({ id: uid(), hours: 0, category: '', cert: '', ...fields });
  }
  // apagados no Google → apaga aqui (só dentro da janela consultada)
  const lo = addDays(today(), -150);
  const hi = addDays(today(), 400);
  d.events = d.events.filter((e) => !e.gcalId || e.dirty || seen.has(e.gcalId) || e.date < lo || e.date > hi);
  for (const ex of d.exams) if (ex.gcalId && !seen.has(ex.gcalId) && ex.date >= lo && ex.date <= hi) ex.gcalId = null;

  d.lastSync = Date.now();
  save();
  return items.length;
}

// ---------- backup no Google Drive (pasta oculta do app)
async function findBackup() {
  const q = new URLSearchParams({ spaces: 'appDataFolder', q: `name='${BACKUP_NAME}'`, fields: 'files(id,modifiedTime)' });
  const r = await api('GET', `https://www.googleapis.com/drive/v3/files?${q}`);
  return r.files[0];
}
export async function backupToDrive() {
  const json = JSON.stringify(D());
  const existing = await findBackup();
  if (existing) {
    await api('PATCH', `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`, json, true);
  } else {
    const boundary = 'b' + Date.now();
    const body = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ name: BACKUP_NAME, parents: ['appDataFolder'] })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${boundary}--`;
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    if (!res.ok) throw new Error('Não consegui salvar no Drive.');
  }
  D().lastBackup = Date.now();
  save({ silent: true });
}
export async function restoreFromDrive() {
  const f = await findBackup();
  if (!f) throw new Error('Nenhum backup encontrado no seu Drive.');
  return { data: JSON.parse(await api('GET', `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`)), when: f.modifiedTime };
}
