// Calcula los resultados a partir de las respuestas (cifradas) y los publica firmados.
// Lo ejecuta cualquier dispositivo con clave de ponente: el portátil (presentación HTML) o la consola.
// Si hay varios, publican lo mismo: no se pisan.
import { QUESTIONS, NEWSPAPERS } from './questions.js';
import { aggregate } from './agg.js';

export function startAggregator(store, { onChange } = {}) {
  const responses = {}, aggs = {}, timers = {};
  let armed = false;
  const publish = qid => {
    if (!armed) return;
    clearTimeout(timers[qid]);
    timers[qid] = setTimeout(() => store.setAgg(qid, aggs[qid]), 500);
  };
  const recompute = qid => {
    const ctx = NEWSPAPERS.some(p => p.id === qid) ? { ideology: responses.q6_ideologia || {} } : {};
    aggs[qid] = aggregate(QUESTIONS[qid], responses[qid] || {}, ctx);
    publish(qid);
    onChange?.(qid, aggs[qid]);
  };
  for (const qid of Object.keys(QUESTIONS)) {
    store.onResponses(qid, m => {
      responses[qid] = m || {};
      recompute(qid);
      if (qid === 'q6_ideologia') NEWSPAPERS.forEach(p => recompute(p.id));
    });
  }
  // Espera a tener las respuestas retenidas antes de publicar, para no enseñar ceros de paso.
  store.ready.then(() => { armed = true; Object.keys(aggs).forEach(publish); });
  // Conectados: móviles con señal en los últimos 75 s.
  let users = {}, last = -1;
  store.onUsers(u => { users = u || {}; });
  setInterval(() => {
    if (!armed) return;
    const now = Date.now();
    const n = Object.values(users).filter(u => u.sim || (u.seen && now - u.seen < 75000)).length;
    if (n !== last) { last = n; store.setAgg('_presence', { n, t: now }); }
  }, 3000);
  return { responses, aggs };
}
