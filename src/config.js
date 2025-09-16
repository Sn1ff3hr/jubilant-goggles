// config.js for Your Worker endpoint (public)
export const ENDPOINT = 'https://rapid-pine-49ba.mussle-creashure.workers.dev/';
// Pinned fingerprint (SHA-256 over SPKI of the signing public key) — PUBLIC
export const SIGN_P256_PUB_FINGERPRINT_SHA256 =
  '9C1C86447269EE51CEDCC795F56677EA4A0874F845066D45CC3E4EF0828FC685';
// Public JWK (verify) — PUBLIC
export const SIGN_P256_PUB_JWK = {
  "crv": "P-256",
  "ext": true,
  "key_ops": ["verify"],
  "kty": "EC",
  "x": "xueVPRmHRpUDL3DejWdar6sMwyU-VC8yHq8Iw8T6fjA",
  "y": "B6E6f8E9bhXxTOwPpZYgBMlWev5x2hihqEyQWV2JfkA"
};
