// Integração com o AnkiMobile (iPhone) via URL "anki://x-callback-url/addnote".
import { diffDays } from './dates.js';

export function slug(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export const deckName = (cfg, subject) => [cfg.deckPrefix || 'UFF', subject?.name || 'Geral'].filter(Boolean).join('::');
export const examTag = (subject, exam) => `prova::${slug(subject?.name)}::${slug(exam?.title)}`;

export function cardTags(card, subject, exam) {
  const tags = ['estudos_uff', slug(subject?.name)];
  if (exam) tags.push(examTag(subject, exam), `data_prova::${exam.date}`);
  for (const t of card.tags || []) tags.push(slug(t));
  return [...new Set(tags.filter(Boolean))];
}

export function ankiAddURL(card, cfg, subject, exam) {
  const cloze = card.type === 'cloze';
  const p = new URLSearchParams();
  if (cfg.profile) p.set('profile', cfg.profile);
  p.set('type', cloze ? cfg.clozeType || 'Cloze' : cfg.basicType || 'Basic');
  p.set('deck', deckName(cfg, subject));
  if (cloze) {
    p.set(`fld${cfg.clozeText || 'Text'}`, card.front);
    if (card.back) p.set(`fld${cfg.clozeExtra || 'Back Extra'}`, card.back);
  } else {
    p.set(`fld${cfg.basicFront || 'Front'}`, card.front);
    p.set(`fld${cfg.basicBack || 'Back'}`, card.back || '');
  }
  p.set('tags', cardTags(card, subject, exam).join(' '));
  p.set('dupes', '1');
  return 'anki://x-callback-url/addnote?' + p.toString().replace(/\+/g, '%20');
}

// Quantos cards novos por dia para terminar antes da folga da prova
export function examRecommendation({ cards, exam, today, bufferDays }) {
  const daysUntil = diffDays(today, exam.date);
  const studyDays = Math.max(1, daysUntil - bufferDays);
  const newPerDay = Math.max(1, Math.ceil(cards / studyDays));
  return { daysUntil, studyDays, newPerDay };
}

// Arquivo .txt para importar no Anki do computador (Arquivo → Importar)
export function exportAnkiTxt(cards, cfg, subjectsById, examsById) {
  const lines = ['#separator:tab', '#html:true', '#notetype column:1', '#deck column:2', '#tags column:5'];
  const clean = (s) => String(s ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, '<br>');
  for (const c of cards) {
    const subject = subjectsById.get(c.subjectId);
    const exam = examsById.get(c.examId);
    const type = c.type === 'cloze' ? cfg.clozeType || 'Cloze' : cfg.basicType || 'Basic';
    lines.push([type, deckName(cfg, subject), clean(c.front), clean(c.back), cardTags(c, subject, exam).join(' ')].join('\t'));
  }
  return lines.join('\n');
}
