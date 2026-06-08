// Nexus OS — Backup JSON completo
// Descarga un .json con TODOS los datos del usuario actual.
// Útil para: respaldo manual, migración entre cuentas, auditoría.

import { supabase } from './supabase.js'

export async function exportFullBackup() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sin sesión')

  // Collect data en paralelo
  const queries = await Promise.allSettled([
    supabase.from('nodes').select('*').eq('owner_id', user.id),
    supabase.from('properties').select('*').eq('user_id', user.id),
    supabase.from('property_links').select('*'),
    supabase.from('property_reports').select('*'),
    supabase.from('property_documents').select('*'),
    supabase.from('property_interactions').select('*'),
  ])

  const [nodes, properties, propLinks, propReports, propDocs, propInter] = queries.map(q =>
    q.status === 'fulfilled' ? q.value.data : []
  )

  const exportData = {
    _meta: {
      version: '2.6.0',
      app: 'Nexus OS',
      exported_at: new Date().toISOString(),
      user: { id: user.id, email: user.email },
    },
    counts: {
      nodes: nodes?.length || 0,
      properties: properties?.length || 0,
      property_links: propLinks?.length || 0,
      property_reports: propReports?.length || 0,
      property_documents: propDocs?.length || 0,
      property_interactions: propInter?.length || 0,
    },
    data: {
      nodes,
      properties,
      property_links: propLinks,
      property_reports: propReports,
      property_documents: propDocs,
      property_interactions: propInter,
    },
  }

  // Build JSON file y dispara descarga
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const fname = `nexus-backup-${new Date().toISOString().slice(0,10)}.json`
  const a = document.createElement('a')
  a.href = url
  a.download = fname
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)

  try { window.nexusTrack?.('action:backup_export', exportData.counts) } catch {}

  return { ok: true, filename: fname, counts: exportData.counts }
}

if (typeof window !== 'undefined') {
  window.nexusBackup = { export: exportFullBackup }
}
