// Cliente MQTT 3.1.1 mínimo sobre WebSocket: QoS 0, mensajes retenidos, keepalive y reconexión.
// Sin dependencias. Funciona en el navegador y en Node (con WebSocket global).
const te = new TextEncoder();
const td = new TextDecoder();

function varint(n) { const out = []; do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 128; out.push(b); } while (n > 0); return out; }
function concat(parts) { let len = 0; for (const p of parts) len += p.length; const out = new Uint8Array(len); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; }
function u16(n) { return new Uint8Array([(n >> 8) & 255, n & 255]); }
function mstr(s) { const b = te.encode(s); return concat([u16(b.length), b]); }
function packet(first, body) { return concat([new Uint8Array([first, ...varint(body.length)]), body]); }

export class MqttClient {
  constructor(url, opts = {}) {
    this.url = url; this.opts = opts;
    this.clientId = opts.clientId || ('c' + Math.random().toString(36).slice(2, 14));
    this.keepalive = opts.keepalive || 30;
    this.subs = new Set(); this.queue = []; this.sticky = new Map();
    this.connected = false; this.connecting = false; this.closed = false;
    this.pid = 1; this.retry = 0; this.buf = new Uint8Array(0); this.ws = null;
  }
  connect() {
    if (this.closed || this.connecting || this.connected) return;
    this.connecting = true;
    let ws;
    try { ws = new WebSocket(this.url, ['mqtt']); } catch { this.connecting = false; return this._schedule(); }
    ws.binaryType = 'arraybuffer';
    this.ws = ws; this.buf = new Uint8Array(0);
    ws.onopen = () => {
      const body = concat([mstr('MQTT'), new Uint8Array([4, 0x02]), u16(this.keepalive), mstr(this.clientId)]);
      this._raw(packet(0x10, body));
    };
    ws.onmessage = ev => this._data(new Uint8Array(ev.data));
    ws.onclose = () => { if (this.ws === ws) this._down(); };
    ws.onerror = () => { try { ws.close(); } catch {} };
    clearTimeout(this.connTimer);
    this.connTimer = setTimeout(() => { if (!this.connected && this.ws === ws) { try { ws.close(); } catch {} this._down(); } }, 8000);
  }
  // Reconectar ya (p. ej. al desbloquear el móvil).
  kick() { if (!this.connected && !this.connecting && !this.closed) { clearTimeout(this.reTimer); this.retry = 0; this.connect(); } }
  _down() {
    clearTimeout(this.connTimer); clearInterval(this.ping);
    this.connected = false; this.connecting = false; this.ws = null;
    this.opts.onStatus?.(false);
    this._schedule();
  }
  _schedule() {
    if (this.closed) return;
    const d = Math.min(10000, 500 * 2 ** this.retry++) + Math.random() * 400;
    clearTimeout(this.reTimer); this.reTimer = setTimeout(() => this.connect(), d);
  }
  _data(chunk) {
    this.buf = this.buf.length ? concat([this.buf, chunk]) : chunk;
    for (;;) {
      if (this.buf.length < 2) return;
      let mult = 1, len = 0, i = 1, b;
      do {
        if (i >= this.buf.length) return;
        b = this.buf[i++]; len += (b & 127) * mult; mult *= 128;
      } while ((b & 128) && i < 5);
      if (this.buf.length < i + len) return;
      const first = this.buf[0], body = this.buf.slice(i, i + len);
      this.buf = this.buf.slice(i + len);
      this._packet(first, body);
    }
  }
  _packet(first, body) {
    const type = first >> 4;
    if (type === 2) { // CONNACK
      if (body[1] !== 0) { try { this.ws?.close(); } catch {} return; }
      clearTimeout(this.connTimer);
      this.connected = true; this.connecting = false; this.retry = 0;
      if (this.subs.size) this._sendSub([...this.subs]);
      for (const [topic, p] of this.sticky) this._send(topic, p, true);
      const q = this.queue; this.queue = [];
      for (const m of q) this._send(m.topic, m.payload, m.retain);
      clearInterval(this.ping);
      this.ping = setInterval(() => this._raw(new Uint8Array([0xC0, 0])), this.keepalive * 750);
      this.opts.onStatus?.(true);
    } else if (type === 3) { // PUBLISH
      const qos = (first >> 1) & 3, retained = !!(first & 1);
      const tlen = (body[0] << 8) | body[1];
      const topic = td.decode(body.subarray(2, 2 + tlen));
      let o = 2 + tlen;
      if (qos > 0) { const id = (body[o] << 8) | body[o + 1]; o += 2; if (qos === 1) this._raw(new Uint8Array([0x40, 2, id >> 8, id & 255])); }
      this.opts.onMessage?.(topic, body.subarray(o), retained);
    }
  }
  _raw(bytes) { if (this.ws && this.ws.readyState === 1) { try { this.ws.send(bytes); } catch {} } }
  _sendSub(filters) {
    const id = (this.pid++ & 0xffff) || 1;
    this._raw(packet(0x82, concat([u16(id), ...filters.map(f => concat([mstr(f), new Uint8Array([0])]))])));
  }
  _send(topic, p, retain) { this._raw(packet(0x30 | (retain ? 1 : 0), concat([mstr(topic), p]))); }
  subscribe(filter) { if (this.subs.has(filter)) return; this.subs.add(filter); if (this.connected) this._sendSub([filter]); }
  // sticky: se vuelve a publicar al reconectar (solo para mensajes retenidos propios).
  publish(topic, payload, { retain = false, sticky = false } = {}) {
    const p = typeof payload === 'string' ? te.encode(payload) : payload;
    if (retain && sticky) { if (p.length) this.sticky.set(topic, p); else this.sticky.delete(topic); }
    if (this.connected) this._send(topic, p, retain);
    else { this.queue.push({ topic, payload: p, retain }); if (this.queue.length > 1000) this.queue.shift(); }
  }
  close() { this.closed = true; clearInterval(this.ping); clearTimeout(this.reTimer); clearTimeout(this.connTimer); try { this.ws?.close(); } catch {} }
}
