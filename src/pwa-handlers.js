// Nexus OS — Handlers para PWA shortcuts y Web Share Target
// Procesa los query params del manifest:
//   ?action=new-property   → abre modal de captación
//   ?action=new-note       → abre quick capture de nota
//   ?action=spotlight      → abre buscador
//   ?shared_title=...&shared_text=...&shared_url=... → share desde otra app

;(() => {
  const params = new URLSearchParams(location.search)
  const action = params.get('action')
  const sharedTitle = params.get('shared_title')
  const sharedText  = params.get('shared_text')
  const sharedUrl   = params.get('shared_url')

  // Si hay algún parámetro relevante, esperamos a que la app cargue
  if (!action && !sharedTitle && !sharedText && !sharedUrl) return

  const run = () => {
    if (action === 'new-property' && window.openPropModal) {
      window.openPropModal()
    } else if (action === 'new-note') {
      const input = document.getElementById('nexus-input')
      if (input) { input.focus(); input.value = '!! ' }
    } else if (action === 'spotlight' && window.openSpotlight) {
      window.openSpotlight()
    } else if (sharedTitle || sharedText || sharedUrl) {
      // Pre-llena el input principal con el contenido compartido
      const input = document.getElementById('nexus-input')
      const txt = [sharedTitle, sharedText, sharedUrl].filter(Boolean).join(' · ')
      if (input) { input.focus(); input.value = txt }
      // Toast confirmando
      window.showToast?.('📥 Compartido desde otra app — edítalo y guarda')
    }

    // Limpiar la URL para que al recargar no se repita la acción
    try { history.replaceState({}, '', location.pathname) } catch {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(run, 500))
  } else {
    setTimeout(run, 500)
  }
})()
