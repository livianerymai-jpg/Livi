export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const nf = (n, d = 1) => (n == null || !Number.isFinite(n) ? '—' : n.toFixed(d).replace('.', ','));
export const num = (v) => {
  if (v === '' || v == null) return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

let toastTimer;
export function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  el.classList.add('show');
  if (action) el.querySelector('button').onclick = () => { el.classList.remove('show'); action.run(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 6000 : 2800);
}

// Folha (modal) de baixo para cima. onSubmit recebe os dados do <form>.
export function sheet(html, { onSubmit, onMount } = {}) {
  const m = $('#sheet');
  m.innerHTML = `<form class="sheet-body" method="dialog">${html}</form>`;
  const form = m.querySelector('form');
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    if (!onSubmit) return closeSheet();
    const data = Object.fromEntries(new FormData(form));
    const keep = await onSubmit(data, form, ev.submitter);
    if (keep !== true) closeSheet();
  };
  if (!m.open) m.showModal();
  onMount?.(m);
  return m;
}
export function closeSheet() {
  const m = $('#sheet');
  if (m.open) m.close();
}

export function ring(pct, color = 'var(--ink)', size = 44) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct || 0));
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 44 44"><circle cx="22" cy="22" r="${r}" stroke="var(--line)" stroke-width="5" fill="none"/><circle cx="22" cy="22" r="${r}" stroke="${color}" stroke-width="5" fill="none" stroke-dasharray="${(c * p) / 100} ${c}" stroke-linecap="round" transform="rotate(-90 22 22)"/><text x="22" y="26" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor">${Math.round(p)}%</text></svg>`;
}

export const bar = (pct, color = 'var(--ink)') =>
  `<div class="bar"><i style="width:${Math.max(0, Math.min(100, pct || 0))}%;background:${color}"></i></div>`;

export const chip = (text, kind = '') => `<span class="tag ${kind}">${esc(text)}</span>`;
