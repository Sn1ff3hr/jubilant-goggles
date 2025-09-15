// ===== Config =====
const IVA_RATE = 0.15;
const LOCALE = { es: 'es-EC', en: 'en-US' };
let currentLang = 'es';

// ===== Cryptography & Security =====
/**
 * --- SECURITY MODEL ---
 * This script uses a dual-layer security model to communicate with the worker:
 *
 * 1. AUTHENTICATION (Bearer Token):
 *    - To prove its identity to the worker, this script sends a secret "Bearer Token"
 *      in the 'Authorization' header of its request.
 *
 * 2. RESPONSE VERIFICATION (ECDSA Signature):
 *    - To ensure the response from the worker is authentic and has not been tampered with,
 *      this script expects the worker to sign the response.
 *    - It uses the worker's public key (`SIGN_P256_PUB_JWK`) to verify the signature
 *      received in the 'X-Signature' header.
 */

// Public key of the worker, used to verify its signatures.
const SIGN_P256_PUB_JWK = { "crv": "P-256", "ext": true, "key_ops": [ "verify" ], "kty": "EC", "x": "t6eyN6jlsOfqq0Otdez9SJ0G7-K4eY5hHVmLZrtv-IA", "y": "SMc0C6cLu_nxoqbB4me4Qt8Opq9613uo7IeODcS6Ozw" };

// Helper function to import the JWK public key.
async function importPubJwk(jwk){
  return crypto.subtle.importKey('jwk', jwk, {name:'ECDSA', namedCurve:'P-256'}, false, ['verify']);
}

// Helper function to verify the signature.
async function verifySignature(publicJwk, payloadUint8, sigBytes){
  const key = await importPubJwk(publicJwk);
  return crypto.subtle.verify({name:'ECDSA', hash:'SHA-256'}, key, sigBytes, payloadUint8);
}

// Helper to decode Base64URL string to Uint8Array
function base64UrlToUint8Array(base64Url) {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const outputArray = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) {
    outputArray[i] = raw.charCodeAt(i);
  }
  return outputArray;
}

// ===== Data =====
let OPTIONS = [];
let EXTRAS = [];

// ===== State & helpers =====
const cart = new Map(); // id -> { id, name, priceCents, qty }
const $ = s => document.querySelector(s);
const t = v => typeof v === 'string' ? v : v[currentLang];
const money = c => (c/100).toLocaleString(LOCALE[currentLang], { style:'currency', currency:'USD' });

function add(item){
  const line = cart.get(item.id) || { ...item, qty:0 };
  line.qty++; cart.set(item.id, line);
  // visual feedback: in dark mode, turn the + Agregar button green for 2s
  const isDark = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark';
  if(isDark){
    const btn = document.querySelector(`button[data-act="add"][data-id="${item.id}"]`);
    if(btn){ btn.classList.add('btn-adding'); setTimeout(()=>btn.classList.remove('btn-adding'), 2000); }
  }
  render();
}
function rem(item){
  if(!cart.has(item.id)) return;
  const line = cart.get(item.id); line.qty--;
  if(line.qty<=0) cart.delete(item.id); else cart.set(item.id, line);
  render();
}

// ===== Build UI =====
function buildOptions(){
  const host = $('#opts'); host.innerHTML='';
  OPTIONS.forEach((o,i)=>{
    const el = document.createElement('div');
    el.className='opt';
    el.innerHTML = `
      <div class="top">
        <button class="btn50 op${(i%4)+1}">${i+1}</button>
        <div>
          <div class="desc">${t(o.desc)} — <strong>${money(o.priceCents)}</strong></div>
          <div class="actions">
            <button class="btn" data-act="rem" data-id="${o.id}">− Quitar</button>
            <button class="btn" data-act="add" data-id="${o.id}">+ Agregar</button>
          </div>
        </div>
      </div>`;
    host.appendChild(el);
  });
}
function buildExtras(){
  const host = $('#extras'); host.innerHTML='';
  EXTRAS.forEach(e=>{
    const row = document.createElement('div');
    row.className='ex-row';
    row.innerHTML = `
      <div class="ex-left">${t(e.name)} <span class="ex-price">${money(e.priceCents)}</span></div>
      <div class="actions">
        <button class="btn" data-act="rem" data-id="${e.id}">−</button>
        <button class="btn" data-act="add" data-id="${e.id}">+ Agregar</button>
      </div>`;
    host.appendChild(row);
  });
}

// ===== Render cart/totals =====
function render(){
  const box = $('#cart'); box.innerHTML='';
  let subtotal = 0;
  cart.forEach(line=>{
    subtotal += line.priceCents * line.qty;
    const el = document.createElement('div');
    el.className='line';
    el.innerHTML = `
      <div>${line.name}</div>
      <div class="qtybox">
        <button class="btn" data-act="rem" data-id="${line.id}">−</button>
        <span>${line.qty}</span>
        <button class="btn" data-act="add" data-id="${line.id}">+</button>
      </div>
      <div><strong>${money(line.priceCents*line.qty)}</strong></div>`;
    box.appendChild(el);
  });
  const vat = Math.round(subtotal * IVA_RATE);
  const total = subtotal + vat;
  $('#subtotal').textContent = money(subtotal);
  $('#vat').textContent = money(vat);
  $('#total').textContent = money(total);
}

// ===== Lang + Theme =====
$('#lang').addEventListener('click', ()=>{
  currentLang = currentLang==='es' ? 'en' : 'es';
  $('#lang').textContent = currentLang.toUpperCase();
  buildOptions(); buildExtras(); render();
});
$('#theme').addEventListener('click', ()=>{
  const root = document.documentElement;
  const cur = root.getAttribute('data-theme') || 'dark';
  const next = cur==='dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  $('#theme').textContent = next==='light' ? '🌞' : '🌙';
});

// ===== Events (add/remove via delegation) =====
document.body.addEventListener('click', (e)=>{
  const btn = e.target.closest('button[data-act]');
  if(!btn) return;
  const id = btn.getAttribute('data-id');
  const act = btn.getAttribute('data-act');
  const item = OPTIONS.find(x=>x.id===id) || EXTRAS.find(x=>x.id===id) || cart.get(id);
  if(!item) return;
  const payload = { id:item.id, name:(item.name?.[currentLang] ?? item.name), priceCents:item.priceCents };
  act==='add' ? add(payload) : rem(payload);
});

// ===== Submit to Worker (loader + toast) =====
const ENDPOINT = 'https://solitary-leaf-f8a9.ignite-metis.workers.dev/'; // Using the latest URL from the user
// IMPORTANT: The user must replace 'YOUR_SECRET_KEY_TO_WORKER' with the actual secret key (bearer token)
// that the Cloudflare Worker will expect.
const SECRET_KEY_TO_WORKER = 'YOUR_SECRET_KEY_TO_WORKER';

const loader = $('#loader');
const toast  = $('#toast');
function showToast(msg, ms=1800){
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(()=>toast.classList.remove('show'), ms);
}

$('#accept').addEventListener('click', async ()=>{
  if(cart.size===0){ showToast('Carrito vacío'); return; }
  // build payload as array of rows (per item)
  const rows = [];
  cart.forEach(item=>{
    const rowSubtotal = item.qty * item.priceCents;
    const rowVAT = Math.round(rowSubtotal * IVA_RATE);
    const rowTotal = rowSubtotal + rowVAT;
    rows.push({
      timestamp: new Date().toISOString(),
      item: item.name,
      qty: item.qty,
      subtotal: (rowSubtotal/100).toFixed(2),
      vat: (rowVAT/100).toFixed(2),
      total: (rowTotal/100).toFixed(2)
    });
  });

  // show loader, send, then toast
  loader.style.display = 'flex';
  try{
    const res = await fetch(ENDPOINT, {
      method:'POST',
      headers:{
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SECRET_KEY_TO_WORKER}`
      },
      body: JSON.stringify(rows)
    });

    // Get signature from header and response body text for verification
    const signatureB64 = res.headers.get('X-Signature');
    const responseBodyText = await res.text(); // Get body as text to verify against

    if (!signatureB64) {
      throw new Error('Worker response is missing signature.');
    }

    const signatureBytes = base64UrlToUint8Array(signatureB64);
    const payloadUint8 = new TextEncoder().encode(responseBodyText);

    const isSignatureValid = await verifySignature(SIGN_P256_PUB_JWK, payloadUint8, signatureBytes);

    if (!isSignatureValid) {
      throw new Error('Invalid signature from worker. The response may have been tampered with.');
    }

    // If signature is valid, we can now trust the response body.
    const result = JSON.parse(responseBodyText);

    // hide loader -> show toast
    loader.style.display = 'none';
    if(res.ok){
      showToast(result.message || '¡Pedido enviado con éxito!');
      cart.clear(); render();
    }else{
      showToast(result.message || 'Error al enviar. Intenta de nuevo.');
    }
  }catch(err){
    loader.style.display = 'none';
    showToast(`Error: ${err.message}`); // More specific error
  }
});

// ===== Init =====
async function init(){
  try {
    const response = await fetch('data.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    OPTIONS = data.OPTIONS;
    EXTRAS = data.EXTRAS;

    document.documentElement.setAttribute('data-theme','dark');
    buildOptions();
    buildExtras();
    render();
  } catch (error) {
    console.error('Failed to load data:', error);
    // Handle error, e.g., by showing an error message to the user
  }
}

init();
