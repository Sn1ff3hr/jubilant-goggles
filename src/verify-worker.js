// verify-worker.js
import { SIGN_P256_PUB_JWK, SIGN_P256_PUB_FINGERPRINT_SHA256, ENDPOINT } from './config.js';

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
export async function assertWorkerKeyMatchesPin(){
  try{
    const r = await fetch(`${ENDPOINT}/.well-known/signing-key`);
    if (r.ok) {
      const { jwk, fingerprint } = await r.json();
      if (jwk) {
        const pub = await importPubJwk(jwk);
        const fp  = await spkiFpSha256(pub);
        if (fp !== SIGN_P256_PUB_FINGERPRINT_SHA256) throw new Error('Pinned fingerprint mismatch');
      }
      if (fingerprint && fingerprint !== SIGN_P256_PUB_FINGERPRINT_SHA256) throw new Error('Worker fingerprint mismatch');
      return;
    }
  } catch (_e) {
    // fall through to local check
  }
  // Fallback: compute from pinned public JWK in repo
  const pubLocal = await importPubJwk(SIGN_P256_PUB_JWK);
  const fpLocal  = await spkiFpSha256(pubLocal);
  if (fpLocal !== SIGN_P256_PUB_FINGERPRINT_SHA256) throw new Error('Pinned fingerprint mismatch (local)');
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
