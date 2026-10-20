// Fuente de verdad de todas las interacciones. Los textos salen de Guia_Diseno_Presentacion.md.

export const ROLES = [
  { id: 'accionista', label: 'Accionista', hint: 'Ideario y sostenibilidad del negocio' },
  { id: 'audiencia', label: 'Audiencia', hint: 'Información veraz' },
  { id: 'anunciante', label: 'Anunciante', hint: 'Audiencia y seguridad de marca' },
  { id: 'periodista', label: 'Periodista', hint: 'Rigor y cláusula de conciencia' },
  { id: 'regulador', label: 'Regulador', hint: 'Pluralismo, independencia y transparencia' },
];

export const LENSES = [
  { id: 'deontologia', label: 'Deontología', hint: '¿Qué deberes tiene el periodista?' },
  { id: 'utilitarismo', label: 'Utilitarismo', hint: '¿Qué consecuencias tiene?' },
  { id: 'virtud', label: 'Ética de la virtud', hint: '¿Qué haría un buen periodista?' },
];

export const GRADIENT = [
  { id: 'seleccion', label: 'Selección de temas', zone: 'ok', note: 'Legítimo' },
  { id: 'encuadre', label: 'Encuadre', zone: 'ok', note: 'Legítimo' },
  { id: 'opinion', label: 'Opinión', zone: 'ok', note: 'Legítimo si se etiqueta' },
  { id: 'omision', label: 'Omisión', zone: 'conflict', note: 'Conflicto ético' },
  { id: 'distorsion', label: 'Distorsión', zone: 'conflict', note: 'Conflicto ético' },
];

export const NEWSPAPERS = [
  { id: 'q7_elpais', label: 'El País' },
  { id: 'q8_elmundo', label: 'El Mundo' },
  { id: 'q9_abc', label: 'ABC' },
  { id: 'q10_eldiario', label: 'elDiario.es' },
];

// Datos del Digital News Report España 2026 (verificados en Planteamiento.md §8).
export const DNR = {
  confianza: 33,
  confianzaPropia: 42,
  influyen: [
    { label: 'Gobiernos y partidos', pct: 70 },
    { label: 'Propietarios de los medios', pct: 65 },
    { label: 'Anunciantes', pct: 55 },
    { label: 'Expertos y académicos', pct: 50 },
    { label: 'Activistas y grupos de interés', pct: 48 },
  ],
  prefiereNeutral: 50,
  buscaAfines: 15,
  buscaOtros: 18,
};

const IDEO = { min: 0, max: 10, labels: ['Izquierda', 'Derecha'] };

export const QUESTIONS = {
  // ——— Encuesta inicial (slide 2) ———
  q1_canal: { type: 'choice', group: 'encuesta', title: '¿Por dónde te informas principalmente?',
    options: ['Redes sociales', 'Televisión', 'Radio', 'Prensa digital', 'Podcasts / YouTube', 'IA / agregadores'] },
  q2_linea: { type: 'choice', group: 'encuesta', title: '¿Sabrías decir cuál es la línea editorial de los medios que consumes?',
    options: ['Sí', 'Más o menos', 'No'] },
  q3_confianza: { type: 'scale', group: 'encuesta', title: '¿Cuánto confías en las noticias que consumes?', min: 1, max: 5, labels: ['Nada', 'Mucho'] },
  q4_preferencia: { type: 'choice', group: 'encuesta', title: '¿Qué tipo de medio prefieres?',
    options: ['Uno que comparta mi visión', 'Uno neutral', 'Uno que me muestre otros puntos de vista'] },
  q5_anunciantes: { type: 'choice', group: 'encuesta', title: '¿Crees que los anunciantes influyen en lo que cuenta un medio?',
    options: ['Mucho', 'Algo', 'Nada'] },
  q6_ideologia: { type: 'slider', group: 'encuesta', optional: true, title: '¿Dónde te sitúas tú ideológicamente?', sub: 'Opcional y anónimo. Sirve para leer el experimento.', ...IDEO },
  q7_elpais: { type: 'slider', group: 'experimento', title: 'Sitúa a El País', sub: 'Experimento: ¿dónde está cada periódico?', ...IDEO },
  q8_elmundo: { type: 'slider', group: 'experimento', title: 'Sitúa a El Mundo', ...IDEO },
  q9_abc: { type: 'slider', group: 'experimento', title: 'Sitúa a ABC', ...IDEO },
  q10_eldiario: { type: 'slider', group: 'experimento', title: 'Sitúa a elDiario.es', ...IDEO },

  // ——— Micro-interacciones ———
  g_confianza: { type: 'slider', title: '¿Qué porcentaje de españoles confía en las noticias?', sub: 'Adivina antes de ver el dato.', min: 0, max: 100, unit: '%' },
  t_tesis_pre: { type: 'choice', title: '«La línea editorial se puede vender. El rigor, no.»', sub: '¿Estás de acuerdo?', options: ['Sí', 'No'] },
  lens: { type: 'choice', title: 'Elige tu lente', sub: 'La usarás en todos los debates.', options: LENSES.map(l => l.label), hints: LENSES.map(l => l.hint), saveAs: 'lens' },
  g_frontera: { type: 'choice', title: '¿Dónde empieza el conflicto ético?', sub: 'Marca el primer paso que ya no es legítimo.', options: GRADIENT.map(g => g.label) },
  r_influencia: { type: 'rank', title: '¿Quién influye más en la información?', sub: 'Toca en orden, del que más influye al que menos.',
    items: DNR.influyen.map(i => i.label) },
  r_criterios: { type: 'rank', title: 'Ordena los criterios del índice de rigor', sub: 'Del más importante al menos.',
    items: ['Verificación y diversidad de fuentes', 'Política pública de correcciones', 'Opinión separada y etiquetada', 'Mecanismos de independencia editorial', 'Transparencia comercial'] },

  // ——— Debates ———
  d1: { type: 'choice', debate: 1, title: '¿Puede un medio tener ideología y ser riguroso a la vez?', options: ['Sí', 'No', 'Depende'] },
  d2_casos: { type: 'cases', debate: 2, title: '¿Dónde colocaríais cada caso?', sub: 'Sitúa cada caso en el gradiente.',
    cases: [
      { id: 'A', text: 'Un medio decide no abrir su informativo con una noticia que perjudica a un partido afín.' },
      { id: 'B', text: 'Un titular informativo usa un adjetivo valorativo («polémica», «histórica»).' },
      { id: 'C', text: 'Una crónica omite un dato oficial que contradice la tesis del medio.' },
      { id: 'D', text: 'Una noticia que afecta al propietario del medio se publica, pero relegada y sin contexto.' },
    ], steps: GRADIENT },
  d3: { type: 'choice', debate: 3, byRole: true, title: 'Si el dueño, la audiencia y quien paga quieren cosas distintas, ¿a quién debe lealtad un periodista?',
    options: ['Al propietario', 'A la audiencia', 'A quien paga', 'A su conciencia profesional'] },
  d4: { type: 'choice', debate: 4, title: '¿Es más honesto un medio que declara su línea o uno que se presenta como neutral?',
    options: ['El que declara su línea', 'El que se presenta como neutral', 'Depende'] },
  d5: { type: 'choice', debate: 5, title: '¿Es ético que una marca elija dónde anunciarse según la línea editorial del medio?',
    options: ['Sí, es segmentación legítima', 'Depende', 'No, financia la polarización'] },
  d_final: { type: 'choice', debate: 6, title: '¿Usaríais AnuncIA si fuerais un medio y vuestra nota de rigor fuera pública?',
    options: ['Sí', 'Sí, con condiciones', 'No'] },

  // ——— Cierre: pre/post ———
  t_tesis_post: { type: 'choice', title: '«La línea editorial se puede vender. El rigor, no.»', sub: 'Ahora, al final: ¿estás de acuerdo?', options: ['Sí', 'No'] },
  q3_post: { type: 'scale', title: '¿Cuánto confías en las noticias que consumes?', sub: 'La misma pregunta del principio.', min: 1, max: 5, labels: ['Nada', 'Mucho'] },
};

export const SURVEY_IDS = ['q1_canal', 'q2_linea', 'q3_confianza', 'q4_preferencia', 'q5_anunciantes', 'q6_ideologia', 'q7_elpais', 'q8_elmundo', 'q9_abc', 'q10_eldiario'];

// Qué ve el móvil en cada slide (numeración de la guía sin «Equipo y presupuesto»: 1–28).
export const SLIDES = [
  { n: 1, section: 'Apertura', title: 'La ética del periodismo', phone: { kind: 'welcome' }, t: 0, who: 'P1', script: ['Mientras entran: «Escanead el QR: hoy sois el consejo editorial».', 'Mira el contador de conectados. Cuando deje de subir, empieza.', 'Presenta al grupo y el tema en una frase.'], notes: [] },
  { n: 2, section: 'Apertura', title: 'Antes de empezar: ¿cómo os informáis?', phone: { kind: 'survey', qids: SURVEY_IDS, title: 'Encuesta y experimento' }, timer: 90, t: 60, who: 'P1', script: ['«Diez preguntas, 90 segundos, anónimo.» Quien hizo la pre-encuesta no repite.', 'Deja correr la cuenta atrás sin comentar nada.', 'Pasa cuando «han terminado» deje de subir.'], notes: [] },
  { n: 3, section: 'Apertura', title: 'Así os informáis', phone: { kind: 'compare', qids: ['q1_canal', 'q2_linea', 'q3_confianza', 'q5_anunciantes'], title: 'Tú frente a la clase' }, t: 180, who: 'P1', script: ['Lee en voz alta las tres cifras de la clase.', 'Pregunta: «¿Os sorprende cuántos sabéis la línea editorial de vuestros medios?»', 'Enlaza: si no la conocemos, ¿es mejor que la declaren o que la oculten?'], notes: ['DNR 2026: credibilidad de las grandes marcas informativas 45 %, frente al 19 % de las redes sociales y el 18 % de los chatbots de IA. Útil si la clase se informa sobre todo por redes o IA.'] },
  { n: 4, section: 'Apertura', title: '¿Por qué hablar de esto ahora?', phone: { kind: 'question', qid: 'g_confianza' }, timer: 30, t: 270, who: 'P1', script: ['«Adivinad: ¿qué porcentaje de españoles confía en las noticias?» (30 s).', 'Siguiente ▶ revela el 33 %. Compáralo con la estimación de la clase.', 'Siguiente ▶ dos veces más: 70 % y 65 / 55 %. Cita la fuente.'], notes: ['También del DNR 2026: el 40 % cree que influye el crimen organizado.'] },
  { n: 5, section: 'Apertura', title: '¿Puede un medio tener línea editorial sin sacrificar el rigor?', phone: { kind: 'question', qid: 't_tesis_pre' }, timer: 15, t: 360, who: 'P1', script: ['Plantea el reto y lee la tesis despacio.', '«¿De acuerdo? Sí o no en el móvil» (15 s). La repetiremos al final.'], notes: [] },
  { n: 6, section: 'Apertura', title: 'Cómo lo hemos abordado', phone: { kind: 'listen', lines: ['Marco ético y normativo', 'Datos: DNR España 2026 y vuestra encuesta', 'Una voz desde dentro: COPE'] }, t: 420, who: 'P1', script: ['Tres fuentes en 30 segundos. No te pares.'], notes: [] },
  { n: 7, section: 'Apertura', title: 'Una voz desde dentro', phone: { kind: 'listen', lines: ['Director de programación y contenidos informativos de COPE', 'Sus respuestas aparecen después de cada debate'] }, t: 465, who: 'P1', script: ['Presenta al entrevistado y por qué COPE: ideario declarado.', 'Avisa: sus citas saldrán después de cada debate, como contrapunto.'], notes: ['La entrevista es una opinión de autoridad, no el centro del trabajo. No usamos cifras de COPE ni comparamos medios.'] },
  { n: 8, section: 'Apertura', title: 'Tres formas de mirar el dilema', phone: { kind: 'question', qid: 'lens' }, timer: 15, t: 510, who: 'P1', script: ['Una frase por lente.', '«Elegid la vuestra en el móvil» (15 s). Servirá para leer los debates.', 'Pasa el testigo a P2.'], notes: [] },
  { n: 9, section: 'Idea 1', title: 'Dos deberes legítimos', phone: { kind: 'listen', lines: ['Rigor: deber hacia la audiencia', 'Línea editorial: derecho del editor', 'El dilema enfrenta dos principios legítimos'] }, t: 570, who: 'P2', script: ['Dos columnas: deber hacia la audiencia frente a derecho del editor.', 'Siguiente ▶: la frase clave. Dos principios legítimos que tienen que convivir.'], notes: [] },
  { n: 10, section: 'Debate 1', title: '¿Puede un medio tener ideología y ser riguroso a la vez?', phone: { kind: 'debate', qid: 'd1' }, t: 630, who: 'P2', script: ['Explica el muro una sola vez: «votad y escribid un argumento; los más votados salen en pantalla».', '30 s de votación. Comenta el reparto.', 'Debate de 2–3 min con las dos preguntas. Destaca un argumento del muro si ayuda.', 'Siguiente ▶: la voz de COPE. Cierra en 20 s.'], notes: ['Si vais tarde, fusionad los debates 1 y 2.'] },
  { n: 11, section: 'Idea 2', title: '¿Dónde está la línea?', phone: { kind: 'question', qid: 'g_frontera' }, timer: 20, t: 840, who: 'P2', script: ['«¿Dónde empieza el conflicto?» Que toquen un paso (20 s).', 'Siguiente ▶ revela el corte entre Opinión y Omisión.', 'Nombra las tres reglas: Constitución, FAPE y cláusula de conciencia.'], notes: [] },
  { n: 12, section: 'Debate 2', title: '¿Dónde colocaríais cada caso?', phone: { kind: 'debate', qid: 'd2_casos' }, t: 900, who: 'P2', script: ['Lee los cuatro casos. Que coloquen cada uno (45 s).', 'Comenta el mapa de calor: ¿dónde hay desacuerdo?', 'Debate de 2 min con las dos preguntas.', 'Siguiente ▶: la voz de COPE. Recuerda que los casos son hipotéticos.', 'Pasa el testigo a P3.'], notes: ['De aquí sale la «exigencia de la clase» del ticker, que vuelve como Medio E en AnuncIA.'] },
  { n: 13, section: 'Idea 3', title: '¿A quién se debe un medio?', phone: { kind: 'question', qid: 'r_influencia' }, timer: 30, t: 1110, who: 'P3', script: ['Triángulo: accionistas, audiencia y anunciantes.', 'Siguiente ▶ cinco veces: el anillo de presiones con el % del DNR.', 'Ranking del móvil: opcional. Sáltalo si vais tarde.', 'Siguiente ▶: el contrapeso legal, EMFA art. 6.3.'], notes: ['Enfoque RSC: teoría de stakeholders (Freeman). En clave ESG, la calidad informativa es la G (gobernanza editorial) y la S (efecto sobre el debate público).'] },
  { n: 14, section: 'Debate 3', title: '¿A quién debe lealtad un periodista?', phone: { kind: 'debate', qid: 'd3' }, t: 1170, who: 'P3', script: ['Voto desde el rol de cada uno (30 s). Lee el desglose por rol en los chips.', 'Debate de 2 min: ¿es legítimo que el propietario fije la línea? ¿Hasta dónde?', 'Siguiente ▶: la voz de COPE.'], notes: [] },
  { n: 15, section: 'Idea 4', title: 'Cada uno ve los medios desde donde está', phone: { kind: 'compare', qids: NEWSPAPERS.map(p => p.id), title: 'Dónde pusiste tú cada periódico' }, t: 1380, who: 'P3', script: ['Revela el experimento: lee las medias y las marcas por autoubicación.', 'Explica el efecto del medio hostil: cada uno ve más sesgados los medios que le quedan lejos.', 'Siguiente ▶ dos veces: 33 / 42 % y 50 / 15 %. Aclara: no comparamos periódicos.'], notes: ['DNR 2026: el 18 % busca medios que muestren otros puntos de vista (10 % en 2020). La muestra de clase es ilustrativa, no representativa.'] },
  { n: 16, section: 'Debate 4', title: '¿Es más honesto un medio que declara su línea o uno que se presenta como neutral?', phone: { kind: 'debate', qid: 'd4' }, t: 1470, who: 'P3', script: ['Voto (30 s) y debate de 2 min: ¿existe la neutralidad?', 'Siguiente ▶: la voz de COPE.', 'Pasa el testigo a P4.'], notes: [] },
  { n: 17, section: 'Idea 5', title: 'Publicidad y línea editorial: una calle de doble sentido', phone: { kind: 'listen', lines: ['Del anunciante al medio: presión, publicidad institucional, patrocinio sin etiquetar', 'Del medio al anunciante: audiencia afín, brand safety, boicots'] }, t: 1650, who: 'P4', script: ['Una frase por flecha: del anunciante al medio y del medio al anunciante.', 'Compara el 55 % del DNR con el % de la clase, ya en pantalla.', 'Publicidad institucional: EMFA art. 25.'], notes: [] },
  { n: 18, section: 'Debate 5', title: '¿Es ético que una marca elija dónde anunciarse según la línea editorial del medio?', phone: { kind: 'debate', qid: 'd5' }, t: 1710, who: 'P4', script: ['Voto de tres opciones (30 s) y debate de 2 min.', 'Siguiente ▶: la voz de COPE.'], notes: [] },
  { n: 19, section: 'Diagnóstico', title: 'Lo que hemos encontrado', phone: { kind: 'listen', lines: ['Un hallazgo por idea'] }, t: 1890, who: 'P4', script: ['Siguiente ▶ cinco veces: un hallazgo por idea.', 'Señala el ticker: ahí está la exigencia de la clase.'], notes: ['El impacto social de un medio es su calidad informativa.'] },
  { n: 20, section: 'Propuesta', title: 'AnuncIA: que el rigor tenga valor de mercado', phone: { kind: 'listen', lines: ['Conecta anunciantes con medios afines', 'Solo entre los que superan un umbral de rigor'] }, t: 1935, who: 'P4', script: ['Define AnuncIA en una frase. Recuerda que es ficticia.', 'Sin filtro de rigor premiaría la polarización; con él, el anunciante pasa de presión a incentivo.'], notes: ['El nombre juega con anuncia + IA. Igual que los ratings ESG orientan la inversión, el filtro de rigor orienta la publicidad.'] },
  { n: 21, section: 'Propuesta', title: 'Una pieza para cada idea', phone: { kind: 'listen', lines: ['Carta editorial pública', 'Índice de rigor', 'Cortafuegos', 'Matching'] }, t: 1980, who: 'P4', script: ['Una pieza por idea. Lee las cuatro filas.'], notes: [] },
  { n: 22, section: 'Propuesta', title: '¿Qué mide el índice de rigor?', phone: { kind: 'question', qid: 'r_criterios' }, timer: 30, t: 2025, who: 'P4', script: ['Cinco criterios. El ranking del móvil es opcional.', 'Siguiente ▶: «La IA propone, una persona dispone».'], notes: [] },
  { n: 23, section: 'Propuesta', title: 'AnuncIA en acción', phone: { kind: 'listen', lines: ['Medio E: el medio de esta clase', 'Su nota de rigor sale de vuestros votos en el debate 2'] }, t: 2070, who: 'P4', script: ['Medios ficticios. Medio D: máxima afinidad y fuera.', 'Siguiente ▶: aparece Medio E, el de la clase, con vuestra exigencia del debate 2. Comenta el resultado.'], notes: ['Atribuir notas inventadas a medios reales sería engañoso; por eso los medios son ficticios.'] },
  { n: 24, section: 'Propuesta', title: 'Las líneas rojas de AnuncIA', phone: { kind: 'listen', lines: ['Cortafuegos', 'Privacidad (art. 9 RGPD)', 'Publicidad institucional (EMFA art. 25)', 'Contra la polarización'] }, t: 2115, who: 'P4', script: ['Cuatro líneas rojas, una frase cada una.', 'Pasa el testigo a P2.'], notes: [] },
  { n: 25, section: 'Implantación', title: 'Hoja de ruta de implantación', phone: { kind: 'listen', lines: ['Diseño → Piloto → Escalado → Revisión anual'] }, t: 2145, who: 'P2', script: ['Cuatro fases y un KPI por idea. 50 segundos.', 'Pasa el testigo a P3.'], notes: [] },
  { n: 26, section: 'Debate final', title: '¿Usaríais AnuncIA si fuerais un medio y vuestra nota de rigor fuera pública?', phone: { kind: 'debate', qid: 'd_final' }, t: 2205, who: 'P3', script: ['Voto (30 s). Debate de 1,5 min con las dos preguntas.', 'Siguiente ▶: nuestra valoración, incentivos y riesgos.', 'Pasa el testigo a P1.'], notes: ['AnuncIA no se planteó en la entrevista: la valoración sale de nuestro análisis.'] },
  { n: 27, section: 'Cierre', title: 'Lo que os lleváis de hoy', phone: { kind: 'survey', qids: ['t_tesis_post', 'q3_post'], title: 'Antes de irte' }, timer: 30, t: 2340, who: 'P1', script: ['«Dos toques en el móvil: la tesis y la confianza» (30 s).', 'Lee el pre/post: ¿ha cambiado la clase?', 'Siguiente ▶: la tesis final.'], notes: [] },
  { n: 28, section: 'Cierre', title: 'Gracias', phone: { kind: 'thanks' }, t: 2385, who: 'P1', script: ['Gracias, preguntas y agradecimiento a COPE. El QR lleva a las fuentes.'], notes: [] },
];

export const CUES = { welcome: 'Escanea el QR', survey: 'Responde en el móvil', question: 'Responde en el móvil', debate: 'Vota y escribe en el muro', compare: 'Mira tu móvil' };
export const PRESENTERS = { P1: 'Ponente 1', P2: 'Ponente 2', P3: 'Ponente 3', P4: 'Ponente 4' };
export const TOTAL_SECONDS = 2400;

// ——— Modo guía (APP_CONFIG.strict): solo las interacciones que pide Guia_Diseno_Presentacion.md ———
// Votaciones: encuesta y experimento (2), casos A–D (12), votación de tres opciones (18 y 26).
// Resultados en pantalla: 3, 15 y 17. Nada más: sin roles, muro, reacciones ni micro-preguntas.
const STRICT_PHONE = {
  4: { kind: 'listen', lines: ['33 % de los españoles confía en las noticias', '70 % cree que influyen gobiernos y partidos', 'Fuente: Digital News Report España 2026'] },
  5: { kind: 'listen', lines: ['«La línea editorial se puede vender. El rigor, no.»'] },
  8: { kind: 'listen', lines: ['Deontología: ¿qué deberes tiene el periodista?', 'Utilitarismo: ¿qué consecuencias tiene?', 'Ética de la virtud: ¿qué haría un buen periodista?'] },
  10: { kind: 'listen', lines: ['¿Es la línea editorial un problema ético o una forma de pluralismo?', '¿Desde qué lente lo justificaríais: deberes, consecuencias o virtud?'] },
  11: { kind: 'listen', lines: ['Selección de temas · Encuadre · Opinión: legítimo', 'Omisión · Distorsión: conflicto ético'] },
  12: { kind: 'question', qid: 'd2_casos' },
  13: { kind: 'listen', lines: ['Accionistas · Audiencia · Anunciantes', 'EMFA art. 6.3: independencia editorial'] },
  14: { kind: 'listen', lines: ['¿Es legítimo que el propietario fije la línea editorial? ¿Hasta dónde?', '¿Qué presión es más peligrosa, la interna o la externa?'] },
  16: { kind: 'listen', lines: ['¿Existe la neutralidad periodística?', '¿Cómo puede un medio ganarse la confianza de quien no comparte su línea?'] },
  18: { kind: 'question', qid: 'd5' },
  22: { kind: 'listen', lines: ['Cinco criterios del índice de rigor', '«La IA propone, una persona dispone.»'] },
  26: { kind: 'question', qid: 'd_final' },
  27: { kind: 'listen', lines: ['«La línea editorial se puede vender. El rigor, no.»'] },
};
const STRICT_TIMER = { 2: 90, 12: 45, 18: 30, 26: 30 };
const STRICT_SCRIPT = {
  1: ['Mientras entran: «Escanead el QR para la encuesta del principio».', 'Presenta al grupo y el tema en una frase.'],
  4: ['Tres cifras grandes del DNR 2026: 33 %, 70 % y 65 / 55 %.', 'Cita la fuente.'],
  5: ['Plantea el reto y lee la hipótesis despacio.'],
  8: ['Una frase por lente. Se usarán en todos los debates.', 'Pasa el testigo a P2.'],
  10: ['Lanza las dos preguntas del debate (2–3 min).', 'Siguiente ▶: la voz de COPE.'],
  11: ['Escala de cinco pasos; el corte está entre Opinión y Omisión.', 'Nombra las tres reglas: Constitución, FAPE y LO 2/1997.'],
  12: ['«Votad dónde colocaríais cada caso» (45 s).', 'Comenta el mapa de calor y lanza las dos preguntas.', 'Siguiente ▶: la voz de COPE. Los casos son hipotéticos.', 'Pasa el testigo a P3.'],
  13: ['Triángulo interno y anillo externo con el % del DNR.', 'El contrapeso legal: EMFA art. 6.3.'],
  14: ['Lanza las dos preguntas del debate (2 min).', 'Siguiente ▶: la voz de COPE.'],
  16: ['Lanza las dos preguntas del debate (2 min).', 'Siguiente ▶: la voz de COPE.', 'Pasa el testigo a P4.'],
  18: ['Votación de tres opciones (30 s). Comenta el reparto.', 'Lanza las dos preguntas del debate (2 min).', 'Siguiente ▶: la voz de COPE.'],
  22: ['Cinco criterios.', '«La IA propone, una persona dispone.»'],
  26: ['Votación de tres opciones (30 s).', 'Lanza las dos preguntas del debate.', 'Después: nuestra valoración, incentivos y riesgos.', 'Pasa el testigo a P1.'],
  27: ['Una conclusión por idea.', 'Cierra con la frase final.'],
};
export const STRICT = !!globalThis.APP_CONFIG?.strict;
if (STRICT) {
  for (const s of SLIDES) {
    if (STRICT_PHONE[s.n]) s.phone = { ...STRICT_PHONE[s.n] };
    if (STRICT_SCRIPT[s.n]) s.script = STRICT_SCRIPT[s.n];
    if (STRICT_TIMER[s.n]) s.timer = STRICT_TIMER[s.n]; else delete s.timer;
  }
  CUES.debate = 'Vota en el móvil';
}
// Votaciones que se abren en los móviles (accesos directos de la consola).
export const POLL_SLIDES = SLIDES.filter(s => ['survey', 'question', 'debate'].includes(s.phone.kind)).map(s => s.n);
// Slides que tienen vista en la pantalla de resultados (votaciones y resultados de la encuesta).
export const SCREEN_SLIDES = [...new Set([...POLL_SLIDES, 3, 15, 17])].sort((a, b) => a - b);
export const SCREEN_VIEWS = [
  { id: 'auto', label: 'Automático' }, { id: 'qr', label: 'QR para entrar' }, { id: 'encuesta', label: 'Encuesta' },
  { id: 'canales', label: 'Así os informáis' }, { id: 'casos', label: 'Casos A–D' }, { id: 'experimento', label: 'Experimento' },
  { id: 'anunciantes', label: 'Anunciantes' }, { id: 'd5', label: 'Debate 5' }, { id: 'd_final', label: 'Debate final' },
];

export const SLIDE_BY_N = Object.fromEntries(SLIDES.map(s => [s.n, s]));

export const REACTIONS = ['👏', '🤔', '😮', '🙅'];
export const WALL_MAX = 200;
export const BAD_WORDS = ['puta', 'puto', 'mierda', 'gilipollas', 'cabrón', 'cabron', 'joder', 'coño', 'hijo de', 'maricón', 'maricon', 'subnormal', 'retrasad'];
