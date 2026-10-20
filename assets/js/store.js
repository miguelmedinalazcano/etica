// Almacén de datos con tres implementaciones intercambiables y la misma interfaz:
//  - MqttStore: en vivo, sin cuentas. Dos brokers MQTT públicos a la vez; respuestas cifradas;
//    solo quien tiene la clave de ponente puede mover la presentación, moderar y publicar resultados.
//  - LocalStore: localStorage. Todas las pestañas del mismo navegador comparten datos (pruebas).
//  - FirebaseStore: Firestore (opcional, requiere proyecto propio).
import { MqttClient } from './mqtt-lite.js';
import { importPublic, importPrivate, signBody, verifyBody, makeSealer, makeOpener, takeSecret, saveSecret, forgetSecret } from './crypto.js';

export const DEFAULT_STATE = { slide: 1, closed: {}, wallVisible: true, pinned: null, t: 0 };

const rnd = (n = 8) => Math.random().toString(36).slice(2, 2 + n);
const td = new TextDecoder();

function fakeResponse(q, roles, lenses) {
  const role = roles[Math.floor(Math.random() * roles.length)].id;
  const lens = lenses[Math.floor(Math.random() * lenses.length)].id;
  const pick = (arr, weights) => {
    const w = weights || arr.map(() => 1);
    const tot = w.reduce((a, b) => a + b, 0);
    let r = Math.random() * tot;
    for (let i = 0; i < arr.length; i++) { r -= w[i]; if (r <= 0) return i; }
    return arr.length - 1;
  };
  let value;
  switch (q.type) {
    case 'choice': value = pick(q.options, q.options.map((_, i) => 3 - i * 0.4 + Math.random())); break;
    case 'scale': value = q.min + Math.floor(Math.random() * (q.max - q.min + 1)); break;
    case 'slider': {
      const span = q.max - q.min;
      const center = q.center ?? (q.min + span / 2);
      const g = (Math.random() + Math.random() + Math.random()) / 3; // campana
      value = Math.round(Math.max(q.min, Math.min(q.max, center + (g - 0.5) * span * 1.4)));
      break;
    }
    case 'cases': value = Object.fromEntries(q.cases.map((c, i) => [c.id, Math.min(4, Math.max(0, Math.round(i + (Math.random() * 3 - 1))))])); break;
    case 'rank': value = [...Array(q.items.length).keys()].sort(() => Math.random() - 0.5); break;
  }
  return { value, role, lens, t: Date.now() };
}

export class LocalStore {
  constructor(cfg) {
    this.mode = 'local';
    this.cfg = cfg;
    this.uid = sessionStorage.getItem('erp_uid') || ('u_' + rnd());
    sessionStorage.setItem('erp_uid', this.uid);
    this.listeners = new Map();
    window.addEventListener('storage', e => { if (e.key && e.key.startsWith('erp:')) this._emit(e.key.slice(4)); });
  }
  get isPresenter() { return true; }
  get canWrite() { return true; }
  get session() { return 'local'; }
  get ready() { return Promise.resolve(); }
  onSession(cb) { Promise.resolve().then(() => cb('local')); return () => {}; }
  onStatus(cb) { Promise.resolve().then(() => cb({ online: 1, total: 1 })); return () => {}; }
  onCmd(cb) {
    let last = (this._read('state', {}).cmd || {}).id;
    return this._on('state', st => { const c = st && st.cmd; if (c && c.id && c.id !== last) { last = c.id; cb(c); } }, DEFAULT_STATE);
  }
  _read(key, def) { try { const v = localStorage.getItem('erp:' + key); return v ? JSON.parse(v) : def; } catch { return def; } }
  _write(key, val) { localStorage.setItem('erp:' + key, JSON.stringify(val)); this._emit(key); }
  _emit(key) { (this.listeners.get(key) || []).forEach(cb => cb(this._read(key, cb.__def))); }
  _on(key, cb, def) {
    cb.__def = def;
    if (!this.listeners.has(key)) this.listeners.set(key, []);
    this.listeners.get(key).push(cb);
    // Como Firestore, la primera entrega es asíncrona.
    Promise.resolve().then(() => cb(this._read(key, def)));
    return () => { const l = this.listeners.get(key) || []; const i = l.indexOf(cb); if (i >= 0) l.splice(i, 1); };
  }

  // Estado de la sesión (slide actual, votaciones cerradas, muro, pinchado, comandos).
  onState(cb) { return this._on('state', st => cb({ ...DEFAULT_STATE, ...(st || {}) }), DEFAULT_STATE); }
  async setState(patch) { if (patch.cmd) patch = { ...patch, cmd: { ...patch.cmd, id: rnd(10) } }; this._write('state', { ...DEFAULT_STATE, ...this._read('state', {}), ...patch, t: Date.now() }); }

  // Respuestas individuales: responses/{qid}/{uid}. Solo la presentación las lee.
  onResponses(qid, cb) { return this._on('resp:' + qid, cb, {}); }
  async submit(qid, value, meta = {}) { const m = this._read('resp:' + qid, {}); m[this.uid] = { value, ...meta, t: Date.now() }; this._write('resp:' + qid, m); }

  // Agregados: agg/{qid}. Los escribe la presentación; los leen los móviles.
  onAgg(qid, cb) { return this._on('agg:' + qid, cb, null); }
  async setAgg(qid, agg) { this._write('agg:' + qid, agg); }

  // Muro de argumentos.
  onWall(cb) { return this._on('wall', cb, {}); }
  async wallPost(text, ctx = {}) { const w = this._read('wall', {}); const id = 'p_' + Date.now().toString(36) + rnd(4); w[id] = { text, uid: this.uid, ...ctx, votes: {}, hidden: false, t: Date.now() }; this._write('wall', w); return id; }
  async wallVote(id) { const w = this._read('wall', {}); if (!w[id]) return; w[id].votes ||= {}; if (w[id].votes[this.uid]) delete w[id].votes[this.uid]; else w[id].votes[this.uid] = true; this._write('wall', w); }
  async wallUpdate(id, patch) { const w = this._read('wall', {}); if (!w[id]) return; w[id] = { ...w[id], ...patch }; this._write('wall', w); }
  async wallClear() { this._write('wall', {}); }

  // Usuarios (rol, lente, última vez visto). Los móviles escriben el suyo.
  onUsers(cb) { return this._on('users', cb, {}); }
  async setUser(patch) { const u = this._read('users', {}); u[this.uid] = { ...(u[this.uid] || {}), ...patch, seen: Date.now() }; this._write('users', u); }
  getMyUser() { return this._read('users', {})[this.uid] || null; }

  // Reacciones efímeras.
  onReactions(cb) { return this._on('reactions', cb, {}); }
  async react(emoji) { const r = this._read('reactions', {}); r[this.uid] = { emoji, t: Date.now() }; this._write('reactions', r); }

  // Utilidades del mando.
  async resetResponses(qids) { for (const qid of qids) this._write("resp:" + qid, {}); }
  async resetAll() { Object.keys(localStorage).filter(k => k.startsWith('erp:')).forEach(k => localStorage.removeItem(k)); for (const key of this.listeners.keys()) this._emit(key); }
  async simulate(qid, q, n, roles, lenses) {
    // Identificadores estables (sim_0 … sim_n-1) para que las preguntas se puedan cruzar entre sí.
    const m = this._read('resp:' + qid, {});
    for (let i = 0; i < n; i++) m['sim_' + i] = { ...fakeResponse(q, roles, lenses), role: roles[i % roles.length].id, lens: lenses[i % lenses.length].id };
    this._write('resp:' + qid, m);
    const u = this._read('users', {});
    for (let i = 0; i < n; i++) u['sim_' + i] = { role: roles[i % roles.length].id, lens: lenses[i % lenses.length].id, seen: Date.now(), sim: true };
    this._write('users', u);
  }
  async simulateWall(texts, ctx) { for (const t of texts) { const id = await this.wallPost(t, { ...ctx, sim: true }); const w = this._read('wall', {}); const k = Math.floor(Math.random() * 6); for (let i = 0; i < k; i++) w[id].votes['sim_' + rnd(5)] = true; w[id].uid = 'sim_' + rnd(5); this._write('wall', w); } }
  async login() { return true; }
  async logout() {}
  onAuth(cb) { cb({ uid: this.uid, presenter: true }); return () => {}; }
}


const emptyData = () => ({ st: {}, r: {}, a: {}, w: {}, wv: {}, wm: {}, u: {}, x: {} });

export class MqttStore {
  static async create(cfg) { const s = new MqttStore(cfg); await s._init(); return s; }
  constructor(cfg) {
    this.mode = 'mqtt'; this.cfg = cfg; this.room = cfg.room;
    let uid = null; try { uid = localStorage.getItem('erp_uid'); } catch {}
    if (!uid || !/^[a-z0-9]+$/.test(uid)) { uid = 'u' + rnd(10); try { localStorage.setItem('erp_uid', uid); } catch {} }
    this.uid = uid;
    this.session = null; this.sessionT = 0; this.currentText = null;
    this.curLast = new Map(); this.healT = new Map(); // último «current» recibido de cada servidor y correcciones pendientes
    this.d = emptyData();
    this.listeners = new Map(); this.pending = new Set(); this.flushT = null;
    this.kinds = new Set(); this.cmdListeners = new Set(); this.seenCmd = new Set();
    this.online = new Map(); this.topics = new Set();
    this.priv = null; this.sealer = null; this.cleanupOnSwitch = false; this.me = null;
  }
  get base() { return `erp/${this.room}/`; }
  get ns() { return `${this.base}${this.session}/`; }
  get isPresenter() { return !!this.priv; }
  get canWrite() { return !!this.priv; }
  anyOnline() { return [...this.online.values()].some(Boolean); }

  async _init() {
    this.pub = await importPublic(this.cfg.keys);
    this.opener = makeOpener(null);
    const secret = takeSecret(this.room);
    if (secret) await this.login(secret);
    this.clients = (this.cfg.brokers || []).map((url, i) => new MqttClient(url, {
      clientId: `erp_${this.uid}_${i}_${rnd(4)}`,
      onMessage: (t, p) => this._onMsg(t, p, i),
      onStatus: up => { this.online.set(i, up); this._notify('status'); if (up) this._checkCurrent(i); if (up && this.me) this._heartbeat(); },
    }));
    for (const c of this.clients) { c.subscribe(this.base + 'current'); c.connect(); }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.clients.forEach(c => c.kick()); });
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('online', () => this.clients.forEach(c => c.kick()));
    // Listo cuando se conoce la sesión y han llegado los mensajes retenidos.
    // Un ponente que no ve sesión en 5 s reanuda la última que conoce (nunca crea una nueva sola).
    this.ready = new Promise(resolve => {
      const start = Date.now(); let resumed = false;
      const check = () => {
        if (this.session) return setTimeout(resolve, 1200);
        if (!resumed && this.canWrite && this.anyOnline() && Date.now() - start > 5000) {
          resumed = true;
          try { const last = JSON.parse(localStorage.getItem('erp_session_' + this.room) || 'null'); if (last && last.session) this._announce(last.session, last.t); } catch {}
        }
        if (Date.now() - start > 9000) return resolve();
        setTimeout(check, 150);
      };
      check();
    });
  }

  // ——— Suscripción y notificación ———
  _sub(kind) {
    if (this.kinds.has(kind)) return; this.kinds.add(kind);
    if (this.session) this._subscribeKind(kind);
  }
  _subscribeKind(kind) {
    const f = kind === 'mine' ? `${this.ns}r/+/${this.uid}` : `${this.ns}${kind}/#`;
    for (const c of this.clients) c.subscribe(f);
  }
  _on(key, cb) {
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key).add(cb);
    Promise.resolve().then(() => cb(this._value(key)));
    return () => this.listeners.get(key)?.delete(cb);
  }
  _notify(key) {
    this.pending.add(key);
    if (!this.flushT) this.flushT = setTimeout(() => {
      this.flushT = null; const keys = [...this.pending]; this.pending.clear();
      for (const k of keys) for (const cb of this.listeners.get(k) || []) { try { cb(this._value(k)); } catch (e) { console.error(e); } }
    }, 40);
  }
  _value(key) {
    if (key === 'state') { const s = { ...DEFAULT_STATE }; for (const [f, r] of Object.entries(this.d.st)) s[f] = r.v; return s; }
    if (key.startsWith('r:')) return this.d.r[key.slice(2)] || {};
    if (key.startsWith('a:')) return this.d.a[key.slice(2)] || null;
    if (key === 'wall') return this._wall();
    if (key === 'users') return this.d.u;
    if (key === 'reactions') return this.d.x;
    if (key === 'session') return this.session;
    if (key === 'status') return { online: [...this.online.values()].filter(Boolean).length, total: this.clients?.length || 0 };
    return null;
  }
  _wall() {
    const out = {};
    for (const [id, p] of Object.entries(this.d.w)) {
      const votes = {}; for (const [u, v] of Object.entries(this.d.wv[id] || {})) if (v.on) votes[u] = true;
      out[id] = { ...p, votes, hidden: !!this.d.wm[id]?.hidden };
    }
    return out;
  }

  // ——— Mensajes entrantes ———
  _onMsg(topic, payload, i) {
    const text = payload.length ? td.decode(payload) : '';
    if (!text) for (const c of this.clients) c.sticky.delete(topic);
    if (topic === this.base + 'current') {
      if (!text) { this.curLast.set(i, 0); this._heal(i); return; } // el servidor ha perdido el puntero
      verifyBody(this.pub, text).then(b => {
        if (!b || !b.session || !b.t) return;
        this.curLast.set(i, b.t);
        if (b.t > this.sessionT) { this.currentText = text; this._switch(b.session, b.t); }
        else if (b.t < this.sessionT) this._heal(i); // alguien ha vuelto a publicar una sesión vieja: se corrige
      });
      return;
    }
    if (!this.session || !topic.startsWith(this.ns)) return;
    const ns = this.ns;
    const parts = topic.slice(ns.length).split('/');
    const kind = parts[0];
    if (text) this.topics.add(topic); else this.topics.delete(topic);
    const same = () => this.session && this.ns === ns;
    const parse = () => { try { return JSON.parse(text); } catch { return null; } };
    switch (kind) {
      case 'st': {
        const f = parts[1]; if (!f) return;
        if (!text) { delete this.d.st[f]; return this._notify('state'); }
        verifyBody(this.pub, text).then(b => {
          if (!b || !same()) return;
          const cur = this.d.st[f];
          if (!cur || b.seq > cur.seq || (b.seq === cur.seq && String(b.by) > String(cur.by))) { this.d.st[f] = { v: b.v, seq: b.seq, by: b.by }; this._notify('state'); }
        });
        return;
      }
      case 'cmd': {
        if (!text) return;
        verifyBody(this.pub, text).then(b => {
          if (!b || !b.id || this.seenCmd.has(b.id) || !same()) return;
          this.seenCmd.add(b.id);
          for (const cb of this.cmdListeners) { try { cb(b); } catch (e) { console.error(e); } }
        });
        return;
      }
      case 'r': {
        const [, qid, uid] = parts; if (!qid || !uid) return;
        if (!text) { if (this.d.r[qid]) delete this.d.r[qid][uid]; this._notify('r:' + qid); this._notify('mine'); return; }
        if (!this.priv) return;
        this.opener.open(text).then(o => {
          if (!o || !same()) return;
          const cur = this.d.r[qid]?.[uid]; if (cur && (cur.t || 0) > (o.t || 0)) return;
          (this.d.r[qid] ||= {})[uid] = o; this._notify('r:' + qid);
        });
        return;
      }
      case 'a': {
        const qid = parts[1]; if (!qid) return;
        if (!text) { delete this.d.a[qid]; return this._notify('a:' + qid); }
        verifyBody(this.pub, text).then(b => {
          if (!b || !same()) return;
          const cur = this.d.a[qid]; if (cur && (cur.t || 0) > (b.t || 0)) return;
          this.d.a[qid] = b; this._notify('a:' + qid);
        });
        return;
      }
      case 'w': {
        const id = parts[1]; if (!id) return;
        if (!text) { delete this.d.w[id]; return this._notify('wall'); }
        const p = parse(); if (!p || typeof p.text !== 'string' || typeof p.uid !== 'string') return;
        this.d.w[id] = { text: p.text.slice(0, 200), uid: p.uid, qid: String(p.qid || ''), slide: Number(p.slide) || 0, role: String(p.role || ''), sim: !!p.sim, t: Number(p.t) || Date.now() };
        return this._notify('wall');
      }
      case 'wv': {
        const [, id, uid] = parts; if (!id || !uid) return;
        if (!text) { if (this.d.wv[id]) delete this.d.wv[id][uid]; return this._notify('wall'); }
        const v = parse(); if (!v) return;
        const cur = this.d.wv[id]?.[uid]; if (cur && cur.t > v.t) return;
        (this.d.wv[id] ||= {})[uid] = { on: !!v.on, t: Number(v.t) || 0 };
        return this._notify('wall');
      }
      case 'wm': {
        const id = parts[1]; if (!id) return;
        if (!text) { delete this.d.wm[id]; return this._notify('wall'); }
        verifyBody(this.pub, text).then(b => {
          if (!b || !same()) return;
          const cur = this.d.wm[id]; if (cur && cur.t > b.t) return;
          this.d.wm[id] = { hidden: !!b.hidden, t: b.t }; this._notify('wall');
        });
        return;
      }
      case 'u': {
        const uid = parts[1]; const p = parse(); if (!uid || !p) return;
        this.d.u[uid] = { role: String(p.role || ''), lens: p.lens || null, sim: !!p.sim, seen: Date.now() };
        return this._notify('users');
      }
      case 'x': {
        const uid = parts[1]; const p = parse(); if (!uid || !p) return;
        this.d.x[uid] = { emoji: String(p.emoji || '').slice(0, 4), t: Date.now() };
        return this._notify('reactions');
      }
    }
  }

  _switch(session, t) {
    const old = this.session, oldTopics = [...this.topics];
    this.session = session; this.sessionT = t;
    try { localStorage.setItem('erp_session_' + this.room, JSON.stringify({ session, t })); } catch {}
    this.d = emptyData(); this.topics = new Set(); this.seenCmd = new Set();
    if (old) for (const c of this.clients) for (const k of [...c.sticky.keys()]) if (k.startsWith(this.base + old + '/')) c.sticky.delete(k);
    for (const kind of this.kinds) this._subscribeKind(kind);
    if (old && old !== session && this.cleanupOnSwitch && this.canWrite) this._cleanup(oldTopics);
    if (this.me) this._heartbeat();
    for (const k of new Set([...this.listeners.keys(), 'session', 'state', 'wall'])) this._notify(k);
  }
  // El puntero a la sesión («current») va firmado, así que cualquier dispositivo puede volver a publicarlo.
  // Si un servidor tiene uno más antiguo que el nuestro (o ninguno), se vuelve a publicar el más reciente.
  // Así un dispositivo que se reconecta tarde nunca devuelve la sala a una sesión vieja.
  _heal(i, delay = 300 + Math.random() * 1200) {
    if (!this.currentText || this.healT.has(i)) return;
    this.healT.set(i, setTimeout(() => {
      this.healT.delete(i);
      if ((this.curLast.get(i) || 0) >= this.sessionT) return; // ya lo ha corregido otro
      this.clients[i]?.publish(this.base + 'current', this.currentText, { retain: true });
    }, delay));
  }
  // Al reconectar: si en unos segundos ese servidor no ha entregado la sesión actual, se le vuelve a publicar.
  _checkCurrent(i) {
    this.curLast.delete(i);
    setTimeout(() => { if (this.online.get(i) && (this.curLast.get(i) || 0) < this.sessionT) this._heal(i, 0); }, 3000 + Math.random() * 1500);
  }
  // Borra del broker los mensajes retenidos de la sesión anterior (privacidad).
  _cleanup(topics) {
    let i = 0;
    const step = () => { for (const t of topics.slice(i, i + 40)) this._pub(t, '', { retain: true }); i += 40; if (i < topics.length) setTimeout(step, 120); };
    step();
  }
  async _announce(session, t) {
    if (!this.canWrite) return;
    const text = await signBody(this.priv, { session, t });
    for (const c of this.clients) c.publish(this.base + 'current', text, { retain: true });
    if (t > this.sessionT) { this.currentText = text; this._switch(session, t); }
  }

  // ——— Publicación ———
  _pub(topic, text, opts) { for (const c of this.clients) c.publish(topic, text, opts); }
  async _pubSigned(topic, obj, opts) { if (!this.priv) return; const text = await signBody(this.priv, obj); this._pub(topic, text, opts); }

  // ——— Interfaz común ———
  onSession(cb) { return this._on('session', cb); }
  onStatus(cb) { return this._on('status', cb); }
  onState(cb) { this._sub('st'); return this._on('state', cb); }
  onCmd(cb) { this._sub('cmd'); this.cmdListeners.add(cb); return () => this.cmdListeners.delete(cb); }
  async setState(patch) {
    if (!this.canWrite || !this.session) return;
    const { cmd, ...fields } = patch;
    for (const [f, v] of Object.entries(fields)) {
      const rec = { v, seq: (this.d.st[f]?.seq || 0) + 1, by: this.uid };
      this.d.st[f] = rec;
      this._pubSigned(`${this.ns}st/${f}`, rec, { retain: true });
    }
    if (Object.keys(fields).length) this._notify('state');
    if (cmd) { const c = { ...cmd, id: rnd(10) }; this.seenCmd.add(c.id); this._pubSigned(`${this.ns}cmd/${c.id}`, c); }
  }

  onResponses(qid, cb) { this._sub('r'); return this._on('r:' + qid, cb); }
  async submit(qid, value, meta = {}) {
    if (!this.session) return;
    this.sealer ||= await makeSealer(this.pub);
    this._pub(`${this.ns}r/${qid}/${this.uid}`, await this.sealer.seal({ value, ...meta, t: Date.now() }), { retain: true });
  }

  onAgg(qid, cb) { this._sub('a'); return this._on('a:' + qid, cb); }
  async setAgg(qid, agg) {
    if (!this.canWrite || !this.session) return;
    this.d.a[qid] = agg; this._notify('a:' + qid);
    this._pubSigned(`${this.ns}a/${qid}`, agg, { retain: true, sticky: true });
  }

  onWall(cb) { this._sub('w'); this._sub('wv'); this._sub('wm'); return this._on('wall', cb); }
  async wallPost(text, ctx = {}) {
    if (!this.session) return null;
    const id = 'p' + Date.now().toString(36) + rnd(4);
    const post = { text: String(text).slice(0, 200), uid: this.uid, ...ctx, t: Date.now() };
    this.d.w[id] = post; this._notify('wall');
    this._pub(`${this.ns}w/${id}`, JSON.stringify(post), { retain: true, sticky: true });
    return id;
  }
  async wallVote(id) {
    if (!this.session) return;
    const rec = { on: !this.d.wv[id]?.[this.uid]?.on, t: Date.now() };
    (this.d.wv[id] ||= {})[this.uid] = rec; this._notify('wall');
    this._pub(`${this.ns}wv/${id}/${this.uid}`, JSON.stringify(rec), { retain: true, sticky: true });
  }
  async wallUpdate(id, patch) {
    if (!this.canWrite || !('hidden' in patch)) return;
    const rec = { hidden: !!patch.hidden, t: Date.now() };
    this.d.wm[id] = rec; this._notify('wall');
    this._pubSigned(`${this.ns}wm/${id}`, rec, { retain: true });
  }
  async wallClear() {
    if (!this.canWrite) return;
    for (const id of Object.keys(this.d.w)) {
      this._pub(`${this.ns}w/${id}`, '', { retain: true });
      this._pub(`${this.ns}wm/${id}`, '', { retain: true });
      for (const u of Object.keys(this.d.wv[id] || {})) this._pub(`${this.ns}wv/${id}/${u}`, '', { retain: true });
    }
    this.d.w = {}; this.d.wv = {}; this.d.wm = {}; this._notify('wall');
  }

  onUsers(cb) { this._sub('u'); return this._on('users', cb); }
  _heartbeat() { if (this.session && this.me) this._pub(`${this.ns}u/${this.uid}`, JSON.stringify({ role: this.me.role || '', lens: this.me.lens || null })); }
  async setUser(patch) { this.me = { ...(this.me || {}), ...patch }; this._heartbeat(); }
  getMyUser() { return this.me; }

  onReactions(cb) { this._sub('x'); return this._on('reactions', cb); }
  async react(emoji) { if (this.session) this._pub(`${this.ns}x/${this.uid}`, JSON.stringify({ emoji })); }

  async resetAll() { if (this.canWrite) await this._announce('s' + Date.now().toString(36) + rnd(4), Date.now()); }
  async resetResponses(qids) {
    if (!this.canWrite) return;
    if (!this.kinds.has('r')) return this.setState({ cmd: { type: 'clear', qids } });
    for (const qid of qids) { for (const uid of Object.keys(this.d.r[qid] || {})) this._pub(`${this.ns}r/${qid}/${uid}`, '', { retain: true }); this.d.r[qid] = {}; this._notify('r:' + qid); }
  }
  async simulate(qid, q, n, roles, lenses) {
    if (!this.session) return;
    this.sealer ||= await makeSealer(this.pub);
    for (let i = 0; i < n; i++) {
      const r = { ...fakeResponse(q, roles, lenses), role: roles[i % roles.length].id, lens: lenses[i % lenses.length].id };
      this._pub(`${this.ns}r/${qid}/sim${i}`, await this.sealer.seal(r), { retain: true });
      this._pub(`${this.ns}u/sim${i}`, JSON.stringify({ role: r.role, sim: true }));
    }
  }
  async simulateWall(texts, ctx) {
    if (!this.session) return;
    for (const t of texts) {
      const id = 'p' + Date.now().toString(36) + rnd(4);
      this._pub(`${this.ns}w/${id}`, JSON.stringify({ text: t, uid: 'sim' + rnd(4), ...ctx, sim: true, t: Date.now() }), { retain: true });
      const k = Math.floor(Math.random() * 6);
      for (let i = 0; i < k; i++) this._pub(`${this.ns}wv/${id}/sim${i}`, JSON.stringify({ on: true, t: Date.now() }), { retain: true });
    }
  }
  async login(secret) {
    const priv = await importPrivate(this.cfg.keys, secret, this.pub);
    if (!priv) return false;
    this.priv = priv; this.opener = makeOpener(priv); saveSecret(this.room, secret);
    return true;
  }
  async logout() { this.priv = null; forgetSecret(this.room); }
  onAuth(cb) { cb({ uid: this.uid, presenter: this.isPresenter }); return () => {}; }
}

export class FirebaseStore {
  // NOTA: pendiente de probar con un proyecto real. Mantiene la misma interfaz que LocalStore.
  static async create(cfg) {
    const v = '10.14.1';
    const [app, auth, fs] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${v}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${v}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${v}/firebase-firestore.js`),
    ]);
    const s = new FirebaseStore();
    s.mode = 'firebase'; s.cfg = cfg; s.fs = fs; s.auth = auth;
    s.app = app.initializeApp(cfg.firebase);
    s.db = fs.getFirestore(s.app);
    s.a = auth.getAuth(s.app);
    s.user = null; s.wallCache = {};
    await new Promise(resolve => {
      const off = auth.onAuthStateChanged(s.a, async u => {
        if (!u) { await auth.signInAnonymously(s.a).catch(e => console.error('auth', e)); return; }
        s.user = u; off(); resolve();
      });
    });
    return s;
  }
  get uid() { return this.user ? this.user.uid : null; }
  get isPresenter() { return !!(this.user && this.user.email && (this.cfg.presenters || []).includes(this.user.email)); }
  get canWrite() { return this.isPresenter; }
  get session() { return 'firebase'; }
  get ready() { return Promise.resolve(); }
  onSession(cb) { Promise.resolve().then(() => cb('firebase')); return () => {}; }
  onStatus(cb) { Promise.resolve().then(() => cb({ online: 1, total: 1 })); return () => {}; }
  onCmd(cb) { let last; let first = true; return this.onState(st => { const c = st.cmd; if (first) { first = false; last = c && c.id; return; } if (c && c.id && c.id !== last) { last = c.id; cb(c); } }); }
  onAuth(cb) { return this.auth.onAuthStateChanged(this.a, u => { this.user = u; cb(u ? { uid: u.uid, email: u.email, presenter: this.isPresenter } : null); }); }
  async login(email, password) { await this.auth.signInWithEmailAndPassword(this.a, email, password); return this.isPresenter; }
  async logout() { await this.auth.signOut(this.a); }

  _doc(...p) { return this.fs.doc(this.db, ...p); }
  _col(...p) { return this.fs.collection(this.db, ...p); }
  _onCol(ref, cb) { return this.fs.onSnapshot(ref, snap => { const m = {}; snap.forEach(d => { m[d.id] = d.data(); }); cb(m); }, e => console.error('snapshot', e)); }

  onState(cb) { return this.fs.onSnapshot(this._doc('sesion', 'estado'), s => cb({ ...DEFAULT_STATE, ...(s.data() || {}) })); }
  async setState(patch) { if (patch.cmd) patch = { ...patch, cmd: { ...patch.cmd, id: rnd(10) } }; await this.fs.setDoc(this._doc('sesion', 'estado'), { ...patch, t: Date.now() }, { merge: true }); }

  onResponses(qid, cb) { return this._onCol(this._col('responses', qid, 'items'), cb); }
  async submit(qid, value, meta = {}) { await this.fs.setDoc(this._doc('responses', qid, 'items', this.uid), { value, ...meta, t: Date.now() }); }

  onAgg(qid, cb) { return this.fs.onSnapshot(this._doc('agg', qid), s => cb(s.exists() ? s.data() : null)); }
  async setAgg(qid, agg) { await this.fs.setDoc(this._doc('agg', qid), agg); }

  onWall(cb) { return this._onCol(this._col('wall'), m => { this.wallCache = m; cb(m); }); }
  async wallPost(text, ctx = {}) { const ref = this.fs.doc(this._col('wall')); await this.fs.setDoc(ref, { text, uid: this.uid, ...ctx, votes: {}, hidden: false, t: Date.now() }); return ref.id; }
  async wallVote(id) { const p = this.wallCache[id]; const voted = p && p.votes && p.votes[this.uid]; await this.fs.updateDoc(this._doc('wall', id), { ['votes.' + this.uid]: voted ? this.fs.deleteField() : true }); }
  async wallUpdate(id, patch) { await this.fs.updateDoc(this._doc('wall', id), patch); }
  async wallClear() { const snap = await this.fs.getDocs(this._col('wall')); const b = this.fs.writeBatch(this.db); snap.forEach(d => b.delete(d.ref)); await b.commit(); }

  onUsers(cb) { return this._onCol(this._col('users'), cb); }
  async setUser(patch) { await this.fs.setDoc(this._doc('users', this.uid), { ...patch, seen: Date.now() }, { merge: true }); }
  getMyUser() { try { return JSON.parse(localStorage.getItem('erp_me') || 'null'); } catch { return null; } }

  onReactions(cb) { return this._onCol(this._col('reactions'), cb); }
  async react(emoji) { await this.fs.setDoc(this._doc('reactions', this.uid), { emoji, t: Date.now() }); }

  async resetAll() {
    for (const name of ['wall', 'users', 'reactions', 'agg']) { const snap = await this.fs.getDocs(this._col(name)); const b = this.fs.writeBatch(this.db); snap.forEach(d => b.delete(d.ref)); await b.commit(); }
    await this.fs.setDoc(this._doc('sesion', 'estado'), { ...DEFAULT_STATE, t: Date.now() });
  }
  async resetResponses(qids) {
    for (const qid of qids) { const snap = await this.fs.getDocs(this._col('responses', qid, 'items')); const b = this.fs.writeBatch(this.db); snap.forEach(d => b.delete(d.ref)); await b.commit(); }
  }
  async simulate(qid, q, n, roles, lenses) {
    const b = this.fs.writeBatch(this.db);
    for (let i = 0; i < n; i++) b.set(this._doc('responses', qid, 'items', 'sim_' + i), { ...fakeResponse(q, roles, lenses), role: roles[i % roles.length].id, lens: lenses[i % lenses.length].id });
    await b.commit();
  }
  async simulateWall(texts, ctx) { for (const t of texts) await this.wallPost(t, { ...ctx, sim: true }); }
}

export async function createStore(cfg = {}) {
  const params = new URLSearchParams(globalThis.location?.search || '');
  const transport = params.has('local') ? 'local' : (cfg.transport || (cfg.firebase ? 'firebase' : 'local'));
  if (transport === 'mqtt') {
    try { return await MqttStore.create(cfg); } catch (e) { console.error('MQTT no disponible, usando modo local', e); }
  }
  if (transport === 'firebase' && cfg.firebase) {
    try { return await FirebaseStore.create(cfg); } catch (e) { console.error('Firebase no disponible, usando modo local', e); }
  }
  return new LocalStore(cfg);
}

export function wallSort(wall) {
  return Object.entries(wall || {}).map(([id, p]) => ({ id, ...p, nVotes: Object.keys(p.votes || {}).length }))
    .sort((a, b) => b.nVotes - a.nVotes || b.t - a.t);
}

export function cleanText(text, bad = []) {
  let t = String(text || '').replace(/\s+/g, ' ').trim();
  const low = t.toLowerCase();
  return { text: t, flagged: bad.some(w => low.includes(w)) };
}
