import { D, save, subject, replan } from '../store.js';
import { esc, toast } from '../ui.js';
import { today, weekday, fmt, addDays } from '../logic/dates.js';
import { attendanceSummary } from '../logic/attendance.js';
import { taskRow, toggleTask, examCountdown, upcomingExams, dateBox, emptyState } from './common.js';

function classesToday() {
  const t = today();
  return D().subjects.filter((s) => {
    const a = s.attendance;
    return a.schedule?.some((x) => Number(x.weekday) === weekday(t)) && (!a.start || a.start <= t) && (!a.end || a.end >= t);
  });
}

export default {
  title: () => {
    const name = D().settings.name;
    return `<small class="kicker">${fmt(today(), 'long')}</small>Olá${name ? ', ' + esc(name) : ''}!`;
  },
  render() {
    const d = D();
    const t = today();
    if (!d.subjects.length) {
      return emptyState('Bem-vinda ao seu painel de estudos ✨',
        'Comece pelos <b>Ajustes</b> (datas do semestre) e depois cadastre suas disciplinas em <b>Estudos</b>.',
        `<div class="row gap center"><a class="btn ghost" href="#ajustes">⚙️ Ajustes</a><a class="btn" href="#estudos">+ Disciplinas</a></div>`);
    }
    const tasksToday = d.tasks.filter((x) => x.date === t);
    const late = d.tasks.filter((x) => !x.done && x.date < t);
    const exams = upcomingExams().slice(0, 3);
    const classes = classesToday();
    const events = d.events.filter((e) => !e.deleted && e.date >= t).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)).slice(0, 3);
    const doneN = tasksToday.filter((x) => x.done).length;

    return `
      ${exams.length ? `
      <section class="panel">
        <div class="panel-head"><span>Próximas avaliações</span>${exams.length ? `<span class="tag wine">${exams.length} em breve</span>` : ''}</div>
        <div class="counts">${exams.map((e, i) => examCountdown(e, i === 0)).join('')}</div>
      </section>` : ''}

      <section class="panel">
        <div class="panel-head"><span>Estudo de hoje</span><span class="mono">${doneN}/${tasksToday.length}</span></div>
        ${tasksToday.length ? tasksToday.map((x) => taskRow(x)).join('') : `<p class="muted pad">${d.exams.length ? 'Nada programado para hoje. Aproveita pra descansar 💛' : 'Cadastre provas e conteúdos em Estudos para gerar o plano.'}</p>`}
        ${late.length ? `
          <div class="late-box">
            <div class="row between"><b>${late.length} atrasada${late.length > 1 ? 's' : ''}</b><button class="btn small" data-action="replan">Replanejar</button></div>
            ${late.slice(0, 5).map((x) => taskRow(x, { showDate: true })).join('')}
          </div>` : ''}
      </section>

      ${classes.length ? `
      <section class="panel">
        <div class="panel-head"><span>Aulas de hoje</span><a href="#presenca" class="mono">presença →</a></div>
        ${classes.map((s) => {
          const r = s.attendance.records?.[t];
          const sum = attendanceSummary(s.attendance, t);
          return `
          <div class="class-row">
            <div><b><i class="dot" style="background:${s.color}"></i>${esc(s.name)}</b><small>pode faltar mais ${sum.canMiss} aula${sum.canMiss === 1 ? '' : 's'}</small></div>
            <div class="seg">
              <button class="${r === 'P' ? 'on ok' : ''}" data-action="mark" data-id="${s.id}" data-v="P">Presente</button>
              <button class="${r === 'F' ? 'on bad' : ''}" data-action="mark" data-id="${s.id}" data-v="F">Falta</button>
            </div>
          </div>`;
        }).join('')}
      </section>` : ''}

      ${events.length ? `
      <section class="panel">
        <div class="panel-head"><span>Próximos eventos</span><a href="#agenda" class="mono">agenda →</a></div>
        ${events.map((e) => `<a class="event-row" href="#agenda/${e.id}">${dateBox(e.date)}<div><b>${esc(e.title)}</b><small>${e.startTime || 'dia todo'}${e.location ? ' · ' + esc(e.location) : ''}</small></div></a>`).join('')}
      </section>` : ''}

      <section class="panel">
        <div class="panel-head"><span>Amanhã</span></div>
        ${d.tasks.filter((x) => x.date === addDays(t, 1)).map((x) => taskRow(x)).join('') || '<p class="muted pad">Nada programado.</p>'}
      </section>`;
  },
  actions: {
    mark(el) {
      const s = subject(el.dataset.id);
      const recs = (s.attendance.records ||= {});
      const t = today();
      recs[t] = recs[t] === el.dataset.v ? undefined : el.dataset.v;
      if (!recs[t]) delete recs[t];
      save();
      if (el.dataset.v === 'F') {
        const sum = attendanceSummary(s.attendance, t);
        toast(sum.remaining < 0 ? `⚠️ ${s.name}: passou do limite de faltas!` : `${s.name}: ainda pode faltar ${sum.canMiss} aula(s).`);
      }
    },
    replan() {
      const w = replan();
      toast(w.some((x) => x.type === 'sobrecarga') ? 'Plano refeito, mas alguns dias ficaram cheios.' : 'Plano refeito a partir de hoje ✓');
    },
  },
  inputs: { 'toggle-task': toggleTask },
};
