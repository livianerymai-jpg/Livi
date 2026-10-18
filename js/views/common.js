import {
  D, subject, exam, contentTitle, setTaskDone, moveTask, postponeTask, removeTask, addExtraReview,
  restoreUnit, restoreRemoved, linkContent, moveContent, deleteContent, save,
} from '../store.js';
import { esc, sheet, closeSheet, toast, confetti } from '../ui.js';
import { today, diffDays, fmt, parse, MONTHS, addDays } from '../logic/dates.js';
import { taskLabel, rootOf, units } from '../logic/planner.js';

export const KIND_ICON = { estudo: '📖', revisao: '🔁', final: '🎯', extra: '➕' };

// ---------- linha de tarefa (deslize → concluir · deslize ← adiar · toque → opções)
export function taskRow(t, { showDate = false, showSubject = true } = {}) {
  const s = subject(t.subjectId);
  const late = !t.done && t.date < today();
  return `
    <div class="swipe" data-swipe="${t.id}">
      <div class="swipe-bg"><span>✓ Feito</span><span>Adiar →</span></div>
      <div class="swipe-inner task ${t.done ? 'done' : ''}" style="--c:${s?.color || 'var(--ink)'}">
        <button class="box" data-action="task-check" data-id="${t.id}" aria-label="${t.done ? 'Desmarcar' : 'Concluir'}"></button>
        <button class="task-text" data-action="task-open" data-id="${t.id}">
          <b>${KIND_ICON[t.kind]} ${taskLabel(t)}: ${esc(contentTitle(t))}</b>
          <small>${showSubject && s ? `<i class="dot" style="background:${s.color}"></i>${esc(s.name)}` : ''}${showDate ? ` · ${fmt(t.date, 'weekday')}` : ''}${t.pinned ? ' · 📌' : ''}${late ? ' · <em class="late">atrasada</em>' : ''}</small>
        </button>
      </div>
    </div>`;
}

function afterDone(t) {
  const todays = D().tasks.filter((x) => x.date === today());
  if (t.date === today() && todays.length && todays.every((x) => x.done)) {
    confetti();
    toast('Tudo de hoje feito! 🎉 Orgulho!');
  } else {
    toast(`✓ ${taskLabel(t)} concluída`, { label: 'Desfazer', run: () => setTaskDone(t.id, false) });
  }
}

export function toggleTaskDone(id) {
  const t = D().tasks.find((x) => x.id === id);
  if (!t) return;
  const willBeDone = !t.done;
  setTaskDone(id, willBeDone);
  if (willBeDone) afterDone(t);
}

export function postpone(id) {
  const t = D().tasks.find((x) => x.id === id);
  if (!t) return;
  const old = t.date;
  const next = postponeTask(id);
  toast(`Adiada para ${fmt(next, 'weekday')}`, { label: 'Desfazer', run: () => moveTask(id, old) });
}

// ---------- folha de uma tarefa
export function taskSheet(id) {
  const t = D().tasks.find((x) => x.id === id);
  if (!t) return;
  const s = subject(t.subjectId);
  const e = exam(t.examId);
  sheet(`
    <small class="kicker">${esc(s?.name || '')} · ${esc(e?.kind || 'Prova')} ${esc(e?.title || '')} (${fmt(e?.date)})</small>
    <h2>${KIND_ICON[t.kind]} ${taskLabel(t)}</h2>
    <p class="lead">${esc(contentTitle(t))}</p>
    <p class="muted small">${t.done ? `Feita em ${fmt(t.doneAt || t.date, 'weekday')}` : `Programada para ${fmt(t.date, 'weekday')}${t.pinned ? ' (data escolhida por você 📌)' : ''}`}</p>
    <div class="grid2">
      <button type="button" class="btn ${t.done ? 'ghost' : ''}" data-action="task-check" data-id="${t.id}" data-close>${t.done ? '↺ Desmarcar' : '✓ Concluir'}</button>
      ${t.done ? '' : `<button type="button" class="btn ghost" data-action="task-postpone" data-id="${t.id}" data-close>Adiar →</button>`}
    </div>
    ${t.done ? '' : `
    <label class="field">Mudar para o dia
      <div class="row gap"><input type="date" id="task-new-date" value="${t.date}" min="${today()}"><button type="button" class="btn ghost" data-action="task-move" data-id="${t.id}">Mover</button></div>
    </label>`}
    <div class="row gap actions">
      <button type="button" class="btn danger" data-action="task-remove" data-id="${t.id}">Desprogramar</button>
      <button type="button" class="btn ghost grow" data-action="content-open" data-exam="${t.examId}" data-id="${t.contentId}">Plano deste conteúdo</button>
    </div>`);
}

// ---------- folha de um conteúdo: plano completo, editar, associar, mover
export function contentSheet(examId, contentId) {
  const e = exam(examId);
  if (!e) return closeSheet();
  const c = e.contents.find((x) => x.id === contentId);
  if (!c) return closeSheet();
  const root = rootOf(e, c.id);
  const unit = units(e).find((u) => u.id === root);
  const s = subject(e.subjectId);
  const tasks = D().tasks.filter((t) => t.contentId === root && t.examId === e.id).sort((a, b) => a.date.localeCompare(b.date));
  const removed = (e.removed || []).filter((id) => id.startsWith(root + ':'));
  const others = units(e).filter((u) => u.id !== root);
  const otherExams = D().exams.filter((x) => x.subjectId === e.subjectId && x.id !== e.id && x.date >= today());
  const names = (u) => u.contentIds.map((id) => e.contents.find((x) => x.id === id)?.title).join(' + ');
  const remLabel = (id) => { const k = id.split(':')[1]; return k === 'estudo' ? 'Estudo' : k === 'final' ? 'Revisão final' : 'Revisão ' + k.replace('rev', ''); };
  sheet(`
    <small class="kicker">${esc(s?.name || '')} · ${esc(e.kind)} ${esc(e.title)} · ${fmt(e.date)}</small>
    <label class="field">Conteúdo<div class="row gap"><input id="content-title" value="${esc(c.title)}"><button type="button" class="btn ghost" data-action="content-rename" data-exam="${e.id}" data-id="${c.id}">Salvar</button></div></label>

    ${unit.contentIds.length > 1 ? `
      <div class="assoc">
        <b>🔗 Estudados juntos</b>
        ${unit.contentIds.map((id) => { const x = e.contents.find((y) => y.id === id); return `<div class="row between"><span>${esc(x.title)}</span>${id === c.id && id === root ? '<small class="muted">principal</small>' : `<button type="button" class="link" data-action="content-unlink" data-exam="${e.id}" data-id="${id}">separar</button>`}</div>`; }).join('')}
      </div>` : ''}
    ${others.length ? `
      <label class="field">Associar (estudar e revisar junto com)
        <div class="row gap"><select id="content-link"><option value="">Escolha…</option>${others.map((u) => `<option value="${u.id}">${esc(names(u))}</option>`).join('')}</select><button type="button" class="btn ghost" data-action="content-link" data-exam="${e.id}" data-id="${c.id}">Associar</button></div>
      </label>` : ''}

    <div class="field">Plano deste conteúdo</div>
    <div class="plan-list">
      ${tasks.map((t) => `
        <div class="plan-item ${t.done ? 'done' : ''}">
          <button type="button" class="box small" data-action="task-check" data-id="${t.id}" data-reopen="${e.id}|${c.id}" aria-label="Concluir"></button>
          <span class="grow">${KIND_ICON[t.kind]} ${taskLabel(t)}${t.pinned ? ' 📌' : ''}</span>
          ${t.done ? `<small>feita ${fmt(t.doneAt || t.date)}</small>` : `<input type="date" value="${t.date}" min="${today()}" data-change="task-date" data-id="${t.id}" data-reopen="${e.id}|${c.id}">`}
          ${t.done ? '' : `<button type="button" class="icon small" data-action="task-remove" data-id="${t.id}" data-reopen="${e.id}|${c.id}" aria-label="Desprogramar">×</button>`}
        </div>`).join('') || '<p class="muted small">Nada programado (a prova já passou ou não há tempo antes dela).</p>'}
    </div>
    ${removed.length ? `<div class="removed"><small class="muted">Desprogramadas:</small> ${removed.map((id) => `<button type="button" class="chip" data-action="restore-one" data-exam="${e.id}" data-id="${id}" data-reopen="${e.id}|${c.id}">↺ ${remLabel(id)}</button>`).join(' ')}</div>` : ''}
    <label class="field">Adicionar revisão extra
      <div class="row gap"><input type="date" id="extra-date" min="${today()}" max="${addDays(e.date, -1)}" value="${addDays(today(), 1)}"><button type="button" class="btn ghost" data-action="add-extra" data-exam="${e.id}" data-id="${root}" data-reopen="${e.id}|${c.id}">+ Revisão</button></div>
    </label>
    <button type="button" class="btn ghost small" data-action="restore-unit" data-exam="${e.id}" data-id="${root}" data-reopen="${e.id}|${c.id}">↺ Voltar ao plano automático</button>

    ${otherExams.length ? `
      <label class="field">Mover para outra avaliação
        <div class="row gap"><select id="content-move">${otherExams.map((x) => `<option value="${x.id}">${esc(x.kind)} ${esc(x.title)} · ${fmt(x.date)}</option>`).join('')}</select><button type="button" class="btn ghost" data-action="content-move" data-exam="${e.id}" data-id="${c.id}">Mover</button></div>
      </label>` : ''}
    <div class="row gap actions">
      <button type="button" class="btn danger" data-action="content-delete" data-exam="${e.id}" data-id="${c.id}">Excluir conteúdo</button>
      <button type="button" class="btn grow" data-action="close-sheet">Pronto</button>
    </div>`);
}

const reopen = (el) => {
  if (!el.dataset.reopen) return;
  const [ex, c] = el.dataset.reopen.split('|');
  contentSheet(ex, c);
};

// ações usadas em várias telas (registradas globalmente no main.js)
export const planActions = {
  'task-check'(el) {
    toggleTaskDone(el.dataset.id);
    if ('close' in el.dataset) closeSheet();
    reopen(el);
  },
  'task-open': (el) => taskSheet(el.dataset.id),
  'task-postpone'(el) {
    postpone(el.dataset.id);
    closeSheet();
  },
  'task-move'(el) {
    const v = document.getElementById('task-new-date').value;
    if (!v) return;
    moveTask(el.dataset.id, v);
    closeSheet();
    toast(`Movida para ${fmt(v, 'weekday')} 📌`);
  },
  'task-remove'(el) {
    const t = D().tasks.find((x) => x.id === el.dataset.id);
    removeTask(el.dataset.id);
    toast(`${taskLabel(t)} desprogramada`, { label: 'Desfazer', run: () => restoreRemoved(t.examId, t.id) });
    if (el.dataset.reopen) reopen(el);
    else closeSheet();
  },
  'content-open': (el) => contentSheet(el.dataset.exam, el.dataset.id),
  'content-rename'(el) {
    const e = exam(el.dataset.exam);
    const c = e.contents.find((x) => x.id === el.dataset.id);
    c.title = document.getElementById('content-title').value.trim() || c.title;
    e.dirty = true;
    save();
    toast('Nome atualizado ✓');
    contentSheet(e.id, c.id);
  },
  'content-link'(el) {
    const target = document.getElementById('content-link').value;
    if (!target) return;
    linkContent(el.dataset.exam, el.dataset.id, target);
    toast('Associados 🔗 — agora são estudados e revisados juntos');
    contentSheet(el.dataset.exam, el.dataset.id);
  },
  'content-unlink'(el) {
    linkContent(el.dataset.exam, el.dataset.id, null);
    toast('Separado ✓');
    closeSheet();
  },
  'content-move'(el) {
    const to = document.getElementById('content-move').value;
    moveContent(el.dataset.exam, el.dataset.id, to);
    toast('Conteúdo movido ✓');
    closeSheet();
  },
  'content-delete'(el) {
    const e = exam(el.dataset.exam);
    const c = e.contents.find((x) => x.id === el.dataset.id);
    if (!confirm(`Excluir "${c.title}" e o plano dele?`)) return;
    deleteContent(e.id, c.id);
    closeSheet();
    toast('Conteúdo excluído');
  },
  'add-extra'(el) {
    const v = document.getElementById('extra-date').value;
    if (!v) return;
    addExtraReview(el.dataset.exam, el.dataset.id, v);
    toast(`Revisão extra em ${fmt(v, 'weekday')} ✓`);
    reopen(el);
  },
  'restore-one'(el) {
    restoreRemoved(el.dataset.exam, el.dataset.id);
    reopen(el);
  },
  'restore-unit'(el) {
    restoreUnit(el.dataset.exam, el.dataset.id);
    toast('De volta ao plano automático ✓');
    reopen(el);
  },
};
export const planInputs = {
  'task-date'(el) {
    if (!el.value) return;
    moveTask(el.dataset.id, el.value);
    toast(`Movida para ${fmt(el.value, 'weekday')} 📌`);
    reopen(el);
  },
};

export function examCountdown(e, highlight = false) {
  const s = subject(e.subjectId);
  const days = diffDays(today(), e.date);
  return `
    <a class="count ${highlight ? 'hl' : ''}" href="#estudos/${e.subjectId}" style="--c:${s?.color || 'var(--wine)'}">
      <small class="mono">${esc((e.kind || 'Prova').toUpperCase())}${e.weight ? ' · PESO ' + esc(e.weight) : ''}</small>
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
