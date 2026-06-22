// Nexus OS · Mobile UX fixes (S4)
//
// 1) Oculta el spotlight bar inferior cuando un modal está abierto.
//    Antes: el input "+ Nuevo > comando…" flotaba sobre el modal y obstruía
//    los botones de Guardar/Cancelar en móvil.
// 2) Detecta automáticamente cualquier overlay con z-index alto y aplica
//    `body.modal-open`, esconde spotlight + bottom-tabbar en móvil.
// 3) Convierte algunos overlays click-outside-to-close en modales explícitos
//    (sólo cierran con la ✕), para no perder data accidentalmente.
//    Whitelist de modales SEGUROS (con formulario): protegidos.

// IDs de modales que tienen formularios — NO deben cerrarse al tap fuera.
// Si abren y el usuario tap fuera por accidente, se debe quedar abierto.
const FORM_MODALS = new Set([
  'mv-modal-overlay',              // Movimientos · Nuevo/Editar
  'mv-orq-modal',                  // Movimientos · Nueva cuenta
  'contact-modal',                 // Contactos
  'cotizacion-modal',              // Cotización
  'crypto-purchase-modal',         // Compra cripto
  'crypto-price-modal',            // Precio cripto
  'docgen-modal',                  // Generación de docs
  'cot-detail-modal',              // Detalle cotización
  'event-modal',                   // Evento agenda
  'agenda-modal',                  // Agenda financiera
])

// Selectores de overlays activos
const OVERLAY_SELECTORS = [
  '.modal-overlay:not(.hidden)',
  '#mv-modal-overlay',
  '#mv-orq-modal',
  '#prop-detail-overlay',
  '#contact-modal:not(.hidden)',
  '#cotizacion-modal:not(.hidden)',
  '#crypto-purchase-modal:not(.hidden)',
  '#crypto-price-modal:not(.hidden)',
  '[role="dialog"]:not([aria-hidden="true"])',
]

let _observer = null

function _hasVisibleOverlay() {
  return OVERLAY_SELECTORS.some(sel => {
    try { return document.querySelector(sel) !== null }
    catch { return false }
  })
}

function _syncModalClass() {
  const isOpen = _hasVisibleOverlay()
  document.body.classList.toggle('modal-open', isOpen)
}

function _initObserver() {
  if (_observer || typeof MutationObserver === 'undefined') return
  _observer = new MutationObserver(() => _syncModalClass())
  _observer.observe(document.body, {
    childList: true, subtree: true,
    attributes: true, attributeFilter: ['style', 'class', 'aria-hidden'],
  })
  _syncModalClass()
}

// ── Patch: removes "click outside to close" on critical form modals ────────
// El attribute onclick="if(event.target===this)..." pierde data si se toca
// el fondo por accidente. Lo neutralizamos para los modales de la whitelist.
function _patchClickOutsideClose() {
  for (const id of FORM_MODALS) {
    const el = document.getElementById(id)
    if (!el || el.dataset.cocPatched === '1') continue
    if (el.hasAttribute('onclick')) {
      el.removeAttribute('onclick')
      el.dataset.cocPatched = '1'
    }
  }
}

// Cuando aparece un overlay con onclick="if(event.target===this)..." dinámico,
// lo neutralizamos también. Polling ligero cada 1s para detectar inserciones.
function _patchDynamicModals() {
  setInterval(() => {
    for (const id of FORM_MODALS) {
      const el = document.getElementById(id)
      if (el && el.dataset.cocPatched !== '1') {
        if (el.hasAttribute('onclick')) {
          const handler = el.getAttribute('onclick')
          // Sólo lo quitamos si parece ser un cierre-al-tap-outside
          if (/event\.target\s*===?\s*this|target\.id\s*===?/i.test(handler)) {
            el.removeAttribute('onclick')
            el.dataset.cocPatched = '1'
          }
        }
      }
    }
  }, 1000)
}

// ── Inject CSS ─────────────────────────────────────────────────────────────
function _injectCSS() {
  if (document.getElementById('nexus-mobile-ux-css')) return
  const style = document.createElement('style')
  style.id = 'nexus-mobile-ux-css'
  style.textContent = `
    /* Cuando hay un modal abierto, esconde el spotlight bar + bottom tabbar
       en móvil para que el formulario tenga toda la pantalla. */
    @media (max-width: 768px) {
      body.modal-open #spotlight-container {
        opacity: 0 !important;
        pointer-events: none !important;
        transform: translateY(120%) !important;
        transition: transform 0.25s, opacity 0.25s;
      }
      body.modal-open #bottom-tabbar,
      body.modal-open .bottom-tabbar,
      body.modal-open #mobile-tabbar {
        display: none !important;
      }
      /* Modales en móvil: full-screen, sin padding outside */
      body.modal-open .modal-overlay > div,
      body.modal-open #mv-modal-overlay > div,
      body.modal-open #contact-modal > div {
        max-height: calc(100vh - 24px) !important;
      }
    }

    /* Indicador visual sutil de "el spotlight está oculto temporalmente"
       — sólo en desktop para feedback al developer/usuario power. */
    @media (min-width: 769px) {
      body.modal-open #spotlight-container {
        opacity: 0.35;
        pointer-events: none;
        transition: opacity 0.25s;
      }
    }
  `
  document.head.appendChild(style)
}

// ── Init ──────────────────────────────────────────────────────────────────
function _init() {
  _injectCSS()
  _patchClickOutsideClose()
  _patchDynamicModals()
  _initObserver()
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init)
  } else {
    _init()
  }
}

// Exponer helpers para uso ad-hoc
if (typeof window !== 'undefined') {
  window.nexusMobileUX = {
    syncModalClass: _syncModalClass,
    isOverlayOpen: _hasVisibleOverlay,
  }
}
