import { createClient } from '@supabase/supabase-js'

// ──────────────────────────────────────────────
// Supabase client
// ──────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ──────────────────────────────────────────────
// Si ya hay sesión activa → redirigir al dashboard
// ──────────────────────────────────────────────
;(async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    window.location.href = '/app.html'
  }
})()

// ──────────────────────────────────────────────
// Demo animado en el hero
// ──────────────────────────────────────────────
const demoLines = [
  { text: '#tarea Revisar el PRD de Nexus',    result: '→ Nodo [kanban] creado' },
  { text: '-$500 Renta oficina',               result: '→ Nodo [expense] $500 registrado' },
  { text: '+$1500 Proyecto freelance',          result: '→ Nodo [income] $1500 registrado' },
  { text: 'Idea: integrar API de OpenAI',       result: '→ Nodo [note] guardado' },
]

let demoIndex = 0
let charIndex  = 0
const demoTextEl   = document.getElementById('demo-text')
const demoResultEl = document.getElementById('demo-result')

function typeLine() {
  const line = demoLines[demoIndex]
  if (charIndex < line.text.length) {
    demoTextEl.textContent += line.text[charIndex]
    charIndex++
    setTimeout(typeLine, 55)
  } else {
    demoResultEl.textContent = line.result
    demoResultEl.classList.remove('hidden')
    setTimeout(() => {
      demoTextEl.textContent   = ''
      demoResultEl.classList.add('hidden')
      charIndex  = 0
      demoIndex  = (demoIndex + 1) % demoLines.length
      setTimeout(typeLine, 600)
    }, 1800)
  }
}
setTimeout(typeLine, 800)

// ──────────────────────────────────────────────
// Modal — abrir / cerrar
// ──────────────────────────────────────────────
const modal         = document.getElementById('auth-modal')
const btnShowLogin  = document.getElementById('btn-show-login')
const btnHeroReg    = document.getElementById('btn-hero-register')
const btnPricingFree= document.getElementById('btn-pricing-free')
const btnClose      = document.getElementById('btn-close-modal')

function openModal(tab = 'login') {
  modal.classList.remove('hidden')
  switchTab(tab)
}
function closeModal() {
  modal.classList.add('hidden')
  clearMessage()
}

btnShowLogin?.addEventListener('click', () => openModal('login'))
btnHeroReg?.addEventListener('click',   () => openModal('register'))
btnPricingFree?.addEventListener('click',() => openModal('register'))
btnClose?.addEventListener('click', closeModal)
modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal() })

// ──────────────────────────────────────────────
// Tabs Login / Register
// ──────────────────────────────────────────────
const tabLogin    = document.getElementById('tab-login')
const tabRegister = document.getElementById('tab-register')
const formLogin   = document.getElementById('form-login')
const formReg     = document.getElementById('form-register')

function switchTab(tab) {
  const isLogin = tab === 'login'
  tabLogin.classList.toggle('text-cyan-neon',   isLogin)
  tabLogin.classList.toggle('border-b-2',       isLogin)
  tabLogin.classList.toggle('border-cyan-neon', isLogin)
  tabLogin.classList.toggle('text-cyan-muted',  !isLogin)

  tabRegister.classList.toggle('text-cyan-neon',   !isLogin)
  tabRegister.classList.toggle('border-b-2',       !isLogin)
  tabRegister.classList.toggle('border-cyan-neon', !isLogin)
  tabRegister.classList.toggle('text-cyan-muted',  isLogin)

  formLogin.classList.toggle('hidden', !isLogin)
  formReg.classList.toggle('hidden',    isLogin)
  clearMessage()
}

tabLogin?.addEventListener('click',    () => switchTab('login'))
tabRegister?.addEventListener('click', () => switchTab('register'))

// ──────────────────────────────────────────────
// Mensajes de estado
// ──────────────────────────────────────────────
const authMessage = document.getElementById('auth-message')

function showMessage(text, isError = false) {
  authMessage.textContent = text
  authMessage.className   = `mt-4 text-xs text-center ${isError ? 'text-red-400' : 'text-cyan-neon'}`
  authMessage.classList.remove('hidden')
}
function clearMessage() {
  authMessage.classList.add('hidden')
  authMessage.textContent = ''
}

// ──────────────────────────────────────────────
// LOGIN
// ──────────────────────────────────────────────
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

// ──────────────────────────────────────────────
// REGISTRO
// ──────────────────────────────────────────────
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

  showMessage('Cuenta creada. Revisa tu email para confirmar.')
})
