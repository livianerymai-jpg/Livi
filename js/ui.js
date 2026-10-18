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

// Folha (modal) de baixo para cima, com animação e arrastar para baixo para fechar.
export function sheet(html, { onSubmit, onMount } = {}) {
  const m = $('#sheet');
  m.classList.remove('closing');
  m.innerHTML = `<form class="sheet-body" method="dialog"><div class="grab" aria-hidden="true"></div>${html}</form>`;
  const form = m.querySelector('form');
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    if (!onSubmit) return closeSheet();
    const data = Object.fromEntries(new FormData(form));
    const keep = await onSubmit(data, form, ev.submitter);
    if (keep !== true) closeSheet();
  };
  if (!m.open) m.showModal();
  dragToClose(form);
  onMount?.(m);
  return m;
}
export function closeSheet() {
  const m = $('#sheet');
  if (!m.open || m.classList.contains('closing')) return;
  m.classList.add('closing');
  setTimeout(() => {
    m.close();
    m.classList.remove('closing');
  }, 180);
}
function dragToClose(body) {
  let y0 = null;
  let dy = 0;
  body.addEventListener('touchstart', (e) => {
    if (body.scrollTop > 0) return;
    y0 = e.touches[0].clientY;
    dy = 0;
  }, { passive: true });
  body.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    if (dy > 0 && body.scrollTop <= 0) body.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  body.addEventListener('touchend', () => {
    if (y0 == null) return;
    body.style.transition = 'transform .18s';
    if (dy > 110) closeSheet();
    else body.style.transform = '';
    setTimeout(() => (body.style.transition = ''), 200);
    y0 = null;
  });
}

// Comemoração quando termina tudo do dia 🎉
export function confetti() {
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#7a2e3a', '#34496b', '#4e6a4f', '#e9c46a', '#d79aa1'];
  for (let i = 0; i < 36; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + '%';
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = Math.random() * 0.25 + 's';
    p.style.setProperty('--x', (Math.random() * 2 - 1) * 120 + 'px');
    p.style.setProperty('--r', Math.random() * 720 + 'deg');
    box.append(p);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 1800);
}

// Deslizar um item para os lados (direita = concluir, esquerda = adiar)
export function enableSwipe(root, { onRight, onLeft }) {
  for (const el of root.querySelectorAll('[data-swipe]')) {
    const inner = el.querySelector('.swipe-inner');
    let x0 = null;
    let y0 = null;
    let dx = 0;
    let horizontal = null;
    el.addEventListener('touchstart', (e) => {
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      dx = 0;
      horizontal = null;
      inner.style.transition = '';
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (x0 == null) return;
      const mx = e.touches[0].clientX - x0;
      const my = e.touches[0].clientY - y0;
      if (horizontal == null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) horizontal = Math.abs(mx) > Math.abs(my);
      if (!horizontal) return;
      dx = mx;
      inner.style.transform = `translateX(${dx}px)`;
      el.classList.toggle('go-right', dx > 70);
      el.classList.toggle('go-left', dx < -70);
    }, { passive: true });
    el.addEventListener('touchend', () => {
      if (x0 == null) return;
      inner.style.transition = 'transform .2s';
      inner.style.transform = '';
      el.classList.remove('go-right', 'go-left');
      if (horizontal && dx > 70) onRight(el.dataset.swipe, el);
      else if (horizontal && dx < -70) onLeft(el.dataset.swipe, el);
      x0 = null;
    });
  }
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
