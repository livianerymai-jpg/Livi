// Versões do app: mesma base, ícone/nome/dados separados.
// A versão vem do atributo data-variant do <html> de cada link (/ = UFF, /ufvjm/ = UFVJM).
const VARIANTS = {
  uff: { key: 'uff', sigla: 'UFF', app: 'Estudos UFF', storage: 'estudos-uff', token: 'g-token', logo: 'icons/uff/icon-180.png', passingHint: 'Na UFF a média de aprovação direta costuma ser 6,0 — confira no plano de ensino.' },
  ufvjm: { key: 'ufvjm', sigla: 'UFVJM', app: 'Estudos UFVJM', storage: 'estudos-ufvjm', token: 'g-token-ufvjm', logo: 'icons/icon-180.png', passingHint: 'Confira no regimento/plano de ensino da UFVJM a nota mínima de aprovação. Para cursos modulares, use o modo “Modular”.' },
};
export const V = VARIANTS[document.documentElement.dataset.variant] || VARIANTS.uff;
