// Configuración de la app. Se carga en las tres páginas.
// transport: "mqtt" (en vivo, sin cuentas: brokers MQTT públicos) · "firebase" (requiere proyecto) · "local" (pruebas).
// Cualquier página acepta ?local para forzar el modo local (todas las pestañas del mismo navegador comparten datos).
window.APP_CONFIG = {
  // Modo guía: solo las votaciones que pide Guia_Diseno_Presentacion.md (slides 2, 12, 18 y 27).
  // false = activa también las micro-interacciones extra (adivinar, lente, muro, roles, rankings…).
  strict: true,
  transport: "mqtt",
  // Dos brokers a la vez: si uno falla, el otro sigue. Todo se publica en ambos.
  brokers: ["wss://broker.hivemq.com:8884/mqtt", "wss://broker.emqx.io:8084/mqtt"],
  // Sala de esta presentación (aleatoria). Las sesiones de ensayo y la real cuelgan de aquí.
  room: "r3njb6mwb",
  // Claves PÚBLICAS. La clave de ponente (privada) NO está aquí: va en los enlaces de ponente.
  keys: {"sign":{"x":"vtD27xB-hrxhXHDGTgNOUxGgk4wRpfpERm3aNw4DA-0","y":"ueumhVQl1yHUiIqrQLYImX9VBBCO25X6G_DALGlzPcA"},"enc":{"x":"wGWBa92tAN1NtSkWw4yHlIO1HT5r8tme_TmF2CEGyH4","y":"5L313WCe_tFBzouDQVgyY5cau7XWri7HfpD0J74U_5o"}},
  // Firebase (opcional): pega aquí "firebaseConfig" y pon transport: "firebase".
  firebase: null,
  presenters: [],
  // URL pública para el QR. Vacío = se deduce de la dirección actual.
  baseUrl: "",
  rigorThreshold: 6.0,
  targetMinutes: 40,
};
