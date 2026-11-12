// Small DOM helpers shared by every view.
export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];

export function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
}
export function btn(cls, text, onClick, attrs = {}) {
  const b = el('button', cls, text);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  for (const [k, v] of Object.entries(attrs)) b.setAttribute(k, v);
  return b;
}
export function h(tag, cls, ...kids) {
  const n = el(tag, cls);
  kids.flat().forEach(k => { if (k === null || k === undefined || k === false) return; n.append(k instanceof Node ? k : document.createTextNode(String(k))); });
  return n;
}

export const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const sleep = ms => new Promise(r => setTimeout(r, ms));

// Speaker icon button that reads `text` aloud.
const SPEAKER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/></svg>';
export function speakBtn(onClick, label = '발음 듣기', cls = '') {
  const b = btn('icon-btn speak ' + cls, '', e => { e.stopPropagation(); onClick(); }, { 'aria-label': label, title: label });
  b.innerHTML = SPEAKER;
  return b;
}
export const MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>';

let toastTimer = null;
export function toast(msg) {
  let t = $('#toast');
  if (!t) { t = el('div', 'toast'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// Highlights `word` inside `sentence` (whole word, case-insensitive).
export function highlight(sentence, word) {
  const box = el('span');
  const re = new RegExp(`\\b(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'i');
  const m = re.exec(sentence);
  if (!m) { box.textContent = sentence; return box; }
  box.append(sentence.slice(0, m.index), el('b', 'hl', m[0]), sentence.slice(m.index + m[0].length));
  return box;
}

export function progressBar(value, max, cls = '') {
  const w = el('div', 'bar ' + cls);
  const f = el('div', 'bar-fill');
  f.style.width = `${max ? Math.round((value / max) * 100) : 0}%`;
  w.append(f);
  w.setAttribute('role', 'progressbar'); w.setAttribute('aria-valuemin', '0'); w.setAttribute('aria-valuemax', String(max)); w.setAttribute('aria-valuenow', String(value));
  return w;
}
