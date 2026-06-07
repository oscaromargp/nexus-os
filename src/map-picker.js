// Mapa picker basado en Leaflet + OpenStreetMap + Nominatim (reverse geocoding)
// Uso:
//   const result = await openMapPicker({ lat, lng, defaultZoom: 15 })
//   result = { lat, lng, address: { calle, colonia, municipio, estado, cp, country, full } } | null

import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Centro default: La Paz, BCS
const DEFAULT_CENTER = { lat: 24.1426, lng: -110.3128 }

// Fix iconos Leaflet con bundlers (Vite)
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import iconUrl       from 'leaflet/dist/images/marker-icon.png'
import shadowUrl     from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl })

async function nominatimReverse(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=es-MX`
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } })
    if (!r.ok) return null
    const data = await r.json()
    const a = data.address || {}
    return {
      calle:     a.road || a.pedestrian || '',
      colonia:   a.suburb || a.neighbourhood || a.quarter || a.village || '',
      municipio: a.city || a.town || a.municipality || a.county || '',
      estado:    a.state || '',
      cp:        a.postcode || '',
      country:   a.country || 'México',
      full:      data.display_name || '',
    }
  } catch (e) {
    console.warn('[map-picker] nominatim reverse error', e)
    return null
  }
}

async function nominatimSearch(query) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&countrycodes=mx&limit=5&accept-language=es-MX`
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } })
    if (!r.ok) return []
    return await r.json()
  } catch { return [] }
}

export function openMapPicker({ lat = DEFAULT_CENTER.lat, lng = DEFAULT_CENTER.lng, defaultZoom = 14 } = {}) {
  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(6px);'

    overlay.innerHTML = `
      <div style="background:#0e1422;border:1px solid rgba(34,211,238,0.25);border-radius:14px;width:100%;max-width:900px;max-height:92vh;overflow:hidden;display:flex;flex-direction:column;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.08);">
          <h3 style="margin:0;font-size:15px;font-weight:800;color:#f1f5f9;">📍 Ubicar inmueble en mapa</h3>
          <button id="mp-close" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:16px;">✕</button>
        </div>

        <div style="padding:12px 18px;background:rgba(255,255,255,0.03);border-bottom:1px solid rgba(255,255,255,0.06);display:flex;gap:8px;flex-wrap:wrap;">
          <input id="mp-search" placeholder="Buscar dirección o lugar (ej. 'La Ventana, BCS')"
            style="flex:1;min-width:240px;padding:8px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#e8f0f9;font-size:13px;"/>
          <button id="mp-search-btn"
            style="padding:8px 16px;background:rgba(34,211,238,0.15);border:1px solid rgba(34,211,238,0.35);color:#22d3ee;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">🔍 Buscar</button>
          <button id="mp-locate-btn"
            style="padding:8px 12px;background:rgba(167,139,250,0.12);border:1px solid rgba(167,139,250,0.3);color:#a78bfa;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;" title="Mi ubicación actual">📍 Mi ubicación</button>
        </div>

        <div id="mp-results" style="max-height:140px;overflow-y:auto;background:rgba(255,255,255,0.02);"></div>

        <div id="mp-map" style="flex:1;min-height:380px;background:#1a1f2e;"></div>

        <div style="padding:10px 18px;background:rgba(0,0,0,0.4);border-top:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
          <div id="mp-coords" style="font-size:12px;color:#94a3b8;font-family:monospace;">Lat: ${lat.toFixed(6)} · Lng: ${lng.toFixed(6)}</div>
          <div style="display:flex;gap:8px;">
            <button id="mp-cancel" style="padding:8px 16px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;border-radius:8px;cursor:pointer;font-size:13px;">Cancelar</button>
            <button id="mp-accept" style="padding:8px 18px;background:linear-gradient(135deg,#22d3ee,#0891b2);border:none;color:#0d0f1f;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;">✓ Usar esta ubicación</button>
          </div>
        </div>
      </div>
    `

    document.body.appendChild(overlay)

    let currentLat = lat
    let currentLng = lng
    let lastAddress = null

    // Inicializa mapa
    const map = L.map('mp-map', { zoomControl: true }).setView([lat, lng], defaultZoom)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map)

    const marker = L.marker([lat, lng], { draggable: true }).addTo(map)

    const updateCoords = (la, ln) => {
      currentLat = la
      currentLng = ln
      document.getElementById('mp-coords').textContent =
        `Lat: ${la.toFixed(6)} · Lng: ${ln.toFixed(6)}`
    }

    const doReverse = async (la, ln) => {
      const coordsEl = document.getElementById('mp-coords')
      if (coordsEl) coordsEl.textContent = `⏳ Resolviendo dirección…`
      lastAddress = await nominatimReverse(la, ln)
      if (coordsEl) {
        const addrLabel = lastAddress ? ` · ${(lastAddress.calle || lastAddress.colonia || lastAddress.municipio || '').slice(0,60)}` : ''
        coordsEl.textContent = `Lat: ${la.toFixed(6)} · Lng: ${ln.toFixed(6)}${addrLabel}`
      }
    }

    marker.on('dragend', e => {
      const { lat: la, lng: ln } = e.target.getLatLng()
      updateCoords(la, ln); doReverse(la, ln)
    })

    map.on('click', e => {
      marker.setLatLng(e.latlng)
      updateCoords(e.latlng.lat, e.latlng.lng); doReverse(e.latlng.lat, e.latlng.lng)
    })

    // Inicial reverse
    doReverse(lat, lng)

    // Buscar
    const doSearch = async () => {
      const q = document.getElementById('mp-search').value.trim()
      if (!q) return
      const resEl = document.getElementById('mp-results')
      resEl.innerHTML = `<div style="padding:10px 16px;color:#94a3b8;font-size:12px;">⏳ Buscando…</div>`
      const results = await nominatimSearch(q)
      if (!results.length) {
        resEl.innerHTML = `<div style="padding:10px 16px;color:#64748b;font-size:12px;">Sin resultados</div>`
        return
      }
      resEl.innerHTML = results.map((r, i) => `
        <div data-i="${i}" class="mp-result" style="padding:8px 16px;cursor:pointer;color:#cbd5e1;font-size:12px;border-bottom:1px solid rgba(255,255,255,0.04);">
          ${r.display_name}
        </div>
      `).join('')
      Array.from(resEl.querySelectorAll('.mp-result')).forEach(el => {
        el.onmouseover = () => el.style.background = 'rgba(34,211,238,0.08)'
        el.onmouseout  = () => el.style.background = 'transparent'
        el.onclick = () => {
          const r = results[+el.dataset.i]
          const la = parseFloat(r.lat), ln = parseFloat(r.lon)
          map.setView([la, ln], 17)
          marker.setLatLng([la, ln])
          updateCoords(la, ln); doReverse(la, ln)
          resEl.innerHTML = ''
        }
      })
    }

    document.getElementById('mp-search-btn').onclick = doSearch
    document.getElementById('mp-search').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); doSearch() } }

    // Mi ubicación (geolocalización del navegador)
    document.getElementById('mp-locate-btn').onclick = () => {
      if (!navigator.geolocation) { alert('Tu navegador no soporta geolocalización'); return }
      navigator.geolocation.getCurrentPosition(pos => {
        const la = pos.coords.latitude, ln = pos.coords.longitude
        map.setView([la, ln], 17)
        marker.setLatLng([la, ln])
        updateCoords(la, ln); doReverse(la, ln)
      }, err => alert('No se pudo obtener tu ubicación: ' + err.message))
    }

    const cleanup = () => { try { map.remove() } catch {} ; overlay.remove() }
    document.getElementById('mp-close').onclick  = () => { cleanup(); resolve(null) }
    document.getElementById('mp-cancel').onclick = () => { cleanup(); resolve(null) }
    document.getElementById('mp-accept').onclick = () => {
      cleanup()
      resolve({ lat: currentLat, lng: currentLng, address: lastAddress })
    }
  })
}
