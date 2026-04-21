import puppeteer from 'puppeteer-core';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT  = join(ROOT, 'assets', 'screenshots');

mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:5175/app.html';

const SHOTS = [
  { view: 'feed',      file: '01-panel-comandos', label: 'Panel de Comandos'  },
  { view: 'kanban',    file: '02-muro-tactico',   label: 'Muro Táctico'       },
  { view: 'finance',   file: '03-bio-finanzas',   label: 'Bio-Finanzas'       },
  { view: 'vault',     file: '04-boveda-neural',  label: 'Bóveda Neural'      },
  { view: 'calendar',  file: '05-linea-de-tiempo',label: 'Línea de Tiempo'    },
  { view: 'cronica',   file: '06-cronica',        label: 'Crónica'            },
  { view: 'contacts',  file: '08-contactos',      label: 'Contactos & CRM'    },
  { view: 'settings',  file: '09-configuracion',  label: 'Configuración'      },
  { view: 'ayuda',     file: '07-ayuda',           label: 'Ayuda'              },
];

async function injectBypassAndSeedData(page) {
  await page.evaluate(() => {
    localStorage.setItem('nexus_admin_bypass', 'true');
    localStorage.setItem('nexus_settings', JSON.stringify({
      nickname: 'Oscar', tempUnit: 'C', timezone: 'America/Mexico_City'
    }));
    // Seed some fake data so views look populated
    const nodes = [
      { id:'1', type:'kanban',  content:'Revisar informe Q2',      metadata:{ status:'todo',        label:'Revisar informe Q2',     tags:['trabajo'] }, created_at: new Date().toISOString() },
      { id:'2', type:'kanban',  content:'Lanzar campaña de mkt',   metadata:{ status:'in_progress', label:'Lanzar campaña de mkt'  }, created_at: new Date().toISOString() },
      { id:'3', type:'kanban',  content:'Cierre fiscal Q4',        metadata:{ status:'done',        label:'Cierre fiscal Q4', done_at: new Date().toISOString().split('T')[0] }, created_at: new Date().toISOString() },
      { id:'4', type:'income',  content:'+$15000 Pago freelance @bbva',  metadata:{ amount:15000, account:'bbva',     description:'Pago freelance' }, created_at: new Date().toISOString() },
      { id:'5', type:'expense', content:'-$3500 Renta oficina @efectivo', metadata:{ amount:3500,  account:'efectivo', description:'Renta oficina'  }, created_at: new Date().toISOString() },
      { id:'6', type:'income',  content:'+$8000 Consultoría @bbva', metadata:{ amount:8000, account:'bbva', description:'Consultoría' }, created_at: new Date().toISOString() },
      { id:'7', type:'note',    content:'Ideas para el nuevo módulo de reportes. Pensar en gráficas de barras y exportación PDF. #idea #proyecto', metadata:{}, created_at: new Date().toISOString() },
      { id:'8', type:'note',    content:'Llamar al contador el lunes. Revisar declaración anual. #finanzas', metadata:{}, created_at: new Date().toISOString() },
      { id:'9', type:'contact', content:'Juan Pérez',  metadata:{ cType:'persona', name:'Juan Pérez',  phone:'+52 55 1234 5678', email:'juan@empresa.com', company:'Startup XYZ', color:'#00f0ff' }, created_at: new Date().toISOString() },
      { id:'10',type:'contact', content:'BBVA',        metadata:{ cType:'bank',   name:'BBVA México', bank_name:'BBVA México', clabe:'012345678901234567', holder:'Oscar Gómez', color:'#60a5fa' }, created_at: new Date().toISOString() },
      { id:'11',type:'contact', content:'Wallet XRP',  metadata:{ cType:'crypto', name:'Wallet XRP',  network:'XRP Ledger', wallet:'rBthUCndKy3Xbb19Ln4xkZeMwusX9NrYfj', color:'#a78bfa' }, created_at: new Date().toISOString() },
      { id:'12',type:'account', content:'BBVA',        metadata:{ icon:'🏦', balance:52000 }, created_at: new Date().toISOString() },
      { id:'13',type:'account', content:'Efectivo',    metadata:{ icon:'💵', balance:8500  }, created_at: new Date().toISOString() },
      { id:'14',type:'event',   content:'Reunión con cliente', metadata:{ date: new Date().toISOString().split('T')[0], time:'15:00' }, created_at: new Date().toISOString() },
    ];
    window.__seedNodes = nodes;
  });
}

async function waitForApp(page) {
  // Wait for the nexus layout to appear
  await page.waitForSelector('#nexus-layout', { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => new Promise(r => setTimeout(r, 800)));
}

async function switchView(page, view) {
  await page.evaluate((v) => {
    if (typeof window.switchView === 'function') {
      window.switchView(v);
    } else {
      // Fallback: click nav button
      const btn = document.querySelector(`[data-view="${v}"]`);
      if (btn) btn.click();
    }
  }, view);
  await page.evaluate(() => new Promise(r => setTimeout(r, 600)));
}

async function screenshot(page, file) {
  const path = join(OUT, `${file}.png`);
  await page.screenshot({ path, fullPage: false });
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

  // Inject localStorage BEFORE any JS runs (evaluateOnNewDocument)
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('nexus_admin_bypass', 'true');
    localStorage.setItem('nexus_settings', JSON.stringify({
      nickname: 'Oscar', tempUnit: 'C', timezone: 'America/Mexico_City'
    }));
    localStorage.setItem('nexus_onboarded', '1'); // skip onboarding
  });

  // 1. Load app
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await waitForApp(page);

  // Give it extra time to render everything
  await page.evaluate(() => new Promise(r => setTimeout(r, 1200)));

  // 2. Take each view screenshot
  for (const { view, file } of SHOTS) {
    await switchView(page, view);
    await screenshot(page, file);
  }

  await browser.close();
  console.log('\n✅ All screenshots saved to assets/screenshots/\n');
})();
