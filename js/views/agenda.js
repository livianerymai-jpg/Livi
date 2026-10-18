import { D, save, subject, uid, files } from '../store.js';
import { esc, sheet, toast, bar, chip, ring, closeSheet } from '../ui.js';
import { today, fmt, parse, iso, addDays, MONTHS, WEEKDAYS, pad } from '../logic/dates.js';
import * as google from '../google.js';
import { rerender } from '../bus.js';
import { examSheet } from './estudos.js';
import { dateBox, emptyState, examCountdown, upcomingExams, subjectOptions } from './common.js';

let seg = 'calendario';
let month = today().slice(0, 7);
let selected = today();

const STATUS = { inscrita: ['Inscrita', 'navy'], confirmado: ['Confirmado', 'sage'], pendente: ['Pendente', 'mustard'] };
const CERT = { pendente: 'Certificado pendente', salvo: 'Certificado salvo' };

const events = () => D().events.filter((e) => !e.deleted);
const onDay = (day) => events().filter((e) => e.date <= day && (e.endDate || e.date) >= day);

function syncBar() {
  const d = D();
  const g = d.settings.google;
  if (!g.clientId) return `<a class="sync" href="#ajustes"><span>📅 Conecte o Google Agenda em Ajustes</span><b>→</b></a>`;
  if (!google.isConnected()) return `<button class="sync" data-action="connect"><span>📅 Google Agenda desconectado</span><b>Conectar</b></button>`;
  const ago = d.lastSync ? Math.round((Date.now() - d.lastSync) / 60000) : null;
  return `<button class="sync ok" data-action="sync"><span>📅 ${esc(g.calendarName || 'Google Agenda')} · ${ago == null ? 'ainda não sincronizado' : ago < 1 ? 'sincronizado agora' : `sincronizado há ${ago} min`}</span><b>↻</b></button>`;
}

function calendar() {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const startPad = first.getDay();
  const daysIn = new Date(y, m, 0).getDate();
  const exams = D().exams;
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push('<span></span>');
  for (let day = 1; day <= daysIn; day++) {
    const ds = `${y}-${pad(m)}-${pad(day)}`;
    const hasExam = exams.some((e) => e.date === ds);
    const evs = onDay(ds);
    const tasks = D().tasks.some((t) => t.date === ds && !t.done);
    cells.push(`<button class="cday ${hasExam ? 'exam' : ''} ${evs.length ? 'ev' : ''} ${ds === today() ? 'today' : ''} ${ds === selected ? 'sel' : ''}" data-action="pick-day" data-d="${ds}">${day}${evs.length || tasks ? `<i>${evs.length ? '<u></u>' : ''}${tasks ? '<s></s>' : ''}</i>` : ''}</button>`);
  }
  const dayExams = exams.filter((e) => e.date === selected);
  const dayEvents = onDay(selected);
  const dayTasks = D().tasks.filter((t) => t.date === selected);
  return `
    <section class="panel">
      <div class="panel-head">
        <button class="icon" data-action="month" data-d="-1" aria-label="Mês anterior">‹</button>
        <span>${MONTHS[m - 1]} ${y}</span>
        <button class="icon" data-action="month" data-d="1" aria-label="Próximo mês">›</button>
      </div>
      <div class="cal">${WEEKDAYS.map((w) => `<small>${w.toUpperCase()}</small>`).join('')}${cells.join('')}</div>
      <div class="legend"><span><i class="lg exam"></i>Prova</span><span><i class="lg ev"></i>Evento</span><span><i class="lg tk"></i>Estudo</span><span><i class="lg today"></i>Hoje</span></div>
    </section>
    <section class="panel">
      <div class="panel-head"><span>${fmt(selected, 'long')}</span></div>
      ${dayExams.map((e) => `<a class="event-row" href="#estudos/${e.subjectId}">${dateBox(e.date)}<div><b>📝 ${esc(e.kind || 'Prova')}: ${esc(subject(e.subjectId)?.name || '')} – ${esc(e.title)}</b><small>${e.time || 'dia todo'}${e.contents.length ? ` · ${e.contents.length} conteúdos` : ''}</small></div></a>`).join('')}
      ${dayEvents.map(eventRow).join('')}
      ${dayTasks.length ? `<a class="event-row" href="#estudos"><div class="datebox">📖</div><div><b>${dayTasks.length} tarefa(s) de estudo</b><small>${dayTasks.filter((t) => t.done).length} feita(s)</small></div></a>` : ''}
      ${!dayExams.length && !dayEvents.length && !dayTasks.length ? '<p class="muted pad">Dia livre.</p>' : ''}
      <div class="row gap pad"><button class="btn ghost grow small" data-action="new-event" data-d="${selected}">+ Evento</button><button class="btn ghost grow small" data-action="new-exam" data-d="${selected}">+ Avaliação</button></div>
    </section>`;
}

function eventRow(e) {
  const st = STATUS[e.status];
  return `
    <button class="event-row" data-action="edit-event" data-id="${e.id}">
      ${dateBox(e.date)}
      <div class="grow"><b>${esc(e.title)}</b><small>${e.startTime ? `${e.startTime}${e.endTime ? '–' + e.endTime : ''}` : 'dia todo'}${e.location ? ' · ' + esc(e.location) : ''}${e.hours ? ` · ${e.hours}h ${esc(e.category || '')}` : ''}</small></div>
      ${st ? chip(st[0], st[1]) : e.hours && e.cert === 'pendente' ? chip('Certificado', 'mustard') : e.dirty ? chip('enviando', '') : ''}
    </button>`;
}

function eventList() {
  const t = today();
  const up = events().filter((e) => (e.endDate || e.date) >= t).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  const past = events().filter((e) => (e.endDate || e.date) < t && e.hours).sort((a, b) => b.date.localeCompare(a.date));
  return `
    <div class="row gap"><button class="btn grow" data-action="new-event" data-d="${t}">+ Novo evento</button></div>
    <section class="panel">
      <div class="panel-head"><span>Próximos eventos</span><span class="mono">${up.length}</span></div>
      ${up.slice(0, 40).map(eventRow).join('') || '<p class="muted pad">Nenhum evento futuro.</p>'}
    </section>
    ${past.length ? `<section class="panel"><div class="panel-head"><span>Eventos passados com horas</span></div>${past.map(eventRow).join('')}</section>` : ''}`;
}

function hoursView() {
  const d = D();
  const cats = d.settings.hourCategories;
  const counted = events().filter((e) => e.hours > 0);
  const total = counted.reduce((s, e) => s + Number(e.hours), 0);
  const req = Number(d.settings.requiredHours) || 0;
  const byCat = new Map(cats.map((c) => [c, 0]));
  for (const e of counted) byCat.set(e.category || 'Outros', (byCat.get(e.category || 'Outros') || 0) + Number(e.hours));
  const max = Math.max(1, ...byCat.values());
  const saved = counted.filter((e) => e.cert === 'salvo').length;
  const pending = counted.filter((e) => e.cert !== 'salvo').length;
  return `
    <section class="panel">
      <div class="panel-head"><span>Horas complementares</span></div>
      <div class="hours">
        <div class="hours-total"><small class="mono">TOTAL ACUMULADO</small><strong>${total}h</strong><small>de ${req}h exigidas</small>${bar(req ? (total / req) * 100 : 0, 'var(--navy)')}</div>
        <div class="grow">${[...byCat].filter(([, h]) => h || true).map(([c, h]) => `<div class="hrow"><div class="row between"><span>${esc(c)}</span><b>${h}h</b></div>${bar((h / max) * 100, 'var(--navy)')}</div>`).join('')}</div>
      </div>
      <p class="mono small pad">${saved} certificado(s) salvo(s) · ${pending} aguardando</p>
    </section>
    <section class="panel">
      <div class="panel-head"><span>Atividades que contam horas</span></div>
      ${counted.sort((a, b) => b.date.localeCompare(a.date)).map(eventRow).join('') || '<p class="muted pad">Ao criar ou abrir um evento, marque quantas horas complementares ele vale.</p>'}
    </section>`;
}

async function eventSheet(ev = null, date = today()) {
  const d = D();
  const e = ev || { title: '', date, endDate: '', startTime: '', endTime: '', location: '', notes: '', status: '', hours: 0, category: '', cert: '' };
  const hasCert = ev ? !!(await files.get('cert-' + ev.id)) : false;
  sheet(`
    <h2>${ev ? 'Evento' : 'Novo evento'}</h2>
    ${ev?.recurring ? '<p class="note">Evento repetido: a edição vale só para esta data.</p>' : ''}
    <label class="field">Nome<input name="title" required value="${esc(e.title)}" placeholder="ex.: Simpósio de Neurociências"></label>
    <div class="row gap">
      <label class="field grow">Data<input type="date" name="date" required value="${e.date}"></label>
      <label class="field grow">Até (opcional)<input type="date" name="endDate" value="${e.endDate && e.endDate !== e.date ? e.endDate : ''}"></label>
    </div>
    <div class="row gap">
      <label class="field grow">Início<input type="time" name="startTime" value="${e.startTime || ''}"></label>
      <label class="field grow">Fim<input type="time" name="endTime" value="${e.endTime || ''}"></label>
    </div>
    <label class="field">Local<input name="location" value="${esc(e.location)}"></label>
    <label class="field">Situação<select name="status"><option value="">—</option>${Object.entries(STATUS).map(([k, [l]]) => `<option value="${k}" ${e.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="field">Notas<textarea name="notes" rows="2">${esc(e.notes)}</textarea></label>
    <fieldset class="box-field">
      <legend>Horas complementares</legend>
      <div class="row gap">
        <label class="field">Horas<input name="hours" type="number" min="0" step="0.5" inputmode="decimal" value="${e.hours || ''}" placeholder="0"></label>
        <label class="field grow">Categoria<select name="category">${d.settings.hourCategories.map((c) => `<option ${e.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
      </div>
      <label class="field">Certificado<select name="cert"><option value="">Não se aplica</option>${Object.entries(CERT).map(([k, l]) => `<option value="${k}" ${e.cert === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="row gap">
        <label class="btn ghost small grow">📎 ${hasCert ? 'Trocar' : 'Anexar'} certificado<input type="file" name="certFile" accept="image/*,application/pdf" hidden></label>
        ${hasCert ? '<button type="button" class="btn ghost small" data-action="open-cert" data-id="' + ev.id + '">Ver</button>' : ''}
      </div>
    </fieldset>
    ${ev?.link ? `<a class="link small" href="${esc(ev.link)}" target="_blank" rel="noopener">Abrir no Google Agenda ↗</a>` : ''}
    <div class="row gap actions">
      ${ev ? '<button class="btn danger" value="delete">Excluir</button>' : ''}
      <button class="btn ghost grow" type="button" data-action="close-sheet">Cancelar</button>
      <button class="btn grow" value="save">Salvar</button>
    </div>`, {
    async onSubmit(data, form, submitter) {
      if (submitter?.value === 'delete') {
        if (!confirm('Excluir este evento' + (ev.gcalId ? ' (também do Google Agenda)?' : '?'))) return true;
        if (ev.gcalId) Object.assign(ev, { deleted: true, dirty: true });
        else d.events = d.events.filter((x) => x !== ev);
        files.del('cert-' + ev.id);
        save();
        return;
      }
      const target = ev || { id: uid() };
      const file = form.certFile.files[0];
      Object.assign(target, {
        title: data.title.trim(), date: data.date, endDate: data.endDate && data.endDate > data.date ? data.endDate : '',
        startTime: data.startTime, endTime: data.endTime, location: data.location.trim(), notes: data.notes, status: data.status,
        hours: Number(String(data.hours).replace(',', '.')) || 0, category: data.category, cert: file ? 'salvo' : data.cert, dirty: true,
      });
      if (file) await files.put('cert-' + target.id, file);
      if (!ev) d.events.push(target);
      save();
      toast(google.isConnected() ? 'Salvo e enviado ao Google Agenda ✓' : 'Evento salvo ✓');
    },
  });
}

export default {
  title: 'Hub de <span class="script">eventos</span>',
  render(id) {
    if (id) setTimeout(() => {
      const ev = D().events.find((e) => e.id === id);
      history.replaceState(null, '', '#agenda');
      if (ev) eventSheet(ev);
    });
    const exams = upcomingExams().slice(0, 3);
    return `
      ${syncBar()}
      <div class="tabs-seg">
        ${[['calendario', 'Calendário'], ['eventos', 'Eventos'], ['horas', 'Horas']].map(([k, l]) => `<button class="${seg === k ? 'on' : ''}" data-action="seg" data-v="${k}">${l}</button>`).join('')}
      </div>
      ${seg === 'calendario' ? `${exams.length ? `<section class="panel"><div class="panel-head"><span>Calendário de provas</span></div><div class="counts">${exams.map((e, i) => examCountdown(e, i === 0)).join('')}</div></section>` : ''}${calendar()}` : seg === 'eventos' ? eventList() : hoursView()}`;
  },
  actions: {
    seg: (el) => { seg = el.dataset.v; rerender(); },
    month(el) {
      const [y, m] = month.split('-').map(Number);
      const dt = new Date(y, m - 1 + Number(el.dataset.d), 1);
      month = iso(dt).slice(0, 7);
      rerender();
    },
    'pick-day': (el) => { selected = el.dataset.d; rerender(); },
    'new-event': (el) => eventSheet(null, el.dataset.d || today()),
    'new-exam': (el) => (D().subjects.length ? examSheet(D().subjects[0].id, null, el.dataset.d || today()) : toast('Cadastre uma disciplina em Estudos primeiro.')),
    'edit-event': (el) => eventSheet(D().events.find((e) => e.id === el.dataset.id)),
    async 'open-cert'(el) {
      const blob = await files.get('cert-' + el.dataset.id);
      if (blob) window.open(URL.createObjectURL(blob), '_blank');
    },
    async connect() {
      await google.connect();
      toast('Google conectado ✓ Sincronizando…');
      await google.sync();
    },
    async sync() {
      const n = await google.sync();
      toast(`Sincronizado ✓ (${n} itens no Google Agenda)`);
    },
  },
};
