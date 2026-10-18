import { D, save, replan, replaceAll } from '../store.js';
import { esc, toast } from '../ui.js';
import { WEEKDAYS } from '../logic/dates.js';
import * as google from '../google.js';
import { rerender } from '../bus.js';
import { V } from '../variant.js';

let calendars = null;

const get = (path) => path.split('.').reduce((o, k) => o?.[k], D().settings);
function set(path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], D().settings)[last] = value;
}

const input = (label, path, attrs = '', hint = '') =>
  `<label class="field">${label}<input value="${esc(get(path) ?? '')}" data-change="set" data-path="${path}" ${attrs}>${hint ? `<small class="muted">${hint}</small>` : ''}</label>`;

export default {
  title: 'Seus <span class="script">ajustes</span>',
  render() {
    const s = D().settings;
    const g = s.google;
    const connected = google.isConnected();
    return `
      <section class="panel"><div class="panel-head"><span>Você e o semestre</span></div><div class="pad form">
        ${input('Seu nome', 'name', 'placeholder="como quer ser chamada"')}
        <div class="row gap">
          ${input('Início do semestre', 'semesterStart', 'type="date"')}
          ${input('Fim do semestre', 'semesterEnd', 'type="date"')}
        </div>
        <button class="btn ghost small" data-action="apply-dates">Usar estas datas nas aulas de todas as disciplinas</button>
      </div></section>

      <section class="panel"><div class="panel-head"><span>Plano de estudos</span></div><div class="pad form">
        <div class="row gap">
          ${input('Dias de folga antes de cada prova', 'bufferDays', 'type="number" min="0" max="7" inputmode="numeric" data-num data-replan')}
          ${input('Blocos de estudo por dia', 'dailyCapacity', 'type="number" min="1" max="12" inputmode="numeric" data-num data-replan', '1 estudo = 1 bloco · 1 revisão = ½')}
        </div>
        <div class="field">Dias sem estudo</div>
        <div class="chips">${WEEKDAYS.map((w, i) => `<button class="chip ${s.offWeekdays.includes(i) ? 'on' : ''}" data-action="offday" data-w="${i}">${w}</button>`).join('')}</div>
        <label class="toggle"><input type="checkbox" ${s.autoReschedule !== false ? 'checked' : ''} data-change="set-bool" data-path="autoReschedule"> Reagendar sozinho o que eu não fizer</label>
        <button class="btn small" data-action="replan">↻ Refazer o plano do zero (mantém o que já fiz e as datas 📌)</button>
      </div></section>

      <section class="panel"><div class="panel-head"><span>Google Agenda e backup</span>${connected ? '<span class="tag sage">conectado</span>' : ''}</div><div class="pad form">
        ${input('ID do cliente OAuth do Google', 'google.clientId', 'class="mono" placeholder="xxxx.apps.googleusercontent.com" autocapitalize="off" spellcheck="false"', 'Passo a passo no README do projeto (5 minutos, uma vez só).')}
        <label class="field">Endereço deste app (para colocar no Google Cloud)<input readonly class="mono" value="${esc(location.origin)}"></label>
        ${connected ? `
          <label class="field">Agenda usada pelo app
            <select data-change="calendar">${calendars ? calendars.map((c) => `<option value="${esc(c.id)}" ${c.id === g.calendarId ? 'selected' : ''}>${esc(c.name)}${c.primary ? ' (principal)' : ''}</option>`).join('') : `<option>${esc(g.calendarName || 'Principal')}</option>`}</select>
          </label>
          <div class="row gap wrap">
            ${calendars ? '' : '<button class="btn ghost small" data-action="load-cals">Escolher agenda</button>'}
            <button class="btn ghost small" data-action="create-cal">+ Criar agenda “Faculdade ${V.sigla}”</button>
            <button class="btn small" data-action="sync">↻ Sincronizar agora</button>
          </div>
          <label class="toggle"><input type="checkbox" ${g.autoBackup ? 'checked' : ''} data-change="set-bool" data-path="google.autoBackup"> Backup automático no Google Drive</label>
          <div class="row gap wrap">
            <button class="btn ghost small" data-action="backup">Fazer backup agora</button>
            <button class="btn ghost small" data-action="restore">Restaurar do Drive</button>
            <button class="btn ghost small danger-text" data-action="disconnect">Desconectar</button>
          </div>
          <small class="muted">${D().lastBackup ? 'Último backup: ' + new Date(D().lastBackup).toLocaleString('pt-BR') : 'Ainda sem backup no Drive.'}</small>`
          : `<button class="btn" data-action="connect" ${g.clientId ? '' : 'disabled'}>Conectar com o Google</button>
          <label class="field">Modo de login
            <select data-change="set" data-path="google.mode"><option value="popup" ${g.mode !== 'redirect' ? 'selected' : ''}>Janela do Google (padrão)</option><option value="redirect" ${g.mode === 'redirect' ? 'selected' : ''}>Redirecionar (se a janela não abrir no iPhone)</option></select>
          </label>`}
      </div></section>

      <section class="panel"><div class="panel-head"><span>Horas complementares</span></div><div class="pad form">
        ${input('Horas exigidas no curso', 'requiredHours', 'type="number" inputmode="numeric" data-num')}
        <label class="field">Categorias (uma por linha)<textarea rows="5" data-change="cats">${esc(s.hourCategories.join('\n'))}</textarea></label>
        ${input('Média padrão para aprovação (novas disciplinas)', 'passing', 'inputmode="decimal" data-num')}
      </div></section>

      <section class="panel"><div class="panel-head"><span>Dados</span></div><div class="pad form">
        <small class="muted">Tudo fica salvo neste aparelho${connected ? ' e com backup no seu Google Drive' : ''}.</small>
        <div class="row gap wrap">
          <button class="btn ghost small" data-action="export">⬇︎ Exportar arquivo</button>
          <label class="btn ghost small">⬆︎ Importar arquivo<input type="file" accept=".json,application/json" data-change="import" hidden></label>
          <button class="btn ghost small" data-action="demo">Carregar exemplo</button>
          <button class="btn ghost small danger-text" data-action="wipe">Apagar tudo</button>
        </div>
      </div></section>
      <p class="muted small center">${V.app} 💙</p>`;
  },
  actions: {
    offday(el) {
      const w = Number(el.dataset.w);
      const off = D().settings.offWeekdays;
      D().settings.offWeekdays = off.includes(w) ? off.filter((x) => x !== w) : [...off, w];
      replan();
    },
    replan() {
      replan({ fresh: true });
      toast('Plano refeito ✓');
    },
    'apply-dates'() {
      const s = D().settings;
      for (const sub of D().subjects) Object.assign(sub.attendance, { start: s.semesterStart, end: s.semesterEnd });
      save();
      toast('Datas aplicadas em todas as disciplinas ✓');
    },
    async connect() {
      await google.connect();
      toast('Google conectado ✓');
      calendars = await google.listCalendars().catch(() => null);
      rerender();
      google.sync().then(() => toast('Agenda sincronizada ✓')).catch((e) => toast(e.message));
    },
    async 'load-cals'() {
      calendars = await google.listCalendars();
      rerender();
    },
    async 'create-cal'() {
      const c = await google.createCalendar('Faculdade ' + V.sigla);
      Object.assign(D().settings.google, { calendarId: c.id, calendarName: c.summary });
      D().exams.forEach((e) => { e.gcalId = null; e.dirty = true; });
      D().events.filter((e) => !e.gcalId).forEach((e) => (e.dirty = true));
      calendars = await google.listCalendars();
      save();
      await google.sync();
      toast(`Agenda “Faculdade ${V.sigla}” criada e sincronizada ✓`);
    },
    async sync() {
      const n = await google.sync();
      toast(`Sincronizado ✓ (${n} itens)`);
    },
    async backup() {
      await google.backupToDrive();
      rerender();
      toast('Backup salvo no Google Drive ✓');
    },
    async restore() {
      const { data, when } = await google.restoreFromDrive();
      if (!confirm(`Restaurar o backup de ${new Date(when).toLocaleString('pt-BR')}? Os dados atuais deste aparelho serão substituídos.`)) return;
      await replaceAll(data);
      save();
      toast('Backup restaurado ✓');
    },
    disconnect() {
      google.disconnect();
      calendars = null;
      rerender();
    },
    export() {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(D(), null, 1)], { type: 'application/json' }));
      a.download = `${V.storage}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    },
    async demo() {
      if (D().subjects.length && !confirm('Adicionar dados de exemplo junto com os seus?')) return;
      const { loadDemo } = await import('../demo.js');
      loadDemo();
      replan();
      location.hash = '#hoje';
      toast('Exemplo carregado — explore à vontade.');
    },
    async wipe() {
      if (!confirm('Apagar TODOS os dados deste aparelho? Isso não apaga nada do Google Agenda.')) return;
      if (!confirm('Tem certeza mesmo?')) return;
      const { defaultState } = await import('../store.js');
      const keep = D().settings.google;
      const fresh = defaultState();
      fresh.settings.google = { ...keep };
      await replaceAll(fresh);
      save();
    },
  },
  inputs: {
    set(el) {
      const v = 'num' in el.dataset ? Number(String(el.value).replace(',', '.')) || 0 : el.value.trim();
      set(el.dataset.path, v);
      if ('replan' in el.dataset) replan();
      else save();
    },
    'set-bool'(el) {
      set(el.dataset.path, el.checked);
      save({ silent: true });
    },
    calendar(el) {
      const c = calendars?.find((x) => x.id === el.value);
      if (!confirm('Trocar de agenda? As provas serão recriadas na nova agenda e os eventos passam a vir dela.')) return rerender();
      const g = D().settings.google;
      g.calendarId = el.value;
      g.calendarName = c?.name || '';
      const d = D();
      d.events = d.events.filter((e) => !e.gcalId);
      d.events.forEach((e) => (e.dirty = true));
      d.exams.forEach((e) => { e.gcalId = null; e.dirty = true; });
      save();
      google.sync().then(() => toast('Agenda trocada e sincronizada ✓')).catch((e) => toast(e.message));
    },
    cats(el) {
      D().settings.hourCategories = el.value.split('\n').map((x) => x.trim()).filter(Boolean);
      save({ silent: true });
    },
    async import(el) {
      try {
        const data = JSON.parse(await el.files[0].text());
        if (!data.settings || !data.subjects) throw new Error('arquivo inválido');
        if (!confirm('Substituir os dados deste aparelho pelos do arquivo?')) return;
        await replaceAll(data);
        save();
        toast('Dados importados ✓');
      } catch (e) {
        toast('Não consegui importar: ' + e.message);
      }
    },
  },
};

