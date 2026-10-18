import { D, save, subject, subjectExams, replan, uid, newSubject, COLORS } from '../store.js';
import { esc, sheet, toast, bar, chip } from '../ui.js';
import { today, diffDays, fmt, addDays, WEEKDAYS } from '../logic/dates.js';
import { taskLabel, folgaDays, gapsOf, cumulative, SPACING_PRESETS, units } from '../logic/planner.js';
import { taskRow, emptyState, KIND_ICON } from './common.js';

const DIFF_TEXT = ['', 'Tranquila', 'Leve', 'Média', 'Difícil', 'Muito difícil'];
export const EXAM_KINDS = ['Prova', 'Trabalho', 'Seminário', 'Prática', 'Outro'];

function progress(subjectId) {
  const tasks = D().tasks.filter((t) => t.subjectId === subjectId);
  const done = tasks.filter((t) => t.done).length;
  return { total: tasks.length, done, pct: tasks.length ? (done / tasks.length) * 100 : 0 };
}

function subjectCard(s) {
  const p = progress(s.id);
  const next = subjectExams(s.id).find((e) => e.date >= today());
  const status = !p.total ? ['A começar', ''] : p.done === p.total ? ['Concluído', 'sage'] : ['Em progresso', 'wine'];
  return `
    <a class="subject" href="#estudos/${s.id}" style="--c:${s.color}">
      ${chip(status[0], status[1])}
      <b>${esc(s.name)}</b>
      ${bar(p.pct, s.color)}
      <small class="mono">${Math.round(p.pct)}% · ${next ? `${esc(next.kind.toUpperCase())} EM ${diffDays(today(), next.date)} DIAS` : 'NADA MARCADO'}</small>
      ${s.studyWeekdays?.length ? `<small class="mono">ESTUDO: ${s.studyWeekdays.map((w) => WEEKDAYS[w].toUpperCase()).join(' · ')}</small>` : ''}
    </a>`;
}

function schedule() {
  const d = D();
  const t = today();
  const days = Array.from({ length: 14 }, (_, i) => addDays(t, i));
  const folga = folgaDays(d.exams.filter((e) => e.date >= t), d.settings.bufferDays);
  return days.map((day) => {
    const tasks = d.tasks.filter((x) => x.date === day);
    const ex = d.exams.filter((e) => e.date === day);
    const f = folga.get(day);
    if (!tasks.length && !ex.length && !f) return '';
    return `
      <div class="day">
        <div class="day-head"><b>${day === t ? 'Hoje' : fmt(day, 'weekday')}</b>
          ${ex.map((e) => chip(`📝 ${e.kind} ${subject(e.subjectId)?.name || ''} ${e.title}`, 'wine')).join('')}
          ${f && !ex.length ? chip(`🛟 folga antes de ${subject(f.subjectId)?.name || ''}`, 'sage') : ''}
        </div>
        ${tasks.map((x) => taskRow(x)).join('')}
      </div>`;
  }).join('') || '<p class="muted pad">Nada nas próximas 2 semanas.</p>';
}

function examBlock(e, s) {
  const tasks = D().tasks.filter((t) => t.examId === e.id);
  const done = tasks.filter((t) => t.done).length;
  const days = diffDays(today(), e.date);
  const past = days < 0;
  return `
    <article class="card exam" id="exam-${e.id}">
      <div class="row between">
        <div>
          <small class="mono">${esc(e.kind.toUpperCase())} · ${past ? 'JÁ FOI' : days === 0 ? 'HOJE' : `EM ${days} DIAS`}${e.weight ? ' · PESO ' + esc(e.weight) : ''}${e.points ? ` · ${esc(e.points)} PTS` : ''}${e.gcalId ? ' · 📅' : ''}</small>
          <h3>${esc(e.title)} <span class="muted">· ${fmt(e.date, 'weekday')}${e.time ? ' ' + e.time : ''}</span></h3>
        </div>
        <button class="icon" data-action="edit-exam" data-id="${e.id}" aria-label="Editar">✎</button>
      </div>
      ${e.dateMovedInGoogle ? `<p class="note">📅 A data foi alterada no Google Agenda. <button class="link" data-action="ack-move" data-id="${e.id}">Replanejar com a nova data</button></p>` : ''}
      ${(D().planWarnings || []).filter((w) => w.examId === e.id).map((w) => `<p class="note">⚠️ ${esc(w.msg)}</p>`).join('')}
      ${(() => { const heavy = [...new Set(tasks.filter((t) => !t.done).map((t) => t.date))].filter((day) => (D().planWarnings || []).some((w) => w.type === 'sobrecarga' && w.date === day)); return heavy.length ? `<p class="note">⚠️ Dias cheios: ${heavy.map((x) => fmt(x)).join(', ')}. Libere mais dias da semana para esta matéria, aumente os blocos por dia em Ajustes ou mova revisões tocando no conteúdo.</p>` : ''; })()}
      ${tasks.length ? `<div class="row between mono small"><span>PLANO DE ESTUDO</span><span>${done}/${tasks.length}</span></div>${bar((done / tasks.length) * 100, s.color)}` : ''}
      <div class="contents">
        ${units(e).map((u) => {
          const ts = tasks.filter((t) => t.contentId === u.id).sort((a, b) => a.date.localeCompare(b.date));
          const titles = u.contentIds.map((id) => e.contents.find((c) => c.id === id)?.title);
          return `
          <div class="content">
            <button class="content-title" data-action="content-open" data-exam="${e.id}" data-id="${u.id}">
              <b>${u.contentIds.length > 1 ? '🔗 ' : ''}${esc(titles.join(' + '))}</b><span class="chev">›</span>
            </button>
            <div class="steps">${ts.map((t) => `<button class="step ${t.done ? 'done' : ''} ${!t.done && t.date < today() ? 'late' : ''}" data-action="task-open" data-id="${t.id}" title="${taskLabel(t)}">${KIND_ICON[t.kind]} ${t.kind === 'estudo' ? 'Estudo' : t.kind === 'final' ? 'Final' : t.kind === 'extra' ? 'Extra' : 'R' + t.n} · ${fmt(t.date)}${t.pinned ? ' 📌' : ''}</button>`).join('') || (past ? '' : '<small class="muted">nada programado — toque no conteúdo para ajustar</small>')}</div>
          </div>`;
        }).join('')}
      </div>
      ${past ? '' : `
      <div class="add-contents">
        <textarea id="new-${e.id}" rows="2" placeholder="Adicionar conteúdos — um por linha&#10;ex.: Membrana plasmática"></textarea>
        <button class="btn small" data-action="add-contents" data-id="${e.id}">+ Adicionar e planejar</button>
      </div>`}
    </article>`;
}

export function examSheet(subjectId, e = null, date = '') {
  const s = subject(e?.subjectId || subjectId);
  const modular = s?.grading.mode === 'modular';
  sheet(`
    <h2>${e ? 'Editar avaliação' : 'Nova avaliação'}</h2>
    <div class="seg wide kinds">${EXAM_KINDS.map((k) => `<label><input type="radio" name="kind" value="${k}" ${(e?.kind || 'Prova') === k ? 'checked' : ''}><span>${k}</span></label>`).join('')}</div>
    <label class="field">Disciplina<select name="subjectId">${D().subjects.map((x) => `<option value="${x.id}" ${x.id === s?.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
    <label class="field">Nome<input name="title" required value="${esc(e?.title || '')}" placeholder="ex.: N1, P2, Seminário de histologia"></label>
    <div class="row gap">
      <label class="field grow">Data<input type="date" name="date" required value="${e?.date || date}"></label>
      <label class="field">Horário<input type="time" name="time" value="${e?.time || ''}"></label>
    </div>
    <div class="row gap">
      <label class="field grow">${modular ? 'Vale (pontos)' : 'Peso na média'}<input name="${modular ? 'points' : 'weight'}" inputmode="decimal" value="${esc((modular ? e?.points : e?.weight) || '')}" placeholder="${modular ? 'ex.: 40' : 'ex.: 1'}"></label>
      ${modular ? `<label class="field grow">Módulo<select name="moduleId">${s.grading.modules.map((m) => `<option value="${m.id}" ${m.id === e?.moduleId ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>` : ''}
    </div>
    ${e ? '' : '<label class="field">Conteúdos (um por linha — opcional)<textarea name="contents" rows="5" placeholder="Membrana plasmática&#10;Organelas&#10;Citoesqueleto"></textarea></label>'}
    <p class="muted small">A nota desta avaliação aparece sozinha na aba Notas.</p>
    <div class="row gap actions">
      ${e ? '<button class="btn danger" value="delete">Excluir</button>' : ''}
      <button class="btn ghost grow" type="button" data-action="close-sheet">Cancelar</button>
      <button class="btn grow" value="save">Salvar</button>
    </div>`, {
    onSubmit(data, form, submitter) {
      const d = D();
      if (submitter?.value === 'delete') {
        if (!confirm(`Excluir ${e.kind.toLowerCase()} ${e.title} e o plano dela? (a nota, se já lançada, fica guardada em Notas)`)) return true;
        d.exams = d.exams.filter((x) => x !== e);
        d.tasks = d.tasks.filter((t) => t.examId !== e.id);
        if (e.gcalId) (d.deletedExamEvents ||= []).push(e.gcalId);
        replan();
        return;
      }
      const target = e || { id: uid(), contents: [], removed: [] };
      Object.assign(target, {
        subjectId: data.subjectId, kind: data.kind || 'Prova', title: data.title.trim(), date: data.date, time: data.time,
        weight: (data.weight ?? target.weight ?? '').trim(), points: (data.points ?? target.points ?? '').trim(), moduleId: data.moduleId || target.moduleId,
        dirty: true, dateMovedInGoogle: false,
      });
      if (!e) {
        target.contents = (data.contents || '').split('\n').map((x) => x.trim()).filter(Boolean).map((title) => ({ id: uid(), title }));
        d.exams.push(target);
      }
      replan();
      toast(e ? 'Avaliação atualizada ✓' : target.contents.length ? 'Criada, plano gerado e nota adicionada em Notas ✓' : 'Criada e adicionada em Notas ✓');
    },
  });
}

function subjectSheet(s = null) {
  sheet(`
    <h2>${s ? 'Editar disciplina' : 'Nova disciplina'}</h2>
    <label class="field">Nome<input name="name" required value="${esc(s?.name || '')}" placeholder="ex.: Citologia"></label>
    <label class="field">Professor(a)<input name="professor" value="${esc(s?.professor || '')}"></label>
    <div class="field">Cor<div class="colors">${COLORS.map((c) => `<label><input type="radio" name="color" value="${c}" ${(s?.color || COLORS[D().subjects.length % COLORS.length]) === c ? 'checked' : ''}><i style="background:${c}"></i></label>`).join('')}</div></div>
    <div class="row gap actions">
      ${s ? '<button class="btn danger" value="delete">Excluir</button>' : ''}
      <button class="btn ghost grow" type="button" data-action="close-sheet">Cancelar</button>
      <button class="btn grow" value="save">Salvar</button>
    </div>`, {
    onSubmit(data, form, submitter) {
      const d = D();
      if (submitter?.value === 'delete') {
        if (!confirm(`Excluir ${s.name} com avaliações, plano, notas e presença?`)) return true;
        for (const e of d.exams.filter((x) => x.subjectId === s.id)) if (e.gcalId) (d.deletedExamEvents ||= []).push(e.gcalId);
        d.subjects = d.subjects.filter((x) => x !== s);
        d.exams = d.exams.filter((x) => x.subjectId !== s.id);
        d.tasks = d.tasks.filter((x) => x.subjectId !== s.id);
        location.hash = '#estudos';
        replan();
        return;
      }
      const target = s || newSubject(data.name.trim());
      Object.assign(target, { name: data.name.trim(), professor: data.professor.trim(), color: data.color || target.color });
      d.exams.filter((x) => x.subjectId === target.id).forEach((x) => (x.dirty = true));
      save();
      if (!s) location.hash = '#estudos/' + target.id;
    },
  });
}

function spacingPanel(s) {
  const gaps = gapsOf(s);
  const custom = !!s.gaps?.length;
  const key = custom ? Object.entries(SPACING_PRESETS).find(([, p]) => p.gaps.join() === s.gaps.join())?.[0] || 'custom' : 'auto';
  return `
    <div class="field">Espaçamento entre as revisões</div>
    <div class="chips">
      <button class="chip ${key === 'auto' ? 'on' : ''}" data-action="spacing" data-id="${s.id}" data-k="auto">Automático</button>
      ${Object.entries(SPACING_PRESETS).map(([k, p]) => `<button class="chip ${key === k ? 'on' : ''}" data-action="spacing" data-id="${s.id}" data-k="${k}">${p.label}</button>`).join('')}
    </div>
    <div class="gaps">
      ${gaps.map((g, i) => `<label><small>${i === 0 ? 'estudo → R1' : `R${i} → R${i + 1}`}</small><span><input inputmode="numeric" value="${g}" data-change="gap" data-id="${s.id}" data-i="${i}"> dias</span></label>`).join('')}
      <div class="gap-btns"><button class="icon small" data-action="gap-add" data-id="${s.id}" aria-label="Mais uma revisão">＋</button>${gaps.length > 1 ? `<button class="icon small" data-action="gap-del" data-id="${s.id}" aria-label="Uma revisão a menos">－</button>` : ''}</div>
    </div>
    <p class="muted small">Revisões em +${cumulative(gaps).join(', +')} dias depois do estudo${key === 'auto' ? ` (automático pela dificuldade ${s.difficulty})` : ''}. Se a matéria tem dia fixo, cai no dia de estudo mais próximo.</p>`;
}

export default {
  title: (id) => (id ? `<small class="kicker">Disciplina</small>${esc(subject(id)?.name || '')}` : 'Painel de <span class="script">disciplinas</span>'),
  render(id) {
    const d = D();
    if (id) {
      const s = subject(id);
      if (!s) return emptyState('Disciplina não encontrada', '', '<a class="btn" href="#estudos">Voltar</a>');
      const exams = subjectExams(s.id);
      return `
        <section class="card" style="--c:${s.color}">
          <div class="row between">
            <small class="muted">${s.professor ? 'Prof. ' + esc(s.professor) : 'Sem professor cadastrado'}</small>
            <button class="btn ghost small" data-action="edit-subject" data-id="${s.id}">Editar</button>
          </div>
          <div class="field">Dificuldade / prioridade no semestre</div>
          <div class="diff">${[1, 2, 3, 4, 5].map((n) => `<button class="${s.difficulty === n ? 'on' : ''}" data-action="set-diff" data-id="${s.id}" data-v="${n}"><b>${n}</b><small>${DIFF_TEXT[n]}</small></button>`).join('')}</div>
          <p class="muted small">Mais difícil = começa antes${s.gaps?.length ? '' : ' e ganha mais revisões'}.</p>

          <div class="field">Dias em que estudo esta matéria</div>
          <div class="chips">${[1, 2, 3, 4, 5, 6, 0].map((w) => `<button class="chip ${s.studyWeekdays.includes(w) ? 'on' : ''}" data-action="study-day" data-id="${s.id}" data-w="${w}">${WEEKDAYS[w]}</button>`).join('')}</div>
          <p class="muted small">${s.studyWeekdays.length ? `Estudos e revisões só caem ${s.studyWeekdays.map((w) => WEEKDAYS[w].toLowerCase()).join(', ')}.` : 'Sem dia fixo: o plano usa qualquer dia livre.'}</p>

          ${spacingPanel(s)}
        </section>
        <div class="row between section-head"><h2>Avaliações e conteúdos</h2><button class="btn small" data-action="new-exam" data-id="${s.id}">+ Avaliação</button></div>
        ${exams.length ? exams.map((e) => examBlock(e, s)).join('') : emptyState('Nada cadastrado ainda', 'Adicione provas, trabalhos ou seminários com a data. Com a lista de conteúdos, o plano de revisões é criado na hora — e a nota já aparece na aba Notas.')}
        <details class="card how">
          <summary>Como o plano funciona e o que dá para ajustar</summary>
          <ul>
            <li><b>📖 Estudo</b> → <b>🔁 revisões</b> com o espaçamento que você escolheu → <b>🎯 revisão final</b> antes da <b>🛟 folga</b> (${d.settings.bufferDays} dia(s)).</li>
            <li><b>Toque num conteúdo</b> para ver o plano dele: mudar datas 📌, desprogramar, adicionar revisão extra, associar com outro conteúdo (estudar junto) ou mover para outra avaliação.</li>
            <li>Na aba Hoje: deslize → para concluir e ← para adiar. O que você não fizer é reagendado sozinho.</li>
            <li>Revisar = <b>tentar lembrar</b> (questões, flashcards, explicar em voz alta), não só reler.</li>
          </ul>
        </details>`;
    }
    return `
      <section class="panel">
        <div class="panel-head"><span>Minhas disciplinas</span><button class="btn small" data-action="new-subject">+ Disciplina</button></div>
        ${d.subjects.length ? `<div class="subjects">${d.subjects.map(subjectCard).join('')}</div>` : '<p class="muted pad">Cadastre suas disciplinas do período para começar.</p>'}
      </section>
      ${d.planWarnings?.filter((w) => w.type !== 'apertado').slice(0, 2).map((w) => `<p class="note">⚠️ ${esc(w.msg)}</p>`).join('') || ''}
      <section class="panel">
        <div class="panel-head"><span>Cronograma · próximos 14 dias</span></div>
        ${schedule()}
      </section>`;
  },
  actions: {
    'new-subject': () => subjectSheet(),
    'edit-subject': (el) => subjectSheet(subject(el.dataset.id)),
    'new-exam': (el) => examSheet(el.dataset.id),
    'edit-exam': (el) => {
      const e = D().exams.find((x) => x.id === el.dataset.id);
      examSheet(e.subjectId, e);
    },
    'set-diff'(el) {
      subject(el.dataset.id).difficulty = Number(el.dataset.v);
      replan({ fresh: true });
      toast('Prioridade atualizada e plano refeito ✓');
    },
    'study-day'(el) {
      const s = subject(el.dataset.id);
      const w = Number(el.dataset.w);
      s.studyWeekdays = s.studyWeekdays.includes(w) ? s.studyWeekdays.filter((x) => x !== w) : [...s.studyWeekdays, w].sort();
      replan({ fresh: true });
      toast(s.studyWeekdays.length ? `${s.name} agora cai só em ${s.studyWeekdays.map((x) => WEEKDAYS[x].toLowerCase()).join(', ')} ✓` : 'Sem dia fixo ✓');
    },
    spacing(el) {
      const s = subject(el.dataset.id);
      s.gaps = el.dataset.k === 'auto' ? null : [...SPACING_PRESETS[el.dataset.k].gaps];
      replan({ fresh: true });
      toast('Espaçamento atualizado e revisões refeitas ✓');
    },
    'gap-add'(el) {
      const s = subject(el.dataset.id);
      const g = [...gapsOf(s)];
      g.push(Math.max(g.at(-1) * 2, 1));
      s.gaps = g;
      replan({ fresh: true });
    },
    'gap-del'(el) {
      const s = subject(el.dataset.id);
      s.gaps = gapsOf(s).slice(0, -1);
      replan({ fresh: true });
    },
    'add-contents'(el) {
      const e = D().exams.find((x) => x.id === el.dataset.id);
      const ta = document.getElementById('new-' + e.id);
      const lines = ta.value.split('\n').map((x) => x.trim()).filter(Boolean);
      if (!lines.length) return ta.focus();
      e.contents.push(...lines.map((title) => ({ id: uid(), title })));
      e.dirty = true;
      replan();
      toast(`${lines.length} conteúdo(s) planejado(s) ✓`);
    },
    'ack-move'(el) {
      D().exams.find((x) => x.id === el.dataset.id).dateMovedInGoogle = false;
      replan({ fresh: true });
    },
  },
  inputs: {
    gap(el) {
      const s = subject(el.dataset.id);
      const g = [...gapsOf(s)];
      g[Number(el.dataset.i)] = Math.max(1, Math.round(Number(el.value) || 1));
      s.gaps = g;
      replan({ fresh: true });
    },
  },
};

