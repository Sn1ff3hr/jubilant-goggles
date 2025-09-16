
// ===== Clickjacking guard =====
if(globalThis.top && globalThis.top !== globalThis.self){
  try{
    globalThis.top.location = globalThis.self.location.href;
  }catch(_err){
    globalThis.self.location.replace('about:blank');
  }
}

// ===== Constants & configuration =====
const IVA_RATE = 0.15;
const LOCALE = { es: 'es-EC', en: 'en-US' };
const STORAGE_KEYS = { lang: 'lts3-lang', theme: 'lts3-theme' };
const DEFAULT_DATA = {
  OPTIONS: [
    { id:'op1', name:{ es:'Opción 1', en:'Option 1' }, desc:{ es:'Tortilla + Huevos + Chorizo + Bebida', en:'Tortilla + Eggs + Sausage + Drink' }, priceCents:320 },
    { id:'op2', name:{ es:'Opción 2', en:'Option 2' }, desc:{ es:'Tortilla + Chorizo + Bebida', en:'Tortilla + Sausage + Drink' }, priceCents:270 },
    { id:'op3', name:{ es:'Opción 3', en:'Option 3' }, desc:{ es:'Tortilla + Huevos + Bebida', en:'Tortilla + Eggs + Drink' }, priceCents:270 },
    { id:'op4', name:{ es:'Opción 4', en:'Option 4' }, desc:{ es:'2 Tortilla + 2 Huevos + 2 Chorizo + 2 Bebida', en:'2 Tortillas + 2 Eggs + 2 Sausages + 2 Drinks' }, priceCents:640 }
  ],
  EXTRAS: [
    { id:'ex_cafe', name:{ es:'Café', en:'Coffee' }, priceCents:70 },
    { id:'ex_cola', name:{ es:'Cola', en:'Cola' }, priceCents:70 },
    { id:'ex_chorizo', name:{ es:'Chorizo', en:'Sausage' }, priceCents:70 },
    { id:'ex_huevo', name:{ es:'Huevo', en:'Egg' }, priceCents:70 },
    { id:'ex_tortilla', name:{ es:'Tortilla', en:'Tortilla' }, priceCents:70 }
  ]
};

const TEXT = {
  optionsTitle: { es:'Opciones', en:'Options' },
  extrasTitle: { es:'Extras', en:'Extras' },
  summaryTitle: { es:'Resumen', en:'Summary' },
  subtotalLabel: { es:'Subtotal', en:'Subtotal' },
  vatLabel: { es:'IVA (15%)', en:'VAT (15%)' },
  totalLabel: { es:'TOTAL', en:'TOTAL' },
  addAction: { es:'+ Agregar', en:'+ Add' },
  removeAction: { es:'− Quitar', en:'− Remove' },
  emptyCart: { es:'Tu carrito está vacío. Agrega opciones para comenzar.', en:'Your cart is empty. Add an option to get started.' },
  accept: { es:'Aceptar', en:'Checkout' },
  toastSuccess: { es:'¡Pedido enviado con éxito!', en:'Order submitted successfully!' },
  toastEmpty: { es:'Carrito vacío', en:'Cart is empty' },
  toastNetwork: { es:'Error de red. Revisa tu conexión.', en:'Network error. Please check your connection.' },
  toastUnauthorized: { es:'Solicitud no autorizada. Verifica las credenciales del servicio.', en:'Unauthorized request. Please check the service credentials.' },
  toastSignature: { es:'Se detectó un error de seguridad. Recarga la página.', en:'Security error detected. Please reload the page.' },
  toastUnexpected: { es:'Ocurrió un error inesperado. Intenta de nuevo.', en:'An unexpected error occurred. Please try again.' },
  toastResponse: { es:'No se pudo leer la respuesta del servidor.', en:'Unable to read the server response.' },
  toastServer: { es:'Error: {msg}. Intenta nuevamente.', en:'Error: {msg}. Please try again.' },
  dataWarningTitle: { es:'Problema al cargar datos', en:'Problem loading data' },
  dataWarningBody: { es:'No pudimos obtener la configuración remota. Se cargaron datos locales seguros.', en:'We could not fetch the remote configuration. Local safe defaults were loaded instead.' },
  dataWarningList: {
    es:[
      'Verifica tu conexión a internet.',
      'Confirma que el archivo <code>data.json</code> exista y sea accesible.',
      'Si usas un CDN, asegúrate de permitir solicitudes al archivo.'
    ],
    en:[
      'Check your internet connection.',
      'Ensure the <code>data.json</code> file exists and is accessible.',
      'If you use a CDN, make sure the file is allowed.'
    ]
  },
  cryptoWarningTitle: { es:'Aviso de seguridad', en:'Security notice' },
  cryptoWarningBody: { es:'Para enviar pedidos necesitamos un contexto seguro (HTTPS) con WebCrypto disponible. Abre esta página usando HTTPS o en un navegador compatible.', en:'Submitting orders requires a secure (HTTPS) context with WebCrypto available. Open this page over HTTPS or in a compatible browser.' },
  cartAriaLabel: { es:'Artículos en el carrito', en:'Items in cart' }
};

const WORKER_ENDPOINT = 'https://solitary-leaf-f8a9.mussle-creashure.workers.dev';
const WORKER_SIGNING_KEY_PATH = '.well-known/signing-key';
const EXPECTED_SUBMIT_ERROR_CODES = new Set(['missing-signature','invalid-signature','invalid-content-type','invalid-json']);
const SIGN_P256_PUB_FINGERPRINT_SHA256 = '9F3AE3BEE7B698BED9F41EBAEB22E32D11E087A301681F709872FD51B3C7CDFC';
const SIGN_P256_PUB_JWK = { "crv": "P-256", "ext": true, "key_ops": [ "verify" ], "kty": "EC", "x": "t6eyN6jlsOfqq0Otdez9SJ0G7-K4eY5hHVmLZrtv-IA", "y": "SMc0C6cLu_nxoqbB4me4Qt8Opq9613uo7IeODcS6Ozw" };

// ===== State =====
let currentLang = 'es';
let OPTIONS = deepClone(DEFAULT_DATA.OPTIONS);
let EXTRAS  = deepClone(DEFAULT_DATA.EXTRAS);
const cart = new Map();

const canUseWebCrypto = typeof globalThis.crypto !== 'undefined' && !!globalThis.crypto.subtle && (typeof globalThis.isSecureContext === 'undefined' || globalThis.isSecureContext);
const warningsShown = new Set();

// ===== Helpers =====
function deepClone(value){
  return JSON.parse(JSON.stringify(value));
}
function joinUrl(base, path){
  try{
    return new URL(path, base).toString();
  }catch(_err){
    const normalizedBase = base.replace(/\/+$/,'');
    const normalizedPath = path.replace(/^\/+/, '');
    return `${normalizedBase}/${normalizedPath}`;
  }
}
function safeJsonParse(text){
  if(!text) return { data:null, error:null };
  try{
    return { data: JSON.parse(text), error:null };
  }catch(error){
    return { data:null, error };
  }
}
const $ = s => document.querySelector(s);
function translate(key, replacements){
  const entry = TEXT[key];
  if(!entry) return '';
  let result = typeof entry === 'string' ? entry : (entry[currentLang] ?? entry.es ?? '');
  if(replacements){
    Object.entries(replacements).forEach(([token,val])=>{
      result = result.replace(new RegExp(`\\{${token}\\}`,'g'), val);
    });
  }
  return result;
}
function translateList(key){
  const entry = TEXT[key];
  if(!entry) return [];
  if(Array.isArray(entry)) return entry;
  const arr = entry[currentLang] ?? entry.es ?? [];
  return Array.isArray(arr) ? arr : [];
}
function translateValue(val){
  if(!val) return '';
  if(typeof val === 'string') return val;
  return val[currentLang] ?? val.es ?? Object.values(val)[0] ?? '';
}
function money(cents){
  return (cents/100).toLocaleString(LOCALE[currentLang], { style:'currency', currency:'USD' });
}
function safeStorage(action,key,value){
  try{
    if(!('localStorage' in globalThis)) return null;
    if(action==='get') return localStorage.getItem(key);
    if(action==='set') localStorage.setItem(key,value);
    if(action==='remove') localStorage.removeItem(key);
  }catch(_e){
    return null;
  }
  return null;
}
function detectPreferredTheme(){
  if(typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(prefers-color-scheme: light)').matches){
    return 'light';
  }
  return 'dark';
}
function sanitizeCatalog(list){
  return (Array.isArray(list) ? list : []).filter(item => item && typeof item.id === 'string' && typeof item.priceCents === 'number' && item.priceCents >= 0 && item.name).map(item=>({
    id: item.id,
    name: item.name,
    desc: item.desc,
    priceCents: item.priceCents
  }));
}
function findCatalogItem(id){
  return OPTIONS.find(o=>o.id===id) || EXTRAS.find(e=>e.id===id) || null;
}
function translateCartLabel(){
  const cartBox = $('#cart');
  if(cartBox){
    cartBox.setAttribute('aria-label', translate('cartAriaLabel'));
  }
}
function showWarning(key,{title,body,list}){
  const container = $('#error-container');
  if(!container || warningsShown.has(key)) return;
  warningsShown.add(key);
  container.classList.remove('hidden');
  const listHtml = list && list.length ? `<ul>${list.map(item=>`<li>${item}</li>`).join('')}</ul>` : '';
  container.insertAdjacentHTML('beforeend', `
    <div class="err-block">
      <div class="err-title">${title}</div>
      <p>${body}</p>
      ${listHtml}
    </div>
  `);
}

// ===== WebCrypto helpers =====
async function importPubJwk(jwk){
  if(!canUseWebCrypto) throw new Error('WebCrypto unavailable');
  return crypto.subtle.importKey('jwk', jwk, {name:'ECDSA', namedCurve:'P-256'}, false, ['verify']);
}
async function spkiFpSha256FromJwk(jwk){
  const pubKey = await importPubJwk(jwk);
  const spki = await crypto.subtle.exportKey('spki', pubKey);
  const h = await crypto.subtle.digest('SHA-256', spki);
  return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
}
async function assertWorkerKeyMatchesPin(){
  if(!canUseWebCrypto || typeof fetch !== 'function') return;
  try{
    const signingKeyUrl = joinUrl(WORKER_ENDPOINT, WORKER_SIGNING_KEY_PATH);
    const r = await fetch(signingKeyUrl, { cache:'no-store', credentials:'omit' });
    if(r.status === 401 || r.status === 403){
      console.info('Pin check skipped: worker denied access.');
      return;
    }
    if(r.status === 404 || r.status === 405){
      console.info(`Pin check not supported by worker (status ${r.status}).`);
      return;
    }
    if(r.ok){
      const { jwk, fingerprint } = await r.json();
      if(fingerprint && fingerprint !== SIGN_P256_PUB_FINGERPRINT_SHA256){
        throw new Error('Worker fingerprint mismatch');
      }
      if(jwk){
        const fp = await spkiFpSha256FromJwk(jwk);
        if(fp !== SIGN_P256_PUB_FINGERPRINT_SHA256) throw new Error('Public JWK fingerprint mismatch');
      }
    }
  }catch(e){
    console.warn('Pin check skipped:', e.message);
  }
}
function base64UrlToUint8Array(base64Url){
  let base64 = base64Url.replace(/-/g,'+').replace(/_/g,'/');
  base64 += '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++) out[i] = raw.charCodeAt(i);
  return out;
}
async function verifySignature(publicJwk, payloadUint8, sigBytes){
  if(!canUseWebCrypto) throw new Error('WebCrypto unavailable');
  const key = await importPubJwk(publicJwk);
  return crypto.subtle.verify({name:'ECDSA', hash:'SHA-256'}, key, sigBytes, payloadUint8);
}

// ===== UI builders =====
function buildOptions(){
  const host = $('#opts');
  if(!host) return;
  host.innerHTML = '';
  OPTIONS.forEach((o,i)=>{
    const optionName = translateValue(o.name);
    const description = translateValue(o.desc);

    const container = document.createElement('div');
    container.className = 'opt';

    const top = document.createElement('div');
    top.className = 'top';

    const badge = document.createElement('button');
    badge.className = `btn50 op${(i%4)+1}`;
    badge.type = 'button';
    badge.setAttribute('aria-hidden','true');
    badge.textContent = String(i+1);
    top.appendChild(badge);

    const body = document.createElement('div');
    body.className = 'opt-body';

    const nameEl = document.createElement('h3');
    nameEl.className = 'opt-name';
    nameEl.textContent = optionName;
    body.appendChild(nameEl);

    const descEl = document.createElement('p');
    descEl.className = 'desc';
    if(description){
      descEl.textContent = `${description} — `;
    }else{
      descEl.textContent = '';
    }
    const priceStrong = document.createElement('strong');
    priceStrong.textContent = money(o.priceCents);
    descEl.appendChild(priceStrong);
    body.appendChild(descEl);

    const actions = document.createElement('div');
    actions.className = 'actions actions-split';
    actions.setAttribute('role','group');
    actions.setAttribute('aria-label', optionName);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn';
    removeBtn.type = 'button';
    removeBtn.dataset.act = 'rem';
    removeBtn.dataset.id = o.id;
    removeBtn.textContent = translate('removeAction');
    actions.appendChild(removeBtn);

    const addBtn = document.createElement('button');
    addBtn.className = 'btn';
    addBtn.type = 'button';
    addBtn.dataset.act = 'add';
    addBtn.dataset.id = o.id;
    addBtn.textContent = translate('addAction');
    actions.appendChild(addBtn);

    body.appendChild(actions);
    top.appendChild(body);
    container.appendChild(top);
    host.appendChild(container);
  });
}
function buildExtras(){
  const host = $('#extras');
  if(!host) return;
  host.innerHTML = '';
  EXTRAS.forEach(e=>{
    const extraName = translateValue(e.name);
    const row = document.createElement('div');
    row.className = 'ex-row';

    const left = document.createElement('div');
    left.className = 'ex-left';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = extraName;
    left.appendChild(nameSpan);

    const priceSpan = document.createElement('span');
    priceSpan.className = 'ex-price';
    priceSpan.textContent = money(e.priceCents);
    left.appendChild(priceSpan);

    const actions = document.createElement('div');
    actions.className = 'actions actions-split';
    actions.setAttribute('role','group');
    actions.setAttribute('aria-label', extraName);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn';
    removeBtn.type = 'button';
    removeBtn.dataset.act = 'rem';
    removeBtn.dataset.id = e.id;
    removeBtn.textContent = translate('removeAction');
    actions.appendChild(removeBtn);

    const addBtn = document.createElement('button');
    addBtn.className = 'btn';
    addBtn.type = 'button';
    addBtn.dataset.act = 'add';
    addBtn.dataset.id = e.id;
    addBtn.textContent = translate('addAction');
    actions.appendChild(addBtn);

    row.appendChild(left);
    row.appendChild(actions);
    host.appendChild(row);
  });
}

// ===== Cart rendering =====
function renderCart(){
  const box = $('#cart');
  if(!box) return;
  box.innerHTML = '';
  translateCartLabel();
  let subtotal = 0;
  if(cart.size === 0){
    const empty = document.createElement('div');
    empty.className = 'cart-empty';
    empty.textContent = translate('emptyCart');
    box.appendChild(empty);
  }else{
    cart.forEach(line=>{
      subtotal += line.priceCents * line.qty;
      const lineEl = document.createElement('div');
      lineEl.className = 'line';

      const nameDiv = document.createElement('div');
      nameDiv.textContent = translateValue(line.name);
      lineEl.appendChild(nameDiv);

      const qtyBox = document.createElement('div');
      qtyBox.className = 'qtybox';

      const remBtn = document.createElement('button');
      remBtn.className = 'btn';
      remBtn.type = 'button';
      remBtn.dataset.act = 'rem';
      remBtn.dataset.id = line.id;
      remBtn.setAttribute('aria-label', translate('removeAction'));
      remBtn.textContent = '−';
      qtyBox.appendChild(remBtn);

      const qtySpan = document.createElement('span');
      qtySpan.textContent = String(line.qty);
      qtyBox.appendChild(qtySpan);

      const addBtn = document.createElement('button');
      addBtn.className = 'btn';
      addBtn.type = 'button';
      addBtn.dataset.act = 'add';
      addBtn.dataset.id = line.id;
      addBtn.setAttribute('aria-label', translate('addAction'));
      addBtn.textContent = '+';
      qtyBox.appendChild(addBtn);

      lineEl.appendChild(qtyBox);

      const priceDiv = document.createElement('div');
      const priceStrong = document.createElement('strong');
      priceStrong.textContent = money(line.priceCents * line.qty);
      priceDiv.appendChild(priceStrong);
      lineEl.appendChild(priceDiv);

      box.appendChild(lineEl);
    });
  }
  const vat = Math.round(subtotal * IVA_RATE);
  const total = subtotal + vat;
  $('#subtotal').textContent = money(subtotal);
  $('#vat').textContent = money(vat);
  $('#total').textContent = money(total);
  const acceptBtn = $('#accept');
  if(acceptBtn){
    acceptBtn.disabled = cart.size === 0 || !canUseWebCrypto;
  }
}

// ===== Cart mutations =====
function addById(id){
  const item = findCatalogItem(id);
  if(!item) return;
  const existing = cart.get(id) || { id:item.id, name:item.name, priceCents:item.priceCents, qty:0 };
  existing.qty += 1;
  cart.set(id, existing);
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  if(theme === 'dark'){
    const btn = document.querySelector(`button[data-act="add"][data-id="${id}"]`);
    if(btn){
      btn.classList.add('btn-adding');
      setTimeout(()=>btn.classList.remove('btn-adding'), 2000);
    }
  }
  renderCart();
}
function removeById(id){
  if(!cart.has(id)) return;
  const line = cart.get(id);
  line.qty -= 1;
  if(line.qty <= 0) cart.delete(id); else cart.set(id, line);
  renderCart();
}

// ===== Language & theme =====
function updateStaticText(){
  const mappings = [
    ['options-title','optionsTitle'],
    ['extras-title','extrasTitle'],
    ['summary-title','summaryTitle'],
    ['subtotal-label','subtotalLabel'],
    ['vat-label','vatLabel'],
    ['total-label','totalLabel']
  ];
  mappings.forEach(([id,key])=>{
    const el = document.getElementById(id);
    if(el) el.textContent = translate(key);
  });
  const acceptBtn = $('#accept');
  if(acceptBtn) acceptBtn.textContent = translate('accept');
  translateCartLabel();
}
function applyLanguage(lang, persist=true){
  currentLang = lang;
  document.documentElement.lang = lang;
  if(persist) safeStorage('set', STORAGE_KEYS.lang, lang);
  const langToggle = $('#lang');
  if(langToggle) langToggle.textContent = lang.toUpperCase();
  buildOptions();
  buildExtras();
  updateStaticText();
  renderCart();
}
function applyTheme(theme, persist=true){
  document.documentElement.setAttribute('data-theme', theme);
  if(persist) safeStorage('set', STORAGE_KEYS.theme, theme);
  const toggle = $('#theme');
  if(toggle) toggle.textContent = theme === 'light' ? '🌞' : '🌙';
}

// ===== Toast & loader =====
const loader = $('#loader');
const toast  = $('#toast');
function showToast(msg, ms=2000){
  if(!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(()=>toast.classList.remove('show'), ms);
}

// ===== Data loading =====
async function loadCatalog(){
  let usedFallback = false;
  if(typeof fetch !== 'function'){
    usedFallback = true;
    return {
      options: sanitizeCatalog(deepClone(DEFAULT_DATA.OPTIONS)),
      extras: sanitizeCatalog(deepClone(DEFAULT_DATA.EXTRAS)),
      usedFallback
    };
  }
  try{
    const response = await fetch('data.json', { cache:'no-store', credentials:'same-origin' });
    if(!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    let options = sanitizeCatalog(data.OPTIONS);
    let extras  = sanitizeCatalog(data.EXTRAS);
    if(!options.length){ options = sanitizeCatalog(deepClone(DEFAULT_DATA.OPTIONS)); usedFallback = true; }
    if(!extras.length){ extras = sanitizeCatalog(deepClone(DEFAULT_DATA.EXTRAS)); usedFallback = true; }
    return { options, extras, usedFallback };
  }catch(error){
    console.error('Failed to load data:', error);
    usedFallback = true;
    return {
      options: sanitizeCatalog(deepClone(DEFAULT_DATA.OPTIONS)),
      extras: sanitizeCatalog(deepClone(DEFAULT_DATA.EXTRAS)),
      usedFallback
    };
  }
}

// ===== Submit handler =====
const acceptButton = $('#accept');
let isSubmitting = false;
if(acceptButton){
  acceptButton.addEventListener('click', async ()=>{
    if(isSubmitting) return;
    if(cart.size === 0){ showToast(translate('toastEmpty')); return; }
    if(!canUseWebCrypto){
      showWarning('crypto', { title: translate('cryptoWarningTitle'), body: translate('cryptoWarningBody'), list: [] });
      showToast(translate('cryptoWarningBody'), 3200);
      return;
    }

    const rows = [];
    cart.forEach(item=>{
      const rowSubtotal = item.qty * item.priceCents;
      const rowVAT = Math.round(rowSubtotal * IVA_RATE);
      const rowTotal = rowSubtotal + rowVAT;
      rows.push({
        timestamp: new Date().toISOString(),
        item: translateValue(item.name),
        qty: item.qty,
        subtotal: (rowSubtotal/100).toFixed(2),
        vat: (rowVAT/100).toFixed(2),
        total: (rowTotal/100).toFixed(2)
      });
    });

    isSubmitting = true;
    acceptButton.disabled = true;
    acceptButton.setAttribute('aria-busy','true');
    if(loader) loader.style.display = 'flex';

    try{
      const res = await fetch(WORKER_ENDPOINT, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(rows)
      });
      const signatureB64 = res.headers.get('X-Signature') || '';
      const contentTypeHeader = res.headers.get('content-type') || '';
      const normalizedType = contentTypeHeader.split(';')[0].trim().toLowerCase();
      const isJson = normalizedType === 'application/json' || normalizedType.endsWith('+json');
      const responseBodyText = await res.text();
      let parsedBody = null;
      let parseErr = null;
      if(isJson){
        const parsed = safeJsonParse(responseBodyText);
        parsedBody = parsed.data;
        parseErr = parsed.error;
      }

      if(res.status === 401 || res.status === 403){
        const unauthorizedMsg = parsedBody && typeof parsedBody.message === 'string'
          ? parsedBody.message
          : translate('toastUnauthorized');
        showToast(unauthorizedMsg, 3200);
        return;
      }

      if(!res.ok){
        const errorMsg = parsedBody && typeof parsedBody.message === 'string'
          ? parsedBody.message
          : `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`;
        showToast(translate('toastServer', { msg: errorMsg }), 3200);
        return;
      }

      if(!signatureB64){
        const noSignatureError = new Error('Worker response is missing signature.');
        noSignatureError.code = 'missing-signature';
        throw noSignatureError;
      }

      const signatureBytes = base64UrlToUint8Array(signatureB64);
      const payloadUint8 = new TextEncoder().encode(responseBodyText);
      const isSignatureValid = await verifySignature(SIGN_P256_PUB_JWK, payloadUint8, signatureBytes);
      if(!isSignatureValid){
        const invalidSignatureError = new Error('Invalid signature from worker.');
        invalidSignatureError.code = 'invalid-signature';
        throw invalidSignatureError;
      }

      if(!isJson){
        const formatError = new Error(`Unexpected response content type: ${contentTypeHeader.trim() || 'unknown'}`);
        formatError.code = 'invalid-content-type';
        throw formatError;
      }

      if(parseErr || !parsedBody){
        const invalidJsonError = new Error('Worker response is not valid JSON.');
        invalidJsonError.code = 'invalid-json';
        throw invalidJsonError;
      }

      showToast(parsedBody.message || translate('toastSuccess'));
      cart.clear();
      renderCart();
    }catch(err){
      const logMethod = err && EXPECTED_SUBMIT_ERROR_CODES.has(err.code) ? console.warn : console.error;
      logMethod.call(console, 'Submit error:', err);
      if(err instanceof TypeError){
        showToast(translate('toastNetwork'), 3000);
      }else if(err.code === 'missing-signature' || err.code === 'invalid-signature'){
        showToast(translate('toastSignature'), 3200);
      }else if(err.code === 'invalid-content-type' || err.code === 'invalid-json'){
        showToast(translate('toastResponse'), 3200);
      }else{
        showToast(translate('toastUnexpected'), 3200);
      }
    }finally{
      if(loader) loader.style.display = 'none';
      acceptButton.disabled = false;
      acceptButton.removeAttribute('aria-busy');
      isSubmitting = false;
    }
  });
}

// ===== Global events =====
document.body.addEventListener('click', (event)=>{
  const btn = event.target.closest('button[data-act]');
  if(!btn) return;
  const id = btn.getAttribute('data-id');
  const act = btn.getAttribute('data-act');
  if(!id || !act) return;
  act === 'add' ? addById(id) : removeById(id);
});

const langToggleButton = $('#lang');
if(langToggleButton){
  langToggleButton.addEventListener('click', ()=>{
    const next = currentLang === 'es' ? 'en' : 'es';
    applyLanguage(next);
  });
}

const themeToggleButton = $('#theme');
if(themeToggleButton){
  themeToggleButton.addEventListener('click', ()=>{
    const root = document.documentElement;
    const cur = root.getAttribute('data-theme') || 'dark';
    const next = cur === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });
}

// ===== Init =====
async function init(){
  const storedLang = safeStorage('get', STORAGE_KEYS.lang);
  if(storedLang && (storedLang === 'es' || storedLang === 'en')){
    currentLang = storedLang;
  }
  const storedTheme = safeStorage('get', STORAGE_KEYS.theme);
  applyTheme(storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : detectPreferredTheme(), false);
  if(!canUseWebCrypto){
    showWarning('crypto', { title: translate('cryptoWarningTitle'), body: translate('cryptoWarningBody'), list: [] });
  }
  await assertWorkerKeyMatchesPin();
  const catalog = await loadCatalog();
  OPTIONS = catalog.options;
  EXTRAS  = catalog.extras;
  if(catalog.usedFallback){
    showWarning('data', { title: translate('dataWarningTitle'), body: translate('dataWarningBody'), list: translateList('dataWarningList') });
  }
  applyLanguage(currentLang, false);
}

init();
