import { D, save, subject, replan } from '../store.js';
import { rerender } from '../bus.js';
import { esc, toast } from '../ui.js';
import { today, weekday, fmt, addDays, parse, WEEKDAYS } from '../logic/dates.js';
import { attendanceSummary } from '../logic/attendance.js';
import { taskRow, examCountdown, upcomingExams, dateBox, emptyState } from './common.js';

let day = null;

function weekStrip(sel) {
  const t = today();
  const tasks = D().tasks;
  const exams = D().exams;
  return `<div class="week">${Array.from({ length: 7 }, (_, i) => addDays(t, i)).map((d) => {
    const list = tasks.filter((x) => x.date === d);
    const left = list.filter((x) => !x.done).length;
    const exam = exams.some((e) => e.date === d);
    return `<button class="wday ${d === sel ? 'on' : ''} ${exam ? 'exam' : ''}" data-action="day" data-d="${d}"><small>${d === t ? 'HOJE' : WEEKDAYS[parse(d).getDay()].toUpperCase()}</small><b>${parse(d).getDate()}</b><i>${list.length ? (left ? left : '✓') : ''}</i></button>`;
  }).join('')}</div>`;
}

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
    if (!day || day < t) day = t;
    const sel = day;
    const tasksToday = d.tasks.filter((x) => x.date === sel);
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
        ${weekStrip(sel)}
        <div class="panel-head"><span>${sel === t ? 'Estudo de hoje' : 'Estudo de ' + fmt(sel, 'weekday')}</span><span class="mono">${doneN}/${tasksToday.length}</span></div>
        ${tasksToday.length ? `<div class="progress-line"><i style="width:${(doneN / tasksToday.length) * 100}%"></i></div>${tasksToday.map((x) => taskRow(x)).join('')}<p class="hint">Deslize → para concluir · ← para adiar · toque para mais opções</p>` : `<p class="muted pad">${d.exams.length ? 'Nada programado. Aproveita pra descansar 💛' : 'Cadastre provas e conteúdos em Estudos para gerar o plano.'}</p>`}
        ${late.length ? `
          <div class="late-box">
            <div class="row between"><b>${late.length} atrasada${late.length > 1 ? 's' : ''}</b><button class="btn small" data-action="replan">Reagendar</button></div>
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
      </section>` : ''}`;
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
    day(el) {
      day = el.dataset.d;
      rerender();
    },
    replan() {
      const w = replan();
      toast(w.some((x) => x.type === 'sobrecarga') ? 'Plano refeito, mas alguns dias ficaram cheios.' : 'Plano refeito a partir de hoje ✓');
    },
  },
};
