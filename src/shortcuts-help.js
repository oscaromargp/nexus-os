// Nexus OS — Modal de atajos de teclado
// Tecla "?" → abre overlay con todos los atajos disponibles.

const SHORTCUTS = [
  {
    section: 'Navegación',
    items: [
      ['?',              'Mostrar/ocultar este panel'],
      ['Ctrl/⌘ + K',     'Spotlight Search global'],
      ['Esc',            'Cerrar modal actual'],
      ['G + I',          'Ir a Inicio'],
      ['G + N',          'Ir a Inmuebles'],
      ['G + F',          'Ir a Finanzas'],
      ['G + C',          'Ir a Contactos'],
    ],
  },
  {
    section: 'Acciones rápidas',
    items: [
      ['N',              'Foco en el input principal'],
      ['Ctrl/⌘ + Enter', 'Submit del input (si en focus)'],
      ['Ctrl/⌘ + N',     'Nuevo inmueble (si en Inmuebles)'],
    ],
  },
  {
    section: 'Sintaxis del parser',
    items: [
      ['+1200 gasolina @efectivo',  'Crear gasto'],
      ['+5000 venta @bbva',         'Crear ingreso'],
      ['#tarea preparar reporte',   'Crear tarea kanban'],
      ['!! nota importante',        'Crear nota'],
      ['@juan tel: 5512345678',     'Crear contacto'],
    ],
  },
]

let _overlay = null

export function toggleShortcutsModal() {
  if (_overlay) { _overlay.remove(); _overlay = null; return }
  _overlay = document.createElement('div')
  _overlay.id = 'shortcuts-overlay'
  _overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.78);backdrop-filter:blur(8px);z-index:10600;display:flex;align-items:center;justify-content:center;padding:20px;'
  _overlay.onclick = e => { if (e.target === _overlay) { _overlay.remove(); _overlay = null } }

  _overlay.innerHTML = `
    <div style="background:#0e1422;border:1px solid rgba(34,211,238,0.25);border-radius:14px;width:100%;max-width:560px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 28px 80px rgba(0,0,0,0.7);overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.06);">
        <h3 style="margin:0;font-size:14px;font-weight:800;color:#22d3ee;">⌨️ Atajos de teclado</h3>
        <button onclick="document.getElementById('shortcuts-overlay')?.remove();window._shortcutsOpen=false"
          style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;width:28px;height:28px;border-radius:6px;cursor:pointer;">✕</button>
      </div>
      <div style="overflow-y:auto;padding:16px 20px;">
        ${SHORTCUTS.map(s => `
          <div style="margin-bottom:18px;">
            <div style="font-size:10px;font-weight:800;color:#a78bfa;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">${s.section}</div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              ${s.items.map(([key, desc]) => `
                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 10px;background:rgba(255,255,255,0.02);border-radius:7px;">
                  <span style="font-size:12px;color:#cbd5e1;">${desc}</span>
                  <kbd style="background:rgba(34,211,238,0.1);border:1px solid rgba(34,211,238,0.3);color:#22d3ee;padding:3px 9px;border-radius:5px;font-family:monospace;font-size:11px;font-weight:600;white-space:nowrap;">${key}</kbd>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
        <div style="font-size:11px;color:#64748b;text-align:center;padding-top:8px;border-top:1px solid rgba(255,255,255,0.04);">
          Presiona <kbd style="background:rgba(255,255,255,0.05);padding:1px 5px;border-radius:3px;font-family:monospace;">?</kbd> en cualquier momento para volver a abrir esto.
        </div>
      </div>
    </div>
  `
  document.body.appendChild(_overlay)
}

if (typeof window !== 'undefined') {
  document.addEventListener('keydown', (e) => {
    // Solo activar ? si no estamos en un input/textarea
    if (e.key === '?' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) && !e.target.isContentEditable) {
      e.preventDefault()
      toggleShortcutsModal()
    }
  })
  window.toggleShortcutsModal = toggleShortcutsModal
}
