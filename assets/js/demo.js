// Modo demo (solo modo local): rellena todas las preguntas con respuestas simuladas,
// unos argumentos en el muro y los agregados, para ver la presentación "llena".
import { QUESTIONS, ROLES, LENSES, SLIDES, NEWSPAPERS } from './questions.js';
import { aggregate } from './agg.js';

const ARGS = {
  d1: ['Sin ideología no hay medio: lo importante es que la declare.', 'El rigor es verificar; la línea es elegir de qué hablas. No se pisan.', 'Depende de si la ideología entra en la noticia o se queda en la editorial.'],
  d2_casos: ['Omitir un dato oficial ya no es encuadre, es engañar.', 'El adjetivo en el titular es opinión colada como información.'],
  d3: ['A la audiencia: es quien paga con su confianza.', 'A su conciencia; para eso existe la cláusula de conciencia.', 'El dueño pone el dinero, pero no debería poner los hechos.'],
  d4: ['Un medio neutral no existe; uno honesto, sí.', 'Declarar la línea es tratar al lector como adulto.'],
  d5: ['Las marcas ya eligen; que elijan también por rigor.', 'Si una marca se va por la línea, es censura con otro nombre.'],
  d_final: ['Sí, pero quién audita al auditor.', 'Si mi nota es pública, al menos sé a qué atenerme.'],
};

export async function demoSeed(store, n = 32) {
  if (store.mode !== 'local') return;
  if (sessionStorage.getItem('erp_demo_done')) return;
  const fixed = { q6_ideologia: { center: 4.5 }, q7_elpais: { center: 3.5 }, q8_elmundo: { center: 6.5 }, q9_abc: { center: 7.5 }, q10_eldiario: { center: 2.5 }, g_confianza: { center: 45 } };
  for (const [qid, q] of Object.entries(QUESTIONS)) await store.simulate(qid, { ...q, ...(fixed[qid] || {}) }, n, ROLES, LENSES);
  for (const [qid, texts] of Object.entries(ARGS)) {
    const s = SLIDES.find(x => x.phone.qid === qid);
    await store.simulateWall(texts, { qid, slide: s?.n, role: ROLES[Math.floor(Math.random() * ROLES.length)].id });
  }
  // Agregados, por si la presentación no está abierta.
  const resp = {};
  for (const qid of Object.keys(QUESTIONS)) resp[qid] = store._read('resp:' + qid, {});
  for (const [qid, q] of Object.entries(QUESTIONS)) {
    const ctx = NEWSPAPERS.some(p => p.id === qid) ? { ideology: resp.q6_ideologia } : {};
    await store.setAgg(qid, aggregate(q, resp[qid], ctx));
  }
  await store.setAgg('_presence', { n, t: Date.now() });
  sessionStorage.setItem('erp_demo_done', '1');
}
