// verify-worker.js
import { SIGN_P256_PUB_JWK, SIGN_P256_PUB_FINGERPRINT_SHA256, ENDPOINT } from './config.js';

const KEY_FETCH_ALLOWED_ORIGINS = new Set([
  'https://lastortillasdesauces3.com',
  'https://www.lastortillasdesauces3.com',
  'https://rapid-pine-49ba.mussle-creashure.workers.dev'
]);
const KEY_FETCH_LOCALHOST_PREFIXES = ['http://localhost', 'http://127.0.0.1'];

async function importPubJwk(jwk){
  return crypto.subtle.importKey('jwk', jwk, { name:'ECDSA', namedCurve:'P-256' }, false, ['verify']);
}
async function spkiFpSha256(publicKey){
  const spki = await crypto.subtle.exportKey('spki', publicKey);
  const h = await crypto.subtle.digest('SHA-256', spki);
  return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
}
function base64UrlToBytes(b64u){
  if (!b64u) return new Uint8Array(0);
  let b64 = b64u.replace(/-/g,'+').replace(/_/g,'/');
  b64 += '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

// call once at startup (optional)
function shouldAttemptRemoteKeyFetch(signingKeyUrl){
  try {
    if (!globalThis.location) return false;
    const origin = globalThis.location.origin;
    if (!origin || origin === 'null') return false;
    const workerOrigin = new URL(signingKeyUrl).origin;
    if (origin === workerOrigin) return true;
    if (KEY_FETCH_ALLOWED_ORIGINS.has(origin)) return true;
    if (KEY_FETCH_LOCALHOST_PREFIXES.some(prefix => origin.startsWith(prefix))) return true;
  } catch (_err) {
    return false;
  }
  return false;
}

async function verifyPinnedKeyLocally(){
  const pubLocal = await importPubJwk(SIGN_P256_PUB_JWK);
  const fpLocal  = await spkiFpSha256(pubLocal);
  if (fpLocal !== SIGN_P256_PUB_FINGERPRINT_SHA256) throw new Error('Pinned fingerprint mismatch (local)');
}

export async function assertWorkerKeyMatchesPin(){
  const signingKeyUrl = `${ENDPOINT}/.well-known/signing-key`;
  if (shouldAttemptRemoteKeyFetch(signingKeyUrl)) {
    try {
      const r = await fetch(signingKeyUrl, { cache: 'no-store', credentials: 'omit', mode: 'cors', referrerPolicy: 'no-referrer' });
      if (r.status === 401 || r.status === 403) {
        console.info('Pin check skipped: worker denied access.');
      } else if (r.status === 404 || r.status === 405) {
        console.info(`Pin check not supported by worker (status ${r.status}).`);
      } else if (r.ok) {
        const { jwk, fingerprint } = await r.json();
        if (jwk) {
          const pub = await importPubJwk(jwk);
          const fp  = await spkiFpSha256(pub);
          if (fp !== SIGN_P256_PUB_FINGERPRINT_SHA256) throw new Error('Pinned fingerprint mismatch');
        }
        if (fingerprint && fingerprint !== SIGN_P256_PUB_FINGERPRINT_SHA256) throw new Error('Worker fingerprint mismatch');
        return;
      }
    } catch (error) {
      if (error instanceof TypeError) {
        console.info('Pin check skipped: remote signing key endpoint is not accessible from this origin.');
      } else {
        console.warn('Pin check skipped:', error && error.message ? error.message : error);
      }
    }
  } else {
    console.info('Pin check skipped: origin not allowlisted for remote worker key fetch.');
  }

  await verifyPinnedKeyLocally();
}

// verify a signed response body using the X-Signature header
export async function verifySignedResponse(bodyText, signatureB64Url){
  if (!signatureB64Url) throw new Error('Missing signature');
  const pub = await importPubJwk(SIGN_P256_PUB_JWK);
  const sigBytes = base64UrlToBytes(signatureB64Url);
  const ok = await crypto.subtle.verify(
    { name:'ECDSA', hash:'SHA-256' },
    pub,
    sigBytes,
    new TextEncoder().encode(bodyText)
  );
  if (!ok) throw new Error('Response signature invalid');
}
