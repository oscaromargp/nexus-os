// Nexus OS — Catálogo de Recetas (Automatizaciones)
//
// Cada receta es un manifest declarativo + un generador de workflow n8n.
// El módulo Disparadores (UI) las muestra como cards en una galería.
// Al activar una receta:
//   1. POST /api/automations/enable { recipe_id, params }
//   2. El backend invoca recipe.generateWorkflow(params, ctx) → n8n JSON
//   3. Sube el workflow a n8n vía API
//   4. Guarda en user_automations con n8n_workflow_id
//
// Para agregar una receta:
//   1. Define el manifest en RECIPES
//   2. Implementa generateWorkflow(params, ctx)
//   3. Listo — la UI la pickea sola

const TG_CRED_ID = 'yqz8lqgxILKesFrq'  // credencial Telegram Bot Nexus en n8n
const TG_CRED_NAME = 'Telegram Bot Nexus'

// Helper: nodo Telegram Send estándar
function tgSendNode(id, name, position, chatIdExpr, textExpr) {
  return {
    parameters: {
      chatId: chatIdExpr,
      text: textExpr,
      additionalFields: { parse_mode: 'Markdown' },
    },
    id, name, type: 'n8n-nodes-base.telegram',
    typeVersion: 1.2, position,
    credentials: { telegramApi: { id: TG_CRED_ID, name: TG_CRED_NAME } },
  }
}

// Helper: nodo Code (JS)
function codeNode(id, name, position, jsCode) {
  return {
    parameters: { jsCode },
    id, name, type: 'n8n-nodes-base.code',
    typeVersion: 2, position,
  }
}

// Helper: nodo Schedule Trigger (cron)
function cronNode(id, name, position, cronExpr) {
  return {
    parameters: { rule: { interval: [{ field: 'cronExpression', expression: cronExpr }] } },
    id, name, type: 'n8n-nodes-base.scheduleTrigger',
    typeVersion: 1.2, position,
  }
}

// Helper: nodo Webhook
function webhookNode(id, name, position, path) {
  return {
    parameters: { httpMethod: 'POST', path, responseMode: 'responseNode', options: {} },
    id, name, type: 'n8n-nodes-base.webhook',
    typeVersion: 1.1, position, webhookId: path,
  }
}

// Helper: nodo Respond
function respondNode(id, name, position, body = '{ "ok": true }') {
  return {
    parameters: { respondWith: 'json', responseBody: '=' + body, options: {} },
    id, name, type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.1, position,
  }
}

// Helper: conecta dos nodos
function conn(fromName, toName) {
  return { [fromName]: { main: [[{ node: toName, type: 'main', index: 0 }]] } }
}
function mergeConns(...objs) {
  return objs.reduce((acc, o) => ({ ...acc, ...o }), {})
}

// ════════════════════════════════════════════════════════════════════
// CATÁLOGO DE RECETAS
// ════════════════════════════════════════════════════════════════════

export const RECIPES = [
  // ── 1. Resumen mañana ────────────────────────────────────────────
  {
    id: 'morning_summary',
    name: '☀️ Resumen mañana',
    desc: 'Cada día a las 8am recibes en Telegram: stats, agenda del día, leads sin contactar.',
    category: 'daily',
    icon: '☀️',
    color: '#fbbf24',
    paramsSchema: [
      { key: 'hour', label: 'Hora (24h)', type: 'number', min: 0, max: 23, default: 8 },
      { key: 'include_finances', label: 'Incluir movimientos del día anterior', type: 'bool', default: true },
    ],
    generateWorkflow(params, ctx) {
      const { hour = 8, include_finances = true } = params
      const { supabaseUrl, supabaseKey, telegramChatId, userId } = ctx
      const code = `
const SB_URL = ${JSON.stringify(supabaseUrl)};
const SB_KEY = ${JSON.stringify(supabaseKey)};
const helpers = this.helpers;
const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
const sb = async (p) => helpers.httpRequest({ method:'GET', url: SB_URL+'/rest/v1/'+p, headers: H, json: true });

const today = new Date(); today.setHours(0,0,0,0);
const todayIso = today.toISOString();
const wkAheadIso = new Date(Date.now()+7*86400000).toISOString();
const coldIso = new Date(Date.now()-3*86400000).toISOString();
const ystIso = new Date(Date.now()-86400000).toISOString();

const [props, leadsHoy, citas, leadsFrios${include_finances ? ', expensesAyer' : ''}] = await Promise.all([
  sb('properties?select=id&deleted_at=is.null'),
  sb('property_leads?select=id&created_at=gte.'+todayIso),
  sb('nodes?select=title,due_date,content,metadata&owner_id=eq.${userId}&type=eq.kanban&order=created_at.desc&limit=10').catch(() => []),
  sb('property_leads?select=nombre,properties(titulo,folio_interno)&created_at=lte.'+coldIso+'&limit=3'),
  ${include_finances ? `sb('nodes?select=content,metadata&owner_id=eq.${userId}&type=in.(expense,income)&created_at=gte.'+ystIso+'&created_at=lt.'+todayIso)` : ''}
]);

const lines = ['☀️ *Buenos días* — resumen Nexus OS', ''];
lines.push('🏠 Inmuebles activos: *' + props.length + '*');
lines.push('📩 Leads hoy: *' + leadsHoy.length + '*');
${include_finances ? `
if (expensesAyer && expensesAyer.length) {
  const ing = expensesAyer.filter(n => n.metadata?.amount && JSON.stringify(n).includes('income'));
  const eg  = expensesAyer.filter(n => n.metadata?.amount && JSON.stringify(n).includes('expense'));
  const sumI = ing.reduce((a,b) => a + (b.metadata.amount||0), 0);
  const sumE = eg.reduce((a,b) => a + (b.metadata.amount||0), 0);
  lines.push('');
  lines.push('💰 *Ayer:*');
  lines.push('  +$' + sumI.toLocaleString('es-MX') + ' · -$' + sumE.toLocaleString('es-MX'));
}` : ''}

if (leadsFrios && leadsFrios.length) {
  lines.push('');
  lines.push('🥶 *Leads sin contactar:*');
  leadsFrios.forEach(l => {
    const inm = l.properties?.titulo || l.properties?.folio_interno || '—';
    lines.push('• ' + (l.nombre || '—') + ' (' + inm + ')');
  });
}

if (citas && citas.length) {
  const pendientes = citas.filter(c => !(c.metadata?.status === 'done'));
  if (pendientes.length) {
    lines.push('');
    lines.push('✅ *Tareas pendientes:*');
    pendientes.slice(0,5).forEach(c => lines.push('• ' + (c.content || c.metadata?.label || '—').slice(0,60)));
  }
}

return [{ json: { chatId: ${telegramChatId}, reply: lines.join('\\n') } }];
`.trim()

      return {
        name: '[Nexus Auto] ☀️ Resumen mañana',
        nodes: [
          cronNode('cron', 'Cron mañana', [240, 300], `0 ${hour} * * *`),
          codeNode('compute', 'Compute summary', [460, 300], code),
          tgSendNode('tg', 'Telegram Send', [680, 300], '={{ $json.chatId }}', '={{ $json.reply }}'),
        ],
        connections: mergeConns(
          conn('Cron mañana', 'Compute summary'),
          conn('Compute summary', 'Telegram Send'),
        ),
        settings: { executionOrder: 'v1' },
      }
    },
  },

  // ── 2. Cierre de jornada ─────────────────────────────────────────
  {
    id: 'evening_summary',
    name: '🌙 Cierre de jornada',
    desc: 'Cada noche al cerrar el día: qué completaste, qué quedó pendiente, movimientos del día, leads atendidos.',
    category: 'daily',
    icon: '🌙',
    color: '#a78bfa',
    paramsSchema: [
      { key: 'hour', label: 'Hora (24h)', type: 'number', min: 0, max: 23, default: 21 },
    ],
    generateWorkflow(params, ctx) {
      const { hour = 21 } = params
      const { supabaseUrl, supabaseKey, telegramChatId, userId } = ctx
      const code = `
const SB_URL = ${JSON.stringify(supabaseUrl)};
const SB_KEY = ${JSON.stringify(supabaseKey)};
const helpers = this.helpers;
const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
const sb = async (p) => helpers.httpRequest({ method:'GET', url: SB_URL+'/rest/v1/'+p, headers: H, json: true });

const today = new Date(); today.setHours(0,0,0,0);
const todayIso = today.toISOString();
const tomorrowIso = new Date(today.getTime()+86400000).toISOString();

const [movs, leadsHoy, propsHoy, allTasks] = await Promise.all([
  sb('nodes?select=type,content,metadata&owner_id=eq.${userId}&type=in.(expense,income)&created_at=gte.'+todayIso),
  sb('property_leads?select=id&created_at=gte.'+todayIso),
  sb('properties?select=id&created_at=gte.'+todayIso+'&deleted_at=is.null'),
  sb('nodes?select=content,metadata&owner_id=eq.${userId}&type=eq.kanban&created_at=gte.'+todayIso).catch(() => []),
]);

const ing = movs.filter(n => n.type==='income');
const eg  = movs.filter(n => n.type==='expense');
const sumI = ing.reduce((a,b) => a + (b.metadata?.amount||0), 0);
const sumE = eg.reduce((a,b) => a + (b.metadata?.amount||0), 0);

const lines = ['🌙 *Cierre de jornada*', ''];
lines.push('📅 ' + new Date().toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' }));
lines.push('');

lines.push('💰 *Movimientos hoy:*');
lines.push('  +$' + sumI.toLocaleString('es-MX') + ' · -$' + sumE.toLocaleString('es-MX'));
lines.push('  Balance: $' + (sumI - sumE).toLocaleString('es-MX'));

lines.push('');
lines.push('📩 Leads del día: *' + leadsHoy.length + '*');
lines.push('🏠 Inmuebles capturados: *' + propsHoy.length + '*');
lines.push('✅ Tareas creadas hoy: *' + allTasks.length + '*');

lines.push('');
lines.push('Buena noche 🌙');

return [{ json: { chatId: ${telegramChatId}, reply: lines.join('\\n') } }];
`.trim()

      return {
        name: '[Nexus Auto] 🌙 Cierre jornada',
        nodes: [
          cronNode('cron', 'Cron noche', [240, 300], `0 ${hour} * * *`),
          codeNode('compute', 'Compute closing', [460, 300], code),
          tgSendNode('tg', 'Telegram Send', [680, 300], '={{ $json.chatId }}', '={{ $json.reply }}'),
        ],
        connections: mergeConns(
          conn('Cron noche', 'Compute closing'),
          conn('Compute closing', 'Telegram Send'),
        ),
        settings: { executionOrder: 'v1' },
      }
    },
  },

  // ── 3. Lead nuevo → Telegram ─────────────────────────────────────
  {
    id: 'lead_telegram',
    name: '📩 Lead nuevo → Telegram',
    desc: 'Cuando alguien llena el form de lead en cualquier propiedad.html pública, te llega al instante con datos del cliente y el inmueble.',
    category: 'crm',
    icon: '📩',
    color: '#22d3ee',
    paramsSchema: [],
    generateWorkflow(params, ctx) {
      const { telegramChatId } = ctx
      const path = 'nexus-lead-telegram-' + Date.now().toString(36)
      const extractCode = `
const body = $input.first().json.body || {};
const d = body.data || {};
return [{ json: {
  nombre: d.nombre || 'Sin nombre',
  telefono: d.telefono || '—',
  email: d.email || '—',
  mensaje: d.mensaje || '—',
  inmueble: d.property?.titulo || 'Inmueble',
  folio: d.property?.folio_interno || '',
} }];
`.trim()
      const msgTemplate = '=📩 *Nuevo lead Nexus OS*\\n\\n🏠 *{{ $json.inmueble }}* ({{ $json.folio }})\\n\\n👤 *{{ $json.nombre }}*\\n📞 {{ $json.telefono }}\\n✉ {{ $json.email }}\\n\\n💬 _{{ $json.mensaje }}_'

      return {
        name: '[Nexus Auto] 📩 Lead → Telegram',
        nodes: [
          webhookNode('hook', 'Webhook lead', [240, 300], path),
          codeNode('extract', 'Extract vars', [460, 300], extractCode),
          tgSendNode('tg', 'Telegram Send', [680, 300], String(telegramChatId), msgTemplate),
          respondNode('respond', 'Respond OK', [900, 300]),
        ],
        connections: mergeConns(
          conn('Webhook lead', 'Extract vars'),
          conn('Extract vars', 'Telegram Send'),
          conn('Telegram Send', 'Respond OK'),
        ),
        settings: { executionOrder: 'v1' },
        webhookPath: path,
      }
    },
    afterEnable(workflow, ctx) {
      // Esta receta produce un webhook URL — devolverla al usuario para que la
      // pegue en Configuración → Conexiones → 📩 Nuevo lead.
      return {
        webhookUrl: `${ctx.n8nBaseUrl}/webhook/${workflow.webhookPath}`,
        instruction: 'Pega esta URL en Configuración → Conexiones → 📩 Nuevo lead, y guarda.',
      }
    },
  },

  // ── 4. Lead frío +N días ─────────────────────────────────────────
  {
    id: 'cold_lead',
    name: '🥶 Lead frío sin contactar',
    desc: 'Cada día revisa leads más viejos que N días sin status actualizado y te recuerda contactarlos.',
    category: 'crm',
    icon: '🥶',
    color: '#60a5fa',
    paramsSchema: [
      { key: 'days', label: 'Días sin contactar', type: 'number', min: 1, max: 30, default: 3 },
      { key: 'hour', label: 'Hora de aviso (24h)', type: 'number', min: 0, max: 23, default: 10 },
    ],
    generateWorkflow(params, ctx) {
      const { days = 3, hour = 10 } = params
      const { supabaseUrl, supabaseKey, telegramChatId } = ctx
      const code = `
const SB_URL = ${JSON.stringify(supabaseUrl)};
const SB_KEY = ${JSON.stringify(supabaseKey)};
const helpers = this.helpers;
const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
const cutoff = new Date(Date.now() - ${days}*86400000).toISOString();
const leads = await helpers.httpRequest({
  method:'GET',
  url: SB_URL+'/rest/v1/property_leads?select=nombre,telefono,created_at,properties(titulo,folio_interno)&created_at=lte.'+cutoff+'&order=created_at.desc&limit=10',
  headers: H, json: true,
});
if (!leads.length) {
  return [{ json: { chatId: ${telegramChatId}, reply: null, skip: true } }];
}
const lines = ['🥶 *Leads sin contactar (+${days}d):*', ''];
leads.forEach(l => {
  const d = Math.floor((Date.now() - new Date(l.created_at).getTime()) / 86400000);
  const inm = l.properties?.titulo || l.properties?.folio_interno || '—';
  lines.push('• *' + (l.nombre || '—') + '* — ' + inm + ' · ' + d + 'd · ' + (l.telefono || '—'));
});
return [{ json: { chatId: ${telegramChatId}, reply: lines.join('\\n'), skip: false } }];
`.trim()
      return {
        name: '[Nexus Auto] 🥶 Lead frío +' + days + 'd',
        nodes: [
          cronNode('cron', 'Cron diario', [240, 300], `0 ${hour} * * *`),
          codeNode('check', 'Check leads', [460, 300], code),
          {
            parameters: { conditions: { string: [{ value1: '={{ $json.skip }}', operation: 'equal', value2: 'false' }] } },
            id: 'gate', name: 'Si hay leads', type: 'n8n-nodes-base.if',
            typeVersion: 1, position: [680, 300],
          },
          tgSendNode('tg', 'Telegram Send', [900, 200], '={{ $json.chatId }}', '={{ $json.reply }}'),
        ],
        connections: mergeConns(
          conn('Cron diario', 'Check leads'),
          conn('Check leads', 'Si hay leads'),
          { 'Si hay leads': { main: [[{ node: 'Telegram Send', type: 'main', index: 0 }], []] } },
        ),
        settings: { executionOrder: 'v1' },
      }
    },
  },

  // ── 5. Gasto inusual ─────────────────────────────────────────────
  {
    id: 'high_expense',
    name: '💸 Gasto inusual',
    desc: 'Te avisa cuando registres un gasto mayor a un umbral. Útil para revisar movimientos grandes en caliente.',
    category: 'finance',
    icon: '💸',
    color: '#f87171',
    paramsSchema: [
      { key: 'threshold', label: 'Umbral en MXN', type: 'number', min: 100, default: 5000 },
      { key: 'hour', label: 'Hora chequeo (24h)', type: 'number', min: 0, max: 23, default: 22 },
    ],
    generateWorkflow(params, ctx) {
      const { threshold = 5000, hour = 22 } = params
      const { supabaseUrl, supabaseKey, telegramChatId, userId } = ctx
      const code = `
const SB_URL = ${JSON.stringify(supabaseUrl)};
const SB_KEY = ${JSON.stringify(supabaseKey)};
const helpers = this.helpers;
const today = new Date(); today.setHours(0,0,0,0);
const movs = await helpers.httpRequest({
  method:'GET',
  url: SB_URL+'/rest/v1/nodes?select=content,metadata,created_at&owner_id=eq.${userId}&type=eq.expense&created_at=gte.'+today.toISOString(),
  headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
  json: true,
});
const big = movs.filter(m => (m.metadata?.amount || 0) >= ${threshold});
if (!big.length) return [{ json: { chatId: ${telegramChatId}, reply: null, skip: true } }];
const lines = ['💸 *Gastos grandes hoy* (≥ $${threshold.toLocaleString('es-MX')}):', ''];
big.forEach(m => {
  const t = new Date(m.created_at).toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
  lines.push('• -$' + (m.metadata.amount).toLocaleString('es-MX') + ' · ' + (m.content || m.metadata?.label || '—').slice(0,40) + ' · ' + t);
});
return [{ json: { chatId: ${telegramChatId}, reply: lines.join('\\n'), skip: false } }];
`.trim()
      return {
        name: '[Nexus Auto] 💸 Gasto >$' + threshold,
        nodes: [
          cronNode('cron', 'Cron diario', [240, 300], `0 ${hour} * * *`),
          codeNode('check', 'Check gastos', [460, 300], code),
          {
            parameters: { conditions: { string: [{ value1: '={{ $json.skip }}', operation: 'equal', value2: 'false' }] } },
            id: 'gate', name: 'Si hay', type: 'n8n-nodes-base.if',
            typeVersion: 1, position: [680, 300],
          },
          tgSendNode('tg', 'Telegram Send', [900, 200], '={{ $json.chatId }}', '={{ $json.reply }}'),
        ],
        connections: mergeConns(
          conn('Cron diario', 'Check gastos'),
          conn('Check gastos', 'Si hay'),
          { 'Si hay': { main: [[{ node: 'Telegram Send', type: 'main', index: 0 }], []] } },
        ),
        settings: { executionOrder: 'v1' },
      }
    },
  },

  // ── 6. Exclusiva próxima a vencer ─────────────────────────────────
  {
    id: 'exclusiva_expiring',
    name: '📅 Exclusiva por vencer',
    desc: 'Cada día revisa contratos de exclusiva próximos a vencer (en N días) y te avisa para renegociar.',
    category: 'crm',
    icon: '📅',
    color: '#fb923c',
    paramsSchema: [
      { key: 'days_ahead', label: 'Avisar con cuántos días de anticipación', type: 'number', min: 1, max: 60, default: 7 },
      { key: 'hour', label: 'Hora chequeo (24h)', type: 'number', min: 0, max: 23, default: 9 },
    ],
    generateWorkflow(params, ctx) {
      const { days_ahead = 7, hour = 9 } = params
      const { supabaseUrl, supabaseKey, telegramChatId, userId } = ctx
      const code = `
const SB_URL = ${JSON.stringify(supabaseUrl)};
const SB_KEY = ${JSON.stringify(supabaseKey)};
const helpers = this.helpers;
const today = new Date(); today.setHours(0,0,0,0);
const limit = new Date(today.getTime() + ${days_ahead}*86400000).toISOString();
const props = await helpers.httpRequest({
  method:'GET',
  url: SB_URL+'/rest/v1/properties?select=titulo,folio_interno,exclusiva_fin,dueno_nombre,dueno_telefono&user_id=eq.${userId}&exclusiva=eq.true&exclusiva_fin=gte.'+today.toISOString()+'&exclusiva_fin=lte.'+limit+'&deleted_at=is.null',
  headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }, json: true,
});
if (!props.length) return [{ json: { chatId: ${telegramChatId}, reply: null, skip: true } }];
const lines = ['📅 *Exclusivas por vencer (próximos ${days_ahead}d):*', ''];
props.forEach(p => {
  const d = Math.ceil((new Date(p.exclusiva_fin) - today) / 86400000);
  lines.push('• *' + (p.titulo || p.folio_interno) + '* — vence en ' + d + 'd');
  if (p.dueno_nombre) lines.push('  Dueño: ' + p.dueno_nombre + (p.dueno_telefono ? ' · ' + p.dueno_telefono : ''));
});
return [{ json: { chatId: ${telegramChatId}, reply: lines.join('\\n'), skip: false } }];
`.trim()
      return {
        name: '[Nexus Auto] 📅 Exclusiva ' + days_ahead + 'd',
        nodes: [
          cronNode('cron', 'Cron diario', [240, 300], `0 ${hour} * * *`),
          codeNode('check', 'Check exclusivas', [460, 300], code),
          {
            parameters: { conditions: { string: [{ value1: '={{ $json.skip }}', operation: 'equal', value2: 'false' }] } },
            id: 'gate', name: 'Si hay', type: 'n8n-nodes-base.if',
            typeVersion: 1, position: [680, 300],
          },
          tgSendNode('tg', 'Telegram Send', [900, 200], '={{ $json.chatId }}', '={{ $json.reply }}'),
        ],
        connections: mergeConns(
          conn('Cron diario', 'Check exclusivas'),
          conn('Check exclusivas', 'Si hay'),
          { 'Si hay': { main: [[{ node: 'Telegram Send', type: 'main', index: 0 }], []] } },
        ),
        settings: { executionOrder: 'v1' },
      }
    },
  },

  // ── 7. RSS contenido nuevo (placeholder Fase 2) ───────────────────
  {
    id: 'rss_new_content',
    name: '📡 Contenido nuevo en RSS',
    desc: 'Cuando un artista/proyecto publique en YouTube, IG, TikTok o Spotify, te avisa con link directo. Configura las fuentes en cada proyecto → tab 📡 RSS.',
    category: 'content',
    icon: '📡',
    color: '#34d399',
    requiresPhase: 2,
    paramsSchema: [
      { key: 'interval_minutes', label: 'Frecuencia (minutos)', type: 'number', min: 5, max: 120, default: 15 },
    ],
    generateWorkflow(params, ctx) {
      // Implementado en Fase 2
      return null
    },
  },

  // ── 8. Backup completado ─────────────────────────────────────────
  {
    id: 'backup_status',
    name: '📦 Backup completado/falló',
    desc: 'Cuando Drive backup termina (o falla), te llega un mensaje confirmando o alertando.',
    category: 'system',
    icon: '📦',
    color: '#94a3b8',
    paramsSchema: [],
    generateWorkflow(params, ctx) {
      const { telegramChatId } = ctx
      const path = 'nexus-backup-' + Date.now().toString(36)
      const code = `
const body = $input.first().json.body || {};
const d = body.data || body;
const status = d.status || 'success';
const folder = d.folder || 'Nexus OS/Backups';
const rows = d.total_rows || 0;
const counts = d.counts || {};
const emoji = status === 'error' ? '⚠️' : '📦';
const lines = [emoji + ' *Backup ' + (status === 'error' ? 'falló' : 'completado') + '*'];
if (rows) lines.push('Filas: ' + rows.toLocaleString('es-MX'));
if (folder) lines.push('Carpeta: ' + folder);
if (status === 'error' && d.error) lines.push('Error: ' + d.error.slice(0,200));
return [{ json: { chatId: ${telegramChatId}, reply: lines.join('\\n') } }];
`.trim()
      return {
        name: '[Nexus Auto] 📦 Backup status',
        nodes: [
          webhookNode('hook', 'Webhook backup', [240, 300], path),
          codeNode('extract', 'Format msg', [460, 300], code),
          tgSendNode('tg', 'Telegram Send', [680, 300], '={{ $json.chatId }}', '={{ $json.reply }}'),
          respondNode('respond', 'Respond OK', [900, 300]),
        ],
        connections: mergeConns(
          conn('Webhook backup', 'Format msg'),
          conn('Format msg', 'Telegram Send'),
          conn('Telegram Send', 'Respond OK'),
        ),
        settings: { executionOrder: 'v1' },
        webhookPath: path,
      }
    },
    afterEnable(workflow, ctx) {
      return {
        webhookUrl: `${ctx.n8nBaseUrl}/webhook/${workflow.webhookPath}`,
        instruction: 'Pega esta URL en Configuración → Conexiones → 📦 Backup completado.',
      }
    },
  },
]

export const CATEGORIES = [
  { id: 'daily',   label: 'Cotidiano',  icon: '☀️' },
  { id: 'crm',     label: 'CRM',        icon: '👥' },
  { id: 'finance', label: 'Finanzas',   icon: '💰' },
  { id: 'content', label: 'Contenido',  icon: '📡' },
  { id: 'system',  label: 'Sistema',    icon: '⚙️' },
]

export function findRecipe(id) {
  return RECIPES.find(r => r.id === id)
}

export default { RECIPES, CATEGORIES, findRecipe }
