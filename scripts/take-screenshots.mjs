import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT  = join(ROOT, 'assets', 'screenshots');

mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:5173/app.html';

const SHOTS = [
  { view: 'feed',          file: '01-panel-comandos',   label: 'Panel de Comandos'   },
  { view: 'kanban',        file: '02-muro-tactico',     label: 'Muro Táctico'        },
  { view: 'finance',       file: '03-bio-finanzas',     label: 'Bio-Finanzas'        },
  { view: 'notes',         file: '04-boveda-neural',    label: 'Bóveda Neural'       },
  { view: 'calendar',      file: '05-linea-de-tiempo',  label: 'Línea de Tiempo'     },
  { view: 'cronica',       file: '06-cronica',          label: 'Crónica'             },
  { view: 'contacts',      file: '07-contactos',        label: 'Contactos & CRM'     },
  { view: 'herramientas',  file: '08-herramientas',     label: 'Herramientas'        },
  { view: 'proyectos',     file: '09-configuracion',    label: 'Proyectos'           },
  { view: 'ayuda',         file: '10-ayuda',            label: 'Ayuda'               },
];

const SEED_NODES = [
  { id:'1',  type:'kanban',  content:'Revisar informe Q2',         metadata:{ status:'todo',        label:'Revisar informe Q2',        tags:['#trabajo','#urgente'] }, created_at: new Date().toISOString() },
  { id:'2',  type:'kanban',  content:'Lanzar campaña de marketing', metadata:{ status:'in_progress', label:'Lanzar campaña de marketing',tags:['#marketing'] },          created_at: new Date().toISOString() },
  { id:'3',  type:'kanban',  content:'Cierre fiscal Q4',           metadata:{ status:'done',        label:'Cierre fiscal Q4',          done_at: new Date().toISOString().split('T')[0] }, created_at: new Date().toISOString() },
  { id:'4',  type:'income',  content:'+$15000 Pago freelance',     metadata:{ amount:15000, label:'Pago freelance',    account_id:'12', date: new Date().toISOString().split('T')[0], currency:'MXN' }, created_at: new Date().toISOString() },
  { id:'5',  type:'expense', content:'-$3500 Renta oficina',       metadata:{ amount:3500,  label:'Renta oficina',     account_id:'13', date: new Date().toISOString().split('T')[0], currency:'MXN' }, created_at: new Date().toISOString() },
  { id:'6',  type:'income',  content:'+$8000 Consultoría',         metadata:{ amount:8000,  label:'Consultoría',       account_id:'12', date: new Date().toISOString().split('T')[0], currency:'MXN' }, created_at: new Date().toISOString() },
  { id:'7',  type:'expense', content:'-$1200 Subscripciones',      metadata:{ amount:1200,  label:'Subscripciones',    account_id:'13', currency:'MXN' }, created_at: new Date().toISOString() },
  { id:'8',  type:'note',    content:'Ideas para el nuevo módulo de reportes. Pensar en gráficas de barras y exportación PDF. #idea #proyecto', metadata:{ tags:['#idea','#proyecto'] }, created_at: new Date().toISOString() },
  { id:'9',  type:'note',    content:'Llamar al contador el lunes. Revisar declaración anual. #finanzas #pendiente', metadata:{ tags:['#finanzas','#pendiente'] }, created_at: new Date().toISOString() },
  { id:'10', type:'note',    content:'Investigar integración con Stripe para cobros automáticos. #dev #idea', metadata:{ tags:['#dev','#idea'], color:'blue' }, created_at: new Date().toISOString() },
  { id:'11', type:'contact', content:'Juan Pérez',   metadata:{ cType:'persona', name:'Juan Pérez',   phone:'+52 55 1234 5678', email:'juan@empresa.com', company:'Startup XYZ', rfc:'PEGJ850101ABC', color:'#00f0ff' }, created_at: new Date().toISOString() },
  { id:'12', type:'contact', content:'BBVA México',  metadata:{ cType:'bank',   name:'BBVA México',  bank_name:'BBVA México', clabe:'012180015600000000', account_no:'0156000000', holder:'Oscar Gómez', rfc:'GOPO890312XYZ', color:'#60a5fa' }, created_at: new Date().toISOString() },
  { id:'13', type:'contact', content:'Wallet XRP',   metadata:{ cType:'crypto', name:'Wallet XRP',   network:'XRP Ledger', wallet:'rBthUCndKy3Xbb19Ln4xkZeMwusX9NrYfj', memo:'994421', color:'#a78bfa' }, created_at: new Date().toISOString() },
  { id:'14', type:'account', content:'BBVA',         metadata:{ icon:'🏦', label:'BBVA', acType:'checking', balance:52000 }, created_at: new Date().toISOString() },
  { id:'15', type:'account', content:'Efectivo',     metadata:{ icon:'💵', label:'Efectivo', acType:'cash', balance:8500  }, created_at: new Date().toISOString() },
  { id:'16', type:'account', content:'Crypto Wallet',metadata:{ icon:'₿',  label:'Crypto Wallet', acType:'crypto', balance:3200  }, created_at: new Date().toISOString() },
  { id:'17', type:'event',   content:'Reunión con cliente', metadata:{ date: new Date().toISOString().split('T')[0], time:'15:00', label:'Reunión con cliente' }, created_at: new Date().toISOString() },
  { id:'18', type:'event',   content:'Demo Nexus OS',        metadata:{ date: new Date().toISOString().split('T')[0], time:'11:00', label:'Demo Nexus OS' },        created_at: new Date().toISOString() },
  { id:'19', type:'loan',    content:'Préstamo a Juan',      metadata:{ label:'Préstamo a Juan', amount:5000, interest:0, lender_id:'14', borrower_id:'11' }, created_at: new Date().toISOString() },
  { id:'20', type:'proyecto', content:'Casa Tulum', metadata:{ label:'Casa Tulum', description:'Proyecto de construcción residencial en Tulum, Q. Roo.', status:'active', budget:850000, spent:320000, progress:38, color:'#00f0ff', tag:'#casatulum', category:'Construcción', startDate: new Date().toISOString().split('T')[0] }, created_at: new Date().toISOString() },
  { id:'21', type:'proyecto', content:'App Mobile v2', metadata:{ label:'App Mobile v2', description:'Rediseño de la aplicación móvil con nuevo sistema de navegación.', status:'active', budget:120000, spent:45000, progress:62, color:'#a78bfa', tag:'#appmobile', category:'Tecnología', startDate: new Date().toISOString().split('T')[0] }, created_at: new Date().toISOString() },
  { id:'22', type:'proyecto', content:'Campaña Digital Q3', metadata:{ label:'Campaña Digital Q3', description:'Estrategia de marketing digital para el tercer trimestre.', status:'planning', budget:35000, spent:0, progress:10, color:'#4ade80', tag:'#campana', category:'Marketing', startDate: new Date().toISOString().split('T')[0] }, created_at: new Date().toISOString() },
];

const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function waitForApp(page) {
  await page.waitForSelector('[data-view="feed"]', { timeout: 15000 }).catch(() => {});
  await delay(1500);
}

async function clickView(page, view) {
  await page.evaluate((v) => {
    // Intentar primero via botón del sidebar
    const btn = document.querySelector(`[data-view="${v}"]`);
    if (btn) { btn.click(); return; }
    // Fallback: llamar switchView global si existe
    if (typeof switchView === 'function') switchView(v);
  }, view);
  await delay(900);
}

async function typeCommand(page, text) {
  const bar = await page.$('#nexus-input');
  if (!bar) { console.warn('  ⚠ No se encontró #nexus-input'); return; }
  await bar.click({ clickCount: 3 });
  await bar.type(text, { delay: 20 });
  await page.keyboard.press('Enter');
  await delay(900);
}

async function shot(page, file) {
  const p = join(OUT, `${file}.png`);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`  ✓  ${file}.png`);
}

(async () => {
  console.log('\n📸 Nexus OS — Screenshot session\n');

  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
           '--disable-gpu', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 }
  });

  const page = await browser.newPage();

  // Bypass de autenticación
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('nexus_admin_bypass', 'true');
    localStorage.setItem('nexus_onboarded', '1');
    localStorage.setItem('nexus_theme', 'dark');
  });

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await waitForApp(page);

  // Crear proyectos via el parser (igual que el usuario lo haría)
  console.log('  → Creando proyectos de demo...');
  await typeCommand(page, '#proyecto Casa Tulum — Residencia frente al mar, Q. Roo');
  await typeCommand(page, '#proyecto App Mobile v2 — Rediseño con nueva navegación');
  await typeCommand(page, '#proyecto Campaña Digital Q3 — Marketing y posicionamiento');
  await delay(500);

  // Tomar capturas en orden
  for (const { view, file } of SHOTS) {
    await clickView(page, view);
    await page.keyboard.press('Escape'); // cerrar modales si hay alguno abierto
    await delay(400);
    await shot(page, file);
  }

  await browser.close();
  console.log('\n✅ All screenshots saved to assets/screenshots/\n');
})();
