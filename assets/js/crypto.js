// Firma (ECDSA P-256) y cifrado (ECDH P-256 + AES-GCM) con WebCrypto.
// - Solo quien tiene la clave de ponente puede mover la presentación, moderar o publicar resultados.
// - Las respuestas viajan cifradas: solo el portátil de los ponentes puede leerlas.
const subtle = globalThis.crypto?.subtle;
const te = new TextEncoder(), td = new TextDecoder();
const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' };
const ECDH = { name: 'ECDH', namedCurve: 'P-256' };

export const b64u = {
  enc(buf) { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  dec(str) { let s = String(str).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const r = atob(s); const b = new Uint8Array(r.length); for (let i = 0; i < r.length; i++) b[i] = r.charCodeAt(i); return b; },
};
export const cryptoAvailable = !!subtle;
const jwk = (k, extra = {}) => ({ kty: 'EC', crv: 'P-256', x: k.x, y: k.y, ext: true, ...extra });

export async function importPublic(keys) {
  if (!subtle) return null;
  return {
    verify: await subtle.importKey('jwk', jwk(keys.sign), ECDSA, false, ['verify']),
    enc: await subtle.importKey('jwk', jwk(keys.enc), ECDH, false, []),
  };
}

// La clave de ponente es "d_firma.d_cifrado" (base64url). Devuelve null si no es válida.
export async function importPrivate(keys, secret, pub) {
  if (!subtle || !secret) return null;
  try {
    const [sd, ed] = String(secret).trim().split('.');
    const sign = await subtle.importKey('jwk', jwk(keys.sign, { d: sd }), ECDSA, false, ['sign']);
    const dec = await subtle.importKey('jwk', jwk(keys.enc, { d: ed }), ECDH, false, ['deriveKey']);
    const probe = 'erp-' + Date.now();
    const sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, sign, te.encode(probe));
    if (!(await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub.verify, sig, te.encode(probe)))) return null;
    return { sign, dec };
  } catch { return null; }
}

export async function signBody(priv, obj) {
  const b = JSON.stringify(obj);
  const s = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv.sign, te.encode(b));
  return JSON.stringify({ b, s: b64u.enc(s) });
}
export async function verifyBody(pub, text) {
  try {
    const { b, s } = JSON.parse(text);
    if (typeof b !== 'string' || typeof s !== 'string') return null;
    const ok = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub.verify, b64u.dec(s), te.encode(b));
    return ok ? JSON.parse(b) : null;
  } catch { return null; }
}

// Cifrado de respuestas: cada dispositivo usa una clave efímera ECDH y AES-GCM.
export async function makeSealer(pub) {
  if (!subtle || !pub) return { seal: async obj => JSON.stringify({ p: obj }) };
  const eph = await subtle.generateKey(ECDH, true, ['deriveKey']);
  const raw = b64u.enc(await subtle.exportKey('raw', eph.publicKey));
  const key = await subtle.deriveKey({ name: 'ECDH', public: pub.enc }, eph.privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  return {
    async seal(obj) {
      const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
      const c = await subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj)));
      return JSON.stringify({ e: raw, i: b64u.enc(iv), c: b64u.enc(c) });
    },
  };
}
export function makeOpener(priv) {
  const cache = new Map();
  return {
    async open(text) {
      try {
        const m = JSON.parse(text);
        if (m.p) return m.p; // dispositivo sin WebCrypto
        if (!priv) return null;
        let key = cache.get(m.e);
        if (!key) {
          const peer = await subtle.importKey('raw', b64u.dec(m.e), ECDH, false, []);
          key = await subtle.deriveKey({ name: 'ECDH', public: peer }, priv.dec, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
          cache.set(m.e, key);
        }
        const plain = await subtle.decrypt({ name: 'AES-GCM', iv: b64u.dec(m.i) }, key, b64u.dec(m.c));
        return JSON.parse(td.decode(plain));
      } catch { return null; }
    },
  };
}

// Clave de ponente: llega en el enlace (#k=...) una vez y se guarda en este dispositivo.
// La clave de ponente son dos partes en base64url separadas por un punto. Se saca de cualquier texto pegado:
// el enlace completo, la clave sola, con comillas o espacios alrededor, o una fila de la tabla de enlaces.
export function extractSecret(text) {
  let t = String(text || '');
  try { t = decodeURIComponent(t); } catch {}
  const m = t.match(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/);
  return m ? m[0] : null;
}
export function takeSecret(room) {
  const storeKey = 'erp_key_' + room;
  let fromLink = null;
  try {
    const hash = globalThis.location?.hash || '';
    if (/[#&]k=/.test(hash)) {
      fromLink = extractSecret(hash.slice(hash.indexOf('k=') + 2));
      const rest = hash.replace(/[#&]?k=[^&]*/, '').replace(/^#?&/, '#');
      history.replaceState(null, '', location.pathname + location.search + (rest && rest !== '#' ? rest : ''));
    }
  } catch {}
  try { if (fromLink) localStorage.setItem(storeKey, fromLink); return fromLink || localStorage.getItem(storeKey); }
  catch { return fromLink; } // navegador sin almacenamiento (ventana privada antigua): vale para esta visita
}
export function saveSecret(room, secret) { try { localStorage.setItem('erp_key_' + room, secret); } catch {} }
export function forgetSecret(room) { try { localStorage.removeItem('erp_key_' + room); } catch {} }
