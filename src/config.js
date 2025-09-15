// config.js for Your Worker endpoint (public)
export const ENDPOINT = 'https://solitary-leaf-f8a9.mussle-creashure.workers.dev/';
// Pinned fingerprint (SHA-256 over SPKI of the signing public key) — PUBLIC
export const SIGN_P256_PUB_FINGERPRINT_SHA256 =
  '9F3AE3BEE7B698BED9F41EBAEB22E32D11E087A301681F709872FD51B3C7CDFC';
// Public JWK (verify) — PUBLIC
export const SIGN_P256_PUB_JWK = {
  "crv": "P-256",
  "ext": true,
  "key_ops": ["verify"],
  "kty": "EC",
  "x": "t6eyN6jlsOfqq0Otdez9SJ0G7-K4eY5hHVmLZrtv-IA",
  "y": "SMc0C6cLu_nxoqbB4me4Qt8Opq9613uo7IeODcS6Ozw"
};
