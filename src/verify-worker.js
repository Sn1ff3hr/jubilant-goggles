import { SIGN_P256_PUB_JWK, SIGN_P256_PUB_FINGERPRINT_SHA256, ENDPOINT } from './config.js';

async function importPubJwk(jwk){
  return crypto.subtle.importKey('jwk', jwk, { name:'ECDSA', namedCurve:'P-256' }, false, ['verify']);
}
async function spkiFpSha256(publicKey){
  const spki = await crypto.subtle.exportKey('spki', publicKey);
  const h = await crypto.subtle.digest('SHA-256', spki);
  return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
}

// call once at startup (optional)
export async function assertWorkerKeyMatchesPin(){
  const r = await fetch(`${ENDPOINT}/.well-known/signing-key`);
  const { jwk, fingerprint } = await r.json();
  const pub = await importPubJwk(jwk);
  const fp  = await spkiFpSha256(pub);
  if (fp !== SIGN_P256_PUB_FINGERPRINT_SHA256) throw new Error('Pinned fingerprint mismatch');
  if (fingerprint && fingerprint !== SIGN_P256_PUB_FINGERPRINT_SHA256) throw new Error('Worker fingerprint mismatch');
}

// verify a signed response body using the X-Signature header
export async function verifySignedResponse(bodyText, signatureB64Url){
  const pub = await importPubJwk(SIGN_P256_PUB_JWK);
  const sigBytes = Uint8Array.from(atob(signatureB64Url.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
  const ok = await crypto.subtle.verify(
    { name:'ECDSA', hash:'SHA-256' },
    pub,
    sigBytes,
    new TextEncoder().encode(bodyText)
  );
  if (!ok) throw new Error('Response signature invalid');
}
