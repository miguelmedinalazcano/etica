// Consola de ponente: guion de la slide actual, estado del público, un botón grande y las herramientas plegadas.
import { QUESTIONS, SLIDES, SLIDE_BY_N, ROLES, LENSES, SURVEY_IDS, PRESENTERS, TOTAL_SECONDS, POLL_SLIDES } from './questions.js';
import { startAggregator } from './aggregator.js';
import { createStore, wallSort } from './store.js';
import { demoSeed } from './demo.js';

const cfg = window.APP_CONFIG || {};
const store = await createStore(cfg);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const app = $('#app');
const params = new URLSearchParams(location.search);
const forcedSlide = Number(params.get('slide')) || null;
if (params.has('demo')) await demoSeed(store);
const mmss = sec => { const s = Math.max(0, Math.round(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

if (store.mode === 'firebase' && !store.isPresenter) {
  app.innerHTML = `<div class="hdr"><span>Consola de ponente</span><span class="mode">en vivo</span></div><form class="login"><b>Acceso de ponente</b><input name="email" type="email" placeholder="Correo" required><input name="pass" type="password" placeholder="Contraseña" required><button class="btn primary">Entrar</button><span class="note" data-err></span></form>`;
  await new Promise(resolve => $('form', app).addEventListener('submit', async e => { e.preventDefault(); try { if (await store.login(e.target.email.value, e.target.pass.value)) resolve(); else $('[data-err]', app).textContent = 'Este correo no está en la lista de ponentes.'; } catch (err) { $('[data-err]', app).textContent = err.message; } }));
}

// En vivo, la consola necesita la clave de ponente (llega con el enlace de ponente).
if (store.mode === 'mqtt' && !store.canWrite) {
  app.innerHTML = `<div class="hdr"><span>Consola de ponente</span><span class="mode">en vivo</span></div>
    <form class="login"><b>Falta la clave de ponente</b><p class="note">Abre esta consola desde tu <b>enlace de ponente</b> (te lo habrá pasado el grupo). Una vez abierto, este móvil la recuerda. También puedes pegar aquí el enlace o la clave.</p>
    <input name="k" placeholder="Enlace o clave de ponente" autocomplete="off" required><button class="btn primary">Entrar</button><span class="note" data-err></span></form>`;
  await new Promise(resolve => $('form', app).addEventListener('submit', async e => {
    e.preventDefault();
    const k = e.target.k.value.trim().replace(/^.*#k=/, '');
    if (await store.login(k)) resolve(); else $('[data-err]', app).textContent = 'Clave incorrecta.';
  }));
}

let state = null, wall = {}, aggs = {}, builtFor = null, status = { online: 0, total: 0 };
// La consola también calcula los resultados: así funcionan aunque el proyector muestre un PowerPoint.
if (store.canWrite) startAggregator(store);
// Mantener la pantalla encendida mientras la consola está abierta (si el móvil lo permite).
let wakeLock = null;
async function keepAwake() { try { if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch {} }
document.addEventListener('visibilitychange', keepAwake); document.addEventListener('click', keepAwake); keepAwake();
// ¿Hay una presentación HTML abierta con clave? Si no, «Siguiente» mueve los móviles directamente.
const deckPresent = () => !!(state && state.deckAt && Date.now() - state.deckAt < 50000);
const aggSubs = {};
const doneSteps = {}; // pasos del guion marcados, solo en este móvil
function needAgg(qid) { if (aggSubs[qid]) return; aggSubs[qid] = store.onAgg(qid, a => { aggs[qid] = a; renderSoft(); }); }
needAgg('_presence');
store.onWall(w => { wall = w || {}; renderSoft(); });
store.onState(st => { state = forcedSlide ? { ...st, slide: forcedSlide } : st; render(); });
store.onStatus(st => { status = st; renderSoft(); });
store.onSession(() => { builtFor = null; render(); });
setInterval(renderSoft, 1000);

function cur() { return SLIDE_BY_N[state?.slide || 1]; }
function describePhone(s) {
  const k = s.phone.kind; const q = s.phone.qid ? QUESTIONS[s.phone.qid] : null;
  const type = { choice: 'voto', scale: 'escala', slider: 'deslizador', cases: 'casos en el gradiente', rank: 'ranking' }[q?.type] || '';
  return { welcome: 'bienvenida y carné de rol', survey: `encuesta de ${s.phone.qids?.length || 0} preguntas`, compare: 'tú frente a la clase', question: type, debate: `${type} + muro`, listen: 'ficha de escucha', thanks: 'gracias y fuentes' }[k] || k;
}

function render() {
  if (!state) return;
  if (store.mode === 'mqtt' && !store.session) {
    builtFor = null;
    app.innerHTML = `<div class="hdr"><span>Consola de ponente</span><span class="mode" data-modelabel>…</span></div>
      <div class="now"><div class="ttl">No hay sesión abierta</div><p class="note">Ábrela antes de que entre la clase. Los móviles que ya estén en la página entrarán solos.</p><button class="btn primary" data-newsession><span>Abrir sesión nueva</span></button></div>`;
    renderSoft();
    return;
  }
  const s = cur();
  if (builtFor !== s.n) { builtFor = s.n; build(s); }
  renderSoft();
}

function build(s) {
  const qid = s.phone.qid; const qids = s.phone.qids || (qid ? [qid] : []);
  qids.forEach(needAgg);
  const next = SLIDE_BY_N[s.n + 1];
  const interactive = ['survey', 'question', 'debate'].includes(s.phone.kind);
  app.innerHTML = `
    <div class="hdr"><span>Consola de ponente</span><span><span data-presence>0</span> en sala · <span class="mode" data-modelabel>…</span></span></div>
    <div class="clock"><div class="t"><span data-clock>0:00</span><small>/ ${mmss(TOTAL_SECONDS)}</small></div><div><div class="d idle" data-delta>objetivo ${mmss(s.t)}</div><button class="btn sm" data-start style="margin-top:6px;display:none">Empezar reloj</button></div></div>
    <div class="now">
      <div class="sec"><span>${esc(s.section)} · ${s.n} / ${SLIDES.length}</span><span class="who">${esc(PRESENTERS[s.who] || s.who || '')}</span></div>
      <div class="ttl">${esc(s.title)}</div>
      <div class="live"><div class="ph">📱 ${esc(describePhone(s))}</div>${interactive ? `<div class="st"><span data-votes>—</span><b class="cd" data-cd></b></div><div class="bar"><i data-bar></i></div>` : `<div class="st"><span>Sin acción en el móvil</span></div>`}</div>
      <ol class="script">${(s.script || []).map((x, i) => `<li data-step="${i}" class="${doneSteps[s.n + ':' + i] ? 'done' : ''}">${esc(x)}</li>`).join('')}</ol>
    </div>
    <div class="nav"><button class="btn" data-cmd="prev">◀</button><button class="btn primary" data-cmd="next"><span>Siguiente ▶</span><small data-nextlabel></small></button></div>
    <div class="polls"><div class="sec-t">Votaciones en el móvil</div><div class="pollrow">${POLL_SLIDES.map(n => `<button class="btn sm ${n === s.n ? 'cur' : ''}" data-poll="${n}"><b>${n}</b> ${esc(SLIDE_BY_N[n].section)}</button>`).join('')}<button class="btn sm" data-poll="1">Espera</button></div></div>
    <div class="after" data-after></div>
    ${qids.length ? `<details><summary>Votación</summary><div class="body q">` + qids.slice(0, 1).map(q => `<div data-qbox="${q}"><div class="st"><span data-n>0 respuestas</span><b data-open></b></div><div class="row2" style="margin-top:8px"><button class="btn" data-close="${q}">Cerrar votación</button><button class="btn" data-cmd="timer">⏱ Reiniciar cuenta atrás</button></div><div class="row2" style="margin-top:8px"><button class="btn warn sm" data-sim="${q}">Simular 30 respuestas</button><button class="btn danger sm" data-clear="${q}">Borrar respuestas</button></div></div>`).join('') + `</div></details>` : ''}
    ${s.phone.kind === 'debate' ? `<details open><summary>Muro <span data-wallcount></span></summary><div class="body"><div class="row2"><button class="btn sm" data-wallvis>Ocultar muro</button><button class="btn sm" data-unpin>Quitar destacado</button></div><div class="posts" data-posts></div><div class="row2"><button class="btn warn sm" data-simwall>Simular argumentos</button><button class="btn danger sm" data-wallclear>Vaciar muro</button></div></div></details>` : ''}
    <details><summary>Ir a una slide</summary><div class="body"><div class="slides">${SLIDES.map(x => `<button data-goto="${x.n}" class="${x.n === s.n ? 'cur' : ''}"><b>${String(x.n).padStart(2, '0')}</b><span>${esc(x.title)}</span><span>${['debate', 'question', 'survey'].includes(x.phone.kind) ? `<span class="k">${x.phone.kind === 'debate' ? 'debate' : 'voto'}</span> ` : ''}<span class="w">${esc(x.who || '')} · ${mmss(x.t)}</span></span></button>`).join('')}</div></div></details>
    <details><summary>Sesión</summary><div class="body"><div class="row2"><button class="btn" data-startclock>Reiniciar reloj</button><a class="btn" style="text-align:center;text-decoration:none;line-height:22px" href="../" target="_blank">Abrir presentación</a></div><button class="btn danger" data-resetall>Preparar sesión nueva (borra todo)</button>${store.mode === 'mqtt' ? `<button class="btn sm" data-forget>Olvidar la clave en este móvil</button>` : ''}<p class="note">Solo pulsa quien habla. El portátil solo muestra la presentación. Toca un paso del guion para marcarlo como hecho.</p></div></details>`;
  renderAfter(s, next);
}
function renderAfter(s, next) {
  const el = $('[data-after]'); if (!el) return;
  el.innerHTML = next ? `<b>Después:</b> ${next.n} · ${esc(next.title)} · 📱 ${esc(describePhone(next))} · ${esc(PRESENTERS[next.who] || '')}` : '<b>Última slide.</b>';
}

function renderSoft() {
  const ml = $('[data-modelabel]');
  if (ml) {
    if (store.mode === 'local') { ml.textContent = 'modo local'; ml.className = 'mode local'; }
    else if (!status.online) { ml.textContent = 'sin conexión'; ml.className = 'mode off'; }
    else { ml.textContent = `en vivo · ${status.online}/${status.total}`; ml.className = 'mode on'; }
  }
  if (!state || (store.mode === 'mqtt' && !store.session)) return;
  const s = cur();
  const pres = aggs._presence?.n ?? 0;
  const pe = $('[data-presence]'); if (pe) pe.textContent = pres;
  // Reloj de sesión compartido
  const clock = $('[data-clock]'), delta = $('[data-delta]'), startBtn = $('[data-start]');
  if (clock) {
    if (state.startedAt) {
      const el = (Date.now() - state.startedAt) / 1000; clock.textContent = mmss(el);
      const d = el - (s.t || 0);
      delta.textContent = Math.abs(d) < 30 ? `en hora · objetivo ${mmss(s.t)}` : (d > 0 ? `+${mmss(d)} tarde · objetivo ${mmss(s.t)}` : `−${mmss(-d)} adelante · objetivo ${mmss(s.t)}`);
      delta.className = 'd ' + (Math.abs(d) < 30 ? 'idle' : d > 0 ? 'late' : 'early');
      clock.style.color = el > TOTAL_SECONDS ? 'var(--linea)' : '';
      startBtn.style.display = 'none';
    } else { clock.textContent = '0:00'; delta.textContent = 'el reloj arranca al salir de la portada'; delta.className = 'd idle'; startBtn.style.display = s.n === 1 ? '' : 'none'; }
  }
  // Estado de la votación
  const votes = $('[data-votes]'), cd = $('[data-cd]'), bar = $('[data-bar]');
  if (votes) {
    let n = 0, label = '';
    if (s.phone.kind === 'survey') { const started = aggs[s.phone.qids[0]]?.n || 0; n = aggs[s.phone.qids[s.phone.qids.length - 1]]?.n || 0; label = `${n} han terminado · ${started} han empezado`; }
    else { n = aggs[s.phone.qid]?.n || 0; label = `${n} han respondido`; }
    const closed = state.closed && state.closed[s.phone.qid];
    votes.innerHTML = `<b>${label}</b> de ${pres} en sala${closed ? ' · <span style="color:var(--warn)">cerrada</span>' : ''}`;
    bar.style.width = (pres ? Math.min(100, (n / pres) * 100) : 0) + '%';
    const left = state.timerEnd ? Math.max(0, (state.timerEnd - Date.now()) / 1000) : 0;
    cd.textContent = s.timer ? (left > 0 ? `⏱ ${mmss(left)}` : '⏱ tiempo') : '';
  }
  // Botón siguiente: ¿muestra un fragmento o cambia de slide?
  const nl = $('[data-nextlabel]');
  if (nl) { const f = state.frag; const next = SLIDE_BY_N[s.n + 1]; nl.textContent = deckPresent() && f && f.i < f.total ? `muestra: ${f.next || 'siguiente elemento'} (${f.i + 1}/${f.total})` : (next ? `pasa a ${next.n} · ${next.title}` : 'fin'); }
  $$('[data-qbox]').forEach(box => {
    const q = box.dataset.qbox; const a = aggs[q];
    $('[data-n]', box).textContent = `${a?.n || 0} respuestas`;
    const closed = state.closed && state.closed[q];
    const o = $('[data-open]', box); o.textContent = closed ? 'cerrada' : 'abierta'; o.className = closed ? 'closed' : 'open';
    $('[data-close]', box).textContent = closed ? 'Reabrir votación' : 'Cerrar votación';
  });
  const posts = $('[data-posts]');
  if (posts) {
    const list = wallSort(wall).filter(p => p.qid === s.phone.qid);
    const wc = $('[data-wallcount]'); if (wc) wc.textContent = `· ${list.filter(p => !p.hidden).length}`;
    posts.innerHTML = list.length ? list.map(p => `<div class="post ${p.hidden ? 'hidden' : ''} ${state.pinned === p.id ? 'pinned' : ''}"><div>${esc(p.text)}<div class="meta">▲ ${p.nVotes} · ${esc(ROLES.find(r => r.id === p.role)?.label || '')}</div></div><button class="btn sm" data-pin="${p.id}">${state.pinned === p.id ? 'Quitar' : 'Destacar'}</button><button class="btn sm" data-hide="${p.id}">${p.hidden ? 'Mostrar' : 'Ocultar'}</button></div>`).join('') : `<div class="note">Sin argumentos todavía.</div>`;
    const wv = $('[data-wallvis]'); if (wv) wv.textContent = state.wallVisible === false ? 'Mostrar muro' : 'Ocultar muro';
  }
}

const SAMPLE_ARGS = ['Sin ideología no hay medio: lo importante es que la declare.', 'El rigor es verificar; la línea es elegir de qué hablas. No se pisan.', 'Si omites un dato porque no te gusta, ya no informas.', 'La audiencia tiene derecho a saber quién paga y quién manda.', 'Un medio neutral no existe; uno honesto, sí.', 'Las marcas ya eligen; que elijan también por rigor.'];

app.addEventListener('click', async e => {
  const li = e.target.closest('li[data-step]');
  if (li) { const k = cur().n + ':' + li.dataset.step; doneSteps[k] = !doneSteps[k]; li.classList.toggle('done', doneSteps[k]); return; }
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset;
  if (d.cmd) {
    // Con presentación HTML abierta, ella decide (fragmentos incluidos). Sin ella (PowerPoint), la consola mueve los móviles.
    if (deckPresent() || d.cmd === 'timer' && deckPresent()) { await store.setState({ cmd: { type: d.cmd, t: Date.now() } }); return; }
    const s = cur();
    if (d.cmd === 'timer') { await store.setState({ timerEnd: Date.now() + (s.timer || 60) * 1000 }); return; }
    const n = Math.max(1, Math.min(SLIDES.length, s.n + (d.cmd === 'next' ? 1 : -1)));
    const ns = SLIDE_BY_N[n]; const patch = { slide: n, frag: null };
    if (ns.timer) patch.timerEnd = Date.now() + ns.timer * 1000;
    if (n >= 2 && !state.startedAt) patch.startedAt = Date.now();
    await store.setState(patch); return;
  }
  if (d.poll) { const n = Number(d.poll); const ns = SLIDE_BY_N[n]; const patch = { slide: n }; if (ns.timer) patch.timerEnd = Date.now() + ns.timer * 1000; if (n >= 2 && !state.startedAt) patch.startedAt = Date.now(); await store.setState(patch); return; }
  if (d.goto) { const n = Number(d.goto); const ns = SLIDE_BY_N[n]; const patch = { slide: n }; if (!deckPresent() && ns.timer) patch.timerEnd = Date.now() + ns.timer * 1000; await store.setState(patch); return; }
  if (b.hasAttribute('data-start') || b.hasAttribute('data-startclock')) { await store.setState({ startedAt: Date.now() }); return; }
  if (d.close) { const closed = { ...(state.closed || {}) }; closed[d.close] = !closed[d.close]; await store.setState({ closed }); }
  if (d.sim) { const s = cur(); const qids = s.phone.qids || [d.sim]; for (const q of qids) await store.simulate(q, QUESTIONS[q], 30, ROLES, LENSES); }
  if (d.clear) { if (confirm('¿Borrar las respuestas de esta pregunta?')) { const s = cur(); await store.resetResponses(s.phone.qids || [d.clear]); } }
  if (b.hasAttribute('data-wallvis')) await store.setState({ wallVisible: state.wallVisible === false });
  if (b.hasAttribute('data-simwall')) await store.simulateWall(SAMPLE_ARGS.sort(() => Math.random() - 0.5).slice(0, 4), { qid: cur().phone.qid, slide: cur().n, role: ROLES[0].id });
  if (b.hasAttribute('data-wallclear')) { if (confirm('¿Vaciar el muro?')) await store.wallClear(); }
  if (b.hasAttribute('data-unpin')) await store.setState({ pinned: null });
  if (d.pin) await store.setState({ pinned: state.pinned === d.pin ? null : d.pin });
  if (d.hide) await store.wallUpdate(d.hide, { hidden: !wall[d.hide]?.hidden });
  if (b.hasAttribute('data-newsession')) { await store.resetAll(); builtFor = null; render(); }
  if (b.hasAttribute('data-resetall')) { if (confirm('Esto empieza una sesión nueva: respuestas, muro y reloj a cero. Los móviles cambian solos. ¿Seguro?')) { await store.resetAll(); if (store.mode === 'local') location.reload(); else { builtFor = null; render(); } } }
  if (b.hasAttribute('data-forget')) { if (confirm('¿Quitar la clave de ponente de este móvil?')) { await store.logout(); location.reload(); } }
});
window.__mando = { store };
