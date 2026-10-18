import { D, save, subject, exam, uid } from '../store.js';
import { esc, sheet, toast, chip } from '../ui.js';
import { today, fmt, addDays } from '../logic/dates.js';
import { ankiAddURL, examRecommendation, examTag, deckName, exportAnkiTxt } from '../logic/anki.js';
import { rerender } from '../bus.js';
import { subjectOptions, emptyState } from './common.js';

let filter = '';
let draft = { subjectId: '', examId: '', type: 'basic' };
let queue = [];

function examOptions(subjectId, selected) {
  const list = D().exams.filter((e) => e.subjectId === subjectId && e.date >= today()).sort((a, b) => a.date.localeCompare(b.date));
  return `<option value="">Sem prova específica</option>` + list.map((e) => `<option value="${e.id}" ${e.id === selected ? 'selected' : ''}>${esc(e.title)} · ${fmt(e.date)}</option>`).join('');
}

function send(card) {
  const cfg = D().settings.anki;
  card.sentAt = Date.now();
  save({ silent: true });
  location.href = ankiAddURL(card, cfg, subject(card.subjectId), exam(card.examId));
}

function sendNext() {
  const id = queue.shift();
  const card = D().cards.find((c) => c.id === id);
  if (card) send(card);
  rerender();
}

// ao voltar do Anki, oferece o próximo da fila
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && queue.length) {
    toast(`Faltam ${queue.length} card(s) para o Anki`, { label: 'Enviar próximo', run: sendNext });
  }
});

function prepPanel(e) {
  const d = D();
  const s = subject(e.subjectId);
  const cards = d.cards.filter((c) => c.examId === e.id);
  if (!cards.length) return '';
  const rec = examRecommendation({ cards: cards.length, exam: e, today: today(), bufferDays: d.settings.bufferDays });
  const pending = cards.filter((c) => !c.sentAt).length;
  const tag = examTag(s, e);
  return `
    <article class="card prep" style="--c:${s?.color}">
      <div class="row between">
        <div><small class="mono">PREPARAÇÃO · EM ${rec.daysUntil} DIAS</small><h3>${esc(s?.name)} ${esc(e.title)}</h3></div>
        <strong class="big">${cards.length}<small> cards</small></strong>
      </div>
      <ul class="facts">
        <li>Baralho: <code>${esc(deckName(d.settings.anki, s))}</code></li>
        <li>Etiqueta: <code>${esc(tag)}</code></li>
        <li>Para ver tudo antes da folga: <b>${rec.newPerDay} cards novos/dia</b> (${rec.studyDays} dias de estudo).</li>
      </ul>
      <details>
        <summary>Configurar no Anki para esta prova</summary>
        <ol>
          <li>No AnkiMobile, abra as <b>Opções do baralho</b> <code>${esc(deckName(d.settings.anki, s))}</code> e coloque <b>Novos cards/dia = ${rec.newPerDay}</b>.</li>
          <li>Deixe o <b>FSRS</b> ligado com retenção desejada ~0,90.</li>
          <li>No 1º dia da folga (${fmt(addDays(e.date, -d.settings.bufferDays))}), crie um <b>Baralho filtrado</b> com a busca <code>tag:${esc(tag)}</code>, limite 9999, e <b>desmarque</b> “Reagendar cards com base nas minhas respostas” — assim você revisa tudo para a prova sem bagunçar o agendamento de longo prazo.</li>
        </ol>
      </details>
      ${pending ? `<button class="btn grow" data-action="send-all" data-exam="${e.id}">Enviar ${pending} pendente(s) ao Anki</button>` : `<p class="mono small ok-text">✓ TODOS NO ANKI</p>`}
    </article>`;
}

function cardRow(c) {
  const s = subject(c.subjectId);
  const e = exam(c.examId);
  return `
    <article class="fcard">
      <div class="row between"><small><i class="dot" style="background:${s?.color}"></i>${esc(s?.name || '')}${e ? ' · ' + esc(e.title) : ''}${c.type === 'cloze' ? ' · omissão' : ''}</small>${c.sentAt ? chip('no Anki', 'sage') : chip('pendente', 'mustard')}</div>
      <b>${esc(c.front)}</b>
      ${c.back ? `<p>${esc(c.back)}</p>` : ''}
      <div class="row gap"><button class="btn ghost small" data-action="send" data-id="${c.id}">${c.sentAt ? 'Reenviar' : 'Enviar ao Anki'}</button><button class="btn ghost small" data-action="edit" data-id="${c.id}">Editar</button><button class="icon small" data-action="del" data-id="${c.id}" aria-label="Apagar">🗑</button></div>
    </article>`;
}

function cardSheet(c) {
  sheet(`
    <h2>Editar flashcard</h2>
    <label class="field">Disciplina<select name="subjectId">${subjectOptions(c.subjectId)}</select></label>
    <label class="field">Prova<select name="examId">${examOptions(c.subjectId, c.examId)}</select></label>
    <label class="field">Frente${c.type === 'cloze' ? ' (texto com {{c1::lacuna}})' : ''}<textarea name="front" rows="3" required>${esc(c.front)}</textarea></label>
    <label class="field">Verso${c.type === 'cloze' ? ' extra' : ''}<textarea name="back" rows="3">${esc(c.back)}</textarea></label>
    <div class="row gap actions"><button class="btn ghost grow" type="button" data-action="close-sheet">Cancelar</button><button class="btn grow">Salvar</button></div>`, {
    onSubmit(data) {
      Object.assign(c, { subjectId: data.subjectId, examId: data.examId || null, front: data.front.trim(), back: data.back.trim(), sentAt: null });
      save();
      toast('Salvo. Reenvie ao Anki para atualizar lá (o Anki cria um card novo).');
    },
  });
}

export default {
  title: 'Flashcards <span class="script">no Anki</span>',
  render() {
    const d = D();
    if (!d.subjects.length) return emptyState('Sem disciplinas ainda', 'Cadastre suas disciplinas em Estudos para criar flashcards.', '<a class="btn" href="#estudos">Ir para Estudos</a>');
    if (!draft.subjectId || !d.subjects.some((s) => s.id === draft.subjectId)) draft.subjectId = d.subjects[0].id;
    if (draft.examId === '') draft.examId = d.exams.filter((e) => e.subjectId === draft.subjectId && e.date >= today()).sort((a, b) => a.date.localeCompare(b.date))[0]?.id ?? null;
    const cloze = draft.type === 'cloze';
    const exams = d.exams.filter((e) => e.date >= today()).sort((a, b) => a.date.localeCompare(b.date));
    const list = d.cards.filter((c) => !filter || c.subjectId === filter).sort((a, b) => b.created - a.created);
    return `
      ${queue.length ? `<div class="sync ok"><span>Fila para o Anki: ${queue.length}</span><button class="btn small" data-action="next">Enviar próximo</button></div>` : ''}
      <section class="panel">
        <div class="panel-head"><span>Novo flashcard</span><button class="link" data-action="bulk">vários de uma vez</button></div>
        <div class="pad form">
          <div class="row gap">
            <label class="field grow">Disciplina<select data-change="draft-subject">${subjectOptions(draft.subjectId)}</select></label>
            <label class="field grow">Prova<select data-change="draft-exam">${examOptions(draft.subjectId, draft.examId)}</select></label>
          </div>
          <div class="seg wide"><button class="${!cloze ? 'on' : ''}" data-action="type" data-v="basic">Pergunta e resposta</button><button class="${cloze ? 'on' : ''}" data-action="type" data-v="cloze">Omissão (lacuna)</button></div>
          <label class="field">${cloze ? 'Texto — marque a lacuna e toque em [ … ]' : 'Frente'}<textarea id="card-front" rows="3" placeholder="${cloze ? 'O GLUT faz {{c1::difusão facilitada}} da glicose' : 'Qual mecanismo leva glicose para dentro da célula sem gastar ATP?'}"></textarea></label>
          ${cloze ? '<button class="btn ghost small" data-action="cloze">[ … ] Transformar seleção em lacuna</button>' : ''}
          <label class="field">${cloze ? 'Verso extra (opcional)' : 'Verso'}<textarea id="card-back" rows="2" placeholder="${cloze ? '' : 'Difusão facilitada por GLUT'}"></textarea></label>
          <div class="row gap"><button class="btn ghost grow" data-action="save-card">Salvar</button><button class="btn grow" data-action="save-send">Salvar e mandar pro Anki</button></div>
        </div>
      </section>

      ${exams.map(prepPanel).join('')}

      <section class="panel">
        <div class="panel-head"><span>Meus cards</span>
          <select class="mini" data-change="filter"><option value="">Todas</option>${subjectOptions(filter)}</select>
        </div>
        ${list.length ? list.map(cardRow).join('') : '<p class="muted pad">Nenhum flashcard ainda.</p>'}
        ${d.cards.length ? '<div class="pad"><button class="btn ghost small" data-action="export">⬇︎ Exportar .txt (Anki do computador)</button></div>' : ''}
      </section>
      <details class="card how">
        <summary>Como funciona com o AnkiMobile</summary>
        <ul>
          <li>“Mandar pro Anki” abre o AnkiMobile já com o card salvo no baralho <code>${esc(d.settings.anki.deckPrefix)}::Disciplina</code>, com etiquetas da disciplina e da prova. Volte para cá e envie o próximo.</li>
          <li>Os nomes do tipo de nota e dos campos precisam ser iguais aos do seu Anki (Ajustes → Anki). Use “Enviar card de teste” lá para conferir.</li>
          <li>O agendamento das revisões dos cards é feito pelo próprio Anki; aqui você vê quantos cards novos por dia ver para terminar antes da folga da prova.</li>
        </ul>
      </details>`;
  },
  actions: {
    type: (el) => { draft.type = el.dataset.v; rerender(); },
    cloze() {
      const ta = document.getElementById('card-front');
      const { selectionStart: a, selectionEnd: b, value } = ta;
      if (a === b) return toast('Selecione a palavra que vira lacuna.');
      const n = (value.match(/\{\{c(\d+)::/g) || []).length + 1;
      ta.value = `${value.slice(0, a)}{{c${n}::${value.slice(a, b)}}}${value.slice(b)}`;
      ta.focus();
    },
    'save-card': () => saveDraft(false),
    'save-send': () => saveDraft(true),
    send: (el) => send(D().cards.find((c) => c.id === el.dataset.id)),
    edit: (el) => cardSheet(D().cards.find((c) => c.id === el.dataset.id)),
    del(el) {
      if (!confirm('Apagar este flashcard daqui? (no Anki ele continua)')) return;
      D().cards = D().cards.filter((c) => c.id !== el.dataset.id);
      save();
    },
    'send-all'(el) {
      queue = D().cards.filter((c) => c.examId === el.dataset.exam && !c.sentAt).map((c) => c.id);
      sendNext();
    },
    next: () => sendNext(),
    bulk() {
      sheet(`
        <h2>Vários flashcards</h2>
        <label class="field">Disciplina<select name="subjectId">${subjectOptions(draft.subjectId)}</select></label>
        <label class="field">Prova<select name="examId">${examOptions(draft.subjectId, draft.examId)}</select></label>
        <label class="field">Um por linha: <code>frente ; verso</code><textarea name="lines" rows="8" placeholder="O que é endocitose? ; Entrada de material por invaginação da membrana&#10;Organela da síntese proteica ; Ribossomo"></textarea></label>
        <div class="row gap actions"><button class="btn ghost grow" type="button" data-action="close-sheet">Cancelar</button><button class="btn grow">Adicionar</button></div>`, {
        onSubmit(data) {
          const rows = data.lines.split('\n').map((l) => l.split(/\s*[;|\t]\s*/)).filter((p) => p[0]?.trim());
          for (const [front, ...rest] of rows) {
            D().cards.push({ id: uid(), subjectId: data.subjectId, examId: data.examId || null, type: 'basic', front: front.trim(), back: rest.join(' ; ').trim(), created: Date.now(), sentAt: null });
          }
          save();
          toast(`${rows.length} flashcard(s) adicionado(s). Envie pelo painel da prova.`);
        },
      });
    },
    export() {
      const d = D();
      const txt = exportAnkiTxt(d.cards, d.settings.anki, new Map(d.subjects.map((s) => [s.id, s])), new Map(d.exams.map((e) => [e.id, e])));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }));
      a.download = `flashcards-uff-${today()}.txt`;
      a.click();
    },
  },
  inputs: {
    'draft-subject': (el) => { draft.subjectId = el.value; draft.examId = ''; rerender(); },
    'draft-exam': (el) => { draft.examId = el.value || null; },
    filter: (el) => { filter = el.value; rerender(); },
  },
};

function saveDraft(andSend) {
  const front = document.getElementById('card-front').value.trim();
  const back = document.getElementById('card-back').value.trim();
  if (!front) return toast('Escreva a frente do card.');
  if (draft.type === 'cloze' && !/\{\{c\d+::/.test(front)) return toast('Marque pelo menos uma lacuna com [ … ].');
  const card = { id: uid(), subjectId: draft.subjectId, examId: draft.examId || null, type: draft.type, front, back, created: Date.now(), sentAt: null };
  D().cards.push(card);
  save();
  if (andSend) send(card);
  else toast('Flashcard salvo ✓');
}
