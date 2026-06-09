// Nexus OS — Drive backup completo
// Crea snapshot del workspace en Google Drive del usuario.
//
// Estructura en Drive:
//   Nexus OS /
//     ├─ Backups /
//     │   ├─ 2026-01-15_0300 /
//     │   │   ├─ manifest.json
//     │   │   ├─ properties.json
//     │   │   ├─ nodes.json
//     │   │   ├─ property_reports.json
//     │   │   ├─ property_links.json
//     │   │   ├─ property_documents.json
//     │   │   └─ property_leads.json
//     │   └─ ...
//     └─ Inmuebles /  (fotos suben aquí por separado, no en backup)

import { supabase } from './supabase.js'
import { ensureNexusFolder, uploadToDrive, hasDriveAccess } from './drive-storage.js'

const BACKUP_ROOT = 'Nexus OS/Backups'
const MAX_BACKUPS_KEEP = 30

async function _collectAllData() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sin sesión')

  const queries = await Promise.allSettled([
    supabase.from('nodes').select('*').eq('owner_id', user.id),
    supabase.from('properties').select('*').eq('user_id', user.id),
    supabase.from('property_links').select('*'),
    supabase.from('property_reports').select('*'),
    supabase.from('property_documents').select('*'),
    supabase.from('property_interactions').select('*'),
    supabase.from('property_leads').select('*'),
  ])
  const [nodes, properties, propLinks, propReports, propDocs, propInter, propLeads] = queries.map(q =>
    q.status === 'fulfilled' ? q.value.data : []
  )

  return {
    manifest: {
      version: '2.6.0',
      app: 'Nexus OS',
      backup_at: new Date().toISOString(),
      user: { id: user.id, email: user.email },
      counts: {
        nodes: nodes?.length || 0,
        properties: properties?.length || 0,
        property_links: propLinks?.length || 0,
        property_reports: propReports?.length || 0,
        property_documents: propDocs?.length || 0,
        property_interactions: propInter?.length || 0,
        property_leads: propLeads?.length || 0,
      },
    },
    nodes,
    properties,
    property_links: propLinks,
    property_reports: propReports,
    property_documents: propDocs,
    property_interactions: propInter,
    property_leads: propLeads,
  }
}

function _jsonBlob(obj) {
  return new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
}

function _todayFolderName() {
  const now = new Date()
  const Y = now.getFullYear()
  const M = String(now.getMonth() + 1).padStart(2, '0')
  const D = String(now.getDate()).padStart(2, '0')
  const h = String(now.getHours()).padStart(2, '0')
  const m = String(now.getMinutes()).padStart(2, '0')
  return `${Y}-${M}-${D}_${h}${m}`
}

export async function runDriveBackup({ onProgress } = {}) {
  if (!(await hasDriveAccess())) {
    throw new Error('Conecta Google Drive primero en Configuración → Conexiones')
  }

  const update = (msg) => { onProgress?.(msg); console.log('[backup]', msg) }

  update('📦 Recolectando datos…')
  const data = await _collectAllData()
  const totalRows = Object.values(data.manifest.counts).reduce((a, b) => a + b, 0)

  update(`📁 Creando carpeta en Drive…`)
  const dateStr = _todayFolderName()
  const folderId = await ensureNexusFolder(`${BACKUP_ROOT}/${dateStr}`)

  // Sube cada archivo
  const files = [
    ['manifest.json',              data.manifest],
    ['nodes.json',                 data.nodes],
    ['properties.json',            data.properties],
    ['property_links.json',        data.property_links],
    ['property_reports.json',      data.property_reports],
    ['property_documents.json',    data.property_documents],
    ['property_interactions.json', data.property_interactions],
    ['property_leads.json',        data.property_leads],
  ]

  const uploaded = []
  for (let i = 0; i < files.length; i++) {
    const [name, content] = files[i]
    update(`📤 Subiendo ${name} (${i + 1}/${files.length})…`)
    try {
      const result = await uploadToDrive(_jsonBlob(content), {
        folderId,
        name,
        makePublic: false, // backup privado
      })
      uploaded.push({ name, drive_id: result.id })
    } catch (e) {
      console.error('[backup]', name, e)
      uploaded.push({ name, error: e.message })
    }
  }

  update('🧹 Limpiando backups viejos…')
  try { await _cleanupOldBackups() } catch (e) { console.warn('[backup] cleanup', e) }

  // Registra el backup en una tabla local para historial
  try {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('backup_runs').insert({
      user_id: user.id,
      folder_name: dateStr,
      folder_drive_id: folderId,
      counts: data.manifest.counts,
      total_rows: totalRows,
      destination: 'google_drive',
    })
  } catch (e) { /* tabla puede no existir aún */ }

  try { window.nexusTrack?.('action:drive_backup', data.manifest.counts) } catch {}

  update(`✅ Backup completo: ${totalRows} filas en ${BACKUP_ROOT}/${dateStr}`)
  return {
    ok: true,
    folder: `${BACKUP_ROOT}/${dateStr}`,
    folder_drive_id: folderId,
    total_rows: totalRows,
    files_uploaded: uploaded.length,
    counts: data.manifest.counts,
  }
}

// Limpia backups más viejos que MAX_BACKUPS_KEEP
async function _cleanupOldBackups() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.provider_token) return
  // Lista las carpetas de backup
  const backupsRoot = await ensureNexusFolder(BACKUP_ROOT)
  const q = encodeURIComponent(`'${backupsRoot}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`)
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,createdTime)&pageSize=100&orderBy=createdTime desc`, {
    headers: { 'Authorization': 'Bearer ' + session.provider_token },
  })
  if (!r.ok) return
  const { files = [] } = await r.json()
  if (files.length <= MAX_BACKUPS_KEEP) return
  // Borra los excedentes (los más viejos)
  const toDelete = files.slice(MAX_BACKUPS_KEEP)
  for (const f of toDelete) {
    try {
      await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + session.provider_token },
      })
    } catch {}
  }
}

// Lista historial de backups del usuario
export async function listBackups() {
  if (!(await hasDriveAccess())) return []
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.provider_token) return []
  const backupsRoot = await ensureNexusFolder(BACKUP_ROOT)
  const q = encodeURIComponent(`'${backupsRoot}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`)
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,createdTime,webViewLink)&pageSize=50&orderBy=createdTime desc`, {
    headers: { 'Authorization': 'Bearer ' + session.provider_token },
  })
  if (!r.ok) return []
  const { files = [] } = await r.json()
  return files
}

if (typeof window !== 'undefined') {
  window.nexusDriveBackup = { run: runDriveBackup, list: listBackups }
}
