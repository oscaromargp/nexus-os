// Nexus OS — Export iCal (.ics)
// Genera archivo iCalendar estándar RFC 5545 con:
//   - Eventos de Agenda Financiera (pagos recurrentes, cobros)
//   - Eventos de Calendario (type=event en nodes)
// Importable en Apple Calendar, Outlook, Mozilla Thunderbird, etc.

import { supabase } from './supabase.js'

function _pad(n) { return String(n).padStart(2, '0') }

function _toICalDate(d) {
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return null
  return [
    dt.getUTCFullYear(),
    _pad(dt.getUTCMonth() + 1),
    _pad(dt.getUTCDate()),
    'T',
    _pad(dt.getUTCHours()),
    _pad(dt.getUTCMinutes()),
    _pad(dt.getUTCSeconds()),
    'Z',
  ].join('')
}

function _toICalDateOnly(d) {
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return null
  return [dt.getUTCFullYear(), _pad(dt.getUTCMonth() + 1), _pad(dt.getUTCDate())].join('')
}

function _escape(s) {
  return String(s ?? '').replace(/[\\;,\n]/g, m => ({ '\\': '\\\\', ';': '\\;', ',': '\\,', '\n': '\\n' }[m]))
}

function _fold(line) {
  // RFC 5545: cada línea max 75 octets, las que excedan se "doblan" con \r\n + space
  const max = 73
  if (line.length <= max) return line
  const parts = []
  for (let i = 0; i < line.length; i += max) {
    parts.push((i === 0 ? '' : ' ') + line.slice(i, i + max))
  }
  return parts.join('\r\n')
}

function _buildVevent({ uid, summary, description, dtStart, dtEnd, allDay, location, url, rrule }) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${_toICalDate(new Date())}`,
  ]
  if (allDay) {
    lines.push(`DTSTART;VALUE=DATE:${_toICalDateOnly(dtStart)}`)
    if (dtEnd) lines.push(`DTEND;VALUE=DATE:${_toICalDateOnly(dtEnd)}`)
  } else {
    lines.push(`DTSTART:${_toICalDate(dtStart)}`)
    if (dtEnd) lines.push(`DTEND:${_toICalDate(dtEnd)}`)
  }
  if (summary) lines.push(_fold(`SUMMARY:${_escape(summary)}`))
  if (description) lines.push(_fold(`DESCRIPTION:${_escape(description)}`))
  if (location) lines.push(_fold(`LOCATION:${_escape(location)}`))
  if (url) lines.push(`URL:${url}`)
  if (rrule) lines.push(`RRULE:${rrule}`)
  lines.push('END:VEVENT')
  return lines.join('\r\n')
}

export async function exportICalAgenda() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sin sesión')

  // Carga eventos: nodes type 'event' + 'bill' (cobros recurrentes)
  const { data: nodes } = await supabase
    .from('nodes')
    .select('*')
    .in('type', ['event', 'bill'])
    .eq('owner_id', user.id)
    .limit(2000)

  const events = []
  for (const n of nodes || []) {
    const m = n.metadata || {}
    const summary = m.label || m.title || n.content?.slice(0, 80) || 'Sin título'
    const description = m.notes || m.description || ''

    // Para 'event' usar startDate/endDate; para 'bill' due_date/next_due
    const start = m.startDate || m.start_date || m.dtstart || m.due_date || m.next_due || m.date
    const end   = m.endDate || m.end_date || m.dtend
    if (!start) continue

    let rrule = null
    if (m.recurrence) {
      // Mapeo simple de recurrence string a RRULE
      const r = String(m.recurrence).toLowerCase()
      if (r.includes('mensual') || r.includes('monthly')) rrule = 'FREQ=MONTHLY'
      else if (r.includes('quincenal') || r.includes('biweekly')) rrule = 'FREQ=WEEKLY;INTERVAL=2'
      else if (r.includes('semanal') || r.includes('weekly')) rrule = 'FREQ=WEEKLY'
      else if (r.includes('diari') || r.includes('daily')) rrule = 'FREQ=DAILY'
      else if (r.includes('anual') || r.includes('yearly')) rrule = 'FREQ=YEARLY'
    }

    events.push(_buildVevent({
      uid: `${n.id}@nexus-os`,
      summary: n.type === 'bill' ? '💸 ' + summary : summary,
      description: [description, m.amount ? `Monto: $${m.amount}` : null].filter(Boolean).join('\n'),
      dtStart: start,
      dtEnd: end,
      allDay: !String(start).includes('T'),
      location: m.location || null,
      url: m.url || null,
      rrule,
    }))
  }

  // También exportar inmuebles con vencimiento de exclusiva
  const { data: props } = await supabase
    .from('properties')
    .select('id,titulo,folio_interno,exclusiva_fin')
    .eq('user_id', user.id)
    .not('exclusiva_fin', 'is', null)
    .is('deleted_at', null)
  for (const p of props || []) {
    events.push(_buildVevent({
      uid: `prop-${p.id}@nexus-os`,
      summary: `🏠 Vence exclusiva: ${p.titulo || p.folio_interno}`,
      description: `Folio: ${p.folio_interno || p.id}`,
      dtStart: p.exclusiva_fin,
      allDay: true,
      url: `https://nexus-os-chi.vercel.app/propiedad?id=${p.id}`,
    }))
  }

  const ical = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nexus OS//Agenda v2.6//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Nexus OS — Agenda',
    'X-WR-TIMEZONE:America/Mazatlan',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n')

  const blob = new Blob([ical], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const fname = `nexus-agenda-${new Date().toISOString().slice(0,10)}.ics`
  const a = document.createElement('a')
  a.href = url
  a.download = fname
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)

  try { window.nexusTrack?.('action:ical_export', { events: events.length }) } catch {}
  return { ok: true, filename: fname, eventsCount: events.length }
}

if (typeof window !== 'undefined') {
  window.nexusICal = { export: exportICalAgenda }
}
