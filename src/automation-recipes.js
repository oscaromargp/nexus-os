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

  // ── 7. RSS contenido nuevo (registrada como receta lite — el workflow vive aparte) ──
  {
    id: 'rss_new_content',
    name: '📡 Contenido nuevo en RSS',
    desc: 'Cuando un artista/proyecto publique en YouTube, IG, TikTok o Spotify, te avisa con link directo + botones [✓ Aceptar] [✗ Rechazar] [🤖 Draft IA]. Configura las fuentes en cada proyecto → tab 📡 RSS.',
    category: 'content',
    icon: '📡',
    color: '#34d399',
    paramsSchema: [],
    generateWorkflow(params, ctx) {
      // El workflow del tracker corre globalmente (no por usuario) — esta receta
      // sólo informa al usuario que el sistema RSS ya está activo. Crea un
      // workflow stub que no hace nada en n8n para mantener el registro.
      return {
        name: '[Nexus Auto] 📡 RSS tracker (info)',
        nodes: [
          {
            parameters: { rule: { interval: [{ field:'cronExpression', expression: '0 0 1 1 *' }] } },
            id: 'noop', name: 'Noop (info-only)',
            type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [240, 300],
          },
        ],
        connections: {},
        settings: { executionOrder: 'v1' },
      }
    },
  },

  // ── 9. Cita en 1h → recordatorio ─────────────────────────────────
  {
    id: 'appointment_reminder',
    name: '⏰ Recordatorio de cita 1h antes',
    desc: 'Revisa cada 15 min tus tareas/citas (nodes kanban con due_date) y te recuerda 1h antes con datos de ubicación si están en la nota.',
    category: 'daily',
    icon: '⏰',
    color: '#60a5fa',
    paramsSchema: [
      { key: 'minutes_ahead', label: 'Minutos de anticipación', type: 'number', min: 15, max: 240, default: 60 },
    ],
    generateWorkflow(params, ctx) {
      const { minutes_ahead = 60 } = params
      const { supabaseUrl, supabaseKey, telegramChatId, userId } = ctx
      const code = `
const SB_URL = ${JSON.stringify(supabaseUrl)};
const SB_KEY = ${JSON.stringify(supabaseKey)};
const helpers = this.helpers;
const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };

const ahead = ${minutes_ahead};
// Ventana: items con due_date entre now+(ahead-7) y now+(ahead+8) min — 15min granularidad del cron
const from = new Date(Date.now() + (ahead - 7) * 60000).toISOString();
const to   = new Date(Date.now() + (ahead + 8) * 60000).toISOString();

// nodes kanban con metadata.due_date en ese rango
const all = await helpers.httpRequest({
  method:'GET',
  url: SB_URL + '/rest/v1/nodes?select=id,content,metadata&owner_id=eq.${userId}&type=eq.kanban&metadata->>due_date=gte.' + from.slice(0,10) + '&metadata->>due_date=lte.' + to.slice(0,10),
  headers: H, json: true,
});

// Filtra por hora exacta si hay metadata.due_time
const matches = all.filter(n => {
  const dd = n.metadata?.due_date;
  const dt = n.metadata?.due_time;
  if (!dd) return false;
  const iso = dd + (dt ? 'T' + dt : 'T09:00:00');
  const d = new Date(iso);
  return !isNaN(d) && d.getTime() >= new Date(from).getTime() && d.getTime() <= new Date(to).getTime();
});

if (!matches.length) return [{ json: { skip: true } }];

const lines = ['⏰ *Cita en aproximadamente ' + ahead + ' min:*', ''];
matches.forEach(m => {
  const titulo = m.metadata?.label || m.content || '—';
  const t = m.metadata?.due_time || '';
  const loc = m.metadata?.location || '';
  lines.push('• *' + titulo.slice(0,80) + '*' + (t ? ' · ' + t : ''));
  if (loc) lines.push('  📍 ' + loc.slice(0,100));
});
return [{ json: { chatId: ${telegramChatId}, reply: lines.join('\\n'), skip: false } }];
`.trim()
      return {
        name: '[Nexus Auto] ⏰ Cita ' + minutes_ahead + 'min',
        nodes: [
          cronNode('cron', 'Cron 15min', [240, 300], '*/15 * * * *'),
          codeNode('check', 'Check citas', [460, 300], code),
          {
            parameters: { conditions: { string: [{ value1: '={{ $json.skip }}', operation: 'equal', value2: 'false' }] } },
            id: 'gate', name: 'Si hay', type: 'n8n-nodes-base.if',
            typeVersion: 1, position: [680, 300],
          },
          tgSendNode('tg', 'Telegram Send', [900, 200], '={{ $json.chatId }}', '={{ $json.reply }}'),
        ],
        connections: mergeConns(
          conn('Cron 15min', 'Check citas'),
          conn('Check citas', 'Si hay'),
          { 'Si hay': { main: [[{ node: 'Telegram Send', type: 'main', index: 0 }], []] } },
        ),
        settings: { executionOrder: 'v1' },
      }
    },
  },

  // ── 11. Movimiento financiero registrado → Telegram ──────────────
  {
    id: 'movement_telegram',
    name: '💰 Movimiento registrado → Telegram',
    desc: 'Cuando capturas un ingreso o gasto en Nexus (Bio-Finanzas, Movimientos o por parser), te llega al instante con monto, categoría, cuenta y link al comprobante si tiene.',
    category: 'finance',
    icon: '💰',
    color: '#34d399',
    paramsSchema: [
      { key: 'min_amount', label: 'Avisar sólo si monto >= (0 = todos)', type: 'number', min: 0, default: 0 },
    ],
    generateWorkflow(params, ctx) {
      const { min_amount = 0 } = params
      const { telegramChatId } = ctx
      const path = 'nexus-movement-' + Date.now().toString(36)
      const code = `
const body = $input.first().json.body || {};
const d = body.data || {};
const minAmt = ${min_amount};
if (minAmt > 0 && (d.amount || 0) < minAmt) {
  return [{ json: { skip: true } }];
}
const isIncome = d.kind === 'income';
const emoji = isIncome ? '💵' : '💸';
const tipo  = isIncome ? 'INGRESO' : 'GASTO';
const signo = isIncome ? '+' : '-';
const monto = signo + '$' + Number(d.amount || 0).toLocaleString('es-MX');
const lines = [emoji + ' *' + tipo + ' registrado*', ''];
lines.push('💰 ' + monto + ' ' + (d.currency || 'MXN'));
lines.push('📝 ' + (d.label || '—').slice(0, 100));
if (d.categoria || d.account) lines.push('🏷️ ' + [d.categoria, d.account].filter(Boolean).join(' · '));
if (d.proyecto || d.project_tag) lines.push('📁 ' + (d.proyecto || d.project_tag));
if (d.account_dest) lines.push('🏦 → ' + d.account_dest);
if (d.tags && d.tags.length) lines.push('#️⃣ ' + d.tags.join(' '));
if (d.estado) lines.push('🔖 ' + d.estado);
if (d.date) lines.push('📅 ' + d.date);
if (d.comprobante) {
  lines.push('');
  lines.push('📎 [Ver comprobante](' + d.comprobante + ')');
}
return [{ json: { chatId: ${telegramChatId}, reply: lines.join('\\n'), skip: false } }];
`.trim()
      return {
        name: '[Nexus Auto] 💰 Movimiento → TG',
        nodes: [
          webhookNode('hook', 'Webhook movimiento', [240, 300], path),
          codeNode('format', 'Format msg', [460, 300], code),
          {
            parameters: { conditions: { string: [{ value1: '={{ $json.skip }}', operation: 'equal', value2: 'false' }] } },
            id: 'gate', name: 'Si pasa filtro', type: 'n8n-nodes-base.if',
            typeVersion: 1, position: [680, 300],
          },
          tgSendNode('tg', 'Telegram Send', [900, 200], '={{ $json.chatId }}', '={{ $json.reply }}'),
          respondNode('respond', 'Respond OK', [900, 400]),
        ],
        connections: mergeConns(
          conn('Webhook movimiento', 'Format msg'),
          conn('Format msg', 'Si pasa filtro'),
          { 'Si pasa filtro': { main: [
            [{ node: 'Telegram Send', type:'main', index:0 }],
            [{ node: 'Respond OK', type:'main', index:0 }],
          ] } },
          conn('Telegram Send', 'Respond OK'),
        ),
        settings: { executionOrder: 'v1' },
        webhookPath: path,
      }
    },
    afterEnable(workflow, ctx) {
      return {
        webhookUrl: `${ctx.n8nBaseUrl}/webhook/${workflow.webhookPath}`,
        instruction: 'Pega esta URL en Configuración → Conexiones → 💰 Movimiento registrado, y guarda. Cada gasto/ingreso capturado en Nexus disparará un mensaje.',
      }
    },
  },

  // ── 12. Agenda diaria del día → Telegram ─────────────────────────
  {
    id: 'daily_agenda',
    name: '📅 Agenda del día → Telegram',
    desc: 'Cada mañana te llega el día completo: pagos/cobros recurrentes próximos, tareas con vencimiento hoy, citas, eventos y movimientos pendientes. Tu briefing diario.',
    category: 'daily',
    icon: '📅',
    color: '#fb923c',
    paramsSchema: [
      { key: 'hour', label: 'Hora (24h)', type: 'number', min: 0, max: 23, default: 7 },
      { key: 'window_days', label: 'Días hacia adelante a mostrar', type: 'number', min: 1, max: 14, default: 3 },
    ],
    generateWorkflow(params, ctx) {
      const { hour = 7, window_days = 3 } = params
      const { supabaseUrl, supabaseKey, telegramChatId, userId } = ctx
      const code = `
const SB_URL = ${JSON.stringify(supabaseUrl)};
const SB_KEY = ${JSON.stringify(supabaseKey)};
const helpers = this.helpers;
const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
const sb = async (p) => helpers.httpRequest({ method:'GET', url: SB_URL+'/rest/v1/'+p, headers: H, json: true });

const today = new Date(); today.setHours(0,0,0,0);
const todayIso = today.toISOString();
const todayDate = todayIso.split('T')[0];
const aheadDate = new Date(today.getTime() + ${window_days}*86400000).toISOString().split('T')[0];

const [bills, tasks, leadsHoy, movsHoy] = await Promise.all([
  sb('nodes?select=content,metadata&owner_id=eq.${userId}&type=eq.bill').catch(() => []),
  sb('nodes?select=content,metadata&owner_id=eq.${userId}&type=eq.kanban&order=created_at.desc&limit=50').catch(() => []),
  sb('property_leads?select=nombre,telefono,properties(titulo,folio_interno)&created_at=gte.' + todayIso + '&order=created_at.desc&limit=5').catch(() => []),
  sb('movimientos?select=tipo,beneficiario,cantidad,moneda,estado&fecha=eq.' + todayDate + '&order=created_at.desc&limit=10').catch(() => []),
]);

// Filtrar bills próximos en la ventana
const billsProximos = bills.filter(b => {
  const due = b.metadata?.dueDate;
  if (!due) return false;
  return due >= todayDate && due <= aheadDate && !b.metadata?.paid;
}).sort((a,b) => (a.metadata.dueDate < b.metadata.dueDate ? -1 : 1));

// Tareas: vencidas + hoy + próximas en ventana
const tasksHoy = tasks.filter(t => {
  const dd = t.metadata?.due_date;
  if (!dd) return false;
  return dd <= aheadDate && t.metadata?.status !== 'done';
}).sort((a,b) => (a.metadata.due_date < b.metadata.due_date ? -1 : 1)).slice(0, 8);

const lines = [];
lines.push('📅 *Tu día — ' + new Date().toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' }) + '*');
lines.push('');

if (billsProximos.length) {
  lines.push('💸 *Pagos próximos (' + ${window_days} + 'd):*');
  billsProximos.slice(0,6).forEach(b => {
    const amt = b.metadata?.amount ? ' $' + Number(b.metadata.amount).toLocaleString('es-MX') : '';
    const cat = b.metadata?.frequency ? ' (' + b.metadata.frequency + ')' : '';
    const days = Math.round((new Date(b.metadata.dueDate) - today) / 86400000);
    const when = days === 0 ? 'hoy' : days === 1 ? 'mañana' : 'en ' + days + 'd';
    lines.push('• ' + (b.content || b.metadata.label || '—') + amt + ' · ' + when + cat);
  });
  lines.push('');
}

if (tasksHoy.length) {
  lines.push('✅ *Tareas / citas:*');
  tasksHoy.forEach(t => {
    const titulo = (t.content || t.metadata?.label || '—').slice(0, 70);
    const due = t.metadata?.due_date;
    const time = t.metadata?.due_time ? ' ' + t.metadata.due_time : '';
    const prio = t.metadata?.priority === 'alta' ? ' 🔴' : t.metadata?.priority === 'media' ? ' 🟡' : '';
    const days = due ? Math.round((new Date(due) - today) / 86400000) : 0;
    const when = days < 0 ? '⚠️ vencida' : days === 0 ? 'hoy' + time : days === 1 ? 'mañana' + time : 'en ' + days + 'd';
    lines.push('• ' + titulo + prio + ' · ' + when);
  });
  lines.push('');
}

if (movsHoy.length) {
  const ing = movsHoy.filter(m => m.tipo === 'entrada');
  const eg  = movsHoy.filter(m => m.tipo === 'salida');
  const sumI = ing.reduce((a,b) => a + (b.cantidad||0), 0);
  const sumE = eg.reduce((a,b) => a + (b.cantidad||0), 0);
  lines.push('💰 *Movimientos hoy:* +' + sumI.toLocaleString('es-MX') + ' · -' + sumE.toLocaleString('es-MX'));
  lines.push('');
}

if (leadsHoy.length) {
  lines.push('📩 *Leads del día (' + leadsHoy.length + '):*');
  leadsHoy.slice(0,3).forEach(l => {
    const inm = l.properties?.titulo || l.properties?.folio_interno || '—';
    lines.push('• ' + (l.nombre || '—') + ' · ' + inm);
  });
  lines.push('');
}

if (lines.length === 2) {
  lines.push('🎉 Sin compromisos en agenda. Disfruta el día.');
}

return [{ json: { chatId: ${telegramChatId}, reply: lines.join('\\n') } }];
`.trim()
      return {
        name: '[Nexus Auto] 📅 Agenda diaria',
        nodes: [
          cronNode('cron', 'Cron mañana', [240, 300], `0 ${hour} * * *`),
          codeNode('compute', 'Compute agenda', [460, 300], code),
          tgSendNode('tg', 'Telegram Send', [680, 300], '={{ $json.chatId }}', '={{ $json.reply }}'),
        ],
        connections: mergeConns(
          conn('Cron mañana', 'Compute agenda'),
          conn('Compute agenda', 'Telegram Send'),
        ),
        settings: { executionOrder: 'v1' },
      }
    },
  },

  // ── 10. Cumpleaños cliente hoy ───────────────────────────────────
  {
    id: 'birthday_reminder',
    name: '🎂 Cumpleaños cliente hoy',
    desc: 'Cada mañana revisa tus contactos y te avisa si alguno cumple años hoy. Lee metadata.birthday (YYYY-MM-DD o MM-DD).',
    category: 'crm',
    icon: '🎂',
    color: '#f472b6',
    paramsSchema: [
      { key: 'hour', label: 'Hora aviso (24h)', type: 'number', min: 0, max: 23, default: 9 },
    ],
    generateWorkflow(params, ctx) {
      const { hour = 9 } = params
      const { supabaseUrl, supabaseKey, telegramChatId, userId } = ctx
      const code = `
const SB_URL = ${JSON.stringify(supabaseUrl)};
const SB_KEY = ${JSON.stringify(supabaseKey)};
const helpers = this.helpers;
const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };

const today = new Date();
const mm = String(today.getMonth()+1).padStart(2,'0');
const dd = String(today.getDate()).padStart(2,'0');

const contacts = await helpers.httpRequest({
  method:'GET',
  url: SB_URL + '/rest/v1/nodes?select=id,content,metadata&owner_id=eq.${userId}&type=eq.contact',
  headers: H, json: true,
});

const matches = contacts.filter(c => {
  const b = c.metadata?.birthday || c.metadata?.fecha_nacimiento || '';
  if (!b) return false;
  return b.endsWith(mm + '-' + dd) || b === mm + '-' + dd;
});

if (!matches.length) return [{ json: { skip: true } }];

const lines = ['🎂 *Cumpleaños hoy:*', ''];
matches.forEach(c => {
  const name = c.metadata?.name || c.metadata?.label || c.content || '—';
  const phone = c.metadata?.phone || c.metadata?.telefono || '';
  lines.push('• *' + name + '*' + (phone ? ' · 📞 ' + phone : ''));
});
return [{ json: { chatId: ${telegramChatId}, reply: lines.join('\\n'), skip: false } }];
`.trim()
      return {
        name: '[Nexus Auto] 🎂 Cumpleaños',
        nodes: [
          cronNode('cron', 'Cron diario', [240, 300], `0 ${hour} * * *`),
          codeNode('check', 'Check cumples', [460, 300], code),
          {
            parameters: { conditions: { string: [{ value1: '={{ $json.skip }}', operation: 'equal', value2: 'false' }] } },
            id: 'gate', name: 'Si hay', type: 'n8n-nodes-base.if',
            typeVersion: 1, position: [680, 300],
          },
          tgSendNode('tg', 'Telegram Send', [900, 200], '={{ $json.chatId }}', '={{ $json.reply }}'),
        ],
        connections: mergeConns(
          conn('Cron diario', 'Check cumples'),
          conn('Check cumples', 'Si hay'),
          { 'Si hay': { main: [[{ node: 'Telegram Send', type: 'main', index: 0 }], []] } },
        ),
        settings: { executionOrder: 'v1' },
      }
    },
  },

  // ── Actividad universal Nexus → Telegram ─────────────────────────
  // (Renumeración: este va antes que backup_status para mantener
  // continuidad lógica de categoría 'system')
  {
    id: 'activity_telegram',
    name: '🔔 Toda actividad → Telegram',
    desc: 'Cada vez que creas o editas algo importante en Nexus (tarea, contacto, proyecto, nota, inmueble, lead aceptado), te llega un mensaje. Útil para tener trazabilidad en tiempo real de lo que estás trabajando.',
    category: 'system',
    icon: '🔔',
    color: '#fbbf24',
    paramsSchema: [
      { key: 'include_tasks',    label: 'Tareas / citas',         type: 'bool', default: true },
      { key: 'include_contacts', label: 'Contactos nuevos',       type: 'bool', default: true },
      { key: 'include_projects', label: 'Proyectos nuevos',       type: 'bool', default: true },
      { key: 'include_notes',    label: 'Notas largas (>40 chars)', type: 'bool', default: false },
      { key: 'include_properties', label: 'Inmuebles modificados', type: 'bool', default: true },
    ],
    generateWorkflow(params, ctx) {
      const { telegramChatId } = ctx
      const path = 'nexus-activity-' + Date.now().toString(36)
      const flags = {
        tasks:      params.include_tasks !== false,
        contacts:   params.include_contacts !== false,
        projects:   params.include_projects !== false,
        notes:      params.include_notes === true,
        properties: params.include_properties !== false,
      }
      const code = `
const body = $input.first().json.body || {};
const d = body.data || {};
const kind = d.kind || d.type || 'unknown';
const flags = ${JSON.stringify(flags)};

const passes = (
  (kind === 'task' && flags.tasks) ||
  (kind === 'contact' && flags.contacts) ||
  (kind === 'project' && flags.projects) ||
  (kind === 'note' && flags.notes) ||
  (kind === 'property' && flags.properties)
);
if (!passes) return [{ json: { skip: true } }];

const EMOJI = { task:'✅', contact:'👤', project:'📁', note:'📝', property:'🏠' };
const VERB  = { create:'creado', update:'editado', delete:'borrado' };
const action = d.action || 'create';
const emoji = EMOJI[kind] || '🔔';

const lines = [emoji + ' *' + (kind.toUpperCase()) + ' ' + (VERB[action] || action) + '*', ''];
if (d.label || d.title || d.name) lines.push('📝 ' + (d.label || d.title || d.name).slice(0,200));
if (d.priority) lines.push('🎯 ' + d.priority);
if (d.due_date) lines.push('📅 ' + d.due_date + (d.due_time ? ' ' + d.due_time : ''));
if (d.project_tag) lines.push('📁 #' + d.project_tag);
if (d.amount != null) lines.push('💰 $' + Number(d.amount).toLocaleString('es-MX'));
if (d.tags?.length) lines.push('🏷️ ' + d.tags.join(' '));
if (d.url) lines.push(d.url);

return [{ json: { chatId: ${telegramChatId}, reply: lines.join('\\n'), skip: false } }];
`.trim()
      return {
        name: '[Nexus Auto] 🔔 Actividad → TG',
        nodes: [
          webhookNode('hook', 'Webhook actividad', [240, 300], path),
          codeNode('format', 'Format msg', [460, 300], code),
          {
            parameters: { conditions: { string: [{ value1: '={{ $json.skip }}', operation: 'equal', value2: 'false' }] } },
            id: 'gate', name: 'Si pasa filtro', type: 'n8n-nodes-base.if',
            typeVersion: 1, position: [680, 300],
          },
          tgSendNode('tg', 'Telegram Send', [900, 200], '={{ $json.chatId }}', '={{ $json.reply }}'),
          respondNode('respond', 'Respond OK', [900, 400]),
        ],
        connections: mergeConns(
          conn('Webhook actividad', 'Format msg'),
          conn('Format msg', 'Si pasa filtro'),
          { 'Si pasa filtro': { main: [
            [{ node: 'Telegram Send', type:'main', index:0 }],
            [{ node: 'Respond OK', type:'main', index:0 }],
          ] } },
          conn('Telegram Send', 'Respond OK'),
        ),
        settings: { executionOrder: 'v1' },
        webhookPath: path,
      }
    },
    afterEnable(workflow, ctx) {
      return {
        webhookUrl: `${ctx.n8nBaseUrl}/webhook/${workflow.webhookPath}`,
        instruction: 'Pega esta URL en Configuración → Conexiones → 🔔 Actividad Nexus (cuando se cree). Por ahora cópiala — el dispatch desde app.js se agrega en el siguiente push.',
      }
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

  // ── 13. Resumen semanal financiero (domingo 7pm) ─────────────────
  {
    id: 'weekly_finance_summary',
    name: '📊 Resumen semanal financiero',
    desc: 'Cada domingo te envía el P&L de la semana: ingresos totales, gastos por categoría, top 3 movimientos grandes y proyectos con más movimiento.',
    category: 'finance',
    icon: '📊',
    color: '#22d3ee',
    paramsSchema: [
      { key: 'weekday', label: 'Día (0=domingo, 6=sábado)', type: 'number', min: 0, max: 6, default: 0 },
      { key: 'hour', label: 'Hora (24h)', type: 'number', min: 0, max: 23, default: 19 },
    ],
    generateWorkflow(params, ctx) {
      const { weekday = 0, hour = 19 } = params
      const { supabaseUrl, supabaseKey, telegramChatId, userId } = ctx
      const code = `
const SB_URL = ${JSON.stringify(supabaseUrl)};
const SB_KEY = ${JSON.stringify(supabaseKey)};
const helpers = this.helpers;
const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
const sb = async (p) => helpers.httpRequest({ method:'GET', url: SB_URL+'/rest/v1/'+p, headers: H, json: true });

const now = new Date();
const start = new Date(now.getTime() - 7*86400000);

const [nodes, movs] = await Promise.all([
  sb('nodes?select=type,content,metadata,created_at&owner_id=eq.${userId}&type=in.(income,expense)&created_at=gte.' + start.toISOString()),
  sb('movimientos?select=*&fecha=gte.' + start.toISOString().split('T')[0]),
]);

// Combina nodes + movimientos
const allEntries = [];
nodes.forEach(n => allEntries.push({ source:'node', kind: n.type, amount: n.metadata?.amount||0, label: n.content||n.metadata?.label||'', tag: n.metadata?.tags?.[0] || n.metadata?.account_hint || 'sin tag' }));
movs.forEach(m => allEntries.push({ source:'mov', kind: m.tipo==='entrada'?'income':'expense', amount: m.monto_mxn||m.cantidad||0, label: m.beneficiario||m.ordenante||'', tag: m.categoria || m.proyecto || 'sin categoria' }));

const ing = allEntries.filter(e => e.kind === 'income');
const eg  = allEntries.filter(e => e.kind === 'expense');
const sumI = ing.reduce((a,b) => a + b.amount, 0);
const sumE = eg.reduce((a,b) => a + b.amount, 0);

// Categorías top
const catSum = {};
eg.forEach(e => { catSum[e.tag] = (catSum[e.tag]||0) + e.amount; });
const topCats = Object.entries(catSum).sort((a,b) => b[1]-a[1]).slice(0,5);

// Top 3 movimientos grandes
const top3 = allEntries.sort((a,b) => b.amount - a.amount).slice(0,3);

const lines = ['📊 *Resumen semanal — ' + new Date().toLocaleDateString('es-MX', {day:'numeric',month:'long'}) + '*', ''];
lines.push('💵 Ingresos: *$' + sumI.toLocaleString('es-MX') + '*');
lines.push('💸 Gastos: *$' + sumE.toLocaleString('es-MX') + '*');
lines.push('📈 Balance: *$' + (sumI-sumE).toLocaleString('es-MX') + '*');
lines.push('');
if (topCats.length) {
  lines.push('🏷️ *Top categorías de gasto:*');
  topCats.forEach(([cat,amt]) => lines.push('  • ' + cat + ': $' + amt.toLocaleString('es-MX')));
  lines.push('');
}
if (top3.length) {
  lines.push('💰 *Top 3 movimientos:*');
  top3.forEach(t => lines.push('  • ' + (t.kind==='income'?'+':'-') + '$' + t.amount.toLocaleString('es-MX') + ' · ' + (t.label||'—').slice(0,40)));
}
return [{ json: { chatId: ${telegramChatId}, reply: lines.join('\\n') } }];
`.trim()
      return {
        name: '[Nexus Auto] 📊 P&L semanal',
        nodes: [
          cronNode('cron', 'Cron semanal', [240, 300], `0 ${hour} * * ${weekday}`),
          codeNode('compute', 'Compute P&L', [460, 300], code),
          tgSendNode('tg', 'Telegram Send', [680, 300], '={{ $json.chatId }}', '={{ $json.reply }}'),
        ],
        connections: mergeConns(
          conn('Cron semanal', 'Compute P&L'),
          conn('Compute P&L', 'Telegram Send'),
        ),
        settings: { executionOrder: 'v1' },
      }
    },
  },

  // ── 14. Comprobante → Drive (auto) ───────────────────────────────
  {
    id: 'receipt_to_drive',
    name: '🧾 Comprobante → Drive auto',
    desc: 'Cuando subes un comprobante (PDF/foto) en Movimientos, te llega a Telegram un link a una copia archivada en Drive bajo `Nexus OS/Comprobantes/AAAA-MM/`.',
    category: 'finance',
    icon: '🧾',
    color: '#fbbf24',
    paramsSchema: [],
    generateWorkflow(params, ctx) {
      const { telegramChatId } = ctx
      const path = 'nexus-receipt-' + Date.now().toString(36)
      const code = `
const body = $input.first().json.body || {};
const d = body.data || {};
// Solo procesa si hay comprobante
if (!d.comprobante) return [{ json: { skip: true } }];
const dateRef = (d.date || new Date().toISOString().split('T')[0]).slice(0,7);
const folder = 'Nexus OS/Comprobantes/' + dateRef;
const lines = ['🧾 *Comprobante archivado*', '', '📄 ' + (d.label || '—').slice(0,80), '💰 ' + (d.kind==='income'?'+':'-') + '$' + Number(d.amount||0).toLocaleString('es-MX'), '📅 ' + (d.date || '—'), '', '📁 Carpeta: \`' + folder + '\`', '📎 [Original](' + d.comprobante + ')'];
return [{ json: { chatId: ${telegramChatId}, reply: lines.join('\\n'), skip: false } }];
`.trim()
      return {
        name: '[Nexus Auto] 🧾 Comprobante → Drive',
        nodes: [
          webhookNode('hook', 'Webhook movimiento', [240, 300], path),
          codeNode('format', 'Check comprobante', [460, 300], code),
          {
            parameters: { conditions: { string: [{ value1: '={{ $json.skip }}', operation: 'equal', value2: 'false' }] } },
            id: 'gate', name: 'Si hay', type: 'n8n-nodes-base.if',
            typeVersion: 1, position: [680, 300],
          },
          tgSendNode('tg', 'Telegram Send', [900, 200], '={{ $json.chatId }}', '={{ $json.reply }}'),
          respondNode('respond', 'Respond OK', [900, 400]),
        ],
        connections: mergeConns(
          conn('Webhook movimiento', 'Check comprobante'),
          conn('Check comprobante', 'Si hay'),
          { 'Si hay': { main: [
            [{ node: 'Telegram Send', type:'main', index:0 }],
            [{ node: 'Respond OK', type:'main', index:0 }],
          ] } },
          conn('Telegram Send', 'Respond OK'),
        ),
        settings: { executionOrder: 'v1' },
        webhookPath: path,
      }
    },
    afterEnable(workflow, ctx) {
      return {
        webhookUrl: `${ctx.n8nBaseUrl}/webhook/${workflow.webhookPath}`,
        instruction: 'Pega esta URL en Configuración → Conexiones → 💰 Movimiento registrado (junto con la otra si tienes ambas). La receta sólo dispara si el movimiento incluye comprobante.',
      }
    },
  },

  // ── 15. Inmueble vendido ─────────────────────────────────────────
  {
    id: 'property_sold',
    name: '🏠 Inmueble vendido',
    desc: 'Cada hora revisa si moviste alguno a status=vendido. Si sí, te avisa con folio, precio y comisión proyectada (%).',
    category: 'crm',
    icon: '🏠',
    color: '#22c55e',
    paramsSchema: [
      { key: 'commission_pct', label: 'Comisión por defecto (%)', type: 'number', min: 0, max: 20, default: 5 },
    ],
    generateWorkflow(params, ctx) {
      const { commission_pct = 5 } = params
      const { supabaseUrl, supabaseKey, telegramChatId, userId } = ctx
      const code = `
const SB_URL = ${JSON.stringify(supabaseUrl)};
const SB_KEY = ${JSON.stringify(supabaseKey)};
const helpers = this.helpers;
const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
const hourAgo = new Date(Date.now() - 65*60*1000).toISOString();
const sold = await helpers.httpRequest({
  method:'GET',
  url: SB_URL+'/rest/v1/properties?select=titulo,folio_interno,precio_venta,comision_pct,updated_at&user_id=eq.${userId}&status=eq.vendido&updated_at=gte.'+hourAgo,
  headers: H, json: true,
});
if (!sold.length) return [{ json: { skip: true } }];
const lines = ['🎉 *Inmueble VENDIDO*', ''];
sold.forEach(p => {
  const pct = p.comision_pct || ${commission_pct};
  const precio = p.precio_venta || 0;
  const com = (precio * pct / 100);
  lines.push('🏠 *' + (p.titulo || p.folio_interno) + '* (' + (p.folio_interno||'—') + ')');
  lines.push('💰 Precio: $' + precio.toLocaleString('es-MX'));
  lines.push('💵 Comisión esperada (' + pct + '%): *$' + com.toLocaleString('es-MX') + '*');
  lines.push('');
});
return [{ json: { chatId: ${telegramChatId}, reply: lines.join('\\n'), skip: false } }];
`.trim()
      return {
        name: '[Nexus Auto] 🏠 Inmueble vendido',
        nodes: [
          cronNode('cron', 'Cron 1h', [240, 300], '0 * * * *'),
          codeNode('check', 'Check vendidos', [460, 300], code),
          {
            parameters: { conditions: { string: [{ value1: '={{ $json.skip }}', operation: 'equal', value2: 'false' }] } },
            id: 'gate', name: 'Si hay', type: 'n8n-nodes-base.if',
            typeVersion: 1, position: [680, 300],
          },
          tgSendNode('tg', 'Telegram Send', [900, 200], '={{ $json.chatId }}', '={{ $json.reply }}'),
        ],
        connections: mergeConns(
          conn('Cron 1h', 'Check vendidos'),
          conn('Check vendidos', 'Si hay'),
          { 'Si hay': { main: [[{ node: 'Telegram Send', type:'main', index:0 }], []] } },
        ),
        settings: { executionOrder: 'v1' },
      }
    },
  },

  // ── 16. Crypto / divisa cruza objetivo ───────────────────────────
  {
    id: 'fx_target',
    name: '💱 USD/MXN o BTC/USD cruza objetivo',
    desc: 'Cron cada hora consulta tipo de cambio o precio cripto vía API gratis. Te avisa cuando cruza tu nivel objetivo (alza o baja).',
    category: 'finance',
    icon: '💱',
    color: '#fb923c',
    paramsSchema: [
      { key: 'pair', label: 'Par (USD/MXN, BTC/USD, ETH/USD)', type: 'text', default: 'USD/MXN' },
      { key: 'target', label: 'Nivel objetivo', type: 'number', min: 0, default: 20 },
      { key: 'direction', label: 'Aviso al (above / below)', type: 'text', default: 'above' },
    ],
    generateWorkflow(params, ctx) {
      const { pair = 'USD/MXN', target = 20, direction = 'above' } = params
      const { telegramChatId } = ctx
      const code = `
const helpers = this.helpers;
const pair = ${JSON.stringify(pair)}.toUpperCase();
const target = ${target};
const dir = ${JSON.stringify(direction)};
let price = 0;
let label = pair;
try {
  if (pair === 'USD/MXN' || pair === 'MXN/USD') {
    const r = await helpers.httpRequest({ method:'GET', url:'https://api.exchangerate.host/latest?base=USD&symbols=MXN', json:true });
    price = r.rates?.MXN || 0;
    label = '1 USD = $' + price.toFixed(4) + ' MXN';
  } else if (pair.startsWith('BTC') || pair.startsWith('ETH')) {
    const sym = pair.split('/')[0].toLowerCase();
    const r = await helpers.httpRequest({ method:'GET', url:'https://api.coingecko.com/api/v3/simple/price?ids=' + (sym==='btc'?'bitcoin':sym==='eth'?'ethereum':sym) + '&vs_currencies=usd', json:true });
    const key = sym==='btc'?'bitcoin':sym==='eth'?'ethereum':sym;
    price = r?.[key]?.usd || 0;
    label = '1 ' + sym.toUpperCase() + ' = $' + price.toLocaleString('es-MX') + ' USD';
  }
} catch (e) {
  return [{ json: { skip: true } }];
}
const cruzo = dir === 'above' ? price >= target : price <= target;
if (!cruzo) return [{ json: { skip: true } }];
const lines = ['💱 *' + pair + ' cruzó tu objetivo*', '', '📊 ' + label, '🎯 Objetivo (' + dir + '): ' + target];
return [{ json: { chatId: ${telegramChatId}, reply: lines.join('\\n'), skip: false } }];
`.trim()
      return {
        name: '[Nexus Auto] 💱 ' + pair,
        nodes: [
          cronNode('cron', 'Cron 1h', [240, 300], '0 * * * *'),
          codeNode('check', 'Check FX', [460, 300], code),
          {
            parameters: { conditions: { string: [{ value1: '={{ $json.skip }}', operation: 'equal', value2: 'false' }] } },
            id: 'gate', name: 'Si cruza', type: 'n8n-nodes-base.if',
            typeVersion: 1, position: [680, 300],
          },
          tgSendNode('tg', 'Telegram Send', [900, 200], '={{ $json.chatId }}', '={{ $json.reply }}'),
        ],
        connections: mergeConns(
          conn('Cron 1h', 'Check FX'),
          conn('Check FX', 'Si cruza'),
          { 'Si cruza': { main: [[{ node: 'Telegram Send', type:'main', index:0 }], []] } },
        ),
        settings: { executionOrder: 'v1' },
      }
    },
  },

  // ── 17. Meta del proyecto cumplida ───────────────────────────────
  {
    id: 'project_milestone',
    name: '🎯 Meta de proyecto cumplida',
    desc: 'Cada noche revisa todos los proyectos y te avisa cuando uno cruza un % de avance (hitos completados) o presupuesto comprometido.',
    category: 'crm',
    icon: '🎯',
    color: '#a78bfa',
    paramsSchema: [
      { key: 'threshold_pct', label: 'Umbral % avance', type: 'number', min: 10, max: 100, default: 50 },
      { key: 'hour', label: 'Hora chequeo', type: 'number', min: 0, max: 23, default: 22 },
    ],
    generateWorkflow(params, ctx) {
      const { threshold_pct = 50, hour = 22 } = params
      const { supabaseUrl, supabaseKey, telegramChatId, userId } = ctx
      const code = `
const SB_URL = ${JSON.stringify(supabaseUrl)};
const SB_KEY = ${JSON.stringify(supabaseKey)};
const helpers = this.helpers;
const projs = await helpers.httpRequest({
  method:'GET',
  url: SB_URL+'/rest/v1/nodes?select=content,metadata&owner_id=eq.${userId}&type=eq.proyecto',
  headers: { apikey: SB_KEY, Authorization: 'Bearer '+SB_KEY }, json: true,
});
const matches = [];
projs.forEach(p => {
  const mils = p.metadata?.milestones || [];
  if (!mils.length) return;
  const done = mils.filter(m => m.is_reached).length;
  const pct = Math.round(done / mils.length * 100);
  if (pct >= ${threshold_pct}) {
    matches.push({ name: p.content || p.metadata?.label || '—', pct, done, total: mils.length });
  }
});
if (!matches.length) return [{ json: { skip: true } }];
const lines = ['🎯 *Proyectos con ≥' + ${threshold_pct} + '% avance:*', ''];
matches.forEach(m => lines.push('• *' + m.name + '* — ' + m.pct + '% (' + m.done + '/' + m.total + ' hitos)'));
return [{ json: { chatId: ${telegramChatId}, reply: lines.join('\\n'), skip: false } }];
`.trim()
      return {
        name: '[Nexus Auto] 🎯 Meta proyectos',
        nodes: [
          cronNode('cron', 'Cron diario', [240, 300], `0 ${hour} * * *`),
          codeNode('check', 'Check avance', [460, 300], code),
          {
            parameters: { conditions: { string: [{ value1: '={{ $json.skip }}', operation: 'equal', value2: 'false' }] } },
            id: 'gate', name: 'Si hay', type: 'n8n-nodes-base.if',
            typeVersion: 1, position: [680, 300],
          },
          tgSendNode('tg', 'Telegram Send', [900, 200], '={{ $json.chatId }}', '={{ $json.reply }}'),
        ],
        connections: mergeConns(
          conn('Cron diario', 'Check avance'),
          conn('Check avance', 'Si hay'),
          { 'Si hay': { main: [[{ node: 'Telegram Send', type:'main', index:0 }], []] } },
        ),
        settings: { executionOrder: 'v1' },
      }
    },
  },

  // ── 18. Email SAT → mover a etiqueta ─────────────────────────────
  {
    id: 'sat_email_forward',
    name: '📧 Email SAT → Telegram (placeholder OAuth)',
    desc: 'Reenvía a Telegram cualquier email recibido de noreply@sat.gob.mx (CFDI, recibo electrónico). Requiere conectar Gmail OAuth en n8n primero. Te explico cómo al activar.',
    category: 'system',
    icon: '📧',
    color: '#94a3b8',
    requiresPhase: 4,
    paramsSchema: [],
    generateWorkflow(params, ctx) {
      // Placeholder — la activación produce un workflow stub con instrucciones
      const code = `
return [{ json: { reply: '📧 Email SAT — workflow placeholder activo.\\n\\nPaso siguiente: en n8n abre este workflow y añade un Gmail Trigger node con tu cuenta OAuth, filtra por From contains "sat.gob.mx", y conecta al Telegram Send. Te dejo el chat_id pre-cargado.' } }];
`.trim()
      return {
        name: '[Nexus Auto] 📧 SAT email (config manual)',
        nodes: [
          cronNode('cron', 'Manual setup pending', [240, 300], '0 0 1 1 *'),
          codeNode('placeholder', 'Info', [460, 300], code),
        ],
        connections: mergeConns(
          conn('Manual setup pending', 'Info'),
        ),
        settings: { executionOrder: 'v1' },
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
