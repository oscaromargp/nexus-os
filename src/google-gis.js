// Nexus OS — Google Identity Services (GIS) para obtener access_token Drive
// directamente desde Google, sin depender del provider_token de Supabase.
//
// GIS es la API moderna recomendada por Google para client-side OAuth.
// El access_token vive ~1 hora; cuando expira, el usuario puede pedir uno
// nuevo con un click (sin volver a iniciar sesión con Google).
//
// Setup: solo necesitas el mismo Client ID que ya tienes en Vercel
// (GOOGLE_CLIENT_ID). El secret NO se usa aquí (es flujo implícito).

const TOKEN_KEY = 'nx_gis_token'
const EXPIRY_KEY = 'nx_gis_expiry'
const EMAIL_KEY = 'nx_gis_email'

let _tokenClient = null
let _clientIdCache = null
let _gisLoadPromise = null

// Carga el script de GIS solo una vez
function loadGIS() {
  if (_gisLoadPromise) return _gisLoadPromise
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  _gisLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.defer = true
    s.onload = resolve
    s.onerror = () => reject(new Error('No se pudo cargar Google Identity Services'))
    document.head.appendChild(s)
  })
  return _gisLoadPromise
}

// Obtiene el Client ID del endpoint serverless
async function getClientId() {
  if (_clientIdCache) return _clientIdCache
  try {
    const r = await fetch('/api/google-client-id')
    if (r.ok) {
      const { clientId } = await r.json()
      if (clientId) { _clientIdCache = clientId; return clientId }
    }
  } catch {}
  throw new Error('GOOGLE_CLIENT_ID no disponible en backend')
}

// Inicializa el token client (lazy)
async function initTokenClient() {
  if (_tokenClient) return _tokenClient
  await loadGIS()
  const clientId = await getClientId()
  _tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
    callback: () => {}, // se reemplaza en cada requestToken()
  })
  return _tokenClient
}

// Persistencia
function saveToken(token, expiresIn = 3600, email = null) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(EXPIRY_KEY, String(Date.now() + expiresIn * 1000))
    if (email) localStorage.setItem(EMAIL_KEY, email)
  } catch {}
}

export function readToken() {
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    const expiry = parseInt(localStorage.getItem(EXPIRY_KEY) || '0', 10)
    if (!token) return null
    if (expiry && Date.now() > expiry - 60000) return null
    return token
  } catch { return null }
}

export function readEmail() {
  try { return localStorage.getItem(EMAIL_KEY) } catch { return null }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EXPIRY_KEY)
    localStorage.removeItem(EMAIL_KEY)
  } catch {}
}

// Pide un access_token al usuario. Si ya autorizó antes, vuelve casi
// instantáneamente. Si necesita consent, abre el popup de Google.
export async function requestToken({ silent = false } = {}) {
  await initTokenClient()
  return new Promise((resolve, reject) => {
    _tokenClient.callback = async (resp) => {
      if (resp.error) {
        reject(new Error(resp.error_description || resp.error))
        return
      }
      const token = resp.access_token
      const expiresIn = resp.expires_in || 3600

      // Obtener email del user (para mostrar en UI)
      let email = null
      try {
        const userR = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { 'Authorization': 'Bearer ' + token },
        })
        if (userR.ok) {
          const u = await userR.json()
          email = u.email
        }
      } catch {}

      saveToken(token, expiresIn, email)
      resolve({ token, email, expires_in: expiresIn })
    }
    try {
      _tokenClient.requestAccessToken({ prompt: silent ? '' : 'consent' })
    } catch (e) {
      reject(e)
    }
  })
}

// Helper de alto nivel: ¿el usuario tiene token GIS válido?
export function hasToken() {
  return !!readToken()
}

// Helper: fetch a Google API con el token actual
export async function gFetch(url, options = {}) {
  const token = readToken()
  if (!token) throw new Error('No hay token Google. Conecta en Configuración.')
  const r = await fetch(url, {
    ...options,
    headers: {
      'Authorization': 'Bearer ' + token,
      ...(options.headers || {}),
    },
  })
  if (r.status === 401) {
    clearToken()
    throw new Error('Token expirado. Reautoriza en Configuración → Conexiones.')
  }
  return r
}

if (typeof window !== 'undefined') {
  window.nexusGIS = {
    request: requestToken,
    read: readToken,
    email: readEmail,
    clear: clearToken,
    has: hasToken,
    fetch: gFetch,
  }
}
