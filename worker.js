/**
 * A Cloudflare Worker that acts as a secure intermediary between a frontend application
 * and a Google Apps Script backend.
 *
 * --- SECURITY MODEL (DEFENSE IN DEPTH) ---
 * This worker employs a two-layer security strategy:
 *
 * 1. AUTHENTICATION (via Bearer Token):
 *    - The worker first authenticates the incoming request from the browser.
 *    - It expects a secret "Bearer Token" in the 'Authorization' header.
 *    - This acts as a simple, effective gate to block unauthorized requests or scans.
 *    - The frontend and this worker share this secret.
 *
 * 2. RESPONSE INTEGRITY (via ECDSA Signature):
 *    - To prove that the response genuinely comes from this worker and has not been
 *      tampered with, the worker signs its entire response body using a private key.
 *    - The browser then uses the corresponding public key to verify this signature.
 *    - This prevents Man-in-the-Middle (MITM) attacks on the response data.
 *
 * This dual-layer approach ensures that only authorized clients can talk to the worker,
 * and the client can be certain the response it receives is authentic and untampered.
 *
 * --- REQUIRED ENVIRONMENT VARIABLES (in Cloudflare Dashboard) ---
 *
 * 1. SECRET_KEY_FROM_BROWSER
 *    - A secret string (bearer token) that the frontend must provide in the
 *      'Authorization' header to authenticate itself to this worker.
 *    - Example: 'a_very_secret_string_for_the_browser'
 *
 * 2. APPS_SCRIPT_URL
 *    - The full deployment URL of the Google Apps Script web app.
 *    - Example: 'https://script.google.com/macros/s/YOUR_APPS_SCRIPT_ID/exec'
 *
 * 3. SECRET_KEY_TO_APPS_SCRIPT
 *    - A secret string (bearer token) that this worker will send to the Google
 *      Apps Script to authenticate itself.
 *    - Example: 'another_super_secret_for_apps_script'
 *
 * 4. SIGNING_KEY_PRIVATE_JWK
 *    - The P-256 private key in JWK (JSON Web Key) format, used to sign responses
 *      sent back to the browser. Must be stored as a single-line JSON string.
 *    - IMPORTANT: This is the PRIVATE key corresponding to the PUBLIC key in script.js.
 *    - Example (Do NOT use this, generate your own):
 *      '{"crv":"P-256","d":"..."}'
 */

// Helper function to import the private signing key from JWK format
async function importPrivateJwk(jwkString) {
  try {
    const jwk = JSON.parse(jwkString);
    return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  } catch (e) {
    console.error('Failed to parse or import private key JWK:', e);
    throw new Error('Invalid signing key configuration.');
  }
}

// Helper function to sign a payload and return the signature in Base64URL format
async function signPayload(privateKey, data) {
  const signatureBuffer = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, data);
  // Convert ArrayBuffer to Base64URL
  return btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}


export default {
  async fetch(request, env, ctx) {
    // Only allow POST requests
    if (request.method !== 'POST') {
      return new Response('Expected POST request', { status: 405 });
    }

    // 1. Authenticate the request from the browser
    const authHeader = request.headers.get('Authorization');
    const expectedAuth = `Bearer ${env.SECRET_KEY_FROM_BROWSER}`;
    if (!authHeader || authHeader !== expectedAuth) {
      return new Response('Forbidden', { status: 403 });
    }

    // Ensure all required environment variables are set
    if (!env.APPS_SCRIPT_URL || !env.SECRET_KEY_TO_APPS_SCRIPT || !env.SIGNING_KEY_PRIVATE_JWK) {
        return new Response('Worker is not configured correctly.', { status: 500 });
    }

    try {
      const requestBody = await request.text();

      // 2. Forward the request to the Google Apps Script
      const appsScriptResponse = await fetch(env.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.SECRET_KEY_TO_APPS_SCRIPT}`,
        },
        body: requestBody,
      });

      const responseBodyText = await appsScriptResponse.text();
      const responseStatus = appsScriptResponse.status;
      const responseHeaders = appsScriptResponse.headers;

      // 3. Sign the response from the Apps Script
      const privateKey = await importPrivateJwk(env.SIGNING_KEY_PRIVATE_JWK);
      const payloadUint8 = new TextEncoder().encode(responseBodyText);
      const signature = await signPayload(privateKey, payloadUint8);

      // 4. Send the signed response back to the browser
      const response = new Response(responseBodyText, {
        status: responseStatus,
        headers: {
          'Content-Type': responseHeaders.get('Content-Type') || 'application/json',
          'X-Signature': signature, // Add the signature to a custom header
        },
      });

      return response;

    } catch (error) {
      console.error('Error in worker:', error);
      // In case of an error, we still sign the error message to maintain a consistent protocol.
      const errorMessage = JSON.stringify({ success: false, message: error.message });
      const privateKey = await importPrivateJwk(env.SIGNING_KEY_PRIVATE_JWK);
      const payloadUint8 = new TextEncoder().encode(errorMessage);
      const signature = await signPayload(privateKey, payloadUint8);

      return new Response(errorMessage, {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': signature,
        },
      });
    }
  },
};
