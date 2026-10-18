import { D, save, subject, contentTitle } from '../store.js';
import { esc } from '../ui.js';
import { today, diffDays, fmt, parse, MONTHS } from '../logic/dates.js';
import { taskLabel } from '../logic/planner.js';

export const KIND_ICON = { estudo: '📖', revisao: '🔁', final: '🎯' };

export function taskRow(t, { showDate = false, showSubject = true } = {}) {
  const s = subject(t.subjectId);
  const late = !t.done && t.date < today();
  return `
    <label class="task ${t.done ? 'done' : ''}">
      <input type="checkbox" data-change="toggle-task" data-id="${t.id}" ${t.done ? 'checked' : ''}>
      <span class="box"></span>
      <span class="task-text">
        <b>${KIND_ICON[t.kind]} ${taskLabel(t)}: ${esc(contentTitle(t))}</b>
        <small>${showSubject && s ? `<i class="dot" style="background:${s.color}"></i>${esc(s.name)}` : ''}${showDate ? ` · ${fmt(t.date, 'weekday')}` : ''}${late ? ' · <em class="late">atrasada</em>' : ''}</small>
      </span>
    </label>`;
}

export function toggleTask(el) {
  const t = D().tasks.find((x) => x.id === el.dataset.id);
  if (!t) return;
  t.done = el.checked;
  t.doneAt = el.checked ? today() : null;
  save();
}

export function examCountdown(e, highlight = false) {
  const s = subject(e.subjectId);
  const days = diffDays(today(), e.date);
  return `
    <a class="count ${highlight ? 'hl' : ''}" href="#estudos/${e.subjectId}" style="--c:${s?.color || 'var(--wine)'}">
      <small class="mono">PROVA${e.weight ? ' · PESO ' + esc(e.weight) : ''}</small>
      <b>${esc(s?.name || '')} ${esc(e.title)}</b>
      <strong>${days === 0 ? 'hoje' : days === 1 ? 'amanhã' : `${days} dias`}</strong>
      <small>${fmt(e.date, 'weekday')}${e.time ? ' · ' + e.time : ''}</small>
    </a>`;
}

export function dateBox(date) {
  const d = parse(date);
  return `<div class="datebox"><b>${d.getDate()}</b><small>${MONTHS[d.getMonth()].slice(0, 3)}</small></div>`;
}

export const upcomingExams = () => D().exams.filter((e) => e.date >= today()).sort((a, b) => a.date.localeCompare(b.date));

export function subjectOptions(selected, { empty } = {}) {
  return (empty ? `<option value="">${esc(empty)}</option>` : '') +
    D().subjects.map((s) => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
}

export function emptyState(title, text, action) {
  return `<div class="empty"><b>${title}</b><p>${text}</p>${action || ''}</div>`;
}
