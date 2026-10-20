// Pantalla de resultados en directo: se abre en otro ordenador, una tele o un segundo proyector.
// No necesita clave: solo lee los resultados que calcula la consola y cambia sola de vista.
import { QUESTIONS, NEWSPAPERS, GRADIENT, SURVEY_IDS } from './questions.js';
import { createStore } from './store.js';
import { pct, fmt1, IDEO_BUCKETS } from './agg.js';
import { demoSeed } from './demo.js';

const cfg = window.APP_CONFIG || {};
const store = await createStore(cfg);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const stage = $('#stage');
const params = new URLSearchParams(location.search);
if (params.has('demo')) await demoSeed(store);
// Vista fija: ?vista=d5 (el complemento de PowerPoint la pasa así, con la que guarda la diapositiva).
// Modo incrustado (?embed): sin cabecera ni título, solo el gráfico en vivo.
const EMBED = params.has('embed');
let forced = params.get('vista');
document.body.classList.toggle('embed', EMBED);
const studentUrl = (cfg.baseUrl || new URL('../', location.href).href).replace(/\/?$/, '/');

// Qué vista corresponde a cada slide abierta desde la consola.
const VIEW_BY_SLIDE = { 1: 'qr', 2: 'encuesta', 3: 'canales', 12: 'casos', 15: 'experimento', 17: 'anunciantes', 18: 'd5', 27: 'd_final' };
const NEEDS = ['_presence', ...SURVEY_IDS, 'd2_casos', 'd5', 'd_final'];

// ——— QR ———
function drawQR(el) {
  if (!el || typeof qrcode !== 'function') return;
  const qr = qrcode(0, 'M'); qr.addData(studentUrl); qr.make();
  el.innerHTML = qr.createSvgTag({ cellSize: 8, margin: 0, scalable: true });
}
drawQR($('[data-miniqr]'));

// ——— Animaciones ———
function countTo(el, to, fmt = v => String(Math.round(v))) {
  if (!el) return;
  const from = Number(el.dataset.v ?? 0);
  el.dataset.v = to;
  if (from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now(), d = 800;
  const step = t => { const k = Math.min(1, (t - t0) / d); const e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1 && el.dataset.v == to) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function bump(counter, delta) {
  if (!counter || delta <= 0) return;
  const b = document.createElement('span'); b.className = 'pop'; b.textContent = '+' + delta;
  counter.appendChild(b); setTimeout(() => b.remove(), 1300);
  counter.classList.remove('pulse'); void counter.offsetWidth; counter.classList.add('pulse');
}
const lastN = {};
function counterUpdate(el, n) {
  if (!el) return;
  const key = el.dataset.k || 'x';
  const prev = lastN[key] ?? n;
  countTo($('b', el), n);
  if (n > prev) bump(el, n - prev);
  lastN[key] = n;
}

// ——— Estado ———
let state = null, aggs = {}, current = null, lastSlideView = 'qr', status = { online: 0 };
for (const q of NEEDS) store.onAgg(q, a => { aggs[q] = a; update(); });
store.onState(st => { state = st; pickView(); });
store.onSession(() => { for (const k of Object.keys(lastN)) delete lastN[k]; current = null; pickView(); });
store.onStatus(st => { status = st; const c = $('[data-conn]'); c.classList.toggle('off', !st.online); c.textContent = st.online ? 'en directo' : 'reconectando…'; });

function pickView() {
  let v = (forced && forced !== 'auto') ? forced : (state?.screen && state.screen !== 'auto' ? state.screen : null);
  if (!v) { const m = VIEW_BY_SLIDE[state?.slide]; if (m) lastSlideView = m; v = lastSlideView; }
  if (v !== current) { current = v; build(v); }
  update();
}

// ——— Vistas ———
const BUILD = {
  qr() {
    return `<div class="split"><div class="qr big huge" data-qr></div><div><div class="kick">Votación anónima</div><h1>Escanea el código y entra</h1><p class="sub">Sin registro ni datos personales. El móvil cambia solo con cada votación.</p><div class="counter" data-k="presence" style="margin-top:4vh"><b>0</b><span>en la sala</span></div></div></div>`;
  },
  encuesta() {
    if (EMBED) return `<div class="embed-count"><div class="counter" data-k="survey"><b>0</b><span>han enviado la encuesta</span></div><div class="progress"><i data-prog></i></div><div class="hint" data-of></div></div>`;
    return `<div class="split"><div class="qr big" data-qr></div><div><div class="kick">Encuesta y experimento</div><h1>Antes de empezar: ¿cómo os informáis?</h1><div class="counter" data-k="survey"><b>0</b><span>han enviado la encuesta</span></div><div class="progress"><i data-prog></i></div><div class="hint" data-of></div></div></div>`;
  },
  canales() {
    const q = QUESTIONS.q1_canal;
    return `<div class="kick">Resultados de la encuesta</div><h1>Así os informáis</h1><div class="two"><div class="vbars compact" data-bars="q1_canal">${q.options.map((o, i) => `<div class="vbar" data-i="${i}"><div class="lab">${esc(o)}</div><div class="track"><div class="fill"></div></div><div class="pc"><span>0</span><small>%</small></div></div>`).join('')}</div>
      <div class="stats"><div class="stat"><b data-stat="linea">—</b><span>sabe cuál es la línea editorial de los medios que consume</span></div><div class="stat"><b data-stat="conf">—</b><span>confianza media en las noticias que consume (1–5)</span></div><div class="stat"><b data-stat="anun">—</b><span>cree que los anunciantes influyen «mucho» o «algo»</span></div></div></div>
      <div class="foot"><div class="counter sm" data-k="canales"><b>0</b><span>respuestas</span></div></div>`;
  },
  casos() {
    const q = QUESTIONS.d2_casos;
    return `<div class="kick">Debate 2 · votación</div><h1>¿Dónde colocaríais cada caso?</h1><div class="heat"><div></div>${q.steps.map(st => `<div class="h ${st.zone}">${esc(st.label)}</div>`).join('')}${q.cases.map(c => `<div class="case"><b>${c.id}</b><span>${esc(c.text)}</span></div>${q.steps.map((st, i) => `<div class="cell ${st.zone}" data-c="${c.id}" data-i="${i}" style="--p:0">·</div>`).join('')}`).join('')}</div>
      <div class="foot"><div class="counter sm" data-k="casos"><b>0</b><span>votos</span></div></div>`;
  },
  experimento() {
    return `<div class="kick">Idea 4 · la confianza</div><h1>Cada uno ve los medios desde donde está</h1><div class="axislab"><span></span><div><span>0 · Izquierda</span><span>Derecha · 10</span></div></div><div class="strips">${NEWSPAPERS.map(p => `<div class="strip" data-p="${p.id}"><div class="nm">${esc(p.label)}</div><div class="axis"><div class="dots"></div><div class="mean" style="left:50%;opacity:0" data-v=""></div>${IDEO_BUCKETS.map(b => `<div class="bm" data-b="${b.id}" data-l="${b.id === 'izq' ? 'I' : b.id === 'centro' ? 'C' : 'D'}" style="left:50%;opacity:0"></div>`).join('')}</div></div>`).join('')}</div>
      <div class="foot"><div class="legend"><span><i></i>Media de la clase</span><span><i class="ink"></i>I · C · D: media según dónde se sitúa quien responde</span></div><div class="counter sm" data-k="exp"><b>0</b><span>respuestas</span></div></div>`;
  },
  anunciantes() {
    if (EMBED) return `<div class="vbars compact" data-anun><div class="vbar" data-r="dnr"><div class="lab">España · DNR 2026</div><div class="track"><div class="fill" style="background:#111111"></div></div><div class="pc"><span>55</span><small>%</small></div></div><div class="vbar lead" data-r="clase"><div class="lab">Esta clase</div><div class="track"><div class="fill"></div></div><div class="pc"><span>—</span><small>%</small></div></div></div>`;
    const ring = (id, label, sub) => `<div class="ring"><svg viewBox="0 0 100 100" role="img" aria-label="${esc(label)}"><circle cx="50" cy="50" r="40" fill="none" stroke="#DDDDDD" stroke-width="10"></circle><circle class="val" data-ring="${id}" cx="50" cy="50" r="40" fill="none" stroke="${id === 'dnr' ? '#111111' : 'var(--accent)'}" stroke-width="10" stroke-dasharray="0 251.3" stroke-linecap="round" transform="rotate(-90 50 50)"></circle><text x="50" y="57" text-anchor="middle" font-family="Sora, sans-serif" font-size="18" font-weight="300" fill="#111111" data-ringv="${id}">—</text></svg><div class="rl">${esc(label)}</div><div class="rs">${esc(sub)}</div></div>`;
    return `<div class="kick">Idea 5 · quien paga</div><h1>¿Influyen los anunciantes en lo que cuenta un medio?</h1><div class="rings">${ring('dnr', 'España', 'Digital News Report 2026')}${ring('clase', 'Esta clase', 'encuesta, «mucho» o «algo»')}</div>`;
  },
  d5() { return voteView('d5', 'Debate 5 · votación'); },
  d_final() { return voteView('d_final', 'Debate final · votación'); },
};
function voteView(qid, kick) {
  const q = QUESTIONS[qid];
  return `<div class="kick">${esc(kick)}</div><h1>${esc(q.title)}</h1><div class="vbars" data-bars="${qid}">${q.options.map((o, i) => `<div class="vbar" data-i="${i}"><div class="lab">${esc(o)}</div><div class="track"><div class="fill"></div></div><div class="pc"><span>0</span><small>%</small></div></div>`).join('')}</div>
    <div class="foot"><span class="sub">Vota en el móvil</span><div class="counter sm" data-k="${qid}"><b>0</b><span>votos</span></div></div>`;
}
function build(v) {
  stage.style.animation = 'none'; void stage.offsetWidth; stage.style.animation = '';
  stage.innerHTML = (BUILD[v] || BUILD.qr)();
  $$('[data-qr]', stage).forEach(drawQR);
  $('[data-miniqr]').classList.toggle('hide', v === 'qr' || v === 'encuesta');
  for (const k of Object.keys(lastN)) delete lastN[k];
}

// ——— Actualización de datos ———
function bars(qid) {
  const box = $(`[data-bars="${qid}"]`, stage); if (!box) return;
  const a = aggs[qid]; const n = a?.n || 0; const counts = a?.counts || [];
  const max = Math.max(0, ...counts);
  $$('.vbar', box).forEach(row => {
    const i = Number(row.dataset.i); const p = pct(counts[i] || 0, n);
    $('.fill', row).style.width = p + '%';
    countTo($('.pc span', row), p);
    row.classList.toggle('lead', n > 0 && counts[i] === max);
  });
}
function update() {
  const pres = aggs._presence?.n || 0;
  countTo($('[data-presence]'), pres);
  const v = current;
  if (v === 'qr') counterUpdate($('[data-k="presence"]', stage), pres);
  if (v === 'encuesta') {
    const done = aggs.q10_eldiario?.n || 0;
    counterUpdate($('[data-k="survey"]', stage), done);
    const base = Math.max(pres, done);
    $('[data-prog]', stage).style.width = (base ? Math.min(100, done / base * 100) : 0) + '%';
    $('[data-of]', stage).textContent = base ? `${done} de ${base} en la sala · 10 preguntas` : '10 preguntas · 90 segundos';
  }
  if (v === 'canales') {
    bars('q1_canal');
    const a2 = aggs.q2_linea, a3 = aggs.q3_confianza, a5 = aggs.q5_anunciantes;
    countTo($('[data-stat="linea"]', stage), a2?.n ? pct(a2.counts[0], a2.n) : 0, x => a2?.n ? `${Math.round(x)} %` : '—');
    countTo($('[data-stat="conf"]', stage), a3?.n ? a3.mean : 0, x => a3?.n ? fmt1(x) : '—');
    countTo($('[data-stat="anun"]', stage), a5?.n ? pct(a5.counts[0] + a5.counts[1], a5.n) : 0, x => a5?.n ? `${Math.round(x)} %` : '—');
    counterUpdate($('[data-k="canales"]', stage), aggs.q1_canal?.n || 0);
  }
  if (v === 'casos') {
    const q = QUESTIONS.d2_casos, a = aggs.d2_casos;
    for (const c of q.cases) {
      const pc = a?.perCase?.[c.id]; const n = pc?.n || 0; const max = n ? Math.max(...pc.counts) : 0;
      $$(`.cell[data-c="${c.id}"]`, stage).forEach(cell => { const i = Number(cell.dataset.i); const val = pc?.counts?.[i] || 0; const p = pct(val, n); cell.style.setProperty('--p', Math.round(p * 0.9)); cell.textContent = n ? p + ' %' : '·'; cell.classList.toggle('max', n > 0 && val === max && val > 0); cell.classList.toggle('hot', p >= 45); });
    }
    counterUpdate($('[data-k="casos"]', stage), a?.n || 0);
  }
  if (v === 'experimento') {
    for (const p of NEWSPAPERS) {
      const a = aggs[p.id]; const strip = $(`.strip[data-p="${p.id}"]`, stage); if (!strip) continue;
      const dots = $('.dots', strip); const have = {};
      $$('.dot', dots).forEach(d => { have[d.dataset.k] = d; });
      const keep = new Set();
      if (a?.hist) for (const [val, c] of Object.entries(a.hist)) {
        const stack = Math.min(c, 9);
        for (let k = 0; k < stack; k++) {
          const key = val + ':' + k; keep.add(key);
          if (!have[key]) { const d = document.createElement('span'); d.className = 'dot new'; d.dataset.k = key; d.style.left = (val * 10) + '%'; d.style.setProperty('--k', k); dots.appendChild(d); }
        }
      }
      for (const [key, d] of Object.entries(have)) if (!keep.has(key)) d.remove();
      const m = $('.mean', strip); if (a?.n) { m.style.left = (a.mean * 10) + '%'; m.style.opacity = 1; m.dataset.v = fmt1(a.mean); } else m.style.opacity = 0;
      for (const b of IDEO_BUCKETS) { const bm = $(`.bm[data-b="${b.id}"]`, strip); const st = a?.byIdeology?.[b.id]; if (st && st.n >= 3) { bm.style.left = (st.mean * 10) + '%'; bm.style.opacity = 1; } else bm.style.opacity = 0; }
    }
    counterUpdate($('[data-k="exp"]', stage), aggs.q7_elpais?.n || 0);
  }
  if (v === 'anunciantes') {
    const a5 = aggs.q5_anunciantes; const clase = a5?.n ? pct(a5.counts[0] + a5.counts[1], a5.n) : null;
    const setRing = (id, val) => { const c = $(`[data-ring="${id}"]`, stage); if (c) c.setAttribute('stroke-dasharray', `${(val ?? 0) * 2.513} 251.3`); const t = $(`[data-ringv="${id}"]`, stage); if (t) t.textContent = val == null ? '—' : `${val} %`; };
    setRing('dnr', 55); setRing('clase', clase);
    const box = $('[data-anun]', stage);
    if (box) { $('[data-r="dnr"] .fill', box).style.width = '55%'; $('[data-r="clase"] .fill', box).style.width = (clase ?? 0) + '%'; countTo($('[data-r="clase"] .pc span', box), clase ?? 0, x => clase == null ? '—' : String(Math.round(x))); }
  }
  if (v === 'd5' || v === 'd_final') { bars(v); counterUpdate($(`[data-k="${v}"]`, stage), aggs[v]?.n || 0); }
}

// Pantalla completa con un clic (los navegadores lo exigen así).
$('#fs').addEventListener('click', () => document.documentElement.requestFullscreen?.().catch(() => {}));
pickView();
window.__pantalla = { store, get aggs() { return aggs; }, setView(v) { forced = v; current = null; pickView(); } };
