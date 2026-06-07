// Catálogo Estados → Municipios México (carga única, cacheada)
// Fuente: public/data/mx-estados-municipios.json
let _cache = null
let _loading = null

export async function loadMxLocations() {
  if (_cache) return _cache
  if (_loading) return _loading
  _loading = fetch('/data/mx-estados-municipios.json')
    .then(r => r.json())
    .then(j => { _cache = j; return j })
    .catch(e => { console.error('[mx-locations]', e); _cache = { estados: [] }; return _cache })
  return _loading
}

export function getEstados() {
  return _cache?.estados || []
}

export function getMunicipios(estadoIdOrNombre) {
  const e = (_cache?.estados || []).find(
    x => x.id === estadoIdOrNombre || x.nombre === estadoIdOrNombre
  )
  return e?.municipios || []
}

// Render dropdowns Estado → Municipio (devuelve HTML string)
// onChange handlers se asumen como `mxOnEstadoChange()` y `mxOnMunicipioChange()`
export function renderEstadoMunicipioSelects({ estadoVal = 'BCS', municipioVal = '', estadoId = 'prop-estado-rep', municipioId = 'prop-municipio' } = {}) {
  const estados = getEstados()
  const muns = getMunicipios(estadoVal)
  return `
    <div>
      <label style="font-size:11px;color:#7a8899;display:block;margin-bottom:6px;">Estado</label>
      <select id="${estadoId}" onchange="window.mxOnEstadoChange?.('${estadoId}','${municipioId}')"
        style="width:100%;padding:9px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
        border-radius:8px;color:#e8f0f9;font-size:13px;">
        ${estados.map(e => `<option value="${e.id}" ${e.id===estadoVal?'selected':''}>${e.nombre}</option>`).join('')}
      </select>
    </div>
    <div>
      <label style="font-size:11px;color:#7a8899;display:block;margin-bottom:6px;">Municipio</label>
      <select id="${municipioId}"
        style="width:100%;padding:9px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
        border-radius:8px;color:#e8f0f9;font-size:13px;">
        <option value="">— Selecciona —</option>
        ${muns.map(m => `<option value="${m}" ${m===municipioVal?'selected':''}>${m}</option>`).join('')}
      </select>
    </div>
  `
}

// Handler global que se conecta al onchange del select de Estado
if (typeof window !== 'undefined') {
  window.mxOnEstadoChange = (estadoElId, municipioElId) => {
    const estadoEl = document.getElementById(estadoElId)
    const munEl = document.getElementById(municipioElId)
    if (!estadoEl || !munEl) return
    const muns = getMunicipios(estadoEl.value)
    munEl.innerHTML = '<option value="">— Selecciona —</option>' +
      muns.map(m => `<option value="${m}">${m}</option>`).join('')
  }
}
