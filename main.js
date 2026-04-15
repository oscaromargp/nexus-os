import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────
// Supabase client
// ─────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─────────────────────────────────────────
// Session guard — redirect if already logged in
// ─────────────────────────────────────────
;(async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) window.location.href = '/app.html'
})()

// ─────────────────────────────────────────
// Auth message helper
// ─────────────────────────────────────────
const authMessage = document.getElementById('auth-message')

function showMessage(text, isError = false) {
  authMessage.textContent = text
  authMessage.className   = isError ? 'error' : 'success'
  authMessage.style.display = 'block'
}
function clearMessage() {
  authMessage.style.display = 'none'
  authMessage.textContent   = ''
  authMessage.className     = ''
}

// ─────────────────────────────────────────
// Tab switching (used internally)
// ─────────────────────────────────────────
const formLogin = document.getElementById('form-login')
const formReg   = document.getElementById('form-register')

function switchTab(tab) {
  clearMessage()
  if (tab === 'login') {
    document.getElementById('tab-login').classList.add('active')
    document.getElementById('tab-register').classList.remove('active')
    formLogin.classList.remove('hidden')
    formLogin.style.display = ''
    formReg.classList.add('hidden')
    formReg.style.display = 'none'
  } else {
    document.getElementById('tab-register').classList.add('active')
    document.getElementById('tab-login').classList.remove('active')
    formReg.classList.remove('hidden')
    formReg.style.display = ''
    formLogin.classList.add('hidden')
    formLogin.style.display = 'none'
  }
}

// Override the inline tab listeners with Supabase-aware ones
document.getElementById('tab-login')?.addEventListener('click', () => switchTab('login'))
document.getElementById('tab-register')?.addEventListener('click', () => switchTab('register'))

// ─────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────
formLogin?.addEventListener('submit', async (e) => {
  e.preventDefault()
  const email    = document.getElementById('login-email').value.trim()
  const password = document.getElementById('login-password').value

  showMessage('Autenticando...')

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    showMessage(error.message || 'Error al iniciar sesión', true)
    return
  }

  showMessage('¡Bienvenido al Nexus! Redirigiendo...')
  setTimeout(() => { window.location.href = '/app.html' }, 800)
})

// ─────────────────────────────────────────
// REGISTRO
// ─────────────────────────────────────────
formReg?.addEventListener('submit', async (e) => {
  e.preventDefault()
  const email    = document.getElementById('reg-email').value.trim()
  const password = document.getElementById('reg-password').value

  showMessage('Creando cuenta...')

  const { error } = await supabase.auth.signUp({ email, password })

  if (error) {
    showMessage(error.message || 'Error al registrarse', true)
    return
  }

  showMessage('¡Cuenta creada! Revisa tu email para confirmar.')
})
