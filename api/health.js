// POST /api/health { action, ... }
//
// Módulo Salud — estudios médicos, lecturas/tendencias, metas diarias,
// registro de hábitos con rachas, y resumen IA de análisis.
//
// Auth: JWT Bearer del usuario.

import { createClient } from '@supabase/supabase-js'

function getSupabase(authToken) {
  const url  = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  return createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: 'Bearer ' + authToken } },
  })
}

// ── IA: resume un análisis médico con Groq (primary) o Gemini (fallback) ──
async function summarizeWithAI(rawText) {
  const groqKey = process.env.GROQ_API_KEY
  const geminiKey = process.env.GEMINI_API_KEY
  const prompt = `Eres un asistente de salud (no médico). Resume estos resultados de análisis clínicos de forma clara y motivadora para una persona sin formación médica. Estructura:
1. Resumen general (1-2 frases).
2. Valores que están BIEN.
3. Valores a VIGILAR o fuera de rango (con el valor y rango ideal).
4. 2-3 recomendaciones prácticas (hábitos, alimentación, ejercicio).
Sé breve, claro y en español. NO diagnostiques ni recetes. Recuerda al final consultar a su médico.

RESULTADOS:
${rawText.slice(0, 6000)}`

  // Groq
  if (groqKey) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + groqKey },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.4, max_tokens: 900,
        }),
        signal: AbortSignal.timeout(30000),
      })
      if (r.ok) {
        const j = await r.json()
        const txt = j.choices?.[0]?.message?.content
        if (txt) return { ok: true, summary: txt, provider: 'groq' }
      }
    } catch (e) { console.warn('[health ai] groq', e.message) }
  }

  // Gemini fallback
  if (geminiKey) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(30000),
      })
      if (r.ok) {
        const j = await r.json()
        const txt = j.candidates?.[0]?.content?.parts?.[0]?.text
        if (txt) return { ok: true, summary: txt, provider: 'gemini' }
      }
    } catch (e) { console.warn('[health ai] gemini', e.message) }
  }

  return { ok: false, error: 'Sin proveedor de IA disponible (configura GROQ_API_KEY o GEMINI_API_KEY).' }
}

// ── Cálculo de rachas a partir de health_logs ──
function computeStreaks(logs, goals) {
  // logs: [{ goal_kind, log_date, value }]
  // Para cada meta, racha = días consecutivos (hasta hoy) donde value >= target.
  const byKind = {}
  for (const g of goals) byKind[g.kind] = { target: Number(g.target || 0), days: new Set(), label: g.label, emoji: g.emoji }
  for (const l of logs) {
    const g = byKind[l.goal_kind]
    if (!g) continue
    if (Number(l.value) >= g.target && g.target > 0) g.days.add(l.log_date)
  }
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const result = {}
  for (const [kind, g] of Object.entries(byKind)) {
    // Racha actual: cuenta hacia atrás desde hoy
    let streak = 0
    let cursor = new Date(today)
    while (g.days.has(cursor.toISOString().slice(0, 10))) {
      streak++
      cursor.setDate(cursor.getDate() - 1)
    }
    // Récord: corrida más larga
    const sorted = [...g.days].sort()
    let record = 0, run = 0, prev = null
    for (const d of sorted) {
      if (prev) {
        const diff = (new Date(d) - new Date(prev)) / 86400000
        run = diff === 1 ? run + 1 : 1
      } else run = 1
      record = Math.max(record, run)
      prev = d
    }
    result[kind] = { current: streak, record: Math.max(record, streak), label: g.label, emoji: g.emoji }
  }
  return result
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { action } = req.body || {}
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return res.status(401).json({ error: 'Sin token' })
    const sb = getSupabase(token)
    const { data: { user }, error: uErr } = await sb.auth.getUser()
    if (uErr || !user) return res.status(401).json({ error: 'Token inválido' })
    const userId = user.id

    // ── DASHBOARD: todo lo necesario para pintar el módulo ──
    if (action === 'health_dashboard') {
      const today = new Date().toISOString().slice(0, 10)
      const weekAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
      const [goalsR, logsR, studiesR, readingsR] = await Promise.all([
        sb.from('health_goals').select('*').eq('owner_id', userId).eq('is_active', true).order('created_at'),
        sb.from('health_logs').select('*').eq('owner_id', userId).gte('log_date', weekAgo),
        sb.from('health_studies').select('*').eq('owner_id', userId).order('study_date', { ascending: false }).limit(20),
        sb.from('health_readings').select('*').eq('owner_id', userId).order('measured_at', { ascending: false }).limit(200),
      ])
      const goals = goalsR.data || []
      const logs  = logsR.data || []
      const studies = studiesR.data || []
      const readings = readingsR.data || []

      // Progreso de hoy por meta
      const todayLogs = {}
      for (const l of logs) if (l.log_date === today) todayLogs[l.goal_kind] = Number(l.value)

      // Tendencias: agrupa lecturas por marker
      const trends = {}
      for (const r of readings) {
        if (!trends[r.marker]) trends[r.marker] = []
        trends[r.marker].push({ value: Number(r.value), unit: r.unit, date: r.measured_at, ref_low: r.ref_low, ref_high: r.ref_high })
      }
      // Ordena cada marker por fecha ascendente para graficar
      for (const k of Object.keys(trends)) trends[k].reverse()

      // Próximo análisis (el más cercano en el futuro)
      const nextCheckups = studies
        .filter(s => s.next_checkup_date && s.next_checkup_date >= today)
        .sort((a, b) => a.next_checkup_date.localeCompare(b.next_checkup_date))

      const streaks = computeStreaks(logs, goals)

      return res.status(200).json({
        ok: true,
        goals, today_progress: todayLogs,
        studies, trends, streaks,
        next_checkup: nextCheckups[0] || null,
        today,
      })
    }

    // ── METAS ──
    if (action === 'health_goal_add') {
      const { kind, label, target, unit, emoji } = req.body
      if (!kind || !label) return res.status(400).json({ error: 'kind + label requeridos' })
      const { data, error } = await sb.from('health_goals').insert({
        owner_id: userId, kind, label, target: Number(target || 0), unit: unit || null, emoji: emoji || '🎯',
      }).select().single()
      if (error) throw error
      return res.status(200).json({ ok: true, goal: data })
    }
    if (action === 'health_goal_delete') {
      const { id } = req.body
      const { error } = await sb.from('health_goals').delete().eq('id', id).eq('owner_id', userId)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }
    if (action === 'health_goal_seed') {
      const { data: existing } = await sb.from('health_goals').select('id').eq('owner_id', userId).limit(1)
      if (existing?.length) return res.status(200).json({ ok: true, seeded: false })
      const seeds = [
        { kind: 'water',    label: 'Agua',     target: 8,     unit: 'vasos', emoji: '💧' },
        { kind: 'steps',    label: 'Pasos',    target: 8000,  unit: 'pasos', emoji: '👟' },
        { kind: 'exercise', label: 'Ejercicio',target: 30,    unit: 'min',   emoji: '🏃' },
        { kind: 'no_sugar', label: 'Sin azúcar', target: 1,   unit: 'día',   emoji: '🚫🍬' },
      ]
      await sb.from('health_goals').insert(seeds.map(s => ({ ...s, owner_id: userId })))
      return res.status(200).json({ ok: true, seeded: true })
    }

    // ── REGISTRO DIARIO (log) ──
    if (action === 'health_log_set') {
      const { goal_kind, value, log_date } = req.body
      if (!goal_kind) return res.status(400).json({ error: 'goal_kind requerido' })
      const date = log_date || new Date().toISOString().slice(0, 10)
      const { data, error } = await sb.from('health_logs').upsert({
        owner_id: userId, goal_kind, log_date: date, value: Number(value || 0), updated_at: new Date().toISOString(),
      }, { onConflict: 'owner_id,goal_kind,log_date' }).select().single()
      if (error) throw error
      return res.status(200).json({ ok: true, log: data })
    }

    // ── ESTUDIOS ──
    if (action === 'health_study_add') {
      const { title, study_date, file_url, notes, next_checkup_date } = req.body
      if (!title) return res.status(400).json({ error: 'title requerido' })
      const { data, error } = await sb.from('health_studies').insert({
        owner_id: userId, title, study_date: study_date || null,
        file_url: file_url || null, notes: notes || null,
        next_checkup_date: next_checkup_date || null,
      }).select().single()
      if (error) throw error
      return res.status(200).json({ ok: true, study: data })
    }
    if (action === 'health_study_delete') {
      const { id } = req.body
      const { error } = await sb.from('health_studies').delete().eq('id', id).eq('owner_id', userId)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    // ── LECTURAS (valores para tendencias) ──
    if (action === 'health_reading_add') {
      const { study_id, marker, value, unit, ref_low, ref_high, measured_at } = req.body
      if (!marker || value == null) return res.status(400).json({ error: 'marker + value requeridos' })
      const { data, error } = await sb.from('health_readings').insert({
        owner_id: userId, study_id: study_id || null, marker,
        value: Number(value), unit: unit || null,
        ref_low: ref_low != null ? Number(ref_low) : null,
        ref_high: ref_high != null ? Number(ref_high) : null,
        measured_at: measured_at || new Date().toISOString().slice(0, 10),
      }).select().single()
      if (error) throw error
      return res.status(200).json({ ok: true, reading: data })
    }
    if (action === 'health_reading_delete') {
      const { id } = req.body
      const { error } = await sb.from('health_readings').delete().eq('id', id).eq('owner_id', userId)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    // ── IA: resumen de análisis ──
    if (action === 'health_ai_summary') {
      const { raw_text, study_id } = req.body
      if (!raw_text || raw_text.trim().length < 20) return res.status(400).json({ error: 'Pega el texto de tu análisis (mínimo 20 caracteres).' })
      const r = await summarizeWithAI(raw_text)
      if (!r.ok) return res.status(503).json(r)
      // Si viene study_id, guarda el resumen
      if (study_id) {
        await sb.from('health_studies').update({ ai_summary: r.summary }).eq('id', study_id).eq('owner_id', userId)
      }
      return res.status(200).json({ ok: true, summary: r.summary, provider: r.provider })
    }

    return res.status(400).json({ error: 'acción desconocida: ' + action })
  } catch (e) {
    console.error('[api/health]', e)
    return res.status(500).json({ error: e.message || 'error interno' })
  }
}
