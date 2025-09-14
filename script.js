// ===== Config =====
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
const ENDPOINT = '/submit-order';
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
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(rows)
    });
    // hide loader -> show toast
    loader.style.display = 'none';
    const result = await res.json();
    if(res.ok){
      showToast(result.message || '¡Pedido enviado con éxito!');
      cart.clear(); render();
    }else{
      showToast(result.message || 'Error al enviar. Intenta de nuevo.');
    }
  }catch(err){
    loader.style.display = 'none';
    showToast('Error de conexión con el worker.');
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
