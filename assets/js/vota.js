import { QUESTIONS, SLIDES, SLIDE_BY_N, ROLES, LENSES, GRADIENT, SURVEY_IDS, REACTIONS, WALL_MAX, BAD_WORDS, STRICT } from './questions.js';
import { createStore, wallSort, cleanText } from './store.js';
import { pct, fmt1 } from './agg.js';
import { demoSeed } from './demo.js';

const cfg = window.APP_CONFIG || {};
const store = await createStore(cfg);
const params = new URLSearchParams(location.search);
if (params.has('demo')) await demoSeed(store);
const forcedSlide = Number(params.get('slide')) || null;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const main = $('#main');
const mem = store.mode === 'local' ? sessionStorage : localStorage; // en modo local, cada pestaña es un alumno
const load = (k, d) => { try { return JSON.parse(mem.getItem('erp_' + k)) ?? d; } catch { return d; } };
const save = (k, v) => mem.setItem('erp_' + k, JSON.stringify(v));

// ——— Identidad anónima: rol y lente ———
let me = load('me', null);
if (!me || !me.role) { me = { role: ROLES[Math.floor(Math.random() * ROLES.length)].id }; save('me', me); }
await store.setUser({ role: me.role, lens: me.lens || null });
setInterval(() => store.setUser({}), 25000); // señal de vida para el contador «en la sala»
const roleEl = $('[data-role]');
function paintRole() { const r = ROLES.find(r => r.id === me.role); roleEl.textContent = r.label; roleEl.className = 'role ' + me.role; roleEl.hidden = STRICT; }
paintRole();

// Respuestas propias, guardadas por sesión (un ensayo no contamina la sesión real).
let mine = load('mine_' + (store.session || 'none'), {});
store.onSession(sess => { mine = load('mine_' + (sess || 'none'), {}); view.key = null; view.idx = null; render(); });
async function answer(qid, value) {
  mine[qid] = value; save('mine_' + (store.session || 'none'), mine);
  await store.submit(qid, value, { role: me.role, lens: me.lens || null });
  const q = QUESTIONS[qid];
  if (q.saveAs === 'lens') { me.lens = LENSES[value].id; save('me', me); await store.setUser({ lens: me.lens }); }
}

// ——— Reacciones ———
let lastReact = 0;
$('#reacts').innerHTML = REACTIONS.map(e => `<button data-e="${e}">${e}</button>`).join('');
$('#reacts').hidden = STRICT; // las reacciones no están en la guía
$('#reacts').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const now = Date.now(); if (now - lastReact < 1500) return; lastReact = now; store.react(b.dataset.e); b.animate([{ transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 250 }); });

// ——— Estado y agregados ———
let state = null, wall = {}, aggs = {};
let view = { key: null };
// Indicador de conexión en la cabecera.
const connEl = $('[data-conn]');
store.onStatus(st => { const on = st.online > 0; connEl.classList.toggle('off', !on); connEl.textContent = on ? 'La redacción · en directo' : 'Reconectando…'; });
const aggSubs = {};
function needAgg(qid) { if (aggSubs[qid]) return; aggSubs[qid] = store.onAgg(qid, a => { aggs[qid] = a; renderSoft(); }); }
store.onWall(w => { wall = w || {}; renderSoft(); });
store.onState(st => { state = forcedSlide ? { ...st, slide: forcedSlide } : st; render(); });

// ——— Vista ———
function currentSlide() { return SLIDE_BY_N[state?.slide || 1]; }
function isOpen(s, qid) { return state && state.slide === s.n && !(state.closed && state.closed[qid]); }
const surveyDone = () => SURVEY_IDS.every(q => mine[q] !== undefined || (QUESTIONS[q].optional && mine[q] === null));
const surveyStarted = () => SURVEY_IDS.some(q => mine[q] !== undefined);

let waitedSince = Date.now(), waitTimer = null;
function render() {
  if (!state) return;
  const s = currentSlide();
  const hash = location.hash;
  let kind = s.phone.kind;
  if (store.mode === 'mqtt' && !store.session && hash !== '#fuentes') {
    const long = Date.now() - waitedSince > 8000;
    view = { key: 'waiting' };
    main.innerHTML = `${header('Conectando', long ? 'Esperando a que empiece la sesión' : 'Entrando en la redacción…', long ? 'Los ponentes todavía no han abierto la sesión. Esta pantalla cambiará sola.' : null)}<div class="wait">${long ? 'Puedes dejar el móvil así' : 'Un momento'}</div>`;
    clearTimeout(waitTimer); waitTimer = setTimeout(render, 2000);
    return;
  }
  if (hash === '#fuentes') kind = 'thanks';
  if (view.forceSurvey && !surveyDone() && state.slide < 15) kind = 'survey';
  const key = kind + ':' + s.n + ':' + (kind === 'survey' ? (view.forceSurvey ? 'f' : '') : '');
  if (view.key !== key) { view = { key, forceSurvey: view.forceSurvey, idx: view.idx }; main.innerHTML = ''; build(kind, s); }
  renderSoft();
}

function build(kind, s) {
  const phone = kind === 'survey' && view.forceSurvey && s.phone.kind !== 'survey' ? { kind: 'survey', qids: SURVEY_IDS, title: 'Encuesta y experimento' } : s.phone;
  switch (kind) {
    case 'welcome': return buildWelcome(s);
    case 'survey': return buildSurvey(s, phone);
    case 'compare': return buildCompare(s, phone);
    case 'question': return buildQuestion(s, phone.qid, false);
    case 'debate': return buildQuestion(s, phone.qid, true);
    case 'listen': return buildListen(s, phone);
    case 'thanks': return buildThanks(s);
  }
}

function header(kick, title, sub, blue) {
  return `<div><div class="kick${blue ? ' blue' : ''}">${esc(kick)}</div><h1>${title}</h1>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}</div>`;
}
function timerBar() { return `<div class="timerbar" data-timer style="width:0"></div>`; }
function resumeBanner() {
  if (surveyDone() || !state || state.slide >= 15 || state.slide < 3) return '';
  return `<button class="btn ghost" data-act="survey">${surveyStarted() ? 'Terminar la encuesta' : '¿Llegas ahora? Haz la encuesta (2 min)'}</button>`;
}

function buildWelcome(s) {
  const r = ROLES.find(r => r.id === me.role);
  needAgg('_presence');
  main.innerHTML = `${STRICT ? header('Bienvenida', 'La ética del periodismo', 'Rigor periodístico vs. línea editorial. Votación anónima: sin registro y sin datos personales.') : header('Bienvenida', 'Entras en la redacción', 'Hoy sois el consejo editorial. Cada persona mira el dilema desde un sitio.')}
    ${STRICT ? '' : `<div class="card"><div class="lab">Tu carné</div><div class="big-role">${esc(r.label)}</div><div class="sub">${esc(r.hint)}</div></div>`}
    <div class="card"><div class="lab">En la sala</div><div style="font-size:40px;font-weight:200" data-presence>…</div></div>
    ${surveyDone() ? `<div class="saved">Encuesta hecha ✓</div>` : `<button class="btn" data-act="survey">${surveyStarted() ? 'Terminar la encuesta' : 'Empezar la encuesta (2 min)'}</button>`}
    <div class="wait">Esperando a que empiece la presentación</div>`;
}

function buildListen(s, phone) {
  main.innerHTML = `${header(s.section, esc(s.title), null, true)}
    <div class="card"><div class="lab">En pantalla</div><ul class="lines">${(phone.lines || []).map(l => `<li>${esc(l)}</li>`).join('')}</ul></div>
    ${resumeBanner()}
    <div class="wait">Escucha. El móvil cambiará cuando toque participar.</div>`;
}

function buildThanks() {
  main.innerHTML = `${header('Cierre', 'Gracias', 'Las respuestas de hoy son anónimas y se borran al terminar.')}
    <div class="card"><div class="lab">Fuentes principales</div><ul class="lines">
      <li>Digital News Report España 2026 (Universidad de Navarra y Reuters Institute)</li><li>Constitución Española, art. 20.1.d</li><li>LO 2/1997, cláusula de conciencia</li><li>Código Deontológico de la FAPE</li><li>Reglamento (UE) 2024/1083, EMFA, art. 6.3 y 25</li><li>RGPD, art. 9</li><li>Freeman, teoría de stakeholders</li><li>Vallone, Ross y Lepper (1985), efecto del medio hostil</li></ul></div>
    <div class="card"><div class="lab">Agradecimiento</div><p class="sub" style="margin:0">A COPE y a su director de programación y contenidos informativos.</p></div>`;
}

// ——— Encuesta por pasos ———
function buildSurvey(s, phone) {
  const qids = phone.qids;
  const firstPending = qids.findIndex(q => mine[q] === undefined);
  if (view.idx == null || view.idx >= qids.length) view.idx = firstPending === -1 ? qids.length : firstPending;
  main.innerHTML = `<div class="progress">${qids.map((q, i) => `<i class="${i < view.idx ? 'done' : ''}"></i>`).join('')}</div>${timerBar()}<div data-step style="flex:1;display:flex;flex-direction:column;gap:16px"></div>`;
  renderSurveyStep(s, qids);
}
function renderSurveyStep(s, qids) {
  const box = $('[data-step]', main); if (!box) return;
  if (view.idx >= qids.length) {
    view.forceSurvey = false;
    box.innerHTML = `${header(s.phone.title || 'Encuesta', 'Ya está. Gracias.', 'Verás tus respuestas frente a las de la clase en la pantalla y aquí.')}<div class="saved">Guardado ✓</div><button class="btn ghost" data-act="review">Revisar mis respuestas</button>`;
    $$('.progress i', main).forEach(i => i.classList.add('done'));
    return;
  }
  const qid = qids[view.idx], q = QUESTIONS[qid];
  const group = q.group === 'experimento' ? 'Experimento' : (s.phone.title || 'Encuesta');
  box.innerHTML = `${header(`${group} · ${view.idx + 1} / ${qids.length}`, esc(q.title), q.sub)}<div data-widget></div>
    <div style="display:grid;grid-template-columns:1fr 2fr;gap:8px;margin-top:auto"><button class="btn ghost" data-act="back" ${view.idx === 0 ? 'disabled' : ''}>Atrás</button><button class="btn" data-act="next" ${mine[qid] === undefined ? 'disabled' : ''}>${view.idx === qids.length - 1 ? 'Terminar' : 'Siguiente'}</button></div>`;
  widget($('[data-widget]', box), qid, true, () => { $('[data-act=next]', box).disabled = false; $$('.progress i', main).forEach((i, k) => i.classList.toggle('done', k < view.idx)); });
}

// ——— Pregunta suelta y debate ———
function buildQuestion(s, qid, debate) {
  const q = QUESTIONS[qid];
  main.innerHTML = `${header(s.section, esc(q.title), q.sub || (debate ? 'Vota y, si quieres, deja un argumento en el muro.' : null), !debate)}${timerBar()}<div data-widget></div><div class="saved" data-saved></div>` +
    (debate && !STRICT ? `<div class="wallbox"><div class="kick">Muro de la redacción</div><textarea maxlength="${WALL_MAX}" placeholder="Tu argumento, en una frase (anónimo)" data-wall-text></textarea><div class="row"><span class="cnt" data-cnt>0 / ${WALL_MAX}</span><button class="btn" data-act="post">Publicar</button></div><div class="posts" data-posts></div></div>` : '');
  widget($('[data-widget]', main), qid, isOpen(s, qid), () => { $('[data-saved]', main).textContent = 'Guardado ✓ · puedes cambiarlo'; });
  const ta = $('[data-wall-text]', main);
  if (ta) ta.addEventListener('input', () => { $('[data-cnt]', main).textContent = `${ta.value.length} / ${WALL_MAX}`; });
}

function buildCompare(s, phone) {
  phone.qids.forEach(needAgg);
  main.innerHTML = `${header(s.section, esc(phone.title), 'Tu respuesta, en azul, frente a la clase.', true)}<div class="cmp" data-cmp></div>${resumeBanner()}`;
}
function renderCompare() {
  const box = $('[data-cmp]', main); if (!box) return;
  const s = currentSlide();
  box.innerHTML = s.phone.qids.map(qid => {
    const q = QUESTIONS[qid], a = aggs[qid], my = mine[qid];
    if (q.type === 'choice') {
      return `<div class="card"><div class="q">${esc(q.title)}</div>` + q.options.map((o, i) => `<div class="bar ${my === i ? 'mine' : ''}"><div><div class="lab"><span>${esc(o)}${my === i ? ' <b>· tú</b>' : ''}</span></div><div class="track"><div class="fill" style="width:${a?.n ? pct(a.counts[i], a.n) : 0}%"></div></div></div><div class="v">${a?.n ? pct(a.counts[i], a.n) : 0}%</div></div>`).join('') + `</div>`;
    }
    const min = q.min, max = q.max, span = max - min;
    const pos = v => ((v - min) / span) * 100;
    return `<div class="card"><div class="q">${esc(q.title)}</div><div class="axis">${a?.n ? `<div class="m class" style="left:${pos(a.mean)}%" data-l="clase ${fmt1(a.mean)}"></div>` : ''}${my != null ? `<div class="m me" style="left:${pos(my)}%" data-l="tú ${my}"></div>` : ''}</div><div class="axis-l"><span>${esc(q.labels?.[0] || min)}</span><span>${esc(q.labels?.[1] || max)}</span></div>${a?.n ? '' : '<div class="sub" style="font-size:12px;margin-top:6px">Esperando a la clase…</div>'}</div>`;
  }).join('');
}

// ——— Widgets ———
function widget(el, qid, open, onSaved) {
  const q = QUESTIONS[qid]; const my = mine[qid];
  const closedTag = open ? '' : `<div class="closed">Votación cerrada</div>`;
  const done = async v => { if (!open) return; await answer(qid, v); onSaved && onSaved(); paint(); };
  let paint;
  switch (q.type) {
    case 'choice': {
      el.innerHTML = closedTag + `<div class="opts">${q.options.map((o, i) => `<button class="opt" data-i="${i}" ${open ? '' : 'disabled'}><span>${esc(o)}${q.hints ? `<small>${esc(q.hints[i])}</small>` : ''}</span><span class="tick">✓</span></button>`).join('')}</div>`;
      paint = () => $$('.opt', el).forEach(b => b.classList.toggle('sel', Number(b.dataset.i) === mine[qid]));
      el.addEventListener('click', e => { const b = e.target.closest('.opt'); if (b) done(Number(b.dataset.i)); });
      break;
    }
    case 'scale': {
      el.innerHTML = closedTag + `<div class="scale">${[...Array(q.max - q.min + 1).keys()].map(k => `<button class="opt" data-v="${q.min + k}" ${open ? '' : 'disabled'}>${q.min + k}</button>`).join('')}</div><div class="scale-labels"><span>${esc(q.labels[0])}</span><span>${esc(q.labels[1])}</span></div>`;
      paint = () => $$('.opt', el).forEach(b => b.classList.toggle('sel', Number(b.dataset.v) === mine[qid]));
      el.addEventListener('click', e => { const b = e.target.closest('.opt'); if (b) done(Number(b.dataset.v)); });
      break;
    }
    case 'slider': {
      const start = my ?? Math.round((q.min + q.max) / 2);
      el.innerHTML = closedTag + `<div class="slider"><div class="val"><span data-v>${my ?? '–'}</span><small>${q.unit || ''}</small></div><input type="range" min="${q.min}" max="${q.max}" step="1" value="${start}" ${open ? '' : 'disabled'}><div class="scale-labels"><span>${esc(q.labels?.[0] || q.min)}</span><span>${esc(q.labels?.[1] || q.max)}</span></div>${my == null ? '<div class="sub" style="text-align:center;font-size:13px">Desliza y suelta para guardar</div>' : ''}${q.optional ? `<button class="btn ghost" data-skip>Prefiero no decirlo</button>` : ''}</div>`;
      const inp = $('input', el);
      inp.addEventListener('input', () => { $('[data-v]', el).textContent = inp.value; });
      inp.addEventListener('change', () => done(Number(inp.value)));
      $('[data-skip]', el)?.addEventListener('click', () => { mine[qid] = null; save('mine_' + (store.session || 'none'), mine); onSaved && onSaved(); });
      paint = () => {};
      break;
    }
    case 'cases': {
      const val = { ...(my || {}) };
      el.innerHTML = closedTag + `<div style="display:grid;gap:18px">${q.cases.map(c => `<div class="case" data-c="${c.id}"><div class="txt"><b>${c.id}</b>${esc(c.text)}</div><div class="steps">${q.steps.map((st, i) => `<button class="${st.zone}" data-i="${i}" ${open ? '' : 'disabled'}>${esc(st.label)}</button>`).join('')}</div></div>`).join('')}</div>`;
      paint = () => $$('.case', el).forEach(c => $$('button', c).forEach(b => b.classList.toggle('sel', val[c.dataset.c] === Number(b.dataset.i))));
      el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b || !open) return; val[b.closest('.case').dataset.c] = Number(b.dataset.i); paint(); if (q.cases.every(c => val[c.id] != null)) done({ ...val }); });
      break;
    }
    case 'rank': {
      let order = Array.isArray(my) ? [...my] : [];
      el.innerHTML = closedTag + `<div class="rank">${q.items.map((it, i) => `<button class="opt" data-i="${i}" ${open ? '' : 'disabled'}><span>${esc(it)}</span><span class="tick" data-n></span></button>`).join('')}</div><button class="btn ghost" data-reset style="margin-top:6px">Empezar de nuevo</button>`;
      paint = () => $$('.opt', el).forEach(b => { const pos = order.indexOf(Number(b.dataset.i)); b.classList.toggle('sel', pos >= 0); $('[data-n]', b).textContent = pos >= 0 ? pos + 1 : ''; });
      el.addEventListener('click', e => {
        if (!open) return;
        if (e.target.closest('[data-reset]')) { order = []; paint(); return; }
        const b = e.target.closest('.opt'); if (!b) return; const i = Number(b.dataset.i);
        if (order.includes(i)) order = order.slice(0, order.indexOf(i)); else order.push(i);
        paint(); if (order.length === q.items.length) done([...order]);
      });
      break;
    }
  }
  paint();
}

// ——— Muro ———
async function post() {
  const ta = $('[data-wall-text]', main); if (!ta) return;
  const { text, flagged } = cleanText(ta.value, BAD_WORDS);
  if (!text) return;
  if (flagged) { $('[data-saved]', main).textContent = 'Cuida el lenguaje: el argumento no se ha publicado.'; return; }
  const s = currentSlide();
  await store.wallPost(text.slice(0, WALL_MAX), { qid: s.phone.qid, slide: s.n, role: me.role });
  ta.value = ''; $('[data-cnt]', main).textContent = `0 / ${WALL_MAX}`;
}
function renderPosts() {
  const box = $('[data-posts]', main); if (!box) return;
  const s = currentSlide(); const qid = s.phone.qid;
  const posts = wallSort(wall).filter(p => p.qid === qid && !p.hidden);
  box.innerHTML = posts.length ? posts.map(p => `<div class="post ${p.uid === store.uid ? 'mine' : ''} ${state?.pinned === p.id ? 'pinned' : ''}"><div>${esc(p.text)}<div class="meta">${state?.pinned === p.id ? 'En pantalla · ' : ''}${esc(ROLES.find(r => r.id === p.role)?.label || 'Anónimo')}</div></div><button class="vote ${p.votes && p.votes[store.uid] ? 'on' : ''}" data-vote="${p.id}">▲ ${p.nVotes}</button></div>`).join('') : `<div class="sub" style="font-size:13px">Todavía no hay argumentos. Sé el primero.</div>`;
}

function renderSoft() {
  renderPosts();
  renderCompare();
  const pe = $('[data-presence]', main); if (pe) pe.textContent = aggs._presence?.n ?? '…';
}

// Barra de tiempo
setInterval(() => {
  const bar = $('[data-timer]', main); if (!bar || !state) return;
  const s = currentSlide(); if (!s.timer || !state.timerEnd) { bar.style.width = 0; return; }
  const left = Math.max(0, state.timerEnd - Date.now()); bar.style.width = Math.min(100, (left / (s.timer * 1000)) * 100) + '%';
}, 1000);

// ——— Acciones ———
main.addEventListener('click', async e => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  const vote = e.target.closest('[data-vote]')?.dataset.vote;
  if (vote) { await store.wallVote(vote); return; }
  if (!act) return;
  if (act === 'survey') { view.forceSurvey = true; view.idx = null; view.key = null; render(); }
  if (act === 'review') { view.idx = 0; view.key = null; view.forceSurvey = true; render(); }
  if (act === 'post') post();
  if (act === 'next' || act === 'back') { view.idx += act === 'next' ? 1 : -1; const s = currentSlide(); const qids = (view.forceSurvey && s.phone.kind !== 'survey') ? SURVEY_IDS : s.phone.qids; renderSurveyStep(s, qids); }
});
window.addEventListener('hashchange', () => { view.key = null; render(); });
window.__vota = { store, mine, me };
