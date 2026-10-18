import { D, save, subject, uid } from '../store.js';
import { esc, nf, num, chip, toast } from '../ui.js';
import { computeGrades, formulaOf, GRADE_TEMPLATES } from '../logic/grades.js';
import { emptyState } from './common.js';

const STATUS = {
  aprovada: ['Aprovada', 'sage'],
  garantida: ['Aprovada', 'sage'],
  tranquilo: ['Tranquilo', 'sage'],
  atencao: ['Atenção', 'mustard'],
  dificil: ['Puxado', 'wine'],
  impossivel: ['Reprovação', 'wine'],
  reprovada: ['Reprovada', 'wine'],
};

function resultCard(s) {
  const r = computeGrades(s.grading);
  if (r.error) return `<div class="result"><small class="mono">FÓRMULA COM ERRO</small><p>${esc(r.error)}</p></div>`;
  const names = r.missing?.map((c) => c.name || c.code).join(', ');
  let big;
  let text;
  if (r.status === 'aprovada') { big = nf(r.final); text = `Média final ${nf(r.final)}. Aprovada! 🎉`; }
  else if (r.status === 'reprovada') { big = nf(r.final); text = `Média final ${nf(r.final)} (mínimo ${nf(r.passing)}).`; }
  else if (r.status === 'garantida') { big = '0'; text = `Mesmo tirando 0 em ${names}, você já fecha com ${nf(r.passing)}.`; }
  else if (r.status === 'impossivel') { big = '—'; text = `Mesmo com nota máxima em ${names} não chega a ${nf(r.passing)}. Veja recuperação/VS com o professor.`; }
  else { big = nf(r.needed); text = `${r.current != null ? `Média atual ${nf(r.current)}. ` : ''}Precisa de ${nf(r.needed)} em ${names} para fechar com ${nf(r.passing)}.`; }
  const pct = r.status === 'aprovada' || r.status === 'garantida' ? 100 : r.needed != null ? 100 - r.needed * 10 : 0;
  return `
    <div class="result">
      <small class="mono">RESULTADO · ${esc(s.name.toUpperCase())}</small>
      <small>${r.status === 'aprovada' || r.status === 'reprovada' ? 'Média final' : 'Você precisa tirar'}</small>
      <strong>${big}</strong>
      <div class="bar dark"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>
      <p>${text}</p>
    </div>`;
}

function summaryRow(s) {
  const r = computeGrades(s.grading);
  const st = STATUS[r.status] || ['—', ''];
  return `
    <a class="grade-row" href="#notas/${s.id}">
      <b><i class="dot" style="background:${s.color}"></i>${esc(s.name)}</b>
      <span class="grades">${s.grading.components.map((c) => `<span><small>${esc(c.code)}</small>${c.grade != null && c.grade !== '' ? nf(Number(c.grade)) : '—'}</span>`).join('')}</span>
      <span class="need"><small>precisa</small>${r.error ? '!' : r.needed ? nf(r.needed) : '—'}</span>
      ${r.error ? chip('Erro', 'wine') : chip(st[0], st[1])}
    </a>`;
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
        <p class="muted small center">Toque numa disciplina para lançar notas e definir como o professor calcula.</p>`;
    }
    const s = subject(id);
    if (!s) return emptyState('Disciplina não encontrada', '');
    const g = s.grading;
    return `
      <div id="gradeResult">${resultCard(s)}</div>

      <section class="panel">
        <div class="panel-head"><span>Minhas notas</span></div>
        <div class="grade-inputs">
          ${g.components.map((c) => `
            <label class="field"><span>${esc(c.name || c.code)} <small class="mono">${esc(c.code)}${g.mode !== 'formula' ? ' · peso ' + esc(c.weight) : ''}</small></span>
              <input inputmode="decimal" placeholder="—" value="${c.grade == null ? '' : String(c.grade).replace('.', ',')}" data-input="grade" data-id="${c.id}"></label>`).join('')}
        </div>
      </section>

      <section class="panel">
        <div class="panel-head"><span>Como o(a) professor(a) calcula</span></div>
        <div class="pad">
          <div class="chips">${Object.entries(GRADE_TEMPLATES).map(([k, t]) => `<button class="chip" data-action="template" data-k="${k}">${t.label}</button>`).join('')}</div>
          <div class="seg wide"><button class="${g.mode !== 'formula' ? 'on' : ''}" data-action="mode" data-v="ponderada">Média com pesos</button><button class="${g.mode === 'formula' ? 'on' : ''}" data-action="mode" data-v="formula">Fórmula própria</button></div>
          <table class="comp">
            <thead><tr><th>Código</th><th>Nome</th>${g.mode !== 'formula' ? '<th>Peso</th>' : ''}<th>Máx.</th><th></th></tr></thead>
            <tbody>${g.components.map((c) => `
              <tr>
                <td><input value="${esc(c.code)}" data-input="comp" data-id="${c.id}" data-k="code" autocapitalize="characters"></td>
                <td><input value="${esc(c.name)}" data-input="comp" data-id="${c.id}" data-k="name"></td>
                ${g.mode !== 'formula' ? `<td><input inputmode="decimal" value="${esc(c.weight)}" data-input="comp" data-id="${c.id}" data-k="weight"></td>` : ''}
                <td><input inputmode="decimal" value="${esc(c.max ?? 10)}" data-input="comp" data-id="${c.id}" data-k="max"></td>
                <td><button class="icon small" data-action="del-comp" data-id="${c.id}" aria-label="Remover">×</button></td>
              </tr>`).join('')}</tbody>
          </table>
          <button class="btn ghost small" data-action="add-comp">+ Avaliação (prova, trabalho, seminário…)</button>
          ${g.mode === 'formula' ? `
            <label class="field">Fórmula<input class="mono" value="${esc(g.formula)}" data-input="formula" placeholder="(P1 + P2*2 + T)/4"></label>
            <p class="muted small">Use os códigos acima, + − * / e parênteses. Também: <code>max(P1; P2)</code>, <code>min(…)</code>, <code>media(…)</code>, <code>soma(…)</code>. Decimais com vírgula: <code>0,4*P1</code>.</p>`
            : `<p class="muted small">Fórmula: <code class="mono" id="formulaPreview">${esc(formulaOf(g))}</code></p>`}
          <label class="field">Média para aprovação<input inputmode="decimal" value="${g.passing}" data-input="passing"></label>
          <p class="muted small">Na UFF a média de aprovação direta costuma ser 6,0 — confira no plano de ensino da disciplina.</p>
        </div>
      </section>`;
  },
  actions: {
    template(el) {
      const s = subject(location.hash.split('/')[1]);
      const t = GRADE_TEMPLATES[el.dataset.k];
      const old = new Map(s.grading.components.map((c) => [c.code, c.grade]));
      s.grading.mode = t.mode;
      s.grading.formula = t.formula || '';
      s.grading.components = t.components.map(([code, name, weight]) => ({ id: uid(), code, name, weight, max: 10, grade: old.get(code) ?? null }));
      save();
      toast(`Modelo "${t.label}" aplicado — ajuste se precisar.`);
    },
    mode(el) {
      const s = subject(location.hash.split('/')[1]);
      s.grading.mode = el.dataset.v;
      if (el.dataset.v === 'formula' && !s.grading.formula) s.grading.formula = formulaOf({ ...s.grading, mode: 'ponderada' });
      save();
    },
    'add-comp'() {
      const s = subject(location.hash.split('/')[1]);
      const n = s.grading.components.length + 1;
      s.grading.components.push({ id: uid(), code: `A${n}`, name: `Avaliação ${n}`, weight: 1, max: 10, grade: null });
      save();
    },
    'del-comp'(el) {
      const s = subject(location.hash.split('/')[1]);
      s.grading.components = s.grading.components.filter((c) => c.id !== el.dataset.id);
      save();
    },
  },
  inputs: {
    grade(el) { update(el, (s) => { s.grading.components.find((c) => c.id === el.dataset.id).grade = num(el.value); }); },
    comp(el) {
      update(el, (s) => {
        const c = s.grading.components.find((x) => x.id === el.dataset.id);
        const k = el.dataset.k;
        c[k] = k === 'code' ? el.value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '') : k === 'name' ? el.value : num(el.value) ?? 0;
      });
    },
    formula(el) { update(el, (s) => { s.grading.formula = el.value; }); },
    passing(el) { update(el, (s) => { s.grading.passing = num(el.value) ?? 6; }); },
  },
};

// Atualiza sem redesenhar a tela (para não fechar o teclado)
function update(el, fn) {
  const s = subject(location.hash.split('/')[1]);
  fn(s);
  save({ silent: true });
  document.getElementById('gradeResult').innerHTML = resultCard(s);
  const fp = document.getElementById('formulaPreview');
  if (fp) fp.textContent = formulaOf(s.grading);
}
