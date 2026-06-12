// Nexus OS — Sistema de Módulos activables
//
// Cada módulo declara: id, nombre, ícono, descripción, categoría, sidebar item.
// El usuario activa/desactiva desde Configuración → Mis Módulos.
// El estado persiste en user_metadata.modules_enabled = { [id]: true }
// Aplica al cargar: oculta items del sidebar si OFF.

import { supabase } from './supabase.js'

// Catálogo de módulos
export const MODULES = [
  // Core (siempre on)
  { id: 'feed',         name: 'Feed Central',    icon: '📊', category: 'core',  sidebar: 'feed',         desc: 'Stream con parser semántico', core: true },
  { id: 'kanban',       name: 'Muro Táctico',    icon: '📌', category: 'core',  sidebar: 'kanban',       desc: 'Kanban drag & drop con prioridades', core: true },
  { id: 'notes',        name: 'Bóveda Neural',   icon: '🧠', category: 'core',  sidebar: 'notes',        desc: 'Notas estilo Keep' },
  { id: 'calendar',     name: 'Tiempo & Crónica',icon: '📅', category: 'core',  sidebar: 'calendar',     desc: 'Calendario + crónica diaria' },
  { id: 'contacts',     name: 'Contactos',       icon: '👥', category: 'core',  sidebar: 'contacts',     desc: 'CRM personal de contactos' },
  { id: 'proyectos',    name: 'Proyectos',       icon: '📁', category: 'core',  sidebar: 'proyectos',    desc: 'Multi-tab por proyecto: finanzas, kanban, wiki, RSS' },
  { id: 'tags',         name: 'Inteligencia Tags',icon: '🏷️', category: 'core', sidebar: 'tags',         desc: 'Análisis de etiquetas' },

  // Finanzas
  { id: 'finance',      name: 'Bio-Finanzas',    icon: '💰', category: 'finance', sidebar: 'finance',    desc: 'Ingresos, gastos, cuentas' },
  { id: 'agenda',       name: 'Agenda Financiera',icon: '💳', category: 'finance', sidebar: 'agenda',    desc: 'Pagos y cobros recurrentes' },
  { id: 'movimientos',  name: 'Movimientos',     icon: '🔄', category: 'finance', sidebar: 'movimientos',desc: 'Orquestador multi-cuenta' },
  { id: 'cotizaciones', name: 'Cotizaciones',    icon: '📄', category: 'finance', sidebar: 'cotizaciones',desc: 'Ventas + abonos + comisiones' },
  { id: 'afp',          name: 'AFP',             icon: '📐', category: 'finance', sidebar: 'afp',        desc: 'Arquitecto Financiero — score 0-100, dispersión sugerida' },

  // Inversiones
  { id: 'crypto',       name: 'Cripto Portfolio',icon: '₿',  category: 'invest',  sidebar: 'crypto',     desc: 'Tracking manual con precios live + journal' },

  // Inmobiliario
  { id: 'inmuebles',    name: 'Inmuebles',       icon: '🏠', category: 'realestate', sidebar: 'inmuebles', desc: 'CRM inmobiliario + leads + reportes IA' },

  // Automatización
  { id: 'automations',  name: 'Flujos',          icon: '⚡', category: 'automation', sidebar: 'automations', desc: 'Recetas IFTTT Nexus → Telegram + n8n' },

  // Utilidades
  { id: 'herramientas', name: 'Herramientas',    icon: '🛠️', category: 'utility', sidebar: 'herramientas', desc: 'Cronómetro, conversores, calculadoras' },
]

export const CATEGORIES = [
  { id: 'core',        label: '🧠 Esenciales',       desc: 'Las bases del sistema' },
  { id: 'finance',     label: '💰 Finanzas',          desc: 'Para controlar tu dinero' },
  { id: 'invest',      label: '📈 Inversiones',       desc: 'Para hacer crecer tu patrimonio' },
  { id: 'realestate',  label: '🏠 Inmobiliario',      desc: 'CRM + reportes para agentes' },
  { id: 'automation',  label: '⚡ Automatización',    desc: 'Flujos sin programar' },
  { id: 'utility',     label: '🛠️ Utilidades',        desc: 'Herramientas accesorias' },
]

// Defaults: TODOS los módulos ON salvo nuevos opt-in
const DEFAULT_ENABLED = MODULES.reduce((acc, m) => ({ ...acc, [m.id]: true }), {})

export async function loadEnabledModules() {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    const saved = user?.user_metadata?.modules_enabled || {}
    return { ...DEFAULT_ENABLED, ...saved }
  } catch { return DEFAULT_ENABLED }
}

export async function saveEnabledModules(modulesMap) {
  const { error } = await supabase.auth.updateUser({ data: { modules_enabled: modulesMap } })
  if (error) throw error
}

export async function applyModulesToSidebar() {
  try {
    const enabled = await loadEnabledModules()
    document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
      const view = btn.dataset.view
      const mod = MODULES.find(m => m.sidebar === view)
      if (mod && !mod.core) {
        btn.style.display = enabled[mod.id] ? '' : 'none'
      }
    })
    // Bottom tabbar mobile también
    document.querySelectorAll('.bottom-tab[data-view]')?.forEach?.(btn => {
      const view = btn.dataset.view
      const mod = MODULES.find(m => m.sidebar === view)
      if (mod && !mod.core) {
        btn.style.display = enabled[mod.id] ? '' : 'none'
      }
    })
  } catch (e) { console.warn('[modules] apply', e) }
}

export async function renderModulesPanel() {
  const root = document.getElementById('modules-panel-root')
  if (!root) return

  let enabled
  try { enabled = await loadEnabledModules() }
  catch (e) { root.innerHTML = `<div style="color:#f87171;">⚠ ${e.message}</div>`; return }

  let html = `
    <div style="padding:4px 0;">
      <div style="font-size:13px;color:#94a3b8;margin-bottom:14px;line-height:1.6;">
        Activa o desactiva módulos según lo que uses. Lo que esté apagado no aparece en el menú lateral.
        <br>Útil para personalizar lo que ofreces a cada cliente: activa solo los módulos que necesite.
      </div>
  `

  for (const cat of CATEGORIES) {
    const mods = MODULES.filter(m => m.category === cat.id)
    if (!mods.length) continue
    html += `
      <div style="margin-top:18px;">
        <div style="font-size:13px;font-weight:700;color:#e5e7eb;margin-bottom:4px;">${cat.label}</div>
        <div style="font-size:11px;color:#6b7280;margin-bottom:10px;">${cat.desc}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px;">
    `
    for (const mod of mods) {
      const isOn = !!enabled[mod.id]
      html += `
        <label style="display:flex;align-items:start;gap:10px;padding:12px;background:rgba(255,255,255,${mod.core?'0.04':'0.02'});border:1px solid rgba(255,255,255,${mod.core?'0.12':'0.06'});border-radius:10px;cursor:${mod.core?'not-allowed':'pointer'};${mod.core?'opacity:0.75;':''}">
          <input type="checkbox" data-mid="${mod.id}" ${isOn?'checked':''} ${mod.core?'disabled':''}
            style="width:18px;height:18px;margin-top:2px;flex-shrink:0;accent-color:#22d3ee;"/>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:#e5e7eb;">
              <span style="font-size:16px;">${mod.icon}</span> ${mod.name}
              ${mod.core ? '<span style="font-size:9px;color:#fbbf24;background:rgba(251,191,36,0.15);padding:1px 6px;border-radius:4px;letter-spacing:1px;">CORE</span>' : ''}
            </div>
            <div style="font-size:11px;color:#94a3b8;margin-top:3px;line-height:1.5;">${mod.desc}</div>
          </div>
        </label>
      `
    }
    html += `</div></div>`
  }

  html += `<div id="modules-save-status" style="margin-top:16px;font-size:12px;color:#22c55e;text-align:center;min-height:18px;"></div></div>`
  root.innerHTML = html

  // Auto-save al togglear
  root.querySelectorAll('input[data-mid]').forEach(input => {
    input.addEventListener('change', async () => {
      enabled[input.dataset.mid] = input.checked
      const status = document.getElementById('modules-save-status')
      if (status) { status.textContent = '⏳ Guardando…'; status.style.color = '#94a3b8' }
      try {
        await saveEnabledModules(enabled)
        applyModulesToSidebar()
        if (status) { status.textContent = '✓ Cambios guardados — recarga para ver efecto completo'; status.style.color = '#22c55e' }
      } catch (e) {
        if (status) { status.textContent = '⚠ ' + e.message; status.style.color = '#f87171' }
      }
    })
  })
}

if (typeof window !== 'undefined') {
  window.nexusModules = { apply: applyModulesToSidebar, render: renderModulesPanel, list: MODULES }
  // Aplica automáticamente al cargar
  setTimeout(() => applyModulesToSidebar(), 1200)
}
