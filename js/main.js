import { load, onSave, onSaveError, flush, D } from './store.js';
import { $, toast, closeSheet } from './ui.js';
import * as google from './google.js';
import { setRerender } from './bus.js';
import hoje from './views/hoje.js';
import estudos from './views/estudos.js';
import agenda from './views/agenda.js';
import cards from './views/cards.js';
import notas from './views/notas.js';
import presenca from './views/presenca.js';
import ajustes from './views/ajustes.js';

const VIEWS = { hoje, estudos, agenda, cards, notas, presenca, ajustes };
let current = { view: hoje, name: 'hoje', param: null };

function parseHash() {
  const [name, param] = location.hash.replace(/^#/, '').split('/');
  return VIEWS[name] ? { view: VIEWS[name], name, param: param ? decodeURIComponent(param) : null } : { view: hoje, name: 'hoje', param: null };
}

export function render() {
  current = parseHash();
  const { view, name, param } = current;
  const main = $('#view');
  const scroll = main.dataset.route === location.hash ? window.scrollY : 0;
  main.dataset.route = location.hash;
  main.innerHTML = view.render(param);
  const t = typeof view.title === 'function' ? view.title(param) : view.title;
  $('#title').innerHTML = t;
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === name));
  $('#back').hidden = !param && name !== 'ajustes';
  view.mount?.(main, param);
  window.scrollTo(0, scroll);
}

function handler(kind, el) {
  const name = el.dataset[kind];
  return current.view[kind === 'action' ? 'actions' : 'inputs']?.[name] ?? GLOBAL[name];
}

const GLOBAL = {
  back: () => (current.param ? (location.hash = '#' + current.name) : history.length > 1 ? history.back() : (location.hash = '#hoje')),
  'close-sheet': () => closeSheet(),
  go: (el) => (location.hash = el.dataset.to),
};

document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el) {
    if (ev.target === $('#sheet')) closeSheet();
    return;
  }
  const fn = handler('action', el);
  if (!fn) return;
  ev.preventDefault();
  try {
    await fn(el, ev);
  } catch (e) {
    console.error(e);
    toast(e.message || 'Algo deu errado.');
  }
});
for (const type of ['input', 'change']) {
  document.addEventListener(type, (ev) => {
    const el = ev.target.closest(`[data-${type}]`);
    if (!el) return;
    const name = el.dataset[type];
    const fn = current.view.inputs?.[name] ?? GLOBAL[name];
    fn?.(el, ev);
  });
}

// ---------- sincronização automática com o Google
let syncTimer;
let backupTimer;
export function scheduleSync(delay = 1500) {
  if (!google.isConnected()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      await google.sync();
    } catch (e) {
      if (!e.needAuth) toast(e.message);
    }
  }, delay);
}
onSave(() => {
  render();
  const d = D();
  if (d.events.some((e) => e.dirty) || d.exams.some((e) => e.dirty) || d.deletedExamEvents?.length) scheduleSync();
  if (google.isConnected() && d.settings.google.autoBackup) {
    clearTimeout(backupTimer);
    backupTimer = setTimeout(() => google.backupToDrive().catch(() => {}), 20000);
  }
});

setRerender(() => render());

// No iPhone, o Safari e o ícone da Tela de Início guardam dados separados
function showInstallHint() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const el = $('#install');
  let dismissed = false;
  try { dismissed = localStorage.getItem('install-hint') === 'no'; } catch {}
  if (!ios || standalone || dismissed) return;
  el.hidden = false;
  el.querySelector('button').onclick = () => {
    el.hidden = true;
    try { localStorage.setItem('install-hint', 'no'); } catch {}
  };
}

async function boot() {
  navigator.storage?.persist?.();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  await load();
  const cameBack = google.handleRedirect();
  window.addEventListener('hashchange', render);
  render();
  if (cameBack) toast('Google conectado! ✓');
  if (google.isConnected()) scheduleSync(300);
  onSaveError(() => toast('⚠️ Não consegui salvar neste aparelho. Feche e abra o app de novo; se continuar, veja se o Safari não está em navegação privada.'));
  window.addEventListener('pagehide', flush);
  showInstallHint();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
    if (document.visibilityState === 'visible') {
      render();
      if (google.isConnected() && Date.now() - (D().lastSync || 0) > 5 * 60000) scheduleSync(300);
    }
  });
}

boot();
