// POST   /api/automations          { action: 'list' | 'enable' | 'disable' | 'update', ... }
//
// Endpoint unificado para gestionar automatizaciones (recetas IFTTT-style).
// Habla con n8n (vía API key) para crear/activar/desactivar workflows.
//
// Auth: lee el JWT del usuario desde Authorization: Bearer <token>.
//       Lo decodifica con la anon_key de Supabase (server-side) para sacar uid.

import { createClient } from '@supabase/supabase-js'
import { RECIPES, findRecipe } from '../src/automation-recipes.js'

const N8N_BASE = process.env.N8N_BASE_URL || 'https://n8n.zxyw.site'
const N8N_KEY  = process.env.N8N_API_KEY
const TG_CHAT_ID = process.env.TELEGRAM_CHAT_ID
  ? Number(process.env.TELEGRAM_CHAT_ID)
  : null

function getSupabase(authToken) {
  const url  = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !anon) throw new Error('Supabase env faltante')
  return createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: 'Bearer ' + authToken } },
  })
}

function getAdminSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.NEXUS_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase admin env faltante')
  return createClient(url, key, { auth: { persistSession: false } })
}

async function n8nRequest(path, opts = {}) {
  if (!N8N_KEY) throw new Error('N8N_API_KEY no configurada')
  const r = await fetch(N8N_BASE + path, {
    ...opts,
    headers: {
      'X-N8N-API-KEY': N8N_KEY,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  })
  const text = await r.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  if (!r.ok) {
    throw new Error('n8n ' + r.status + ' ' + (json.message || text).slice(0, 200))
  }
  return json
}

// Sanitiza la receta para un manifest público (sin generateWorkflow function)
function recipeToPublic(r) {
  return {
    id: r.id,
    name: r.name,
    desc: r.desc,
    category: r.category,
    icon: r.icon,
    color: r.color,
    paramsSchema: r.paramsSchema || [],
    requiresPhase: r.requiresPhase || null,
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { action, recipe_id, params, automation_id } = req.body || {}

    // ── LISTA pública del catálogo (no requiere auth)
    if (action === 'catalog') {
      return res.status(200).json({
        ok: true,
        recipes: RECIPES.map(recipeToPublic),
      })
    }

    // ── Las demás requieren auth
    const authHeader = req.headers.authorization || ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) return res.status(401).json({ error: 'Sin token' })

    const sb = getSupabase(token)
    const { data: { user }, error: uErr } = await sb.auth.getUser()
    if (uErr || !user) return res.status(401).json({ error: 'Token inválido' })
    const userId = user.id

    const admin = getAdminSupabase()

    // ── LIST activas del usuario
    if (action === 'list') {
      const { data, error } = await admin
        .from('user_automations')
        .select('id, recipe_id, enabled, params, n8n_workflow_id, n8n_webhook_url, last_run_at, last_run_status, created_at, updated_at')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return res.status(200).json({ ok: true, automations: data || [] })
    }

    // ── ENABLE (crea workflow en n8n + INSERT en DB)
    if (action === 'enable') {
      if (!recipe_id) return res.status(400).json({ error: 'recipe_id requerido' })
      const recipe = findRecipe(recipe_id)
      if (!recipe) return res.status(404).json({ error: 'Receta no existe' })
      if (recipe.requiresPhase && recipe.requiresPhase > 1) {
        return res.status(400).json({ error: 'Receta requiere fase ' + recipe.requiresPhase + ' (próximamente).' })
      }

      // Construir contexto para el generador
      const ctx = {
        supabaseUrl: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
        supabaseKey: process.env.NEXUS_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY,
        telegramChatId: params?.telegram_chat_id || TG_CHAT_ID,
        userId,
        n8nBaseUrl: N8N_BASE,
        apiBase: process.env.NEXUS_API_BASE || 'https://nexus-os.vercel.app',
        serviceSecret: process.env.NEXUS_WEBHOOK_SECRET || '',
      }
      if (!ctx.telegramChatId) {
        return res.status(400).json({ error: 'No hay chat_id de Telegram configurado. Define TELEGRAM_CHAT_ID en env o pásalo en params.' })
      }

      const workflow = recipe.generateWorkflow(params || {}, ctx)
      if (!workflow) return res.status(500).json({ error: 'Receta no generó workflow' })

      // 1. Crea workflow en n8n
      const created = await n8nRequest('/api/v1/workflows', {
        method: 'POST',
        body: JSON.stringify({
          name: workflow.name,
          nodes: workflow.nodes,
          connections: workflow.connections,
          settings: workflow.settings || { executionOrder: 'v1' },
        }),
      })
      const workflowId = created.id
      if (!workflowId) throw new Error('n8n no devolvió id')

      // 2. Activa
      await n8nRequest('/api/v1/workflows/' + workflowId + '/activate', { method: 'POST' })

      // 3. afterEnable hook (ej. devolver webhook URL)
      let afterResult = null
      if (typeof recipe.afterEnable === 'function') {
        afterResult = recipe.afterEnable(workflow, ctx)
      }

      // 4. Upsert en DB (UNIQUE owner_id, recipe_id permite re-activar)
      const { data: row, error: insErr } = await admin
        .from('user_automations')
        .upsert({
          owner_id: userId,
          recipe_id,
          params: params || {},
          enabled: true,
          n8n_workflow_id: workflowId,
          n8n_webhook_url: afterResult?.webhookUrl || null,
        }, { onConflict: 'owner_id,recipe_id' })
        .select()
        .single()
      if (insErr) throw insErr

      return res.status(200).json({
        ok: true,
        automation: row,
        afterResult,
      })
    }

    // ── DISABLE (deactivate en n8n + UPDATE)
    if (action === 'disable') {
      if (!automation_id) return res.status(400).json({ error: 'automation_id requerido' })
      const { data: row, error: rErr } = await admin
        .from('user_automations')
        .select('id, n8n_workflow_id, owner_id')
        .eq('id', automation_id)
        .single()
      if (rErr || !row) return res.status(404).json({ error: 'Automatización no existe' })
      if (row.owner_id !== userId) return res.status(403).json({ error: 'Sin acceso' })

      if (row.n8n_workflow_id) {
        try { await n8nRequest('/api/v1/workflows/' + row.n8n_workflow_id + '/deactivate', { method: 'POST' }) }
        catch (e) { console.warn('[automations] deactivate fail', e.message) }
      }

      const { error: upErr } = await admin
        .from('user_automations')
        .update({ enabled: false })
        .eq('id', automation_id)
      if (upErr) throw upErr

      return res.status(200).json({ ok: true })
    }

    // ── DELETE (deactivate + drop workflow + delete row)
    if (action === 'delete') {
      if (!automation_id) return res.status(400).json({ error: 'automation_id requerido' })
      const { data: row, error: rErr } = await admin
        .from('user_automations')
        .select('id, n8n_workflow_id, owner_id')
        .eq('id', automation_id)
        .single()
      if (rErr || !row) return res.status(404).json({ error: 'No existe' })
      if (row.owner_id !== userId) return res.status(403).json({ error: 'Sin acceso' })

      if (row.n8n_workflow_id) {
        try {
          await n8nRequest('/api/v1/workflows/' + row.n8n_workflow_id + '/deactivate', { method: 'POST' })
          await n8nRequest('/api/v1/workflows/' + row.n8n_workflow_id, { method: 'DELETE' })
        } catch (e) { console.warn('[automations] cleanup fail', e.message) }
      }

      const { error: dErr } = await admin
        .from('user_automations')
        .delete()
        .eq('id', automation_id)
      if (dErr) throw dErr

      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: 'action no reconocida: ' + action })
  } catch (e) {
    console.error('[automations]', e)
    return res.status(500).json({ error: e.message })
  }
}
