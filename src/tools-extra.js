// Nexus OS · Herramientas extra (S3)
// - Descuentos en cadena
// - Conversor de unidades (longitud / masa / área / volumen / temperatura / tiempo)
// - Alarmas / recordatorios locales con Web Notifications

// ═══════════════════════════════════════════════════════════════════════════════
// 🏷 DESCUENTOS EN CADENA
// ═══════════════════════════════════════════════════════════════════════════════
window.addDiscRow = function() {
  const list = document.getElementById('disc-rows')
  if (!list) return
  const n = list.children.length + 1
  const row = document.createElement('div')
  row.className = 'disc-row'
  row.style.cssText = 'display:flex;gap:6px;align-items:center;'
  row.innerHTML = `
    <span style="font-size:11px;color:var(--text-muted);min-width:18px;">${n}.</span>
    <input type="number" class="modal-input disc-pct" placeholder="% descuento" oninput="calcDiscChain()" />
    <span style="font-size:13px;color:var(--text-muted);">%</span>
    <button class="disc-rm" onclick="removeDiscRow(this)" style="background:transparent;border:none;color:var(--text-dim);cursor:pointer;font-size:14px;">✕</button>
  `
  list.appendChild(row)
}

window.removeDiscRow = function(btn) {
  const row = btn.closest('.disc-row')
  if (!row) return
  const list = row.parentElement
  if (list.children.length <= 1) return   // mantener al menos 1
  row.remove()
  // Re-numerar
  Array.from(list.children).forEach((r, i) => {
    const lbl = r.querySelector('span')
    if (lbl) lbl.textContent = (i + 1) + '.'
  })
  calcDiscChain()
}

window.calcDiscChain = function() {
  const priceEl = document.getElementById('disc-price')
  const resultEl = document.getElementById('disc-result')
  if (!priceEl || !resultEl) return
  const price = parseFloat(priceEl.value)
  if (!price || price <= 0) {
    resultEl.innerHTML = '<div style="font-size:11px;color:var(--text-muted);">Ingresa un precio para calcular</div>'
    return
  }
  const pcts = Array.from(document.querySelectorAll('.disc-pct'))
    .map(i => parseFloat(i.value))
    .filter(n => !isNaN(n) && n > 0 && n < 100)
  if (!pcts.length) {
    resultEl.innerHTML = `<div style="font-size:12px;color:var(--text-muted);">Sin descuentos</div><div style="font-size:18px;font-weight:800;color:#fbbf24;margin-top:4px;">$${price.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>`
    return
  }
  let final = price
  const steps = []
  pcts.forEach((p, i) => {
    const before = final
    final = final * (1 - p / 100)
    steps.push(`<div style="font-size:10px;color:var(--text-muted);">Descuento ${i+1}: ${p}% → $${final.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>`)
  })
  const totalSaved = price - final
  const effectivePct = (totalSaved / price * 100).toFixed(2)
  const fmt = (n) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  resultEl.innerHTML = `
    ${steps.join('')}
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(251,191,36,0.2);">
      <div style="font-size:10px;color:var(--text-muted);">Precio final</div>
      <div style="font-size:22px;font-weight:800;color:#fbbf24;line-height:1.1;">${fmt(final)}</div>
      <div style="font-size:10px;color:#34d399;margin-top:4px;">Ahorras ${fmt(totalSaved)} · descuento efectivo ${effectivePct}%</div>
    </div>`
}

// ═══════════════════════════════════════════════════════════════════════════════
// 📐 CONVERSOR DE UNIDADES
// ═══════════════════════════════════════════════════════════════════════════════
const UCONV = {
  length: {
    label: 'Longitud',
    base: 'm',
    units: {
      mm: { label: 'Milímetros (mm)',     factor: 0.001 },
      cm: { label: 'Centímetros (cm)',    factor: 0.01 },
      m:  { label: 'Metros (m)',          factor: 1 },
      km: { label: 'Kilómetros (km)',     factor: 1000 },
      in: { label: 'Pulgadas (in)',       factor: 0.0254 },
      ft: { label: 'Pies (ft)',           factor: 0.3048 },
      yd: { label: 'Yardas (yd)',         factor: 0.9144 },
      mi: { label: 'Millas (mi)',         factor: 1609.344 },
      nmi:{ label: 'Millas náuticas',     factor: 1852 },
    },
  },
  mass: {
    label: 'Masa',
    base: 'g',
    units: {
      mg: { label: 'Miligramos (mg)',     factor: 0.001 },
      g:  { label: 'Gramos (g)',          factor: 1 },
      kg: { label: 'Kilogramos (kg)',     factor: 1000 },
      t:  { label: 'Toneladas (t)',       factor: 1000000 },
      oz: { label: 'Onzas (oz)',          factor: 28.3495 },
      lb: { label: 'Libras (lb)',         factor: 453.592 },
      st: { label: 'Stones (st)',         factor: 6350.29 },
    },
  },
  area: {
    label: 'Área',
    base: 'm2',
    units: {
      cm2: { label: 'cm² (centímetro²)',  factor: 0.0001 },
      m2:  { label: 'm² (metro²)',        factor: 1 },
      ha:  { label: 'Hectáreas (ha)',     factor: 10000 },
      km2: { label: 'km² (kilómetro²)',   factor: 1000000 },
      in2: { label: 'in² (pulgada²)',     factor: 0.00064516 },
      ft2: { label: 'ft² (pie²)',         factor: 0.092903 },
      yd2: { label: 'yd² (yarda²)',       factor: 0.836127 },
      acre:{ label: 'Acres',              factor: 4046.86 },
      mi2: { label: 'mi² (milla²)',       factor: 2589988.11 },
    },
  },
  volume: {
    label: 'Volumen',
    base: 'l',
    units: {
      ml: { label: 'Mililitros (ml)',     factor: 0.001 },
      l:  { label: 'Litros (l)',          factor: 1 },
      m3: { label: 'm³ (metro³)',         factor: 1000 },
      tsp:{ label: 'Cucharaditas (tsp)',  factor: 0.00492892 },
      tbsp:{label: 'Cucharadas (tbsp)',   factor: 0.0147868 },
      cup:{ label: 'Tazas (cup)',         factor: 0.236588 },
      gal:{ label: 'Galones (gal)',       factor: 3.78541 },
      ozfl:{label: 'Onzas líquidas (fl oz)', factor: 0.0295735 },
    },
  },
  temp: {
    label: 'Temperatura',
    // Temperatura no usa factor — usa converters específicos
    custom: true,
    units: {
      C: { label: 'Celsius (°C)'    },
      F: { label: 'Fahrenheit (°F)' },
      K: { label: 'Kelvin (K)'      },
    },
  },
  time: {
    label: 'Tiempo',
    base: 's',
    units: {
      ms: { label: 'Milisegundos (ms)',   factor: 0.001 },
      s:  { label: 'Segundos (s)',        factor: 1 },
      min:{ label: 'Minutos (min)',       factor: 60 },
      h:  { label: 'Horas (h)',           factor: 3600 },
      d:  { label: 'Días (d)',            factor: 86400 },
      wk: { label: 'Semanas (wk)',        factor: 604800 },
      mo: { label: 'Meses (mo)',          factor: 2629800 },     // 30.4375 días promedio
      yr: { label: 'Años (yr)',           factor: 31557600 },    // 365.25 días
    },
  },
}

function _convertTemp(val, from, to) {
  // Convertir todo a Celsius primero, luego a destino
  let c
  if (from === 'C') c = val
  else if (from === 'F') c = (val - 32) * 5 / 9
  else if (from === 'K') c = val - 273.15
  if (to === 'C') return c
  if (to === 'F') return c * 9 / 5 + 32
  if (to === 'K') return c + 273.15
  return val
}

window.uconvRebuild = function() {
  const catEl = document.getElementById('uconv-cat')
  const fromEl = document.getElementById('uconv-from')
  const toEl = document.getElementById('uconv-to')
  if (!catEl || !fromEl || !toEl) return
  const cat = UCONV[catEl.value]
  if (!cat) return
  const units = Object.entries(cat.units)
  fromEl.innerHTML = units.map(([k, u]) => `<option value="${k}">${u.label}</option>`).join('')
  toEl.innerHTML   = units.map(([k, u]) => `<option value="${k}">${u.label}</option>`).join('')
  // Default: segunda opción del lado derecho
  if (units.length > 1) toEl.selectedIndex = 1
  uconvCompute()
}

window.uconvCompute = function() {
  const catEl = document.getElementById('uconv-cat')
  const amountEl = document.getElementById('uconv-amount')
  const fromEl = document.getElementById('uconv-from')
  const toEl = document.getElementById('uconv-to')
  const resultEl = document.getElementById('uconv-result')
  if (!catEl || !amountEl || !fromEl || !toEl || !resultEl) return
  const cat = UCONV[catEl.value]
  const amount = parseFloat(amountEl.value)
  if (isNaN(amount)) { resultEl.textContent = '—'; return }
  const from = fromEl.value
  const to = toEl.value
  let result
  if (cat.custom && catEl.value === 'temp') {
    result = _convertTemp(amount, from, to)
  } else {
    const baseVal = amount * cat.units[from].factor
    result = baseVal / cat.units[to].factor
  }
  // Formato según magnitud
  let str
  if (Math.abs(result) >= 10000 || (Math.abs(result) < 0.001 && result !== 0)) {
    str = result.toExponential(4)
  } else if (Math.abs(result) >= 1) {
    str = result.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 6 })
  } else {
    str = result.toLocaleString('es-MX', { minimumFractionDigits: 4, maximumFractionDigits: 8 })
  }
  resultEl.textContent = str + ' ' + to.replace(/^(\w)/, '$1')
}

window.uconvSwap = function() {
  const fromEl = document.getElementById('uconv-from')
  const toEl = document.getElementById('uconv-to')
  if (!fromEl || !toEl) return
  const tmp = fromEl.value
  fromEl.value = toEl.value
  toEl.value = tmp
  uconvCompute()
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🔔 ALARMAS Y RECORDATORIOS
// ═══════════════════════════════════════════════════════════════════════════════
const ALM_STORAGE_KEY = 'nexus_alarms_v1'
let _almCheckInterval = null

function _loadAlarms() {
  try { return JSON.parse(localStorage.getItem(ALM_STORAGE_KEY) || '[]') } catch { return [] }
}
function _saveAlarms(list) {
  try { localStorage.setItem(ALM_STORAGE_KEY, JSON.stringify(list)) } catch {}
}

function _renderAlarmList() {
  const listEl = document.getElementById('alm-list')
  if (!listEl) return
  const alarms = _loadAlarms().sort((a, b) => a.when.localeCompare(b.when))
  const now = new Date()
  if (!alarms.length) {
    listEl.innerHTML = '<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:10px;">Sin alarmas programadas</div>'
    return
  }
  listEl.innerHTML = alarms.map(a => {
    const dt = new Date(a.when)
    const past = dt < now
    const diff = dt - now
    let when = dt.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    if (past && !a.fired) when += ' · ⚠ vencida'
    else if (past && a.fired) when += ' · ✓ disparada'
    else if (diff < 86400000) {
      const hrs = Math.floor(diff / 3600000)
      const mins = Math.floor((diff % 3600000) / 60000)
      when += ` · en ${hrs}h ${mins}m`
    }
    return `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;${past?'opacity:0.6;':''}">
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:700;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_esc(a.label)}</div>
          <div style="font-size:10px;color:var(--text-muted);">${when}</div>
        </div>
        <button onclick="removeAlarm('${a.id}')" style="background:transparent;border:none;color:var(--text-dim);cursor:pointer;font-size:14px;padding:4px;">✕</button>
      </div>`
  }).join('')
}

function _esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))
}

async function _requestNotifPermission() {
  if (!('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  try {
    const p = await Notification.requestPermission()
    return p
  } catch { return 'denied' }
}

function _updatePermissionBadge() {
  const el = document.getElementById('alm-permission')
  if (!el) return
  if (!('Notification' in window)) {
    el.textContent = '⚠ Tu navegador no soporta notificaciones'
    el.style.color = '#f87171'
    return
  }
  if (Notification.permission === 'granted') {
    el.textContent = '✓ Notificaciones permitidas'
    el.style.color = '#34d399'
  } else if (Notification.permission === 'denied') {
    el.textContent = '🔕 Permisos denegados — actívalos en tu navegador'
    el.style.color = '#fbbf24'
  } else {
    el.textContent = 'ⓘ Te pediremos permiso al agregar tu primera alarma'
    el.style.color = 'var(--text-muted)'
  }
}

window.addAlarm = async function() {
  const labelEl = document.getElementById('alm-label')
  const dateEl  = document.getElementById('alm-date')
  const timeEl  = document.getElementById('alm-time')
  if (!labelEl || !dateEl || !timeEl) return
  const label = labelEl.value.trim()
  const date = dateEl.value
  const time = timeEl.value || '08:00'
  if (!label || !date) {
    if (window.showToast) window.showToast('⚠ Necesito label + fecha')
    return
  }
  const when = `${date}T${time}:00`
  if (new Date(when) < new Date()) {
    if (!confirm('Esa hora ya pasó. ¿Igual quieres agregarla?')) return
  }
  const perm = await _requestNotifPermission()
  if (perm === 'denied') {
    if (window.showToast) window.showToast('🔕 Activa los permisos de notificación para que funcione')
  }
  const id = 'a-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
  const alarms = _loadAlarms()
  alarms.push({ id, label, when, fired: false, createdAt: Date.now() })
  _saveAlarms(alarms)
  labelEl.value = ''
  _renderAlarmList()
  _updatePermissionBadge()
  if (window.showToast) window.showToast('🔔 Alarma agregada')
  _ensureCheckRunning()
}

window.removeAlarm = function(id) {
  const alarms = _loadAlarms().filter(a => a.id !== id)
  _saveAlarms(alarms)
  _renderAlarmList()
}

function _fireAlarm(alarm) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    // Fallback: toast in-app si no hay permiso
    if (window.showToast) window.showToast('🔔 Recordatorio: ' + alarm.label)
    return
  }
  try {
    const n = new Notification('🔔 Nexus OS — Recordatorio', {
      body: alarm.label,
      icon: '/favicon.ico',
      tag: alarm.id,
      requireInteraction: true,
    })
    n.onclick = () => { window.focus(); n.close() }
  } catch (e) {
    if (window.showToast) window.showToast('🔔 ' + alarm.label)
  }
}

function _checkAlarms() {
  const alarms = _loadAlarms()
  if (!alarms.length) return
  const now = Date.now()
  let changed = false
  for (const a of alarms) {
    if (a.fired) continue
    if (new Date(a.when).getTime() <= now) {
      _fireAlarm(a)
      a.fired = true
      changed = true
    }
  }
  if (changed) {
    _saveAlarms(alarms)
    _renderAlarmList()
  }
}

function _ensureCheckRunning() {
  if (_almCheckInterval) return
  _almCheckInterval = setInterval(_checkAlarms, 20000)   // cada 20s
  // Check inicial inmediato
  setTimeout(_checkAlarms, 200)
}

// Hidrata al cargar la app
function _initToolsExtra() {
  uconvRebuild()
  _renderAlarmList()
  _updatePermissionBadge()
  _ensureCheckRunning()
  // Fecha por default = hoy
  const dateEl = document.getElementById('alm-date')
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10)
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(_initToolsExtra, 200))
  } else {
    setTimeout(_initToolsExtra, 200)
  }
}
