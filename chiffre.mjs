// Chiffrement du contenu des scénarios (AES-GCM 256, Web Crypto). Même code dans Node (construction)
// et dans le navigateur (lecture). Rien ne part sur un serveur : les clés voyagent dans les liens d'invitation.
import { normaliserCode } from './texte.mjs';

const subtle = globalThis.crypto.subtle;
const te = new TextEncoder();
const td = new TextDecoder();

export const b64u = {
  enc(bytes) {
    let s = '';
    for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec(str) {
    const s = atob(String(str).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(str).length + 3) % 4));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  },
};

// Clé d'une manche : SHA-256(clé du rôle ‖ code de la manche normalisé). Mauvais code = déchiffrement impossible.
export async function cleDeManche(brute, code) {
  const a = b64u.dec(brute);
  const c = te.encode(normaliserCode(code));
  const tout = new Uint8Array(a.length + c.length);
  tout.set(a); tout.set(c, a.length);
  return b64u.enc(await subtle.digest('SHA-256', tout));
}

// Clé maîtresse de l'hôte, tirée du code d'accès imprimé dans le kit.
export async function cleMaitresse(codeAcces, sel, iterations) {
  const base = await subtle.importKey('raw', te.encode(normaliserCode(codeAcces)), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b64u.dec(sel), iterations }, base, 256);
  return b64u.enc(bits);
}

const importer = (brute, usage) => subtle.importKey('raw', b64u.dec(brute), 'AES-GCM', false, [usage]);

export async function chiffrer(brute, objet, iv = globalThis.crypto.getRandomValues(new Uint8Array(12))) {
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, await importer(brute, 'encrypt'), te.encode(JSON.stringify(objet)));
  return { iv: b64u.enc(iv), ct: b64u.enc(ct) };
}

// Renvoie l'objet, ou null si la clé (donc le code) est fausse.
export async function dechiffrer(brute, bloc) {
  try {
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv: b64u.dec(bloc.iv) }, await importer(brute, 'decrypt'), b64u.dec(bloc.ct));
    return JSON.parse(td.decode(pt));
  } catch { return null; }
}
