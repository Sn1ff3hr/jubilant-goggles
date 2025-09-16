// ===== Config =====
import { ENDPOINT } from './src/config.js';
import { assertWorkerKeyMatchesPin, verifySignedResponse } from './src/verify-worker.js';

const IVA_RATE = 0.15;
const LOCALE = { es: 'es-EC', en: 'en-US' };
let currentLang = 'es';

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

  loader.style.display = 'flex';
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(rows)
    });

    const signatureB64 = res.headers.get('X-Signature');
    const responseBodyText = await res.text();
    await verifySignedResponse(responseBodyText, signatureB64);

    const result = JSON.parse(responseBodyText);
    if (res.ok) {
      showToast(result.message || '¡Pedido enviado con éxito!');
      cart.clear();
      render();
    } else {
      // Server returned an error (e.g. 4xx, 5xx)
      const errorMsg = result.message || 'An unknown server error occurred.';
      showToast(`Error: ${errorMsg} Please try again.`);
    }
  } catch (err) {
    console.error('Submit error:', err);
    let userMessage = 'An unexpected error occurred. Please try again.';
    if (err instanceof TypeError && err.message === 'Failed to fetch') {
      userMessage = 'Network error. Please check your connection and try again.';
    } else if (err.message.includes('signature')) {
      userMessage = 'A security error occurred. Please reload the page and try again.';
    } else if (err instanceof SyntaxError) {
      userMessage = 'Error reading server response. Please try again later.';
    }
    showToast(userMessage, 3000);
  } finally {
    loader.style.display = 'none';
  }
});

// ===== Init =====
async function init(){
  try {
    await assertWorkerKeyMatchesPin();
    const response = await fetch('data.json');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    OPTIONS = data.OPTIONS;
    EXTRAS = data.EXTRAS;
    document.documentElement.setAttribute('data-theme','dark');
    buildOptions();
    buildExtras();
    render();
  } catch (error) {
    console.error('Failed to load data:', error);
    const errContainer = $('#error-container');
    errContainer.innerHTML = `
      <div class="err-title">Application Error</div>
      <p>Could not load essential application data.</p>
      <p><strong>Troubleshooting:</strong></p>
      <ul style="margin: 0; padding-left: 20px;">
        <li>Please check your internet connection.</li>
        <li>Try reloading the page.</li>
        <li>If the problem persists, the site owner may need to check that the <code>data.json</code> file exists and is valid.</li>
      </ul>
    `;
    errContainer.style.display = 'block';
    // Hide the main content area as the app is not usable
    $('.wrap').style.display = 'none';
  }
}
init();
