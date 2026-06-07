// Google Drive storage usando el provider_token de Supabase Auth (Google OAuth).
//
// Requisitos previos (setup):
//   1. Supabase Auth → Providers → Google habilitado con scopes:
//        https://www.googleapis.com/auth/drive.file
//        https://www.googleapis.com/auth/userinfo.email
//   2. Usuario debió hacer login con "Continuar con Google" (no email/password).
//
// Uso:
//   import { uploadToDrive, ensureNexusFolder } from './drive-storage.js'
//   const folderId = await ensureNexusFolder('Nexus OS / Inmuebles / FOLIO-001')
//   const file = await uploadToDrive(blobOrFile, { folderId, name: 'foto-01.jpg' })

import { supabase } from './supabase.js'

const DRIVE_API     = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD  = 'https://www.googleapis.com/upload/drive/v3/files'

let _cachedToken = null

async function getProviderToken() {
  if (_cachedToken) return _cachedToken
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('No hay sesión activa')
  const token = session.provider_token
  if (!token) {
    throw new Error('No tienes Google Drive conectado. Cierra sesión y entra con "Continuar con Google".')
  }
  _cachedToken = token
  return token
}

export function clearTokenCache() { _cachedToken = null }

async function driveFetch(url, options = {}) {
  const token = await getProviderToken()
  const r = await fetch(url, {
    ...options,
    headers: {
      'Authorization': 'Bearer ' + token,
      ...(options.headers || {}),
    },
  })
  if (r.status === 401 || r.status === 403) {
    _cachedToken = null
    throw new Error('Token Google expirado o sin permisos — vuelve a iniciar sesión con Google.')
  }
  if (!r.ok) {
    const txt = await r.text()
    throw new Error('Drive ' + r.status + ': ' + txt.slice(0, 200))
  }
  return r.json()
}

// Crea (o devuelve) una carpeta tipo "Nexus OS/Inmuebles/FOLIO" dentro del Drive del usuario.
// Soporta path con "/" como separador.
export async function ensureNexusFolder(path = 'Nexus OS') {
  const parts = path.split('/').map(s => s.trim()).filter(Boolean)
  let parentId = 'root'
  for (const part of parts) {
    // Buscar carpeta hija con ese nombre
    const q = encodeURIComponent(
      `name='${part.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    )
    const search = await driveFetch(`${DRIVE_API}/files?q=${q}&fields=files(id,name)&pageSize=10`)
    if (search.files && search.files.length > 0) {
      parentId = search.files[0].id
    } else {
      const created = await driveFetch(`${DRIVE_API}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: part,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentId],
        }),
      })
      parentId = created.id
    }
  }
  return parentId
}

// Sube un Blob/File a Drive y lo hace público (link "anyone con link").
// Devuelve { id, name, webViewLink, webContentLink, thumbnailLink }.
export async function uploadToDrive(blob, { folderId, name, makePublic = true } = {}) {
  const token = await getProviderToken()
  const fname = name || `archivo-${Date.now()}`
  const metadata = {
    name: fname,
    ...(folderId ? { parents: [folderId] } : {}),
  }
  const boundary = '---NX-' + Math.random().toString(36).slice(2)
  const body = new Blob([
    `--${boundary}\r\n`,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata) + '\r\n',
    `--${boundary}\r\n`,
    `Content-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`,
  ], { type: 'multipart/related; boundary=' + boundary })

  const uploadR = await fetch(
    `${DRIVE_UPLOAD}?uploadType=multipart&fields=id,name,webViewLink,webContentLink,thumbnailLink`,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'multipart/related; boundary=' + boundary,
      },
      body,
    }
  )
  if (!uploadR.ok) {
    const txt = await uploadR.text()
    throw new Error('Drive upload: ' + txt.slice(0, 200))
  }
  const file = await uploadR.json()
  if (makePublic) {
    try {
      await driveFetch(`${DRIVE_API}/files/${file.id}/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      })
      // Refrescar para obtener webViewLink/webContentLink válidos público
      const refreshed = await driveFetch(`${DRIVE_API}/files/${file.id}?fields=id,name,webViewLink,webContentLink,thumbnailLink`)
      Object.assign(file, refreshed)
    } catch (e) {
      console.warn('[drive] no se pudo hacer público:', e.message)
    }
  }
  return file
}

// Borra un archivo del Drive
export async function deleteFromDrive(fileId) {
  const token = await getProviderToken()
  const r = await fetch(`${DRIVE_API}/files/${fileId}`, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + token },
  })
  if (!r.ok && r.status !== 204) {
    const txt = await r.text()
    throw new Error('Drive delete: ' + txt.slice(0, 200))
  }
  return true
}

// Helper: convierte un webViewLink de Drive a un link directo viewable
// para inyectar en <img>. Soporta /file/d/{id}/view y /open?id=
export function driveDirectImageUrl(fileIdOrUrl) {
  let id = fileIdOrUrl
  const m = String(fileIdOrUrl).match(/\/file\/d\/([^/]+)\//) || String(fileIdOrUrl).match(/[?&]id=([^&]+)/)
  if (m) id = m[1]
  return `https://drive.google.com/thumbnail?id=${id}&sz=w2000`
}

// Estado actual: ¿el usuario tiene token Google?
export async function hasDriveAccess() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    return !!session?.provider_token
  } catch { return false }
}
