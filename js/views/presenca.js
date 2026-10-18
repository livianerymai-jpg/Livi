import { D, save, subject } from '../store.js';
import { esc, nf, chip, bar, toast } from '../ui.js';
import { today, fmt, WEEKDAYS } from '../logic/dates.js';
import { attendanceSummary } from '../logic/attendance.js';
import { emptyState } from './common.js';

const ST = { ok: ['Tranquila', 'sage'], atencao: ['Atenção', 'mustard'], limite: ['No limite', 'wine'], reprovada: ['Reprovada por falta', 'wine'] };
const COLOR = { ok: 'var(--sage)', atencao: 'var(--mustard)', limite: 'var(--wine)', reprovada: 'var(--wine)' };

function summaryCard(s, link = true) {
  const sum = attendanceSummary(s.attendance, today());
  const configured = s.attendance.schedule?.length;
  const tagOpen = link ? `<a class="att" href="#presenca/${s.id}">` : '<div class="att">';
  return `
    ${tagOpen}
      <div class="row between"><b><i class="dot" style="background:${s.color}"></i>${esc(s.name)}</b>${configured ? chip(...ST[sum.status]) : chip('Configurar', 'mustard')}</div>
      ${configured ? `
        <div class="row between small"><span>Faltas: <b>${nf(sum.absent, 0)}h</b> de ${nf(sum.limit, sum.limit % 1 ? 1 : 0)}h permitidas</span><span class="mono">${nf(sum.pct, 0)}% presença</span></div>
        ${bar(sum.limit ? (sum.absent / sum.limit) * 100 : 0, COLOR[sum.status])}
        <small>${sum.remaining < 0 ? `Passou ${nf(-sum.remaining, 0)}h do limite.` : `Ainda pode faltar <b>${sum.canMiss}</b> aula${sum.canMiss === 1 ? '' : 's'} (${nf(sum.remaining, sum.remaining % 1 ? 1 : 0)}h).`}${sum.pendingPast ? ` · ${sum.pendingPast} aula(s) sem marcar` : ''}</small>`
        : '<small>Informe os dias de aula e a carga horária.</small>'}
    ${link ? '</a>' : '</div>'}`;
}

export default {
  title: (id) => (id ? `<small class="kicker">Presença</small>${esc(subject(id)?.name || '')}` : 'Controle de <span class="script">presença</span>'),
  render(id) {
    const d = D();
    if (!d.subjects.length) return emptyState('Sem disciplinas ainda', 'Cadastre suas disciplinas em Estudos.', '<a class="btn" href="#estudos">Ir para Estudos</a>');
    if (!id) {
      return `
        <section class="panel"><div class="panel-head"><span>Mínimo de 75% de presença</span></div>${d.subjects.map((s) => summaryCard(s)).join('')}</section>
        <p class="muted small center">Marque presença rápido na aba Hoje, nos dias de aula.</p>`;
    }
    const s = subject(id);
    if (!s) return emptyState('Disciplina não encontrada', '');
    const a = s.attendance;
    const sum = attendanceSummary(a, today());
    const t = today();
    const past = sum.dates.filter((x) => x.date <= t).reverse();
    const future = sum.dates.filter((x) => x.date > t);
    const byDay = new Map((a.schedule || []).map((x) => [Number(x.weekday), x.hours]));
    return `
      <section class="panel">${summaryCard(s, false)}</section>

      <section class="panel">
        <div class="panel-head"><span>Aulas</span>${past.some((x) => !a.records?.[x.date]) ? '<button class="btn small ghost" data-action="fill">Marcar não marcadas como presença</button>' : ''}</div>
        ${past.length ? past.map((x) => {
          const r = a.records?.[x.date];
          return `
            <div class="class-row">
              <div><b>${x.date === t ? 'Hoje' : fmt(x.date, 'weekday')}</b><small>${x.hours}h</small></div>
              <div class="seg">
                <button class="${r === 'P' ? 'on ok' : ''}" data-action="mark" data-d="${x.date}" data-v="P">Presente</button>
                <button class="${r === 'F' ? 'on bad' : ''}" data-action="mark" data-d="${x.date}" data-v="F">Falta</button>
                <button class="${r === 'X' ? 'on' : ''}" data-action="mark" data-d="${x.date}" data-v="X" title="Sem aula / feriado">Sem aula</button>
              </div>
            </div>`;
        }).join('') : '<p class="muted pad">Nenhuma aula até hoje.</p>'}
        ${future.length ? `<p class="muted small pad">+ ${future.length} aulas até ${fmt(a.end)}</p>` : ''}
      </section>

      <section class="panel">
        <div class="panel-head"><span>Configuração</span></div>
        <div class="pad form">
          <div class="row gap">
            <label class="field grow">Carga horária total (h)<input inputmode="numeric" value="${a.totalHours ?? ''}" data-change="att" data-k="totalHours"></label>
            <label class="field grow">Presença mínima (%)<input inputmode="numeric" value="${a.minPct ?? 75}" data-change="att" data-k="minPct"></label>
          </div>
          <div class="row gap">
            <label class="field grow">Início das aulas<input type="date" value="${a.start || ''}" data-change="att" data-k="start"></label>
            <label class="field grow">Fim<input type="date" value="${a.end || ''}" data-change="att" data-k="end"></label>
          </div>
          <div class="field">Dias de aula e horas-aula em cada dia</div>
          <div class="weekdays">
            ${[1, 2, 3, 4, 5, 6].map((w) => `
              <label class="wd ${byDay.has(w) ? 'on' : ''}">
                <input type="checkbox" ${byDay.has(w) ? 'checked' : ''} data-change="wday" data-w="${w}"><span>${WEEKDAYS[w]}</span>
                <input inputmode="decimal" value="${byDay.get(w) ?? ''}" placeholder="h" data-change="whours" data-w="${w}" ${byDay.has(w) ? '' : 'disabled'}>
              </label>`).join('')}
          </div>
          <p class="muted small">Limite de faltas = ${100 - (a.minPct ?? 75)}% da carga horária. Se a carga ficar vazia, uso a soma das aulas do calendário.</p>
        </div>
      </section>`;
  },
  actions: {
    mark(el) {
      const s = subject(location.hash.split('/')[1]);
      const recs = (s.attendance.records ||= {});
      if (recs[el.dataset.d] === el.dataset.v) delete recs[el.dataset.d];
      else recs[el.dataset.d] = el.dataset.v;
      save();
    },
    fill() {
      const s = subject(location.hash.split('/')[1]);
      const recs = (s.attendance.records ||= {});
      let n = 0;
      for (const x of attendanceSummary(s.attendance, today()).dates) if (x.date <= today() && !recs[x.date]) { recs[x.date] = 'P'; n++; }
      save();
      toast(`${n} aula(s) marcadas como presença.`);
    },
  },
  inputs: {
    att(el) {
      const s = subject(location.hash.split('/')[1]);
      const k = el.dataset.k;
      s.attendance[k] = k === 'start' || k === 'end' ? el.value : Number(el.value.replace(',', '.')) || 0;
      save();
    },
    wday(el) {
      const s = subject(location.hash.split('/')[1]);
      const w = Number(el.dataset.w);
      const sch = (s.attendance.schedule ||= []);
      if (el.checked) sch.push({ weekday: w, hours: 2 });
      else s.attendance.schedule = sch.filter((x) => Number(x.weekday) !== w);
      save();
    },
    whours(el) {
      const s = subject(location.hash.split('/')[1]);
      const x = s.attendance.schedule.find((y) => Number(y.weekday) === Number(el.dataset.w));
      if (x) x.hours = Number(el.value.replace(',', '.')) || 1;
      save();
    },
  },
};
