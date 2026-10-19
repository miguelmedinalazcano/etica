import { QUESTIONS, SLIDES, SLIDE_BY_N, ROLES, LENSES, GRADIENT, NEWSPAPERS, DNR, SURVEY_IDS, REACTIONS, CUES, STRICT } from './questions.js';
import { createStore, wallSort } from './store.js';
import { aggregate, pct, fmt1, IDEO_BUCKETS } from './agg.js';
import { demoSeed } from './demo.js';

const cfg = window.APP_CONFIG || {};
const store = await createStore(cfg);
const params = new URLSearchParams(location.search);
if (params.has('demo')) await demoSeed(store);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// El móvil del alumno vive en la raíz del sitio; la presentación, en /proyector/.
const votaUrl = (cfg.baseUrl || new URL('../', location.href).href).replace(/\/?$/, '/');
const prettyUrl = votaUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
const live = store.mode === 'mqtt';
// ?solo=N: una sola slide, solo lectura, sin cabecera de estado. Para incrustarla en PowerPoint (Web Viewer) o en otra pantalla.
const solo = Number(params.get('solo')) || 0;
const canWrite = store.canWrite && !solo;        // con clave de ponente (o en modo local)
document.body.classList.toggle('strict', STRICT);
document.body.classList.toggle('embed', !!solo);
if (live) store.cleanupOnSwitch = true;

// ——— Login en modo Firebase (solo ponentes) ———
if (store.mode === 'firebase' && !store.isPresenter) {
  await new Promise(resolve => {
    const ov = document.createElement('div'); ov.className = 'overlay';
    ov.innerHTML = `<form><b style="font-size:18px">Acceso de ponente</b><input name="email" type="email" placeholder="Correo" required><input name="pass" type="password" placeholder="Contraseña" required><button>Entrar</button><span class="dim" style="font-size:13px" data-err></span></form>`;
    document.body.appendChild(ov);
    ov.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      try { const ok = await store.login(e.target.email.value, e.target.pass.value); if (ok) { ov.remove(); resolve(); } else ov.querySelector('[data-err]').textContent = 'Este correo no está en la lista de ponentes.'; }
      catch (err) { ov.querySelector('[data-err]').textContent = 'No se ha podido entrar: ' + err.message; }
    });
  });
}

// ——— Folios ———
for (const sec of $$('.reveal .slides section')) {
  const n = Number(sec.dataset.n); const s = SLIDE_BY_N[n];
  const f = document.createElement('div'); f.className = 'folio';
  const cue = CUES[s.phone.kind];
  f.innerHTML = `<span><b>La ética del periodismo</b> · Rigor vs. línea editorial</span><span>${cue ? `<span class="cue">📱 ${esc(cue)}<b data-cd></b></span>` : ''}${esc(s.section)} <span class="num">· ${String(n).padStart(2, '0')} / ${SLIDES.length}</span></span>`;
  sec.prepend(f);
  // Guion del ponente en las notas (vista de ponente: tecla S).
  if (s.script && s.script.length) {
    let aside = sec.querySelector('aside.notes');
    if (!aside) { aside = document.createElement('aside'); aside.className = 'notes'; sec.appendChild(aside); }
    aside.innerHTML = `<p><b>${esc(s.who)} · Guion</b></p><ol>${s.script.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` +
      (s.notes && s.notes.length ? `<p><b>Datos de apoyo</b></p><ul>${s.notes.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '') +
      (aside.innerHTML.trim() ? `<p><b>Nota de la guía</b></p><p>${aside.innerHTML}</p>` : '');
  }
}

// ——— QR ———
function drawQR(el, text) {
  if (!el || typeof qrcode !== 'function') return;
  const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
  el.innerHTML = qr.createSvgTag({ cellSize: 8, margin: 0, scalable: true });
}
$$('[data-view=qr]').forEach(el => drawQR(el, votaUrl));
$$('[data-view=url]').forEach(el => el.textContent = prettyUrl);
$$('[data-view=qr-fuentes]').forEach(el => drawQR(el, votaUrl + '#fuentes'));
$$('[data-view=url-fuentes]').forEach(el => el.textContent = prettyUrl + '#fuentes');

// ——— Reveal ———
const deck = new Reveal({ width: 1920, height: 1080, margin: 0, minScale: 0.1, maxScale: 2, center: false, hash: true, controls: false, progress: false, slideNumber: false, transition: 'fade', transitionSpeed: 'fast', backgroundTransition: 'none', keyboard: canWrite, touch: canWrite, fragments: !params.has('nofrag') && !solo, plugins: [RevealNotes] });
await deck.initialize();

// ——— Estado compartido ———
// Con clave: este portátil es la referencia (publica slide, fragmento y cuenta atrás).
// Sin clave: vista de solo lectura que sigue lo que hace el proyector.
let state = null, applying = false, synced = false;
let timerEnd = 0;

function currentN() { return Number(deck.getCurrentSlide()?.dataset.n || 1); }

function fragState() {
  const sec = deck.getCurrentSlide(); if (!sec) return { i: 0, total: 0, next: null };
  const frags = [...sec.querySelectorAll('.fragment')];
  const f = deck.getIndices().f; const shown = (f == null || f < 0) ? 0 : f + 1;
  const nx = frags[shown];
  const next = nx ? (nx.dataset.hint || (nx.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 50) || 'siguiente elemento') : null;
  return { i: shown, total: frags.length, next };
}
deck.on('slidechanged', () => {
  renderWall(); updateTicker();
  if (!canWrite || !synced) return;
  const n = currentN(); const s = SLIDE_BY_N[n];
  const patch = { frag: fragState() };
  if (state?.slide !== n) patch.slide = n;
  if (s.timer) { timerEnd = Date.now() + s.timer * 1000; patch.timerEnd = timerEnd; }
  if (n >= 2 && !state?.startedAt) patch.startedAt = Date.now();
  store.setState(patch);
});
deck.on('fragmentshown', () => { if (canWrite && synced) store.setState({ frag: fragState() }); });
deck.on('fragmenthidden', () => { if (canWrite && synced) store.setState({ frag: fragState() }); });

function followState(st) {
  if (solo) return;
  const n = currentN();
  const wantF = (st.frag?.i ?? 0) - 1;
  applying = true;
  if (st.slide && st.slide !== n) deck.slide(st.slide - 1, 0, canWrite ? undefined : wantF);
  else if (!canWrite && st.frag && (deck.getIndices().f ?? -1) !== wantF) deck.slide(st.slide - 1, 0, wantF);
  applying = false;
}
store.onState(st => {
  state = st;
  if (st.timerEnd) timerEnd = st.timerEnd;
  if (synced || !canWrite) followState(st);
  renderWall(); updateTicker();
});

// Comandos de la consola (firmados): siguiente, anterior, reiniciar cuenta atrás, borrar respuestas.
store.onCmd(c => {
  if (!canWrite) return;
  if (c.type === 'next') deck.next();
  if (c.type === 'prev') deck.prev();
  if (c.type === 'timer') { const s = SLIDE_BY_N[currentN()]; timerEnd = Date.now() + (s.timer || 60) * 1000; store.setState({ timerEnd }); }
  if (c.type === 'clear') store.resetResponses(Array.isArray(c.qids) ? c.qids : []);
});

// Nueva sesión: empezar desde la slide actual con los datos vacíos.
let lastSession = store.session;
store.onSession(sess => {
  if (sess && lastSession && sess !== lastSession && canWrite) setTimeout(() => store.setState({ slide: currentN(), frag: fragState() }), 300);
  lastSession = sess; updateBanner();
});

if (solo) deck.slide(solo - 1);
// Latido: la consola sabe que hay una presentación HTML que atiende «Siguiente».
setInterval(() => { if (canWrite && synced && live) store.setState({ deckAt: Date.now() }); }, 20000);
// Al arrancar: si ya hay una sesión con slide guardada, se reanuda; si no, se publica la actual.
store.ready.then(() => {
  if (canWrite && live) store.setState({ deckAt: Date.now() });
  if (canWrite) {
    const resume = state && state.slide && store.session && !params.has('demo') && (live || state.t);
    if (resume) followState(state);
    synced = true;
    const s0 = SLIDE_BY_N[currentN()]; const patch0 = { frag: fragState() };
    if (!resume || state.slide !== currentN()) patch0.slide = currentN();
    if (!resume && s0.timer) { timerEnd = Date.now() + s0.timer * 1000; patch0.timerEnd = timerEnd; }
    store.setState(patch0);
  }
  updateBanner();
});

// ——— Respuestas y agregados ———
const responses = {}, aggs = {};
const aggTimers = {};
function publishAgg(qid) {
  if (!canWrite) return;
  clearTimeout(aggTimers[qid]);
  aggTimers[qid] = setTimeout(() => store.setAgg(qid, aggs[qid]), 400);
}
function recompute(qid) {
  const q = QUESTIONS[qid];
  const ctx = {};
  if (NEWSPAPERS.some(p => p.id === qid)) ctx.ideology = responses.q6_ideologia || {};
  aggs[qid] = aggregate(q, responses[qid] || {}, ctx);
  publishAgg(qid);
  render(qid);
}

// ——— Renderizadores ———
const renderers = {
  bars(el, q, agg) {
    const narrow = el.dataset.narrow ? ' narrow' : '';
    if (!el.dataset.built) {
      el.innerHTML = q.options.map((o, i) => `<div class="bar c${i + 1}${narrow}"><div class="lab">${esc(o)}</div><div class="track"><div class="fill"></div></div><div class="val"><span>0</span><small>%</small></div></div>`).join('');
      el.dataset.built = '1';
    }
    const n = agg?.n || 0;
    $$('.bar', el).forEach((b, i) => { const p = pct(agg?.counts?.[i] || 0, n); $('.fill', b).style.width = p + '%'; $('.val span', b).textContent = p; });
  },
  'bars-role'(el, q, agg) {
    if (!el.dataset.built) {
      el.innerHTML = `<div class="bars" data-narrow="1"></div><div class="roles" style="display:flex;gap:14px;flex-wrap:wrap;margin-top:22px"></div>`;
      el.dataset.built = '1';
    }
    renderers.bars($('.bars', el), q, agg);
    const rolesEl = $('.roles', el);
    rolesEl.innerHTML = ROLES.map(r => {
      const c = agg?.byRole?.[r.id]; if (!c) return '';
      const tot = c.reduce((a, b) => a + b, 0); const top = c.indexOf(Math.max(...c));
      return `<span class="pill" style="font-size:19px"><span class="dim">${esc(r.label)}</span> · ${esc(q.options[top])} <b>${pct(c[top], tot)} %</b></span>`;
    }).join('');
  },
  n(el, q, agg) { el.textContent = `${agg?.n || 0} respuestas`; },
  guess(el, q, agg) { el.innerHTML = agg?.n ? `${Math.round(agg.median)}<small>%</small>` : `—<small>%</small>`; },
  'lens-count'(el, q, agg) { el.textContent = agg?.counts?.[Number(el.dataset.i)] || 0; },
  'gradient-dist'(el, q, agg) {
    if (!el.dataset.built) {
      const cut = $('.cut', el);
      GRADIENT.forEach(g => {
        const d = document.createElement('div'); d.className = 'step ' + g.zone;
        d.innerHTML = `<div class="name">${esc(g.label)}</div><div class="note">${esc(g.note)}</div><div class="dist"><div class="col ${g.zone}"></div></div><div class="dpct">0 %</div>`;
        el.insertBefore(d, cut);
      });
      el.dataset.built = '1';
    }
    const n = agg?.n || 0;
    $$('.step', el).forEach((s, i) => { const p = pct(agg?.counts?.[i] || 0, n); $('.col', s).style.height = Math.max(2, p * 1.2) + 'px'; $('.dpct', s).textContent = p + ' %'; });
  },
  heat(el, q, agg) {
    if (!el.dataset.built) {
      el.innerHTML = `<div class="h"></div>` + q.steps.map(s => `<div class="h ${s.zone}">${esc(s.label)}</div>`).join('') +
        q.cases.map(c => `<div class="case"><b>${c.id}</b><span>${esc(c.text)}</span></div>` + q.steps.map(s => `<div class="cell ${s.zone}" data-c="${c.id}" style="--p:0">·</div>`).join('')).join('');
      el.dataset.built = '1';
    }
    for (const c of q.cases) {
      const pc = agg?.perCase?.[c.id]; const n = pc?.n || 0; const max = n ? Math.max(...pc.counts) : 0;
      $$(`.cell[data-c="${c.id}"]`, el).forEach((cell, i) => { const v = pc?.counts?.[i] || 0; const p = pct(v, n); cell.style.setProperty('--p', Math.round(p * 0.9)); cell.textContent = n ? p + ' %' : '·'; cell.classList.toggle('top', n > 0 && v === max && v > 0); cell.classList.toggle('hot', p >= 45); });
    }
    updateTicker();
  },
  'rank-simple'(el, q, agg) {
    const order = agg?.n ? agg.order : q.items.map((_, i) => i);
    el.innerHTML = `<ol class="rankcmp-l" style="list-style:none;padding:0;margin:0">` + order.map((i, pos) => `<li style="display:grid;grid-template-columns:44px 1fr 90px;gap:12px;align-items:center;font-size:24px;padding:10px 0;border-bottom:1px solid var(--line)"><span style="font-weight:200;font-size:30px;color:var(--paper-dim)">${pos + 1}</span><span>${esc(q.items[i])}</span><span class="dim" style="text-align:right;font-variant-numeric:tabular-nums">${agg?.n ? fmt1(agg.avgPos[i]) : '—'}</span></li>`).join('') + `</ol><div class="small" style="margin-top:10px">${agg?.n || 0} respuestas · media de posición</div>`;
  },
  medioE(el) {
    const agg = aggs.d2_casos; const r = agg?.rigor; const th = cfg.rigorThreshold ?? 6;
    $('[data-f=rigor]', el).textContent = r == null ? '—' : fmt1(r);
    const res = $('[data-f=res]', el);
    if (r == null) { res.className = 'dim'; res.textContent = 'Sin datos del debate 2'; }
    else if (r >= th + 1) { res.className = 'ok'; res.textContent = 'Recomendado'; }
    else if (r >= th) { res.className = 'warn'; res.textContent = 'Recomendado con aviso'; }
    else { res.className = 'linea'; res.innerHTML = '<b>No recomendado:</b> no supera el umbral de rigor'; }
  },
  strips(el) {
    if (!el.dataset.built) {
      el.innerHTML = NEWSPAPERS.map(p => `<div class="strip" data-p="${p.id}"><div class="nm">${esc(p.label)}</div><div class="axis">${[...Array(11).keys()].map(i => `<span class="tick" style="left:${i * 10}%"></span>`).join('')}<div class="dots"></div><div class="mean" style="left:50%;opacity:0" data-v=""></div>${IDEO_BUCKETS.map(b => `<div class="bm ${b.id}" data-l="${b.id === 'izq' ? 'I' : b.id === 'centro' ? 'C' : 'D'}" style="left:50%;opacity:0"></div>`).join('')}</div></div>`).join('');
      el.dataset.built = '1';
    }
    for (const p of NEWSPAPERS) {
      const agg = aggs[p.id]; const s = $(`.strip[data-p="${p.id}"]`, el);
      const dots = $('.dots', s); let html = '';
      if (agg?.hist) for (const [v, c] of Object.entries(agg.hist)) for (let k = 0; k < Math.min(c, 6); k++) html += `<span class="dot" style="left:${v * 10}%;bottom:${10 + k * 11}px"></span>`;
      dots.innerHTML = html;
      const m = $('.mean', s); if (agg?.n) { m.style.left = agg.mean * 10 + '%'; m.style.opacity = 1; m.dataset.v = fmt1(agg.mean); } else m.style.opacity = 0;
      for (const b of IDEO_BUCKETS) { const bm = $('.bm.' + b.id, s); const st = agg?.byIdeology?.[b.id]; if (st && st.n >= 3) { bm.style.left = st.mean * 10 + '%'; bm.style.opacity = 1; } else bm.style.opacity = 0; }
    }
  },
  prepost(el) {
    const a = aggs.t_tesis_pre, b = aggs.t_tesis_post, c = aggs.q3_confianza, d = aggs.q3_post;
    const pa = a?.n ? pct(a.counts[0], a.n) : null, pb = b?.n ? pct(b.counts[0], b.n) : null;
    const sign = v => (v > 0 ? '+' : '') + v;
    el.innerHTML = `<div class="pp"><div class="lab">De acuerdo con la tesis</div><div class="row"><div class="big">${pa ?? '—'}<small>% al inicio</small></div><div class="big">${pb ?? '—'}<small>% al final</small></div><div class="delta">${pa != null && pb != null ? sign(pb - pa) + ' pt' : ''}</div></div></div>
      <div class="pp"><div class="lab">Confianza en las noticias (1–5)</div><div class="row"><div class="big">${fmt1(c?.mean)}<small>al inicio</small></div><div class="big">${fmt1(d?.mean)}<small>al final</small></div><div class="delta">${c?.n && d?.n ? (d.mean - c.mean >= 0 ? '+' : '−') + fmt1(Math.abs(d.mean - c.mean)) : ''}</div></div></div>`;
  },
};

function render(qid) {
  const q = QUESTIONS[qid], agg = aggs[qid];
  $$(`[data-q="${qid}"]`).forEach(el => { const r = renderers[el.dataset.view]; if (r) r(el, q, agg); });
  if (qid === 'q2_linea') $$('[data-view=stat-linea]').forEach(el => el.innerHTML = agg?.n ? `${pct(agg.counts[0], agg.n)}<small>%</small>` : '—<small>%</small>');
  if (qid === 'q3_confianza') $$('[data-view=stat-confianza]').forEach(el => el.innerHTML = `${fmt1(agg?.mean)}<small>/5</small>`);
  if (qid === 'q5_anunciantes') $$('[data-view=stat-anunciantes]').forEach(el => el.innerHTML = agg?.n ? `${pct(agg.counts[0] + agg.counts[1], agg.n)}<small>%</small>` : '—<small>%</small>');
  if (qid === 'q10_eldiario') $$('[data-view=survey-count]').forEach(el => el.innerHTML = `${agg?.n || 0}<small>han terminado</small>`);
  if (NEWSPAPERS.some(p => p.id === qid)) $$('[data-view=strips]').forEach(el => renderers.strips(el));
  if (qid === 'd2_casos') $$('[data-view=medioE]').forEach(el => renderers.medioE(el));
  if (['t_tesis_pre', 't_tesis_post', 'q3_confianza', 'q3_post'].includes(qid)) $$('[data-view=prepost]').forEach(el => renderers.prepost(el));

}
$$('[data-view=strips]').forEach(el => renderers.strips(el));
$$('[data-view=medioE]').forEach(el => renderers.medioE(el));
$$('[data-view=prepost]').forEach(el => renderers.prepost(el));

// Suscripciones (después de definir los renderizadores).
// Con clave: se leen las respuestas (cifradas) y se calculan los resultados.
// Sin clave: se muestran los resultados que publica el portátil de los ponentes.
for (const qid of Object.keys(QUESTIONS)) {
  if (canWrite) store.onResponses(qid, m => {
    responses[qid] = m || {};
    recompute(qid);
    if (qid === 'q6_ideologia') NEWSPAPERS.forEach(p => recompute(p.id));
  });
  else store.onAgg(qid, a => { aggs[qid] = a; render(qid); });
}


// ——— Muro ———
let wall = {};
store.onWall(w => { wall = w || {}; renderWall(); });
function renderWall() {
  const n = currentN(); const s = SLIDE_BY_N[n]; const qid = s?.phone?.qid;
  $$(`section[data-n="${n}"] [data-view=wall]`).forEach(el => {
    const posts = wallSort(wall).filter(p => p.qid === qid && !p.hidden);
    const pinned = state?.pinned && wall[state.pinned] && wall[state.pinned].qid === qid ? { id: state.pinned, ...wall[state.pinned] } : null;
    const rest = posts.filter(p => p.id !== pinned?.id).slice(0, pinned ? 4 : 6);
    const hidden = state && state.wallVisible === false;
    el.innerHTML = `<div class="wh"><span>Muro de la redacción</span><span>${posts.length} argumentos</span></div>` +
      (hidden ? `<div class="empty">Muro en pausa</div>` :
        (pinned ? `<div class="post pinned"><div>${esc(pinned.text)}<div class="meta">Argumento destacado · ${esc(roleLabel(pinned.role))}</div></div></div>` : '') +
        (rest.length ? rest.map(p => `<div class="post"><div>${esc(p.text)}<div class="meta">${esc(roleLabel(p.role))}</div></div><div class="v">${p.nVotes}</div></div>`).join('') : (pinned ? '' : `<div class="empty">Escribe tu argumento en el móvil. Los más votados aparecen aquí.</div>`)));
  });
}
function roleLabel(id) { return ROLES.find(r => r.id === id)?.label || 'Anónimo'; }

// ——— Presencia y reacciones ———
let users = {}, reactions = {}, status = { online: 0, total: 0 }, presenceAgg = null;
store.onUsers(u => { users = u || {}; updateTicker(); });
store.onReactions(r => { reactions = r || {}; updateTicker(); });
store.onStatus(st => { status = st; updateTicker(); updateBanner(); });
if (!canWrite) store.onAgg('_presence', a => { presenceAgg = a; updateTicker(); });
// Conectados: móviles que han dado señal en los últimos 75 s (envían una cada 25 s).
function connectedCount() {
  if (!canWrite) return presenceAgg?.n || 0;
  const now = Date.now();
  return Object.values(users).filter(u => u.sim || (u.seen && now - u.seen < 75000)).length;
}
let lastPresence = -1;
function updateTicker() {
  const c = connectedCount();
  $$('[data-view=connected]').forEach(el => el.innerHTML = `${c}<small>ya en la redacción</small>`);
  $('[data-t=connected]').textContent = c;
  if (canWrite && c !== lastPresence) { lastPresence = c; store.setAgg('_presence', { n: c, t: Date.now() }); }
  const modeEl = $('[data-t=mode]');
  if (store.mode === 'local') { modeEl.textContent = 'modo local'; modeEl.className = 'mode local'; }
  else if (!status.online) { modeEl.textContent = 'sin conexión'; modeEl.className = 'mode off'; }
  else { modeEl.textContent = (canWrite ? 'en vivo' : 'solo lectura') + (status.total > 1 ? ` · ${status.online}/${status.total}` : ''); modeEl.className = 'mode on'; }
  const r = aggs.d2_casos?.rigor; $('[data-t=rigor]').textContent = r == null ? '—' : fmt1(r) + ' / 10';
  const n = currentN(); const s = SLIDE_BY_N[n]; $('[data-t=slide]').textContent = `${s.section} · ${n}/${SLIDES.length}`;
  const now = Date.now(); const counts = {};
  for (const e of REACTIONS) counts[e] = 0;
  for (const r of Object.values(reactions)) if (r.t && now - r.t < 12000 && counts[r.emoji] != null) counts[r.emoji]++;
  $('[data-t=react]').innerHTML = REACTIONS.map(e => `<span>${e}<b>${counts[e] || ''}</b></span>`).join('');
}
setInterval(updateTicker, 3000);

// ——— Cuenta atrás ———
setInterval(() => {
  const n = currentN();
  const left = Math.max(0, Math.round((timerEnd - Date.now()) / 1000));
  const txt = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  $$(`section[data-n="${n}"] [data-view=countdown]`).forEach(el => { el.textContent = txt; el.style.color = left === 0 ? 'var(--text)' : 'var(--accent)'; });
  $$(`section[data-n="${n}"] [data-cd]`).forEach(el => { const s = SLIDE_BY_N[n]; el.textContent = s.timer ? ` · ${left ? txt : 'tiempo'}` : ''; });
}, 500);

// ——— Avisos (sin sesión, sin conexión, vista de solo lectura) ———
function updateBanner() {
  const b = $('#banner'); if (!b) return;
  let html = '';
  if (live && !status.online) html = `<b>Sin conexión con la sala.</b> Reintentando… Comprueba la red del portátil.`;
  else if (live && !store.session && canWrite) html = `<b>No hay sesión abierta.</b> <button data-newsession>Abrir sesión nueva</button>`;
  else if (live && !store.session) html = `<b>Esperando a que los ponentes abran la sesión…</b>`;
  else if (live && !canWrite && !solo) html = `Vista de solo lectura. <button data-key>Soy ponente</button>`;
  b.innerHTML = html; b.hidden = !html;
}
document.addEventListener('click', async e => {
  if (e.target.closest('[data-newsession]')) { await store.resetAll(); updateBanner(); }
  if (e.target.closest('[data-key]')) {
    const k = prompt('Pega la clave de ponente (está en tu enlace de ponente, después de «#k=»):');
    if (k && await store.login(k.replace(/^.*#k=/, ''))) location.reload(); else if (k) alert('Clave incorrecta.');
  }
});
setInterval(updateBanner, 2000);

updateTicker();
window.__deck = { store, deck, aggs, responses };
