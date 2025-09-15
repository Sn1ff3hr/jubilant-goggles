async function importPrivateJwk(jwkString) {
  const jwk = JSON.parse(jwkString);
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}
function b64urlFromArrayBuffer(ab) {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(ab)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowList = (env.ALLOW_ORIGINS || '*').split(',').map(s=>s.trim());
    const allowOrigin = allowList.includes('*') ? '*' : (allowList.includes(origin) ? origin : '');

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': allowOrigin || '*',
          'Vary': 'Origin',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') || 'Content-Type',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    if (request.method === 'GET' && url.pathname === '/.well-known/signing-key') {
      const fingerprint = env.SIGN_P256_PUB_FINGERPRINT_SHA256 || null;
      let jwk = null;
      try {
        if (env.KEYS_PUB_ALLOWLIST) {
          const s = await env.KEYS_PUB_ALLOWLIST.get('pubjwk:sign_p256');
          if (s) jwk = JSON.parse(s);
        }
      } catch {}
      return new Response(JSON.stringify({ jwk, fingerprint }), {
        headers: {
          'Content-Type':'application/json',
          'Access-Control-Allow-Origin': allowOrigin || '*',
          'Vary':'Origin'
        }
      });
    }

    if (request.method !== 'POST') {
      return new Response('Expected POST request', {
        status: 405,
        headers: { 'Access-Control-Allow-Origin': allowOrigin || '*', 'Vary':'Origin' }
      });
    }

    if (!env.APPS_SCRIPT_URL || !env.SECRET_KEY_TO_APPS_SCRIPT || !env.SIGNING_KEY_PRIVATE_JWK) {
      return new Response(JSON.stringify({ success:false, message:'Worker is not configured correctly.' }), {
        status: 500,
        headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin': allowOrigin || '*', 'Vary':'Origin' }
      });
    }

    try {
      const requestBody = await request.text();

      const appsScriptResponse = await fetch(env.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.SECRET_KEY_TO_APPS_SCRIPT}`
        },
        body: requestBody
      });

      const responseBodyText = await appsScriptResponse.text();
      const responseStatus = appsScriptResponse.status;
      const contentType = appsScriptResponse.headers.get('Content-Type') || 'application/json';

      const privateKey = await importPrivateJwk(env.SIGNING_KEY_PRIVATE_JWK);
      const signatureAb = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        privateKey,
        new TextEncoder().encode(responseBodyText)
      );
      const signature = b64urlFromArrayBuffer(signatureAb);

      return new Response(responseBodyText, {
        status: responseStatus,
        headers: {
          'Content-Type': contentType,
          'X-Signature': signature,
          'Access-Control-Allow-Origin': allowOrigin || '*',
          'Vary':'Origin'
        }
      });

    } catch (error) {
      const errorBody = JSON.stringify({ success:false, message:String(error && error.message || error) });
      try {
        const privateKey = await importPrivateJwk(env.SIGNING_KEY_PRIVATE_JWK);
        const signatureAb = await crypto.subtle.sign(
          { name: 'ECDSA', hash: 'SHA-256' },
          privateKey,
          new TextEncoder().encode(errorBody)
        );
        const signature = b64urlFromArrayBuffer(signatureAb);
        return new Response(errorBody, {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'X-Signature': signature,
            'Access-Control-Allow-Origin': allowOrigin || '*',
            'Vary':'Origin'
          }
        });
      } catch {
        return new Response(errorBody, {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': allowOrigin || '*',
            'Vary':'Origin'
          }
        });
      }
    }
  }
};
