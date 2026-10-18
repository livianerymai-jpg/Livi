import { D, save, subject, uid, exam, allComponents, syncExamComponents } from '../store.js';
import { esc, nf, num, chip, toast } from '../ui.js';
import { computeGrades, formulaOf, GRADE_TEMPLATES, MODULAR_TEMPLATE, codeFor } from '../logic/grades.js';
import { fmt } from '../logic/dates.js';
import { emptyState } from './common.js';
import { examSheet } from './estudos.js';

const STATUS = {
  aprovada: ['Aprovada', 'sage'],
  garantida: ['Aprovada', 'sage'],
  tranquilo: ['Tranquilo', 'sage'],
  atencao: ['Atenção', 'mustard'],
  dificil: ['Puxado', 'wine'],
  impossivel: ['Reprovação', 'wine'],
  reprovada: ['Reprovada', 'wine'],
};
const sid = () => location.hash.split('/')[1];
const showGrade = (v) => (v == null || v === '' ? '' : String(v).replace('.', ','));

function resultCard(s) {
  const r = computeGrades(s.grading);
  if (r.error) return `<div class="result"><small class="mono">FÓRMULA COM ERRO</small><p>${esc(r.error)}</p></div>`;
  if (r.empty || (!r.missing?.length && r.final == null)) {
    return `<div class="result"><small class="mono">RESULTADO · ${esc(s.name.toUpperCase())}</small><strong>—</strong><p>Cadastre provas e trabalhos em Estudos (elas aparecem aqui sozinhas) ou adicione avaliações abaixo.</p></div>`;
  }
  const modular = s.grading.mode === 'modular';
  const dec = r.scale === 100 ? 0 : 1;
  const names = r.missing?.map((c) => c.name || c.code).join(', ');
  let big;
  let text;
  if (r.status === 'aprovada') { big = nf(r.final, dec); text = `Nota final ${nf(r.final, dec)}. Aprovada! 🎉`; }
  else if (r.status === 'reprovada') { big = nf(r.final, dec); text = `Nota final ${nf(r.final, dec)} (mínimo ${nf(r.passing, dec)}${r.minModule != null ? `, e ${nf(r.minModule, dec)} em cada módulo` : ''}).`; }
  else if (r.status === 'garantida') { big = '0'; text = `Mesmo zerando ${names}, você já passa. 💪`; }
  else if (r.status === 'impossivel') { big = '—'; text = `Mesmo com nota máxima no que falta não chega ao mínimo. Converse com o professor sobre recuperação.`; }
  else if (modular) { big = `${Math.round(r.fraction * 100)}%`; text = `Precisa de ~${Math.round(r.fraction * 100)}% do valor de cada avaliação que falta: ${r.neededByComp.map((c) => `${esc(c.name)} ${nf(c.pts)}/${nf(c.max, 0)}`).join(' · ')}.`; }
  else { big = nf(r.needed); text = `${r.current != null ? `Média atual ${nf(r.current)}. ` : ''}Precisa de ${nf(r.needed)} em ${esc(names)} para fechar com ${nf(r.passing)}.`; }
  const pct = r.status === 'aprovada' || r.status === 'garantida' ? 100 : modular ? 100 - (r.fraction ?? 1) * 100 : r.needed != null ? 100 - r.needed * 10 : 0;
  return `
    <div class="result">
      <small class="mono">RESULTADO · ${esc(s.name.toUpperCase())}</small>
      <small>${r.status === 'aprovada' || r.status === 'reprovada' ? 'Nota final' : 'Você precisa tirar'}</small>
      <strong>${big}</strong>
      <div class="bar dark"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>
      <p>${text}</p>
      ${modular && r.modules?.length ? `<div class="mods">${r.modules.map((m) => `<span><small>${esc(m.name)}</small>${m.grade == null ? '—' : nf(m.grade, dec)}</span>`).join('')}</div>` : ''}
    </div>`;
}

function summaryRow(s) {
  const r = computeGrades(s.grading);
  const st = STATUS[r.status] || ['—', ''];
  const modular = s.grading.mode === 'modular';
  const items = modular ? (r.modules || []).map((m) => [m.name, m.grade == null ? '—' : nf(m.grade, r.scale === 100 ? 0 : 1)]) : s.grading.components.map((c) => [c.code, c.grade != null && c.grade !== '' ? nf(Number(c.grade)) : '—']);
  return `
    <a class="grade-row" href="#notas/${s.id}">
      <b><i class="dot" style="background:${s.color}"></i>${esc(s.name)}</b>
      <span class="grades">${items.map(([k, v]) => `<span><small>${esc(k)}</small>${v}</span>`).join('') || '<small>sem avaliações</small>'}</span>
      <span class="need"><small>precisa</small>${r.error ? '!' : modular && r.fraction ? Math.round(r.fraction * 100) + '%' : r.needed ? nf(r.needed) : '—'}</span>
      ${r.error ? chip('Erro', 'wine') : r.empty ? chip('—', '') : chip(st[0], st[1])}
    </a>`;
}

function linkedBadge(c) {
  if (!c.examId) return '';
  const e = exam(c.examId);
  return e ? `<button class="linked" data-action="open-exam" data-id="${e.id}">📝 ${esc(e.kind)} · ${fmt(e.date)}</button>` : '';
}

function gradeInput(c, max) {
  return `<input class="grade-in" inputmode="decimal" placeholder="—" value="${showGrade(c.grade)}" data-input="grade" data-id="${c.id}" aria-label="Nota de ${esc(c.name)}">${max ? `<small class="of">/ ${nf(Number(c.max) || 10, 0)}</small>` : ''}`;
}

function weightedView(s) {
  const g = s.grading;
  return `
    <section class="panel">
      <div class="panel-head"><span>Minhas notas</span></div>
      ${g.components.length ? g.components.map((c) => `
        <div class="grade-item">
          <div class="grow"><b>${esc(c.name || c.code)}</b>${linkedBadge(c)}<small class="mono">${esc(c.code)}${g.mode !== 'formula' ? ' · peso ' + nf(Number(c.weight) || 0, Number(c.weight) % 1 ? 1 : 0) : ''}</small></div>
          <div class="grade-box">${gradeInput(c, Number(c.max) !== 10)}</div>
        </div>`).join('') : '<p class="muted pad">As provas e trabalhos que você cadastrar em Estudos aparecem aqui sozinhos.</p>'}
      <div class="pad"><button class="btn ghost small" data-action="add-comp">+ Outra nota (participação, lista…)</button></div>
    </section>
    <section class="panel">
      <div class="panel-head"><span>Como o(a) professor(a) calcula</span></div>
      <div class="pad">
        ${modeSwitch(g)}
        ${g.mode !== 'formula' ? `<div class="chips">${Object.entries(GRADE_TEMPLATES).map(([k, t]) => `<button class="chip" data-action="template" data-k="${k}">${t.label}</button>`).join('')}</div>` : ''}
        <table class="comp">
          <thead><tr><th>Código</th><th>Nome</th>${g.mode !== 'formula' ? '<th>Peso</th>' : ''}<th>Máx.</th><th></th></tr></thead>
          <tbody>${g.components.map((c) => `
            <tr>
              <td><input value="${esc(c.code)}" data-input="comp" data-id="${c.id}" data-k="code" autocapitalize="characters"></td>
              <td><input value="${esc(c.name)}" data-input="comp" data-id="${c.id}" data-k="name" ${c.examId ? 'disabled title="Renomeie na aba Estudos"' : ''}></td>
              ${g.mode !== 'formula' ? `<td><input inputmode="decimal" value="${showGrade(c.weight)}" data-input="comp" data-id="${c.id}" data-k="weight"></td>` : ''}
              <td><input inputmode="decimal" value="${showGrade(c.max ?? 10)}" data-input="comp" data-id="${c.id}" data-k="max"></td>
              <td><button class="icon small" data-action="del-comp" data-id="${c.id}" aria-label="Remover">×</button></td>
            </tr>`).join('')}</tbody>
        </table>
        ${g.mode === 'formula' ? `
          <label class="field">Fórmula<input class="mono" value="${esc(g.formula)}" data-input="formula" placeholder="(N1 + N2*2 + T)/4"></label>
          <p class="muted small">Use os códigos acima, + − * / e parênteses. Também: <code>max(N1; N2)</code>, <code>min(…)</code>, <code>media(…)</code>, <code>soma(…)</code>. Decimais com vírgula: <code>0,4*N1</code>.</p>`
          : `<p class="muted small">Fórmula: <code class="mono" id="formulaPreview">${esc(formulaOf(g))}</code></p>`}
        <label class="field">Média para aprovação<input inputmode="decimal" value="${showGrade(g.passing)}" data-input="passing"></label>
        <p class="muted small">Na UFF a média de aprovação direta costuma ser 6,0 — confira no plano de ensino.</p>
      </div>
    </section>`;
}

function modularView(s) {
  const g = s.grading;
  const r = computeGrades(g);
  const dec = (Number(g.scale) || 10) === 100 ? 0 : 1;
  return `
    ${g.modules.map((m, mi) => {
      const p = r.modules?.find((x) => x.id === m.id);
      const pts = m.components.reduce((a, c) => a + (Number(c.max) || 0), 0);
      return `
      <section class="panel module">
        <div class="panel-head"><span>${esc(m.name)}</span><span class="mono">${p?.grade == null ? '—' : nf(p.grade, dec)} / ${g.scale}</span></div>
        ${m.components.map((c) => `
          <div class="grade-item">
            <div class="grow"><b>${esc(c.name)}</b>${linkedBadge(c)}<small class="mono">vale ${nf(Number(c.max) || 0, 0)} pts</small></div>
            <div class="grade-box">${gradeInput(c, true)}</div>
          </div>`).join('') || '<p class="muted pad small">Sem avaliações neste módulo.</p>'}
        <details class="mod-edit">
          <summary>Editar módulo · ${pts} pts no total</summary>
          <div class="pad">
            <div class="row gap">
              <label class="field grow">Nome<input value="${esc(m.name)}" data-input="mod" data-m="${m.id}" data-k="name"></label>
              <label class="field">Peso na média final<input inputmode="decimal" value="${showGrade(m.weight ?? 1)}" data-input="mod" data-m="${m.id}" data-k="weight"></label>
            </div>
            <table class="comp">
              <thead><tr><th>Avaliação</th><th>Vale</th><th></th></tr></thead>
              <tbody>${m.components.map((c) => `
                <tr>
                  <td><input value="${esc(c.name)}" data-input="comp" data-id="${c.id}" data-k="name" ${c.examId ? 'disabled' : ''}></td>
                  <td><input inputmode="decimal" value="${showGrade(c.max)}" data-input="comp" data-id="${c.id}" data-k="max"></td>
                  <td><button class="icon small" data-action="del-comp" data-id="${c.id}" aria-label="Remover">×</button></td>
                </tr>`).join('')}</tbody>
            </table>
            <div class="row gap wrap">
              <button class="btn ghost small" data-action="add-comp" data-m="${m.id}">+ Avaliação</button>
              <button class="btn ghost small" data-action="mod-template" data-m="${m.id}">Modelo: Cognitiva 40 · Tutoria 30 · Habilidades 30</button>
              ${g.modules.length > 1 ? `<button class="btn ghost small danger-text" data-action="del-mod" data-m="${m.id}">Excluir módulo</button>` : ''}
              ${mi > 0 ? `<button class="btn ghost small" data-action="mod-up" data-m="${m.id}">↑</button>` : ''}
            </div>
          </div>
        </details>
      </section>`;
    }).join('')}
    <button class="btn ghost" data-action="add-mod">+ Módulo</button>
    <section class="panel">
      <div class="panel-head"><span>Regras do sistema modular</span></div>
      <div class="pad">
        ${modeSwitch(g)}
        <div class="field">Escala das notas</div>
        <div class="seg wide"><button class="${(Number(g.scale) || 10) === 10 ? 'on' : ''}" data-action="scale" data-v="10">0 a 10</button><button class="${Number(g.scale) === 100 ? 'on' : ''}" data-action="scale" data-v="100">0 a 100</button></div>
        <div class="row gap">
          <label class="field grow">Nota final para aprovação<input inputmode="decimal" value="${showGrade(g.passing)}" data-input="passing"></label>
          <label class="field grow">Mínimo em cada módulo (opcional)<input inputmode="decimal" value="${showGrade(g.minModule)}" placeholder="—" data-input="minModule"></label>
        </div>
        <p class="muted small">Nota do módulo = pontos que você tirou ÷ pontos possíveis × escala. Nota final = média dos módulos (com os pesos). Ajuste conforme o regimento do seu curso.</p>
      </div>
    </section>`;
}

function modeSwitch(g) {
  return `<div class="seg wide"><button class="${g.mode === 'ponderada' || !g.mode ? 'on' : ''}" data-action="mode" data-v="ponderada">Com pesos</button><button class="${g.mode === 'formula' ? 'on' : ''}" data-action="mode" data-v="formula">Fórmula</button><button class="${g.mode === 'modular' ? 'on' : ''}" data-action="mode" data-v="modular">Modular</button></div>`;
}

export default {
  title: (id) => (id ? `<small class="kicker">Notas</small>${esc(subject(id)?.name || '')}` : 'Calculadora <span class="script">de média</span>'),
  render(id) {
    const d = D();
    if (!d.subjects.length) return emptyState('Sem disciplinas ainda', 'Cadastre suas disciplinas em Estudos.', '<a class="btn" href="#estudos">Ir para Estudos</a>');
    if (!id) {
      return `
        <section class="panel">
          <div class="panel-head"><span>Visão do período</span></div>
          ${d.subjects.map(summaryRow).join('')}
        </section>
        <p class="muted small center">Provas e trabalhos cadastrados em Estudos já aparecem aqui. Toque numa disciplina para lançar notas.</p>`;
    }
    const s = subject(id);
    if (!s) return emptyState('Disciplina não encontrada', '');
    syncExamComponents(s);
    return `<div id="gradeResult">${resultCard(s)}</div>${s.grading.mode === 'modular' ? modularView(s) : weightedView(s)}`;
  },
  actions: {
    'open-exam'(el) {
      const e = exam(el.dataset.id);
      examSheet(e.subjectId, e);
    },
    template(el) {
      const s = subject(sid());
      const t = GRADE_TEMPLATES[el.dataset.k];
      const g = s.grading;
      g.mode = t.mode;
      // mantém as notas ligadas às provas; completa com os espaços do modelo
      const linked = g.components.filter((c) => c.examId);
      const used = new Set(linked.map((c) => c.code));
      const extra = t.components.slice(linked.length).map(([code, name, weight]) => ({ id: uid(), code: codeFor(code, used), name, weight, max: 10, grade: null, auto: /^P\d+$/.test(code) }));
      t.components.slice(0, linked.length).forEach(([, , w], i) => (linked[i].weight = w));
      g.components = [...linked, ...extra];
      save();
      toast(`Modelo "${t.label}" aplicado ✓`);
    },
    mode(el) {
      const s = subject(sid());
      const g = s.grading;
      const to = el.dataset.v;
      if (to === g.mode) return;
      if (to === 'modular' && g.mode !== 'modular') {
        g.modules = g.modules?.length ? g.modules : [{ id: uid(), name: 'Módulo 1', weight: 1, components: g.components.map((c) => ({ ...c, max: Number(c.max) || 10 })) }];
        g.components = [];
        if ((Number(g.scale) || 10) === 10 && Number(g.passing) === 6) g.passing = 6;
      } else if (to !== 'modular' && g.mode === 'modular') {
        g.components = g.modules.flatMap((m) => m.components);
        g.modules = [];
      }
      g.mode = to;
      if (to === 'formula' && !g.formula) g.formula = formulaOf({ ...g, mode: 'ponderada' });
      save();
    },
    'add-comp'(el) {
      const s = subject(sid());
      const g = s.grading;
      const used = new Set(allComponents(g).map((c) => c.code));
      const n = allComponents(g).length + 1;
      const c = { id: uid(), code: codeFor('A' + n, used), name: `Avaliação ${n}`, weight: 1, max: 10, grade: null };
      if (g.mode === 'modular') g.modules.find((m) => m.id === el.dataset.m).components.push(c);
      else g.components.push(c);
      save();
    },
    'del-comp'(el) {
      const s = subject(sid());
      const g = s.grading;
      const c = allComponents(g).find((x) => x.id === el.dataset.id);
      if (c.examId && !confirm(`"${c.name}" está ligada a uma avaliação da aba Estudos. Remover só a nota daqui? (ela volta se você editar a avaliação)`)) return;
      if (g.mode === 'modular') for (const m of g.modules) m.components = m.components.filter((x) => x !== c);
      else g.components = g.components.filter((x) => x !== c);
      save();
    },
    'add-mod'() {
      const g = subject(sid()).grading;
      g.modules.push({ id: uid(), name: `Módulo ${g.modules.length + 1}`, weight: 1, components: [] });
      save();
    },
    'del-mod'(el) {
      const g = subject(sid()).grading;
      const m = g.modules.find((x) => x.id === el.dataset.m);
      if (!confirm(`Excluir ${m.name} e as notas dele?`)) return;
      g.modules = g.modules.filter((x) => x !== m);
      save();
    },
    'mod-up'(el) {
      const g = subject(sid()).grading;
      const i = g.modules.findIndex((x) => x.id === el.dataset.m);
      [g.modules[i - 1], g.modules[i]] = [g.modules[i], g.modules[i - 1]];
      save();
    },
    'mod-template'(el) {
      const g = subject(sid()).grading;
      const m = g.modules.find((x) => x.id === el.dataset.m);
      const scale = Number(g.scale) || 10;
      const existing = new Set(m.components.map((c) => c.name));
      for (const [name, pts] of MODULAR_TEMPLATE) if (!existing.has(name)) m.components.push({ id: uid(), code: codeFor(name, new Set()), name, weight: 1, max: scale === 100 ? pts : pts / 10, grade: null });
      save();
    },
    scale(el) {
      const g = subject(sid()).grading;
      const to = Number(el.dataset.v);
      const from = Number(g.scale) || 10;
      if (to === from) return;
      const k = to / from;
      g.scale = to;
      g.passing = Math.round((Number(g.passing) || 6) * k * 10) / 10;
      if (g.minModule != null && g.minModule !== '') g.minModule = Math.round(Number(g.minModule) * k * 10) / 10;
      save();
    },
  },
  inputs: {
    grade(el) {
      update((s) => {
        const c = allComponents(s.grading).find((x) => x.id === el.dataset.id);
        const v = num(el.value);
        c.grade = v == null ? null : Math.min(v, Number(c.max) || (s.grading.mode === 'modular' ? Infinity : 10));
      });
    },
    comp(el) {
      update((s) => {
        const c = allComponents(s.grading).find((x) => x.id === el.dataset.id);
        const k = el.dataset.k;
        c[k] = k === 'code' ? el.value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '') : k === 'name' ? el.value : num(el.value) ?? 0;
      });
    },
    mod(el) {
      update((s) => {
        const m = s.grading.modules.find((x) => x.id === el.dataset.m);
        m[el.dataset.k] = el.dataset.k === 'name' ? el.value : num(el.value) ?? 1;
      });
    },
    formula(el) { update((s) => { s.grading.formula = el.value; }); },
    passing(el) { update((s) => { s.grading.passing = num(el.value) ?? 6; }); },
    minModule(el) { update((s) => { s.grading.minModule = num(el.value); }); },
  },
};

// Atualiza sem redesenhar a tela (para não fechar o teclado)
function update(fn) {
  const s = subject(sid());
  fn(s);
  save({ silent: true });
  document.getElementById('gradeResult').innerHTML = resultCard(s);
  const fp = document.getElementById('formulaPreview');
  if (fp) fp.textContent = formulaOf(s.grading);
}
