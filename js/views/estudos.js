import { D, save, subject, subjectExams, replan, uid, newSubject, COLORS } from '../store.js';
import { esc, sheet, toast, bar, chip } from '../ui.js';
import { today, diffDays, fmt, addDays } from '../logic/dates.js';
import { taskLabel, folgaDays } from '../logic/planner.js';
import { taskRow, toggleTask, emptyState, KIND_ICON } from './common.js';

const DIFF_TEXT = ['', 'Tranquila', 'Leve', 'Média', 'Difícil', 'Muito difícil'];

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
      <small class="mono">${Math.round(p.pct)}% · ${next ? `PROVA EM ${diffDays(today(), next.date)} DIAS` : 'SEM PROVA MARCADA'}</small>
    </a>`;
}

function schedule() {
  const d = D();
  const t = today();
  const days = Array.from({ length: 14 }, (_, i) => addDays(t, i));
  const folga = folgaDays(d.exams.filter((e) => e.date >= t), d.settings.bufferDays);
  const examsOn = (day) => d.exams.filter((e) => e.date === day);
  return days.map((day) => {
    const tasks = d.tasks.filter((x) => x.date === day);
    const ex = examsOn(day);
    const f = folga.get(day);
    if (!tasks.length && !ex.length && !f) return '';
    return `
      <div class="day">
        <div class="day-head"><b>${day === t ? 'Hoje' : fmt(day, 'weekday')}</b>
          ${ex.map((e) => chip(`📝 prova ${subject(e.subjectId)?.name || ''} ${e.title}`, 'wine')).join('')}
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
          <small class="mono">${past ? 'JÁ FOI' : days === 0 ? 'HOJE' : `EM ${days} DIAS`}${e.weight ? ' · PESO ' + esc(e.weight) : ''}${e.gcalId ? ' · 📅' : ''}</small>
          <h3>${esc(e.title)} <span class="muted">· ${fmt(e.date, 'weekday')}${e.time ? ' ' + e.time : ''}</span></h3>
        </div>
        <button class="icon" data-action="edit-exam" data-id="${e.id}" aria-label="Editar prova">✎</button>
      </div>
      ${e.dateMovedInGoogle ? '<p class="note">📅 A data foi alterada no Google Agenda. <button class="link" data-action="ack-move" data-id="' + e.id + '">Replanejar com a nova data</button></p>' : ''}
      ${tasks.length ? `<div class="row between mono small"><span>PLANO DE ESTUDO</span><span>${done}/${tasks.length}</span></div>${bar((done / tasks.length) * 100, s.color)}` : ''}
      <div class="contents">
        ${e.contents.map((c) => {
          const ts = tasks.filter((t) => t.contentId === c.id);
          return `
          <div class="content">
            <div class="row between"><b>${esc(c.title)}</b><button class="icon small" data-action="del-content" data-exam="${e.id}" data-id="${c.id}" aria-label="Remover">×</button></div>
            <div class="steps">${ts.map((t) => `<button class="step ${t.done ? 'done' : ''} ${!t.done && t.date < today() ? 'late' : ''}" data-action="toggle-step" data-id="${t.id}" title="${taskLabel(t)}">${KIND_ICON[t.kind]} ${t.kind === 'estudo' ? 'Estudo' : t.kind === 'final' ? 'Final' : 'R' + t.n} · ${fmt(t.date)}</button>`).join('') || (past ? '' : '<small class="muted">sem tempo para revisões antes da prova</small>')}</div>
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

function examSheet(subjectId, e = null) {
  sheet(`
    <h2>${e ? 'Editar prova' : 'Nova prova'}</h2>
    <label class="field">Disciplina<select name="subjectId">${D().subjects.map((s) => `<option value="${s.id}" ${s.id === (e?.subjectId || subjectId) ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
    <label class="field">Nome<input name="title" required value="${esc(e?.title || '')}" placeholder="ex.: N1, P2, Prática"></label>
    <div class="row gap">
      <label class="field grow">Data<input type="date" name="date" required value="${e?.date || ''}"></label>
      <label class="field">Horário<input type="time" name="time" value="${e?.time || ''}"></label>
    </div>
    <label class="field">Peso (opcional)<input name="weight" value="${esc(e?.weight || '')}" placeholder="ex.: 4"></label>
    ${e ? '' : '<label class="field">Conteúdos (um por linha)<textarea name="contents" rows="5" placeholder="Membrana plasmática&#10;Organelas&#10;Citoesqueleto"></textarea></label>'}
    <div class="row gap actions">
      ${e ? '<button class="btn danger" value="delete">Excluir</button>' : ''}
      <button class="btn ghost grow" type="button" data-action="close-sheet">Cancelar</button>
      <button class="btn grow" value="save">Salvar</button>
    </div>`, {
    onSubmit(data, form, submitter) {
      const d = D();
      if (submitter?.value === 'delete') {
        if (!confirm('Excluir esta prova e o plano de estudos dela?')) return true;
        d.exams = d.exams.filter((x) => x !== e);
        d.tasks = d.tasks.filter((t) => t.examId !== e.id);
        d.cards.forEach((c) => { if (c.examId === e.id) c.examId = null; });
        if (e.gcalId) (d.deletedExamEvents ||= []).push(e.gcalId);
        replan();
        return;
      }
      const target = e || { id: uid(), contents: [] };
      Object.assign(target, { subjectId: data.subjectId, title: data.title.trim(), date: data.date, time: data.time, weight: data.weight.trim(), dirty: true, dateMovedInGoogle: false });
      if (!e) {
        target.contents = (data.contents || '').split('\n').map((x) => x.trim()).filter(Boolean).map((title) => ({ id: uid(), title }));
        d.exams.push(target);
      }
      replan();
      toast(e ? 'Prova atualizada ✓' : target.contents.length ? 'Prova criada e plano gerado ✓' : 'Prova criada ✓');
    },
  });
}

function subjectSheet(s = null) {
  sheet(`
    <h2>${s ? 'Editar disciplina' : 'Nova disciplina'}</h2>
    <label class="field">Nome<input name="name" required value="${esc(s?.name || '')}" placeholder="ex.: Citologia"></label>
    <label class="field">Professor(a)<input name="professor" value="${esc(s?.professor || '')}"></label>
    <div class="field">Cor<div class="colors">${COLORS.map((c, i) => `<label><input type="radio" name="color" value="${c}" ${(s?.color || COLORS[D().subjects.length % COLORS.length]) === c ? 'checked' : ''}><i style="background:${c}"></i></label>`).join('')}</div></div>
    <div class="row gap actions">
      ${s ? '<button class="btn danger" value="delete">Excluir</button>' : ''}
      <button class="btn ghost grow" type="button" data-action="close-sheet">Cancelar</button>
      <button class="btn grow" value="save">Salvar</button>
    </div>`, {
    onSubmit(data, form, submitter) {
      const d = D();
      if (submitter?.value === 'delete') {
        if (!confirm(`Excluir ${s.name} com provas, plano, notas, presença e flashcards?`)) return true;
        for (const e of d.exams.filter((x) => x.subjectId === s.id)) if (e.gcalId) (d.deletedExamEvents ||= []).push(e.gcalId);
        d.subjects = d.subjects.filter((x) => x !== s);
        d.exams = d.exams.filter((x) => x.subjectId !== s.id);
        d.tasks = d.tasks.filter((x) => x.subjectId !== s.id);
        d.cards = d.cards.filter((x) => x.subjectId !== s.id);
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
            <div><small class="muted">${s.professor ? 'Prof. ' + esc(s.professor) : 'Sem professor cadastrado'}</small></div>
            <button class="btn ghost small" data-action="edit-subject" data-id="${s.id}">Editar</button>
          </div>
          <div class="field">Dificuldade / prioridade no semestre</div>
          <div class="diff">${[1, 2, 3, 4, 5].map((n) => `<button class="${s.difficulty === n ? 'on' : ''}" data-action="set-diff" data-id="${s.id}" data-v="${n}"><b>${n}</b><small>${DIFF_TEXT[n]}</small></button>`).join('')}</div>
          <p class="muted small">Quanto mais difícil, mais cedo o plano começa e mais revisões ela ganha (${s.difficulty >= 4 ? '4–5' : '2–3'} revisões por conteúdo).</p>
        </section>
        <div class="row between section-head"><h2>Provas e conteúdos</h2><button class="btn small" data-action="new-exam" data-id="${s.id}">+ Prova</button></div>
        ${exams.length ? exams.map((e) => examBlock(e, s)).join('') : emptyState('Nenhuma prova ainda', 'Adicione a prova com a data e a lista de conteúdos — o plano com revisões espaçadas é criado na hora.')}
        <details class="card how">
          <summary>Como o plano é montado?</summary>
          <ul>
            <li><b>📖 Estudo</b> do conteúdo, depois <b>🔁 revisões</b> em intervalos crescentes (1, 3, 7, 14 dias) — o efeito de espaçamento é uma das técnicas com mais evidência para memória de longo prazo.</li>
            <li>Revisar = <b>tentar lembrar</b> (questões, flashcards, explicar em voz alta), não só reler.</li>
            <li><b>🎯 Revisão final</b> pouco antes da folga, e <b>🛟 ${d.settings.bufferDays} dia(s) de folga</b> antes de cada prova sem conteúdo novo.</li>
            <li>Respeita sua capacidade diária (${d.settings.dailyCapacity} blocos) e os dias sem estudo — ajuste em ⚙️ Ajustes.</li>
          </ul>
        </details>`;
    }
    return `
      <section class="panel">
        <div class="panel-head"><span>Minhas disciplinas</span><button class="btn small" data-action="new-subject">+ Disciplina</button></div>
        ${d.subjects.length ? `<div class="subjects">${d.subjects.map(subjectCard).join('')}</div>` : '<p class="muted pad">Cadastre suas disciplinas do período para começar.</p>'}
      </section>
      ${d.planWarnings?.some((w) => w.type === 'sobrecarga') ? '<p class="note">⚠️ Alguns dias passaram da sua capacidade diária. Aumente a capacidade em Ajustes ou adiante o início dos estudos.</p>' : ''}
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
      replan();
      toast('Prioridade atualizada e plano refeito ✓');
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
    'del-content'(el) {
      const e = D().exams.find((x) => x.id === el.dataset.exam);
      const c = e.contents.find((x) => x.id === el.dataset.id);
      if (!confirm(`Remover "${c.title}" do plano?`)) return;
      e.contents = e.contents.filter((x) => x !== c);
      D().tasks = D().tasks.filter((t) => t.contentId !== c.id);
      e.dirty = true;
      replan();
    },
    'toggle-step'(el) {
      const t = D().tasks.find((x) => x.id === el.dataset.id);
      t.done = !t.done;
      t.doneAt = t.done ? today() : null;
      save();
    },
    'ack-move'(el) {
      D().exams.find((x) => x.id === el.dataset.id).dateMovedInGoogle = false;
      replan();
    },
  },
  inputs: { 'toggle-task': toggleTask },
};
