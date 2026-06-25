// POST /api/health { action, ... }
//
// Módulo Salud — estudios médicos, lecturas/tendencias, metas diarias,
// registro de hábitos con rachas, y resumen IA de análisis.
//
// Auth: JWT Bearer del usuario.

import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { cyclePrediction, epley1RM } from '../src/health-calc.js'

// Firma/verifica un enlace de confirmación de toma (botones de Telegram sin
// necesidad de tocar el bot). HMAC-SHA256 con NEXUS_WEBHOOK_SECRET.
function medSign(payloadObj) {
  const data = Buffer.from(JSON.stringify(payloadObj)).toString('base64url')
  const sig = crypto.createHmac('sha256', process.env.NEXUS_WEBHOOK_SECRET || '').update(data).digest('base64url')
  return data + '.' + sig
}
function medVerify(token) {
  const [data, sig] = String(token || '').split('.')
  if (!data || !sig) return null
  const expect = crypto.createHmac('sha256', process.env.NEXUS_WEBHOOK_SECRET || '').update(data).digest('base64url')
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null
  try { return JSON.parse(Buffer.from(data, 'base64url').toString()) } catch { return null }
}
function medConfirmPage(emoji, msg) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nexus OS · Salud</title></head><body style="font-family:system-ui,-apple-system,sans-serif;background:#0f1419;color:#e5e7eb;display:grid;place-items:center;min-height:100vh;margin:0"><div style="text-align:center;padding:24px"><div style="font-size:56px">${emoji}</div><div style="font-size:18px;margin-top:14px;font-weight:700">${msg}</div><div style="font-size:13px;color:#94a3b8;margin-top:10px">Nexus OS · Salud · ya puedes cerrar esta ventana</div></div></body></html>`
}

function getSupabase(authToken) {
  const url  = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  return createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: 'Bearer ' + authToken } },
  })
}

// Cliente admin (service-role, bypassa RLS) — sólo para acciones de servicio
// autenticadas con NEXUS_WEBHOOK_SECRET (cron de Meds + callback de Telegram).
function getAdminSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.NEXUS_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY
  return createClient(url, key, { auth: { persistSession: false } })
}

// Dosis "vencidas" de hoy aún sin registrar (para el recordatorio de Telegram).
async function medDueForUser(admin, userId, nowHHMM) {
  const today = new Date().toISOString().slice(0, 10)
  const dow = new Date().getDay()
  const [medsR, logsR] = await Promise.all([
    admin.from('health_medications').select('*').eq('owner_id', userId).eq('active', true).eq('notify_telegram', true),
    admin.from('health_medication_logs').select('medication_id,scheduled_time,status').eq('owner_id', userId).eq('scheduled_for', today),
  ])
  const logged = new Set((logsR.data || []).filter(l => l.status !== 'pendiente').map(l => l.medication_id + '|' + (l.scheduled_time || '')))
  const due = []
  for (const m of (medsR.data || [])) {
    if (m.frequency === 'prn') continue
    if (m.frequency === 'dias' && !(m.days_of_week || []).includes(dow)) continue
    for (const t of (m.schedule_times && m.schedule_times.length ? m.schedule_times : [''])) {
      if (t && nowHHMM && t > nowHHMM) continue   // aún no es su hora
      if (logged.has(m.id + '|' + (t || ''))) continue
      due.push({ medication_id: m.id, name: m.name, kind: m.kind, dose: m.dose, purpose: m.purpose, time: t || null, scheduled_for: today })
    }
  }
  return due
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

// ── IA Visión: extrae valores de la FOTO de un estudio (Gemini 2.0 Flash) ──
async function extractLabsFromImage(base64, mimeType) {
  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) return { ok: false, error: 'GEMINI_API_KEY no configurada' }

  const prompt = `Eres un asistente que LEE un estudio de laboratorio clínico desde una imagen y extrae sus valores.
Devuelve EXCLUSIVAMENTE un array JSON (sin texto extra, sin fences). Cada elemento:
{
  "marker": "nombre del análisis en español (ej: Glucosa en ayunas, Colesterol total, Presión arterial, Hemoglobina)",
  "value": número,
  "value2": número o null,   // SOLO para presión arterial (ej 120/80 → value=120, value2=80). Si no aplica, null.
  "unit": "unidad tal como aparece (mg/dL, %, U/L...) o cadena vacía",
  "ref_low": número o null,  // límite inferior del rango de referencia si aparece
  "ref_high": número o null  // límite superior del rango de referencia si aparece
}
Reglas:
- NO inventes valores. Solo extrae lo que se vea claramente en la imagen.
- Si un valor no es legible, omítelo.
- Convierte comas decimales a punto (0,95 → 0.95).
- Si la imagen NO es un estudio o no hay valores, devuelve [].`

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType || 'image/jpeg', data: base64 } },
        ] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.1, maxOutputTokens: 2048 },
      }),
      signal: AbortSignal.timeout(45000),
    })
    if (!r.ok) {
      const t = await r.text()
      return { ok: false, error: 'Gemini ' + r.status + ': ' + t.slice(0, 200) }
    }
    const j = await r.json()
    let raw = j.candidates?.[0]?.content?.parts?.[0]?.text || '[]'
    let arr
    try { arr = JSON.parse(raw) }
    catch {
      const m = raw.match(/\[[\s\S]*\]/)
      arr = m ? JSON.parse(m[0]) : []
    }
    if (!Array.isArray(arr)) arr = []
    // Normaliza y limpia
    const clean = arr
      .filter(x => x && x.marker && x.value != null && x.value !== '')
      .slice(0, 60)
      .map(x => ({
        marker: String(x.marker).slice(0, 120),
        value: Number(String(x.value).replace(',', '.')),
        value2: x.value2 != null && x.value2 !== '' ? Number(String(x.value2).replace(',', '.')) : null,
        unit: x.unit ? String(x.unit).slice(0, 20) : '',
        ref_low: x.ref_low != null && x.ref_low !== '' ? Number(String(x.ref_low).replace(',', '.')) : null,
        ref_high: x.ref_high != null && x.ref_high !== '' ? Number(String(x.ref_high).replace(',', '.')) : null,
      }))
      .filter(x => !isNaN(x.value))
    return { ok: true, readings: clean }
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'La imagen tardó demasiado. Intenta con una foto más pequeña.' : e.message }
  }
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

// La extracción por foto (Gemini visión) puede tardar; pedimos margen a Vercel.
export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  // GET ?mc=<token> → confirmación de toma desde el enlace de Telegram (sin bot)
  if (req.method === 'GET' && req.query?.mc) {
    const sendHtml = (code, emoji, msg) => {
      res.status(code); res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(medConfirmPage(emoji, msg))
    }
    const p = medVerify(req.query.mc)
    if (!p || !p.u || !p.m) return sendHtml(400, '⚠️', 'Enlace inválido o alterado')
    try {
      const admin = getAdminSupabase()
      await admin.from('health_medication_logs').upsert({
        owner_id: p.u, medication_id: p.m,
        scheduled_for: p.d || new Date().toISOString().slice(0, 10),
        scheduled_time: p.t || '', status: p.s, source: 'telegram',
        taken_at: p.s === 'tomado' ? new Date().toISOString() : null,
      }, { onConflict: 'owner_id,medication_id,scheduled_for,scheduled_time' })
      return sendHtml(200, p.s === 'tomado' ? '✅' : '☑️',
        p.s === 'tomado' ? 'Registrado como TOMADO' : 'Registrado como NO tomado')
    } catch (e) {
      return sendHtml(500, '⚠️', 'No se pudo registrar: ' + (e.message || ''))
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { action } = req.body || {}

    // ── Acciones de servicio (n8n cron + callback de Telegram) — auth por secret ──
    const SERVICE_ACTIONS = new Set(['med_due', 'med_log_telegram'])
    if (SERVICE_ACTIONS.has(action)) {
      const svc = req.headers['x-nexus-service-secret']
      const SECRET = process.env.NEXUS_WEBHOOK_SECRET
      if (!svc || !SECRET || svc !== SECRET) return res.status(401).json({ error: 'service secret inválido' })
      const admin = getAdminSupabase()
      const uid = req.body?.user_id
      if (!uid) return res.status(400).json({ error: 'user_id requerido' })

      if (action === 'med_due') {
        const due = await medDueForUser(admin, uid, req.body?.now || null)
        const base = process.env.NEXUS_API_BASE || ('https://' + (req.headers['x-forwarded-host'] || req.headers.host))
        const withLinks = due.map(d => ({
          ...d,
          confirm: {
            taken: base + '/api/health?mc=' + medSign({ u: uid, m: d.medication_id, t: d.time || '', s: 'tomado', d: d.scheduled_for }),
            skip:  base + '/api/health?mc=' + medSign({ u: uid, m: d.medication_id, t: d.time || '', s: 'no_tomado', d: d.scheduled_for }),
          },
        }))
        return res.status(200).json({ ok: true, due: withLinks, count: withLinks.length })
      }
      if (action === 'med_log_telegram') {
        const { medication_id, scheduled_for, scheduled_time, status, dose_taken } = req.body
        if (!medication_id || !status) return res.status(400).json({ error: 'medication_id + status requeridos' })
        const row = {
          owner_id: uid, medication_id,
          scheduled_for: scheduled_for || new Date().toISOString().slice(0, 10),
          scheduled_time: scheduled_time || '',
          status, dose_taken: dose_taken || null, source: 'telegram',
          taken_at: status === 'tomado' ? new Date().toISOString() : null,
        }
        const { data, error } = await admin.from('health_medication_logs')
          .upsert(row, { onConflict: 'owner_id,medication_id,scheduled_for,scheduled_time' }).select().single()
        if (error) return res.status(500).json({ error: error.message })
        return res.status(200).json({ ok: true, log: data })
      }
    }

    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return res.status(401).json({ error: 'Sin token' })
    const sb = getSupabase(token)
    const { data: { user }, error: uErr } = await sb.auth.getUser()
    if (uErr || !user) return res.status(401).json({ error: 'Token inválido' })
    const userId = user.id

    // ── DASHBOARD: todo lo necesario para pintar el módulo ──
    if (action === 'health_dashboard') {
      const today = new Date().toISOString().slice(0, 10)
      // 120 días: alimenta rachas + heatmap de constancia (16 semanas)
      const weekAgo = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10)
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
      const trendMeta = {}   // marker → { category, unit } (último conocido)
      for (const r of readings) {
        if (!trends[r.marker]) trends[r.marker] = []
        trends[r.marker].push({
          value: Number(r.value),
          value2: r.value2 != null ? Number(r.value2) : null,
          unit: r.unit, date: r.measured_at,
          ref_low: r.ref_low, ref_high: r.ref_high,
          category: r.category || null, source: r.source || 'manual',
        })
        if (!trendMeta[r.marker]) trendMeta[r.marker] = { category: r.category || null, unit: r.unit || null }
      }
      // Ordena cada marker por fecha ascendente para graficar
      for (const k of Object.keys(trends)) trends[k].reverse()

      // Próximo análisis (el más cercano en el futuro)
      const nextCheckups = studies
        .filter(s => s.next_checkup_date && s.next_checkup_date >= today)
        .sort((a, b) => a.next_checkup_date.localeCompare(b.next_checkup_date))

      const streaks = computeStreaks(logs, goals)

      // Logs compactos (120d) para el heatmap de constancia
      const logsLite = logs.map(l => ({ k: l.goal_kind, d: l.log_date, v: Number(l.value) }))

      return res.status(200).json({
        ok: true,
        goals, today_progress: todayLogs, logs: logsLite,
        studies, trends, trend_meta: trendMeta, streaks,
        next_checkup: nextCheckups[0] || null,
        today,
      })
    }

    // ── OVERVIEW: resumen de todas las áreas para el dashboard de inicio ──
    if (action === 'health_overview') {
      const today = new Date().toISOString().slice(0, 10)
      const since7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
      const since40 = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10)
      const [goalsR, logsR, readingsR, workoutsR, setsR, cyclesR, medsR, medLogsR] = await Promise.all([
        sb.from('health_goals').select('*').eq('owner_id', userId).eq('is_active', true),
        sb.from('health_logs').select('goal_kind,value,log_date').eq('owner_id', userId).gte('log_date', since40),
        sb.from('health_readings').select('marker,value,value2,unit,ref_low,ref_high,measured_at').eq('owner_id', userId).order('measured_at', { ascending: false }).limit(200),
        sb.from('health_workouts').select('id').eq('owner_id', userId).gte('workout_date', since7),
        sb.from('health_workout_sets').select('exercise,weight').eq('owner_id', userId).not('weight', 'is', null).order('weight', { ascending: false }).limit(1),
        sb.from('health_cycles').select('*').eq('owner_id', userId).order('start_date', { ascending: false }).limit(24),
        sb.from('health_medications').select('*').eq('owner_id', userId).eq('active', true),
        sb.from('health_medication_logs').select('medication_id,scheduled_time,status').eq('owner_id', userId).eq('scheduled_for', today),
      ])
      const goals = goalsR.data || [], logs = logsR.data || []
      const todayDone = goals.filter(g => {
        const l = logs.find(x => x.goal_kind === g.kind && x.log_date === today)
        const t = Number(g.target || 1)
        return l && t > 0 && Number(l.value) >= t
      }).length
      const streaks = computeStreaks(logs, goals)
      const bestStreak = Math.max(0, ...Object.values(streaks).map(s => s.current))
      // Última lectura por marcador
      const latest = {}
      for (const r of (readingsR.data || [])) if (!latest[r.marker]) latest[r.marker] = r
      const vital = name => {
        const r = latest[name]; if (!r) return null
        const inR = (r.ref_low == null || r.value >= r.ref_low) && (r.ref_high == null || r.value <= r.ref_high)
        return { value: r.value, value2: r.value2, unit: r.unit, date: r.measured_at, in_range: inR }
      }
      const topSet = (setsR.data || [])[0] || null
      const { prediction } = cyclePrediction(cyclesR.data)
      // Meds de hoy: cuántas dosis programadas y cuántas tomadas
      const dowO = new Date().getDay()
      const medLogs = medLogsR.data || []
      const takenKeys = new Set(medLogs.filter(l => l.status === 'tomado').map(l => l.medication_id + '|' + (l.scheduled_time || '')))
      let medsDue = 0, medsTaken = 0
      for (const m of (medsR.data || [])) {
        if (m.frequency === 'prn') continue
        if (m.frequency === 'dias' && !(m.days_of_week || []).includes(dowO)) continue
        const times = (m.schedule_times && m.schedule_times.length) ? m.schedule_times : ['']
        for (const t of times) { medsDue++; if (takenKeys.has(m.id + '|' + (t || ''))) medsTaken++ }
      }
      return res.status(200).json({
        ok: true, today,
        vitals: {
          presion: vital('Presión arterial'), peso: vital('Peso'),
          glucosa: vital('Glucosa en ayunas') || vital('Glucosa capilar'),
          count: Object.keys(latest).length,
        },
        habits: { done: todayDone, total: goals.length, best_streak: bestStreak },
        gym: { workouts_7d: (workoutsR.data || []).length, top: topSet ? { exercise: topSet.exercise, weight: topSet.weight } : null },
        cycle: prediction, has_cycle: (cyclesR.data || []).length > 0,
        meds: { due: medsDue, taken: medsTaken, total: (medsR.data || []).length },
      })
    }

    // ── METAS ──
    if (action === 'health_goal_add') {
      const { kind, label, target, unit, emoji, target_type } = req.body
      if (!kind || !label) return res.status(400).json({ error: 'kind + label requeridos' })
      const tt = ['binary', 'count', 'time'].includes(target_type) ? target_type : 'count'
      const { data, error } = await sb.from('health_goals').insert({
        owner_id: userId, kind, label,
        target: tt === 'binary' ? 1 : Number(target || 0),
        unit: tt === 'binary' ? 'sí' : (unit || null),
        emoji: emoji || '🎯', target_type: tt,
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
      const { study_id, marker, value, value2, unit, ref_low, ref_high, measured_at, category, source } = req.body
      if (!marker || value == null) return res.status(400).json({ error: 'marker + value requeridos' })
      const { data, error } = await sb.from('health_readings').insert({
        owner_id: userId, study_id: study_id || null, marker,
        value: Number(value),
        value2: value2 != null && value2 !== '' ? Number(value2) : null,
        unit: unit || null,
        category: category || null,
        source: source || 'manual',
        ref_low: ref_low != null && ref_low !== '' ? Number(ref_low) : null,
        ref_high: ref_high != null && ref_high !== '' ? Number(ref_high) : null,
        measured_at: measured_at || new Date().toISOString().slice(0, 10),
      }).select().single()
      if (error) throw error
      return res.status(200).json({ ok: true, reading: data })
    }
    // ── LECTURAS EN LOTE (confirmación de la foto→IA) ──
    if (action === 'health_readings_bulk') {
      const { readings, study_id, measured_at, source } = req.body
      if (!Array.isArray(readings) || !readings.length) return res.status(400).json({ error: 'readings (array) requerido' })
      const date = measured_at || new Date().toISOString().slice(0, 10)
      const rows = readings
        .filter(r => r && r.marker && r.value != null && r.value !== '')
        .slice(0, 60)
        .map(r => ({
          owner_id: userId, study_id: study_id || null, marker: String(r.marker).slice(0, 120),
          value: Number(r.value),
          value2: r.value2 != null && r.value2 !== '' ? Number(r.value2) : null,
          unit: r.unit || null,
          category: r.category || null,
          source: source || 'photo_ai',
          ref_low: r.ref_low != null && r.ref_low !== '' ? Number(r.ref_low) : null,
          ref_high: r.ref_high != null && r.ref_high !== '' ? Number(r.ref_high) : null,
          measured_at: r.measured_at || date,
        }))
        .filter(r => !isNaN(r.value))
      if (!rows.length) return res.status(400).json({ error: 'Ninguna lectura válida' })
      const { data, error } = await sb.from('health_readings').insert(rows).select()
      if (error) throw error
      return res.status(200).json({ ok: true, inserted: data?.length || 0, readings: data })
    }
    if (action === 'health_reading_delete') {
      const { id } = req.body
      const { error } = await sb.from('health_readings').delete().eq('id', id).eq('owner_id', userId)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    // ── IA VISIÓN: extrae valores de la FOTO de un estudio ──
    if (action === 'health_extract_labs') {
      let { image_base64, mime_type } = req.body
      if (!image_base64) return res.status(400).json({ error: 'image_base64 requerido' })
      // Si viene con prefijo data:..;base64, lo quitamos
      const m = String(image_base64).match(/^data:([^;]+);base64,(.*)$/)
      if (m) { mime_type = mime_type || m[1]; image_base64 = m[2] }
      const r = await extractLabsFromImage(image_base64, mime_type)
      if (!r.ok) return res.status(502).json(r)
      return res.status(200).json({ ok: true, readings: r.readings })
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

    // ═══════════════════ MEDICAMENTOS / SUPLEMENTOS ═══════════════════
    if (action === 'med_list') {
      const today = new Date().toISOString().slice(0, 10)
      const dow = new Date().getDay()   // 0=Dom..6=Sab
      const [medsR, logsR] = await Promise.all([
        sb.from('health_medications').select('*').eq('owner_id', userId).order('created_at'),
        sb.from('health_medication_logs').select('*').eq('owner_id', userId).eq('scheduled_for', today),
      ])
      const meds = medsR.data || [], logs = logsR.data || []
      const logByKey = {}
      for (const l of logs) logByKey[l.medication_id + '|' + (l.scheduled_time || '')] = l
      const todayDoses = []
      for (const m of meds) {
        if (!m.active || m.frequency === 'prn') continue
        if (m.frequency === 'dias' && !(m.days_of_week || []).includes(dow)) continue
        const times = (m.schedule_times && m.schedule_times.length) ? m.schedule_times : ['']
        for (const t of times) {
          const log = logByKey[m.id + '|' + (t || '')]
          todayDoses.push({
            medication_id: m.id, name: m.name, kind: m.kind, dose: m.dose, purpose: m.purpose,
            time: t || null, status: log?.status || 'pendiente',
            log_id: log?.id || null, dose_taken: log?.dose_taken || null,
          })
        }
      }
      todayDoses.sort((a, b) => (a.time || '~').localeCompare(b.time || '~'))
      return res.status(200).json({ ok: true, medications: meds, today_doses: todayDoses, today })
    }
    if (action === 'med_add') {
      const { name, kind, dose, purpose, schedule_times, frequency, days_of_week, notify_telegram } = req.body
      if (!name) return res.status(400).json({ error: 'name requerido' })
      const { data, error } = await sb.from('health_medications').insert({
        owner_id: userId, name, kind: kind || 'medicamento', dose: dose || null, purpose: purpose || null,
        schedule_times: Array.isArray(schedule_times) ? schedule_times : [],
        frequency: ['diario', 'dias', 'prn'].includes(frequency) ? frequency : 'diario',
        days_of_week: Array.isArray(days_of_week) ? days_of_week : [],
        notify_telegram: notify_telegram !== false,
      }).select().single()
      if (error) throw error
      return res.status(200).json({ ok: true, medication: data })
    }
    if (action === 'med_update') {
      const { id, patch } = req.body
      if (!id || !patch) return res.status(400).json({ error: 'id + patch requeridos' })
      const allowed = ['name', 'kind', 'dose', 'purpose', 'schedule_times', 'frequency', 'days_of_week', 'active', 'notify_telegram']
      const upd = {}
      for (const k of allowed) if (k in patch) upd[k] = patch[k]
      const { data, error } = await sb.from('health_medications').update(upd).eq('id', id).eq('owner_id', userId).select().single()
      if (error) throw error
      return res.status(200).json({ ok: true, medication: data })
    }
    if (action === 'med_delete') {
      const { id } = req.body
      const { error } = await sb.from('health_medications').delete().eq('id', id).eq('owner_id', userId)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }
    if (action === 'med_log_set') {
      const { medication_id, scheduled_for, scheduled_time, status, dose_taken, notes } = req.body
      if (!medication_id || !status) return res.status(400).json({ error: 'medication_id + status requeridos' })
      const row = {
        owner_id: userId, medication_id,
        scheduled_for: scheduled_for || new Date().toISOString().slice(0, 10),
        scheduled_time: scheduled_time || '',
        status, dose_taken: dose_taken || null, notes: notes || null, source: 'app',
        taken_at: status === 'tomado' ? new Date().toISOString() : null,
      }
      const { data, error } = await sb.from('health_medication_logs')
        .upsert(row, { onConflict: 'owner_id,medication_id,scheduled_for,scheduled_time' })
        .select().single()
      if (error) throw error
      return res.status(200).json({ ok: true, log: data })
    }
    if (action === 'med_history') {
      const { medication_id, days = 30 } = req.body
      const since = new Date(Date.now() - Math.min(days, 365) * 86400000).toISOString().slice(0, 10)
      let q = sb.from('health_medication_logs')
        .select('*, med:health_medications(name,kind,dose,purpose)')
        .eq('owner_id', userId).gte('scheduled_for', since)
        .order('scheduled_for', { ascending: false }).order('scheduled_time', { ascending: false }).limit(300)
      if (medication_id) q = q.eq('medication_id', medication_id)
      const { data, error } = await q
      if (error) throw error
      return res.status(200).json({ ok: true, logs: data || [] })
    }

    // ═══════════════════════ GYM / RUTINAS ═══════════════════════
    if (action === 'gym_dashboard') {
      const [wR, sR] = await Promise.all([
        sb.from('health_workouts').select('*').eq('owner_id', userId).order('workout_date', { ascending: false }).limit(60),
        sb.from('health_workout_sets').select('*').eq('owner_id', userId).order('created_at', { ascending: false }).limit(2000),
      ])
      const workouts = wR.data || []
      const sets = sR.data || []
      const wDate = {}; for (const w of workouts) wDate[w.id] = w.workout_date
      const setsByWorkout = {}
      for (const s of sets) (setsByWorkout[s.workout_id] = setsByWorkout[s.workout_id] || []).push(s)

      // Récords (PR) y 1RM estimado (Epley) por ejercicio
      const prs = {}
      for (const s of sets) {
        if (s.weight == null || s.reps == null) continue
        const e = s.exercise
        const w = Number(s.weight), r = Number(s.reps)
        const oneRM = epley1RM(w, r)
        if (!prs[e]) prs[e] = { exercise: e, muscle: s.muscle_group || null, max_weight: 0, reps_at_max: 0, best_1rm: 0 }
        if (w > prs[e].max_weight) { prs[e].max_weight = w; prs[e].reps_at_max = r }
        if (oneRM > prs[e].best_1rm) prs[e].best_1rm = oneRM
      }
      // Volumen por músculo (últimos 30 días)
      const since30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
      const muscleVol = {}
      let sets30 = 0
      for (const s of sets) {
        const d = wDate[s.workout_id]; if (!d || d < since30) continue
        sets30++
        if (s.weight == null || s.reps == null) continue
        const mg = s.muscle_group || 'otro'
        muscleVol[mg] = (muscleVol[mg] || 0) + Number(s.weight) * Number(s.reps)
      }
      const workoutsFull = workouts.slice(0, 20).map(w => ({ ...w, sets: setsByWorkout[w.id] || [] }))
      return res.status(200).json({
        ok: true,
        workouts: workoutsFull,
        prs: Object.values(prs).sort((a, b) => b.best_1rm - a.best_1rm).slice(0, 30),
        muscle_volume: muscleVol,
        sets_30d: sets30,
        workouts_30d: workouts.filter(w => w.workout_date >= since30).length,
      })
    }
    if (action === 'gym_workout_add') {
      const { workout_date, title, notes, duration_min, sets } = req.body
      if (!Array.isArray(sets) || !sets.filter(s => s && s.exercise).length) return res.status(400).json({ error: 'Agrega al menos una serie con ejercicio' })
      const { data: w, error } = await sb.from('health_workouts').insert({
        owner_id: userId, workout_date: workout_date || new Date().toISOString().slice(0, 10),
        title: title || null, notes: notes || null,
        duration_min: duration_min ? Number(duration_min) : null,
      }).select().single()
      if (error) throw error
      const rows = sets.filter(s => s && s.exercise).slice(0, 80).map((s, i) => ({
        owner_id: userId, workout_id: w.id,
        exercise: String(s.exercise).slice(0, 120), muscle_group: s.muscle_group || null,
        weight: s.weight != null && s.weight !== '' ? Number(s.weight) : null,
        reps: s.reps != null && s.reps !== '' ? parseInt(s.reps, 10) : null,
        set_order: i,
      }))
      if (rows.length) { const { error: e2 } = await sb.from('health_workout_sets').insert(rows); if (e2) throw e2 }
      return res.status(200).json({ ok: true, workout: w, sets: rows.length })
    }
    if (action === 'gym_workout_delete') {
      const { id } = req.body
      const { error } = await sb.from('health_workouts').delete().eq('id', id).eq('owner_id', userId)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    // ═══════════════════════ CICLO MENSTRUAL ═══════════════════════
    if (action === 'cycle_dashboard') {
      const { data: cycles } = await sb.from('health_cycles').select('*').eq('owner_id', userId).order('start_date', { ascending: false }).limit(24)
      const { prediction, avg_cycle, avg_period } = cyclePrediction(cycles)
      return res.status(200).json({ ok: true, cycles: cycles || [], prediction, avg_cycle, avg_period })
    }
    if (action === 'cycle_add') {
      const { start_date, end_date, flow, symptoms, notes } = req.body
      if (!start_date) return res.status(400).json({ error: 'start_date requerido' })
      const { data, error } = await sb.from('health_cycles').insert({
        owner_id: userId, start_date, end_date: end_date || null,
        flow: flow || null, symptoms: Array.isArray(symptoms) ? symptoms : [], notes: notes || null,
      }).select().single()
      if (error) throw error
      return res.status(200).json({ ok: true, cycle: data })
    }
    if (action === 'cycle_delete') {
      const { id } = req.body
      const { error } = await sb.from('health_cycles').delete().eq('id', id).eq('owner_id', userId)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: 'acción desconocida: ' + action })
  } catch (e) {
    console.error('[api/health]', e)
    return res.status(500).json({ error: e.message || 'error interno' })
  }
}
