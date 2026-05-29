/**
 * Nexus OS — Documentos Inmobiliarios v1.0
 * src/docs-inmuebles.js
 *
 * 14 plantillas legales inmobiliarias:
 *   Captación (7) + Negociación (4) + Contratos Profeco (3)
 */

import { supabase } from './supabase.js'

// ─── Estado ───────────────────────────────────────────────────────────────────
let _docs = {}          // { [propId]: doc[] }
let _activePropId = null

// ─── Escape ───────────────────────────────────────────────────────────────────
function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// ─── Relleno de plantilla ─────────────────────────────────────────────────────
function _fill(html, data) {
  return html.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = data[k]
    return v != null && String(v).trim() !== ''
      ? String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      : '<span style="background:#fff3cd;padding:0 3px;font-style:italic;font-size:9pt;">[_______________]</span>'
  })
}

// ─── Auto-fill desde propiedad + agente ──────────────────────────────────────
function _autoFill(prop) {
  const addr = [prop.calle, prop.numero, prop.colonia, prop.municipio, prop.estado_rep].filter(Boolean).join(', ')
  const today = new Date().toLocaleDateString('es-MX', { day:'numeric', month:'long', year:'numeric' })
  return {
    agente_nombre:    localStorage.getItem('nexus_agent_name')      || '',
    agente_tel:       localStorage.getItem('nexus_agent_tel')       || '',
    agente_email:     localStorage.getItem('nexus_agent_email')     || '',
    agente_agencia:   localStorage.getItem('nexus_agent_agency')    || 'Nexus OS Inmobiliario',
    agente_domicilio: localStorage.getItem('nexus_agent_domicilio') || '',
    vendedor_nombre:  prop.dueno_nombre   || '',
    vendedor_tel:     prop.dueno_telefono || '',
    vendedor_email:   prop.dueno_email    || '',
    propietario_nombre: prop.dueno_nombre || '',
    inmueble_tipo:       prop.tipo        || '',
    inmueble_direccion:  addr,
    inmueble_colonia:    prop.colonia     || '',
    inmueble_municipio:  prop.municipio   || '',
    inmueble_estado:     prop.estado_rep  || '',
    inmueble_cp:         prop.cp          || '',
    inmueble_sup_t:      prop.sup_terreno    ? String(prop.sup_terreno)    : '',
    inmueble_sup_c:      prop.sup_construida ? String(prop.sup_construida) : '',
    inmueble_recamaras:  prop.recamaras   ? String(prop.recamaras)   : '',
    inmueble_banos:      prop.banos       ? String(prop.banos)       : '',
    inmueble_estac:      prop.estacionamientos ? String(prop.estacionamientos) : '',
    inmueble_pisos:      prop.pisos       ? String(prop.pisos)       : '',
    inmueble_antiguedad: prop.antiguedad_anios ? String(prop.antiguedad_anios) + ' años' : '',
    inmueble_descripcion:prop.descripcion || '',
    precio_total:        prop.precio_venta ? String(Number(prop.precio_venta).toLocaleString('es-MX')) : '',
    comision_pct:        prop.comision_pct ? String(prop.comision_pct) + '%' : '5%',
    lugar:               prop.municipio   || '',
    fecha_hoy:           today,
    folio:               prop.folio_interno || '',
  }
}

// ─── Exportar DOC ─────────────────────────────────────────────────────────────
function _exportDOC(html, filename) {
  const blob = new Blob([
    `<html xmlns:o='urn:schemas-microsoft-com:office:office'
      xmlns:w='urn:schemas-microsoft-com:office:word'
      xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset='utf-8'><title>${_esc(filename)}</title>
    <style>
      @page { size: letter; margin: 2.5cm; }
      body { font-family: Arial, sans-serif; font-size: 10pt; line-height: 1.6; color: #000; }
      h1 { font-size: 13pt; font-weight: bold; text-align: center; text-transform: uppercase; margin: 0 0 6pt; }
      h2 { font-size: 11pt; font-weight: bold; text-transform: uppercase; margin: 14pt 0 4pt; border-bottom: 1pt solid #333; padding-bottom: 2pt; }
      h3 { font-size: 10pt; font-weight: bold; margin: 10pt 0 3pt; }
      p { margin: 4pt 0; text-align: justify; }
      table { border-collapse: collapse; width: 100%; margin: 8pt 0; }
      td, th { border: 1pt solid #666; padding: 4pt 6pt; font-size: 9pt; vertical-align: top; }
      th { background: #e8e8e8; font-weight: bold; }
      .firma-box { display: inline-block; width: 45%; margin: 20pt 2% 0; text-align: center; }
      .firma-linea { border-top: 1pt solid #333; margin-top: 40pt; padding-top: 4pt; font-size: 9pt; }
      .campo-vacio { background: #fff3cd; }
      .centrado { text-align: center; }
      .clausula { margin: 8pt 0; }
      .subrayado { text-decoration: underline; }
    </style>
    </head><body>${html}</body></html>`
  ], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename.replace(/[^a-zA-Z0-9_\-\s]/g,'_') + '.doc'; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

// ─── Exportar PDF (usa jsPDF.html + html2canvas) ─────────────────────────────
async function _exportPDF(html, filename) {
  const { jsPDF } = await import('jspdf')
  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#fff;font-family:Arial,sans-serif;font-size:10pt;color:#000;padding:60px;box-sizing:border-box;'
  container.innerHTML = `<style>
    h1{font-size:13pt;font-weight:bold;text-align:center;text-transform:uppercase;margin:0 0 8px;}
    h2{font-size:11pt;font-weight:bold;text-transform:uppercase;margin:16px 0 4px;border-bottom:1px solid #333;padding-bottom:2px;}
    p{margin:4px 0;text-align:justify;line-height:1.6;}
    table{border-collapse:collapse;width:100%;margin:8px 0;}
    td,th{border:1px solid #666;padding:4px 6px;font-size:9pt;}
    th{background:#e8e8e8;font-weight:bold;}
    .firma-box{display:inline-block;width:45%;margin:20px 2% 0;text-align:center;}
    .firma-linea{border-top:1px solid #333;margin-top:40px;padding-top:4px;font-size:9pt;}
    .campo-vacio{background:#fff3cd;}
  </style>${html}`
  document.body.appendChild(container)
  try {
    const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'letter' })
    await pdf.html(container, {
      callback: (doc) => { doc.save(filename.replace(/[^a-zA-Z0-9_\-\s]/g,'_') + '.pdf') },
      x: 10, y: 10, width: 190, windowWidth: 794,
      margin: [10, 10, 10, 10],
    })
  } finally {
    container.remove()
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// TEMPLATES — 14 plantillas
// ════════════════════════════════════════════════════════════════════════════════
export const TEMPLATES = [
  // ── CAPTACIÓN ──────────────────────────────────────────────────────────────
  {
    id: 'registro_captacion', name: 'Registro de Captura de Inmobiliaria', cat: 'captacion',
    desc: 'Registro de captura de datos del propietario e inmueble a comercializar',
    fields: [
      { id:'fecha_hoy',                  label:'Fecha de elaboración',           type:'date',     src:'fecha_hoy' },
      { id:'agente_nombre',              label:'Agente Inmobiliario',            type:'text',     src:'agente_nombre' },
      { id:'agente_tel',                 label:'Teléfono Agente',               type:'text',     src:'agente_tel' },
      { id:'vendedor_nombre',            label:'Nombre del propietario',         type:'text',     src:'vendedor_nombre' },
      { id:'estado_civil',               label:'Estado Civil',                   type:'text' },
      { id:'regimen_matrimonio',         label:'Régimen del matrimonio',         type:'text' },
      { id:'vendedor_domicilio',         label:'Dirección del propietario',      type:'text' },
      { id:'vendedor_tel_fijo',          label:'Teléfono fijo',                 type:'text' },
      { id:'vendedor_tel',               label:'Teléfono Celular',              type:'text',     src:'vendedor_tel' },
      { id:'vendedor_email',             label:'Correo electrónico',            type:'text',     src:'vendedor_email' },
      { id:'inmueble_direccion',         label:'Dirección del inmueble',         type:'text',     src:'inmueble_direccion' },
      { id:'inmueble_tipo',              label:'Tipo de inmueble',               type:'text',     src:'inmueble_tipo' },
      { id:'regimen_propiedad',          label:'Régimen de Propiedad',          type:'text' },
      { id:'inmueble_antiguedad',        label:'Antigüedad',                     type:'text' },
      { id:'estado_conservacion',        label:'Estado de conservación',         type:'text' },
      { id:'niveles',                    label:'Niveles',                        type:'text' },
      { id:'inmueble_sup_t',             label:'M2 Terreno',                    type:'text',     src:'inmueble_sup_t' },
      { id:'inmueble_sup_c',             label:'M2 de Construcción',            type:'text',     src:'inmueble_sup_c' },
      { id:'inmueble_estac',             label:'Estacionamientos',               type:'text' },
      { id:'inmueble_recamaras',         label:'Recámaras',                      type:'text' },
      { id:'banos_completos',            label:'Baños Completos',               type:'text' },
      { id:'medios_banos',               label:'Medios baños',                   type:'text' },
      { id:'otras_areas',                label:'Otras áreas',                    type:'text' },
      { id:'tipo_operacion',             label:'Tipo de operación',              type:'text' },
      { id:'instalaciones_especiales',   label:'Instalaciones especiales',       type:'textarea' },
      { id:'distribucion',               label:'Distribución',                   type:'textarea' },
      { id:'materiales_construccion',    label:'Materiales de construcción',     type:'textarea' },
      { id:'rec_pisos',   label:'Acabados Recámaras — Pisos',    type:'text' },
      { id:'rec_muros',   label:'Acabados Recámaras — Muros',    type:'text' },
      { id:'rec_plafones',label:'Acabados Recámaras — Plafones', type:'text' },
      { id:'sala_pisos',  label:'Acabados Sala — Pisos',         type:'text' },
      { id:'sala_muros',  label:'Acabados Sala — Muros',         type:'text' },
      { id:'sala_plafones',label:'Acabados Sala — Plafones',     type:'text' },
      { id:'bano_pisos',  label:'Acabados Baños — Pisos',        type:'text' },
      { id:'bano_muros',  label:'Acabados Baños — Muros',        type:'text' },
      { id:'bano_plafones',label:'Acabados Baños — Plafones',    type:'text' },
      { id:'esc_pisos',   label:'Acabados Escalera — Pisos',     type:'text' },
      { id:'esc_muros',   label:'Acabados Escalera — Muros',     type:'text' },
      { id:'esc_plafones',label:'Acabados Escalera — Plafones',  type:'text' },
      { id:'coc_pisos',   label:'Acabados Cocina — Pisos',       type:'text' },
      { id:'coc_muros',   label:'Acabados Cocina — Muros',       type:'text' },
      { id:'coc_plafones',label:'Acabados Cocina — Plafones',    type:'text' },
      { id:'com_pisos',   label:'Acabados Comedor — Pisos',      type:'text' },
      { id:'com_muros',   label:'Acabados Comedor — Muros',      type:'text' },
      { id:'com_plafones',label:'Acabados Comedor — Plafones',   type:'text' },
      { id:'patio_pisos', label:'Acabados Patio serv. — Pisos',  type:'text' },
      { id:'patio_muros', label:'Acabados Patio serv. — Muros',  type:'text' },
      { id:'patio_plafones',label:'Acabados Patio serv. — Plafones',type:'text' },
      { id:'esta_pisos',  label:'Acabados Estacionamiento — Pisos',  type:'text' },
      { id:'esta_muros',  label:'Acabados Estacionamiento — Muros',  type:'text' },
      { id:'esta_plafones',label:'Acabados Estacionamiento — Plafones',type:'text' },
      { id:'fach_pisos',  label:'Acabados Fachada — Pisos',      type:'text' },
      { id:'fach_muros',  label:'Acabados Fachada — Muros',      type:'text' },
      { id:'fach_plafones',label:'Acabados Fachada — Plafones',  type:'text' },
      { id:'equipo_general',             label:'Equipamiento general',           type:'textarea' },
      { id:'zona_clasificacion',         label:'Clasificación de la zona',       type:'text' },
      { id:'construcciones_predominantes',label:'Construcciones predominantes',  type:'text' },
      { id:'electrificacion',            label:'Electrificación',               type:'text' },
      { id:'agua_potable',               label:'Agua Potable',                   type:'text' },
      { id:'drenaje',                    label:'Drenaje',                        type:'text' },
      { id:'vigilancia',                 label:'Vigilancia',                     type:'text' },
      { id:'transporte',                 label:'Transporte',                     type:'text' },
    ],
  },
  {
    id: 'levantamiento', name: 'Levantamiento de Información del Inmueble', cat: 'captacion',
    desc: 'Levantamiento de información del inmueble con acabados e infraestructura',
    fields: [
      { id:'agente_nombre',              label:'Agente Inmobiliario',            type:'text',     src:'agente_nombre' },
      { id:'agente_tel',                 label:'Teléfono',                       type:'text',     src:'agente_tel' },
      { id:'fecha_hoy',                  label:'Fecha de elaboración',           type:'date',     src:'fecha_hoy' },
      { id:'vendedor_nombre',            label:'Nombre del propietario',         type:'text',     src:'vendedor_nombre' },
      { id:'inmueble_direccion',         label:'Dirección del inmueble',         type:'text',     src:'inmueble_direccion' },
      { id:'inmueble_tipo',              label:'Tipo de inmueble',               type:'text',     src:'inmueble_tipo' },
      { id:'regimen_propiedad',          label:'Régimen de Propiedad',          type:'text' },
      { id:'inmueble_antiguedad',        label:'Antigüedad (años)',              type:'text' },
      { id:'estado_conservacion',        label:'Estado de conservación',         type:'text' },
      { id:'niveles',                    label:'Niveles',                        type:'text' },
      { id:'inmueble_sup_t',             label:'M2 Terreno',                    type:'text',     src:'inmueble_sup_t' },
      { id:'inmueble_sup_c',             label:'M2 de Construcción',            type:'text',     src:'inmueble_sup_c' },
      { id:'inmueble_estac',             label:'Estacionamientos',               type:'text' },
      { id:'inmueble_recamaras',         label:'Recámaras',                      type:'text' },
      { id:'banos_completos',            label:'Baños Completos',               type:'text' },
      { id:'medios_banos',               label:'Medios baños',                   type:'text' },
      { id:'otras_areas',                label:'Otras áreas',                    type:'text' },
      { id:'tipo_operacion',             label:'Tipo de operación',              type:'text' },
      { id:'instalaciones_especiales',   label:'Instalaciones especiales',       type:'textarea' },
      { id:'distribucion',               label:'Distribución',                   type:'textarea' },
      { id:'materiales_construccion',    label:'Materiales de construcción',     type:'textarea' },
      { id:'rec_pisos',    label:'Acabados Recámaras — Pisos',        type:'text' },
      { id:'rec_muros',    label:'Acabados Recámaras — Muros',        type:'text' },
      { id:'rec_plafones', label:'Acabados Recámaras — Plafones',     type:'text' },
      { id:'sala_pisos',   label:'Acabados Sala — Pisos',             type:'text' },
      { id:'sala_muros',   label:'Acabados Sala — Muros',             type:'text' },
      { id:'sala_plafones',label:'Acabados Sala — Plafones',          type:'text' },
      { id:'bano_pisos',   label:'Acabados Baños — Pisos',            type:'text' },
      { id:'bano_muros',   label:'Acabados Baños — Muros',            type:'text' },
      { id:'bano_plafones',label:'Acabados Baños — Plafones',         type:'text' },
      { id:'esc_pisos',    label:'Acabados Escalera — Pisos',         type:'text' },
      { id:'esc_muros',    label:'Acabados Escalera — Muros',         type:'text' },
      { id:'esc_plafones', label:'Acabados Escalera — Plafones',      type:'text' },
      { id:'coc_pisos',    label:'Acabados Cocina — Pisos',           type:'text' },
      { id:'coc_muros',    label:'Acabados Cocina — Muros',           type:'text' },
      { id:'coc_plafones', label:'Acabados Cocina — Plafones',        type:'text' },
      { id:'com_pisos',    label:'Acabados Comedor — Pisos',          type:'text' },
      { id:'com_muros',    label:'Acabados Comedor — Muros',          type:'text' },
      { id:'com_plafones', label:'Acabados Comedor — Plafones',       type:'text' },
      { id:'patio_pisos',  label:'Acabados Patio serv. — Pisos',      type:'text' },
      { id:'patio_muros',  label:'Acabados Patio serv. — Muros',      type:'text' },
      { id:'patio_plafones',label:'Acabados Patio serv. — Plafones',  type:'text' },
      { id:'esta_pisos',   label:'Acabados Estacionamiento — Pisos',  type:'text' },
      { id:'esta_muros',   label:'Acabados Estacionamiento — Muros',  type:'text' },
      { id:'esta_plafones',label:'Acabados Estacionamiento — Plafones',type:'text' },
      { id:'fach_pisos',   label:'Acabados Fachada — Pisos',          type:'text' },
      { id:'fach_muros',   label:'Acabados Fachada — Muros',          type:'text' },
      { id:'fach_plafones',label:'Acabados Fachada — Plafones',       type:'text' },
      { id:'equipo_general',              label:'Equipamiento general',          type:'textarea' },
      { id:'zona_clasificacion',          label:'Clasificación de la zona',      type:'text' },
      { id:'construcciones_predominantes',label:'Construcciones predominantes',  type:'text' },
      { id:'electrificacion',             label:'Electrificación',              type:'text' },
      { id:'agua_potable',                label:'Agua Potable',                  type:'text' },
      { id:'drenaje',                     label:'Drenaje',                       type:'text' },
      { id:'vigilancia',                  label:'Vigilancia',                    type:'text' },
      { id:'transporte',                  label:'Transporte',                    type:'text' },
    ],
  },
  {
    id: 'ficha_tecnica', name: 'Ficha Técnica', cat: 'captacion',
    desc: 'Ficha técnica del inmueble con especificaciones, distribución, croquis y fotografías',
    fields: [
      { id:'agente_nombre',          label:'Agente Inmobiliario',       type:'text',     src:'agente_nombre' },
      { id:'agente_tel',             label:'Teléfono',                  type:'text',     src:'agente_tel' },
      { id:'fecha_hoy',              label:'Fecha de elaboración',      type:'date',     src:'fecha_hoy' },
      { id:'inmueble_tipo',          label:'Tipo de inmueble',          type:'text',     src:'inmueble_tipo' },
      { id:'descripcion',            label:'Descripción',               type:'textarea', src:'inmueble_descripcion' },
      { id:'regimen_propiedad',      label:'Régimen de Propiedad',      type:'text' },
      { id:'arboles',                label:'Árboles',                   type:'text' },
      { id:'inmueble_antiguedad',    label:'Antigüedad',                type:'text',     src:'inmueble_antiguedad' },
      { id:'closets',                label:'Closets',                   type:'text' },
      { id:'estado_conservacion',    label:'Estado de conservación',    type:'text' },
      { id:'cocina_integral',        label:'Cocina Integral',           type:'text' },
      { id:'inmueble_sup_t',         label:'Área de Terreno',           type:'text',     src:'inmueble_sup_t' },
      { id:'cisterna',               label:'Cisterna',                  type:'text' },
      { id:'inmueble_sup_c',         label:'Área construida',           type:'text',     src:'inmueble_sup_c' },
      { id:'caseta_vigilancia',      label:'Caseta de vigilancia',      type:'text' },
      { id:'inmueble_estac',         label:'Espacios para autos',       type:'text',     src:'inmueble_estac' },
      { id:'urbanizacion_privada',   label:'Urbanización privada',      type:'text' },
      { id:'inmueble_recamaras',     label:'Recamaras',                 type:'text',     src:'inmueble_recamaras' },
      { id:'seguridad_privada',      label:'Seguridad privada',         type:'text' },
      { id:'banos_completos',        label:'Baños',                     type:'text' },
      { id:'area_eventos',           label:'Área de eventos',           type:'text' },
      { id:'medios_banos',           label:'Medios Baños',              type:'text' },
      { id:'asador',                 label:'Asador',                    type:'text' },
      { id:'patio',                  label:'Patio',                     type:'text' },
      { id:'area_deportiva',         label:'Área deportiva',            type:'text' },
      { id:'jardin',                 label:'Jardín(es)',                type:'text' },
      { id:'cancha',                 label:'Cancha(s)',                 type:'text' },
      { id:'inmueble_direccion',     label:'Dirección',                 type:'text',     src:'inmueble_direccion' },
      { id:'precio_total',           label:'Valor ($)',                 type:'text',     src:'precio_total' },
      { id:'moneda',                 label:'Divisa',                    type:'text',     src:'moneda' },
      { id:'planta_baja',            label:'Distribución Planta Baja',  type:'textarea' },
      { id:'planta_alta',            label:'Distribución Planta Alta',  type:'textarea' },
      { id:'situacion_legal',        label:'Situación legal',           type:'text' },
      { id:'zona_clasificacion',     label:'Zona',                      type:'text' },
      { id:'micro_localizacion',     label:'Microlocalización (URL o descripción)', type:'text' },
      { id:'macro_localizacion',     label:'Macrolocalización (URL o descripción)', type:'text' },
      { id:'foto_01',                label:'Fotografía 001 (URL)',      type:'text' },
      { id:'foto_02',                label:'Fotografía 002 (URL)',      type:'text' },
      { id:'foto_03',                label:'Fotografía 003 (URL)',      type:'text' },
      { id:'foto_04',                label:'Fotografía 004 (URL)',      type:'text' },
      { id:'foto_05',                label:'Fotografía 005 (URL)',      type:'text' },
      { id:'foto_06',                label:'Fotografía 006 (URL)',      type:'text' },
    ],
  },
  {
    id: 'perfilamiento', name: 'Perfilamiento del Prospecto Vendedor', cat: 'captacion',
    desc: 'Perfilamiento del prospecto vendedor con situación legal del inmueble y aviso de privacidad',
    fields: [
      { id:'agente_nombre',       label:'Agente Inmobiliario',                              type:'text',  src:'agente_nombre' },
      { id:'agente_tel',          label:'Teléfono',                                         type:'text',  src:'agente_tel' },
      { id:'fecha_hoy',           label:'Fecha de elaboración',                             type:'date',  src:'fecha_hoy' },
      { id:'vendedor_nombre',     label:'Nombre del propietario',                           type:'text',  src:'vendedor_nombre' },
      { id:'fecha_nacimiento',    label:'Fecha de nacimiento',                              type:'date' },
      { id:'estado_civil',        label:'Estado civil',                                     type:'text' },
      { id:'regimen_matrimonio',  label:'Régimen del matrimonio',                           type:'text' },
      { id:'estado_civil_compra', label:'Estado civil al momento de comprar el inmueble',  type:'text' },
      { id:'nacionalidad',        label:'Nacionalidad',                                     type:'text' },
      { id:'vendedor_email',      label:'Correo electrónico',                              type:'text',  src:'vendedor_email' },
      { id:'vendedor_domicilio',  label:'Dirección',                                        type:'text' },
      { id:'vendedor_tel_fijo',   label:'Teléfono fijo',                                   type:'text' },
      { id:'vendedor_tel',        label:'Teléfono Celular',                                 type:'text',  src:'vendedor_tel' },
      { id:'inmueble_direccion',  label:'Ubicación del inmueble',                           type:'text',  src:'inmueble_direccion' },
      { id:'inmueble_tipo',       label:'Tipo de propiedad',                                type:'text',  src:'inmueble_tipo' },
      { id:'regimen_propiedad',   label:'Régimen de Propiedad',                            type:'text' },
      { id:'uso_suelo',           label:'Uso de suelo',                                     type:'text' },
      { id:'inmueble_antiguedad', label:'Antigüedad (años)',                               type:'text',  src:'inmueble_antiguedad' },
      { id:'estado_conservacion', label:'Estado de conservación',                           type:'text' },
      { id:'caracteristicas',     label:'Características',                                 type:'textarea' },
      { id:'inmueble_sup_c',      label:'Metros cuadrados Construcción',                   type:'text',  src:'inmueble_sup_c' },
      { id:'inmueble_sup_t',      label:'Metros cuadrados Terreno',                        type:'text',  src:'inmueble_sup_t' },
      { id:'isr_exento',          label:'¿Ha exentado el ISR en venta de inmueble en los últimos 3 años?', type:'text' },
      { id:'gravamen',            label:'¿El inmueble presenta algún gravamen?',            type:'text' },
      { id:'tipo_gravamen',       label:'Tipo de gravamen',                                 type:'text' },
      { id:'monto_gravamen',      label:'Monto del gravamen',                               type:'text' },
      { id:'regimen_condominio',  label:'¿El inmueble se encuentra en régimen de condominio?', type:'text' },
      { id:'cuota_mantenimiento', label:'Monto de la cuota de mantenimiento mensual',       type:'text' },
      { id:'viable_comercializacion', label:'Es viable su comercialización',               type:'text' },
      { id:'motivo_venta',        label:'Motivo',                                           type:'text' },
    ],
  },
  {
    id: 'aviso_privacidad', name: 'Aviso de Privacidad', cat: 'captacion',
    desc: 'Aviso de privacidad conforme LFPDPPP',
    fields: [
      { id:'agente_nombre',    label:'Nombre del asesor inmobiliario', type:'text', src:'agente_nombre' },
      { id:'agente_domicilio', label:'Domicilio del asesor',           type:'text', src:'agente_domicilio' },
      { id:'lugar',            label:'Lugar',                          type:'text', src:'lugar' },
      { id:'fecha_hoy',        label:'Fecha',                          type:'date', src:'fecha_hoy' },
    ],
  },
  {
    id: 'carta_derechos', name: 'Carta de Derechos del Consumidor Adquirente', cat: 'captacion',
    desc: 'Carta de derechos del consumidor adquirente de casa habitación (NOM-247-SE-2021)',
    fields: [
      { id:'agente_nombre', label:'Nombre del asesor o inmobiliaria', type:'text', src:'agente_nombre' },
      { id:'lugar',         label:'Lugar',                            type:'text', src:'lugar' },
      { id:'fecha_hoy',     label:'Fecha',                            type:'date', src:'fecha_hoy' },
    ],
  },
  {
    id: 'propuesta_exclusiva', name: 'Propuesta para Promoción Exclusiva', cat: 'captacion',
    desc: 'Propuesta de valor para la promoción exclusiva de la propiedad',
    fields: [
      { id:'agente_nombre',        label:'Agente Inmobiliario',    type:'text', src:'agente_nombre' },
      { id:'agente_tel',           label:'Teléfono',               type:'text', src:'agente_tel' },
      { id:'fecha_hoy',            label:'Fecha de elaboración',   type:'date', src:'fecha_hoy' },
      { id:'trato',                label:'Trato (Sr./Sra./Lic.)', type:'text' },
      { id:'nombre_contraoferente',label:'Nombre del propietario', type:'text', src:'vendedor_nombre' },
    ],
  },
  // ── NEGOCIACIÓN ───────────────────────────────────────────────────────────
  {
    id: 'contraoferta', name: 'Contra Oferta de Compra Inmobiliaria', cat: 'negociacion',
    desc: 'Contra oferta de compra inmobiliaria con estructura de pago y plazos',
    fields: [
      { id:'agente_nombre',          label:'Agente Inmobiliario',                     type:'text', src:'agente_nombre' },
      { id:'agente_tel',             label:'Teléfono',                                type:'text', src:'agente_tel' },
      { id:'fecha_hoy',              label:'Fecha de elaboración',                    type:'date', src:'fecha_hoy' },
      { id:'nombre_ofertante',       label:'Nombre del Ofertante',                    type:'text' },
      { id:'inmueble_direccion',     label:'Dirección del Inmueble',                  type:'text', src:'inmueble_direccion' },
      { id:'nombre_contraoferente',  label:'Nombre del Contraoferente',               type:'text', src:'vendedor_nombre' },
      { id:'dir_contraoferente',     label:'Dirección del Contraoferente',            type:'text' },
      { id:'ciudad_contraoferente',  label:'Ciudad del Contraoferente',               type:'text', src:'inmueble_municipio' },
      { id:'estado_contraoferente',  label:'Estado del Contraoferente',               type:'text', src:'inmueble_estado' },
      { id:'tel_contraoferente',     label:'Teléfono del Contraoferente',             type:'text', src:'vendedor_tel' },
      { id:'inmueble_tipo',          label:'Tipo de Inmueble',                        type:'text', src:'inmueble_tipo' },
      { id:'inmueble_sup_t',         label:'Superficie de Terreno (m²)',             type:'text', src:'inmueble_sup_t' },
      { id:'inmueble_sup_c',         label:'Superficie de Construcción (m²)',        type:'text', src:'inmueble_sup_c' },
      { id:'caracteristicas',        label:'Características Relevantes',              type:'textarea' },
      { id:'monto_contraoferta_num', label:'Monto de la Contraoferta en Números ($)',type:'text', src:'precio_total' },
      { id:'monto_contraoferta_letra',label:'Monto de la Contraoferta en Letra',     type:'text' },
      { id:'monto_anticipo_num',     label:'Monto Anticipo en Números ($)',          type:'text' },
      { id:'monto_anticipo_letra',   label:'Monto Anticipo en Letra',               type:'text' },
      { id:'monto_contrato_num',     label:'Monto Contrato C-V en Números ($)',      type:'text' },
      { id:'monto_contrato_letra',   label:'Monto Contrato C-V en Letra',           type:'text' },
      { id:'fecha_max_contrato',     label:'Fecha Máxima Firma Contrato C-V',        type:'date' },
      { id:'monto_saldo_num',        label:'Monto Saldo Final en Números ($)',       type:'text' },
      { id:'monto_saldo_letra',      label:'Monto Saldo Final en Letra',            type:'text' },
      { id:'fecha_escrituracion',    label:'Fecha de Escrituración',                 type:'date' },
      { id:'num_dias',               label:'Número de Días de Vigencia',             type:'text' },
      { id:'num_dias_letra',         label:'Número de Días en Letra',               type:'text' },
      { id:'tipo_id',                label:'Tipo de Identificación',                 type:'text' },
      { id:'clave_id',               label:'Clave o Número de Identificación',       type:'text' },
      { id:'correo_contraoferente',  label:'Correo del Contraoferente',              type:'text', src:'vendedor_email' },
    ],
  },
  {
    id: 'resolucion_a', name: 'Resolución Formal del Propietario sobre Oferta', cat: 'negociacion',
    desc: 'Resolución formal del propietario sobre oferta o contraoferta recibida',
    fields: [
      { id:'agente_nombre',          label:'Agente Inmobiliario',                  type:'text', src:'agente_nombre' },
      { id:'agente_tel',             label:'Teléfono',                             type:'text', src:'agente_tel' },
      { id:'fecha_hoy',              label:'Fecha de elaboración',                 type:'date', src:'fecha_hoy' },
      { id:'trato',                  label:'Trato (Sr./Sra./Lic.)',               type:'text' },
      { id:'nombre_contraoferente',  label:'Nombre del Contraoferente',            type:'text' },
      { id:'inmueble_direccion',     label:'Dirección Completa del Inmueble',      type:'text', src:'inmueble_direccion' },
      { id:'tipo_documento',         label:'Oferta / Contraoferta (mencionar cuál)',type:'text' },
      { id:'fecha_oferta_recibida',  label:'Fecha de la Oferta/Contraoferta Recibida', type:'date' },
      { id:'monto_aceptado_num',     label:'Monto Aceptado en Números ($)',       type:'text', src:'precio_total' },
      { id:'monto_aceptado_letra',   label:'Monto Aceptado en Letra',            type:'text' },
      { id:'fecha_firma_contrato',   label:'Fecha Propuesta Firma Contrato C-V',  type:'date' },
      { id:'vendedor_nombre',        label:'Nombre del Propietario',              type:'text', src:'vendedor_nombre' },
      { id:'tipo_id',                label:'Tipo de Identificación',               type:'text' },
      { id:'clave_id',               label:'Clave o Número de Identificación',     type:'text' },
      { id:'vendedor_tel',           label:'Teléfono del Propietario',            type:'text', src:'vendedor_tel' },
      { id:'vendedor_email',         label:'Correo del Propietario',              type:'text', src:'vendedor_email' },
    ],
  },
  {
    id: 'resolucion_b', name: 'Resolución Formal del Propietario — Acepta con Modificaciones', cat: 'negociacion',
    desc: 'Resolución formal del propietario: acepta el principio de la oferta con modificaciones',
    fields: [
      { id:'agente_nombre',         label:'Agente Inmobiliario',                       type:'text', src:'agente_nombre' },
      { id:'agente_tel',            label:'Teléfono',                                  type:'text', src:'agente_tel' },
      { id:'fecha_hoy',             label:'Fecha de elaboración',                      type:'date', src:'fecha_hoy' },
      { id:'trato',                 label:'Trato (Sr./Sra./Lic.)',                    type:'text' },
      { id:'nombre_contraoferente', label:'Nombre del Contraoferente',                 type:'text' },
      { id:'inmueble_direccion',    label:'Dirección Completa del Inmueble',           type:'text', src:'inmueble_direccion' },
      { id:'tipo_documento',        label:'Oferta / Contraoferta (mencionar cuál)',    type:'text' },
      { id:'fecha_oferta_recibida', label:'Fecha de la Oferta/Contraoferta Recibida', type:'date' },
      { id:'nuevo_precio_num',      label:'Nuevo Precio en Números ($)',              type:'text' },
      { id:'nuevo_precio_letra',    label:'Nuevo Precio en Letra',                   type:'text' },
      { id:'condiciones',           label:'Condiciones',                               type:'textarea' },
      { id:'fecha_firma_contrato',  label:'Fecha Propuesta Firma Contrato C-V',       type:'date' },
      { id:'vendedor_nombre',       label:'Nombre del Propietario',                   type:'text', src:'vendedor_nombre' },
      { id:'tipo_id',               label:'Tipo de Identificación',                    type:'text' },
      { id:'clave_id',              label:'Clave o Número de Identificación',          type:'text' },
      { id:'vendedor_tel',          label:'Teléfono del Propietario',                 type:'text', src:'vendedor_tel' },
      { id:'vendedor_email',        label:'Correo del Propietario',                   type:'text', src:'vendedor_email' },
    ],
  },
  {
    id: 'resolucion_c', name: 'Resolución Formal del Propietario — No Acepta', cat: 'negociacion',
    desc: 'Resolución formal del propietario: no es posible aceptar la oferta/contraoferta',
    fields: [
      { id:'agente_nombre',         label:'Agente Inmobiliario',                       type:'text', src:'agente_nombre' },
      { id:'agente_tel',            label:'Teléfono',                                  type:'text', src:'agente_tel' },
      { id:'fecha_hoy',             label:'Fecha de elaboración',                      type:'date', src:'fecha_hoy' },
      { id:'trato',                 label:'Trato (Sr./Sra./Lic.)',                    type:'text' },
      { id:'nombre_contraoferente', label:'Nombre del Contraoferente',                 type:'text' },
      { id:'inmueble_direccion',    label:'Dirección Completa del Inmueble',           type:'text', src:'inmueble_direccion' },
      { id:'tipo_documento',        label:'Oferta / Contraoferta (mencionar cuál)',    type:'text' },
      { id:'fecha_oferta_recibida', label:'Fecha de la Oferta/Contraoferta Recibida', type:'date' },
      { id:'causa_rechazo',         label:'Causa breve del rechazo',                   type:'text' },
      { id:'vendedor_nombre',       label:'Nombre del Propietario',                   type:'text', src:'vendedor_nombre' },
      { id:'tipo_id',               label:'Tipo de Identificación',                    type:'text' },
      { id:'clave_id',              label:'Clave o Número de Identificación',          type:'text' },
      { id:'vendedor_tel',          label:'Teléfono del Propietario',                 type:'text', src:'vendedor_tel' },
      { id:'vendedor_email',        label:'Correo del Propietario',                   type:'text', src:'vendedor_email' },
    ],
  },
  // ── CONTRATOS PROFECO ─────────────────────────────────────────────────────
  {
    id: 'cv_vivienda', name: 'Contrato Compraventa — Vivienda', cat: 'profeco',
    desc: 'Modelo PROFECO — Contrato de adhesión de compraventa de terreno destinado a casa habitación',
    fields: [
      // Parte vendedora
      { id:'vendedor_nombre',           label:'Nombre/razón social de la parte vendedora',           type:'text',     src:'vendedor_nombre' },
      { id:'vendedor_comparece',        label:'Comparece (por su propio derecho / a través de)',      type:'text' },
      { id:'vendedor_rep_nombre',       label:'Nombre del apoderado/representante legal (vendedora)', type:'text' },
      { id:'vendedor_rep_cargo',        label:'Cargo del representante — vendedora (apoderado/representante legal)', type:'text' },
      { id:'vendedor_nacionalidad',     label:'Nacionalidad de la parte vendedora',                   type:'text' },
      { id:'vendedor_id_tipo',          label:'Tipo de ID vendedora (credencial, pasaporte, etc.)',   type:'text' },
      { id:'vendedor_id_folio',         label:'Número de folio ID vendedora',                         type:'text' },
      { id:'vendedor_id_autoridad',     label:'Autoridad emisora ID vendedora',                       type:'text' },
      { id:'vendedor_doc_publico_num',  label:'Número de documento público constitutivo (vendedora)', type:'text' },
      { id:'vendedor_notario_tipo',     label:'Tipo de fedatario — vendedora (Notario/Corredor)',     type:'text' },
      { id:'vendedor_notario_num',      label:'Número de Notario/Corredor — vendedora',               type:'text' },
      { id:'vendedor_notario_localidad',label:'Localidad del Notario/Corredor — vendedora',           type:'text' },
      { id:'vendedor_notario_nombre',   label:'Nombre del Notario/Corredor — vendedora',              type:'text' },
      { id:'vendedor_folio_mercantil',  label:'Folio mercantil — vendedora',                          type:'text' },
      { id:'vendedor_docs_consulta',    label:'Domicilio o link para consulta de documentos — vendedora', type:'text' },
      { id:'vendedor_ocupacion',        label:'Ocupación habitual/objeto social — vendedora',         type:'text' },
      { id:'vendedor_domicilio',        label:'Domicilio de la parte vendedora',                      type:'text' },
      { id:'vendedor_rfc',              label:'RFC de la parte vendedora',                            type:'text' },
      { id:'vendedor_notif_domicilio',  label:'Domicilio para notificaciones — vendedora',            type:'text' },
      { id:'vendedor_notif_email',      label:'Correo electrónico para notificaciones — vendedora',   type:'text',     src:'vendedor_email' },
      // Terreno / escritura
      { id:'inmueble_direccion',        label:'Dirección del terreno',                                type:'text',     src:'inmueble_direccion' },
      { id:'escritura_num',             label:'Número de escritura pública del terreno',              type:'text' },
      { id:'escritura_fecha',           label:'Fecha de escritura (día-mes-año)',                     type:'text' },
      { id:'notario_num',               label:'Número de Notario Público del terreno',               type:'text' },
      { id:'notario_localidad',         label:'Localidad del Notario Público del terreno',           type:'text',     src:'inmueble_municipio' },
      { id:'notario_nombre',            label:'Nombre del Notario Público del terreno',              type:'text' },
      { id:'rpp_fecha',                 label:'Fecha de inscripción en RPP (día-mes-año)',            type:'text' },
      { id:'rpp_localidad',             label:'Localidad del RPP',                                    type:'text' },
      { id:'folio_real',                label:'Folio real en RPP',                                    type:'text' },
      { id:'contrato_privado_fecha',    label:'Fecha del contrato privado (día-mes-año)',             type:'text' },
      { id:'ratificacion_fecha',        label:'Fecha de ratificación del contrato privado',          type:'text' },
      { id:'ratificacion_notario_num',  label:'Número de Notario Público — ratificación',            type:'text' },
      { id:'ratificacion_localidad',    label:'Localidad del Notario — ratificación',                type:'text' },
      { id:'ratificacion_notario_nombre',label:'Nombre del Notario — ratificación',                  type:'text' },
      { id:'ratificacion_rpp_fecha',    label:'Fecha inscripción RPP — ratificación',                type:'text' },
      { id:'ratificacion_rpp_localidad',label:'Localidad RPP — ratificación',                       type:'text' },
      { id:'ratificacion_folio_real',   label:'Folio real RPP — ratificación',                       type:'text' },
      // Condominio (si aplica)
      { id:'condominio_escritura_num',  label:'Escritura condominio — número',                        type:'text' },
      { id:'condominio_escritura_fecha',label:'Escritura condominio — fecha',                         type:'text' },
      { id:'condominio_notario_num',    label:'Notario condominio — número',                          type:'text' },
      { id:'condominio_notario_localidad',label:'Notario condominio — localidad',                     type:'text' },
      { id:'condominio_notario_nombre', label:'Notario condominio — nombre',                          type:'text' },
      { id:'condominio_rpp_fecha',      label:'RPP condominio — fecha inscripción',                   type:'text' },
      { id:'condominio_rpp_localidad',  label:'RPP condominio — localidad',                           type:'text' },
      { id:'condominio_folio_real',     label:'RPP condominio — folio real',                          type:'text' },
      { id:'uso_suelo',                 label:'Uso de suelo del terreno',                             type:'text' },
      { id:'licencias_permisos',        label:'Licencias, permisos y autorizaciones',                 type:'textarea' },
      // Parte compradora
      { id:'comprador_nombre',          label:'Nombre/razón social de la parte compradora',           type:'text' },
      { id:'comprador_comparece',       label:'Comparece (por su propio derecho / a través de)',      type:'text' },
      { id:'comprador_rep_nombre',      label:'Nombre del apoderado/representante legal (compradora)',type:'text' },
      { id:'comprador_rep_cargo',       label:'Cargo del representante — compradora',                 type:'text' },
      { id:'comprador_nacionalidad',    label:'Nacionalidad de la parte compradora',                  type:'text' },
      { id:'comprador_id_tipo',         label:'Tipo de ID compradora (credencial, pasaporte, etc.)',  type:'text' },
      { id:'comprador_id_folio',        label:'Número de folio ID compradora',                        type:'text' },
      { id:'comprador_id_autoridad',    label:'Autoridad emisora ID compradora',                      type:'text' },
      { id:'comprador_edad',            label:'Edad de la parte compradora',                          type:'text' },
      { id:'comprador_estado_civil',    label:'Estado civil de la parte compradora',                  type:'text' },
      { id:'comprador_doc_publico_num', label:'Número de documento público constitutivo (compradora)',type:'text' },
      { id:'comprador_notario_tipo',    label:'Tipo de fedatario — compradora (Notario/Corredor)',    type:'text' },
      { id:'comprador_notario_num',     label:'Número de Notario/Corredor — compradora',              type:'text' },
      { id:'comprador_notario_localidad',label:'Localidad del Notario/Corredor — compradora',        type:'text' },
      { id:'comprador_notario_nombre',  label:'Nombre del Notario/Corredor — compradora',             type:'text' },
      { id:'comprador_folio_mercantil', label:'Folio mercantil — compradora',                         type:'text' },
      { id:'comprador_domicilio',       label:'Domicilio de la parte compradora',                     type:'text' },
      { id:'comprador_rfc',             label:'RFC de la parte compradora',                           type:'text' },
      { id:'comprador_notif_domicilio', label:'Domicilio para notificaciones — compradora',           type:'text' },
      { id:'comprador_notif_email',     label:'Correo electrónico para notificaciones — compradora',  type:'text' },
      // Precio y pagos
      { id:'precio_total',              label:'Precio total ($)',                                      type:'text',     src:'precio_total' },
      { id:'precio_letra',              label:'Precio total con letra',                               type:'text' },
      { id:'contado_escritura_monto',   label:'Pago al contado en escritura ($)',                     type:'text' },
      { id:'contado_escritura_letra',   label:'Pago al contado en escritura (letra)',                 type:'text' },
      { id:'anticipo_fecha',            label:'Fecha del anticipo (día-mes-año)',                      type:'text' },
      { id:'anticipo_monto',            label:'Monto del anticipo ($)',                               type:'text' },
      { id:'anticipo_letra',            label:'Monto del anticipo (letra)',                           type:'text' },
      { id:'enganche_monto',            label:'Monto del enganche ($)',                               type:'text' },
      { id:'enganche_letra',            label:'Monto del enganche (letra)',                           type:'text' },
      { id:'pago_plazo_monto',          label:'Pago a plazo ($)',                                     type:'text' },
      { id:'pago_plazo_letra',          label:'Pago a plazo (letra)',                                 type:'text' },
      { id:'pago_plazo_dia',            label:'Día del pago a plazo',                                 type:'text' },
      { id:'pago_plazo_mes',            label:'Mes del pago a plazo',                                 type:'text' },
      { id:'pago_plazo_anio',           label:'Año del pago a plazo',                                 type:'text' },
      { id:'saldo_escritura_monto',     label:'Saldo en escrituración ($)',                           type:'text' },
      { id:'saldo_escritura_letra',     label:'Saldo en escrituración (letra)',                       type:'text' },
      { id:'metodo_pago',               label:'Método de pago',                                       type:'text' },
      { id:'credito_info',              label:'Información del crédito e institución acreditante',    type:'text' },
      { id:'interes_moratorio_pct',     label:'Porcentaje de interés moratorio (%)',                  type:'text' },
      { id:'interes_moratorio_periodo', label:'Periodo del interés moratorio (mensual/anual)',        type:'text' },
      { id:'interes_moratorio_calculo', label:'Parámetro de cálculo del interés moratorio',           type:'text' },
      // Gastos y plazos
      { id:'gastos_operativos',         label:'Gastos operativos a cargo de la compradora',           type:'textarea' },
      { id:'plazo_cancelar',            label:'Plazo para cancelar (días hábiles, mín. 5)',           type:'text' },
      { id:'interes_devolucion_pct',    label:'Interés moratorio por devolución tardía (%)',          type:'text' },
      { id:'interes_devolucion_periodo',label:'Periodo interés devolución (mensual/anual)',           type:'text' },
      { id:'interes_devolucion_calculo',label:'Parámetro cálculo interés devolución',                type:'text' },
      { id:'dias_escrituracion',        label:'Días naturales para firma de escritura',               type:'text' },
      // Entrega
      { id:'entrega_dia',               label:'Día de entrega del terreno',                           type:'text' },
      { id:'entrega_mes',               label:'Mes de entrega del terreno',                           type:'text' },
      { id:'entrega_anio',              label:'Año de entrega del terreno',                           type:'text' },
      // Restricciones
      { id:'restricciones_ambientales', label:'Restricciones ambientales (si aplica)',                type:'textarea' },
      { id:'colindancias_ecologicas',   label:'Colindancias con zonas ecológicas (si aplica)',        type:'textarea' },
      { id:'otras_limitaciones',        label:'Otras limitaciones oficiales (si aplica)',              type:'textarea' },
      // Pena y rescisión
      { id:'pena_convencional_pct',     label:'Porcentaje de pena convencional (%)',                  type:'text' },
      { id:'interes_rescision_pct',     label:'Interés moratorio por rescisión (%)',                  type:'text' },
      { id:'interes_rescision_periodo', label:'Periodo interés rescisión (mensual/anual)',            type:'text' },
      { id:'interes_rescision_calculo', label:'Parámetro cálculo interés rescisión',                  type:'text' },
      { id:'legislacion_sucesion',      label:'Disposiciones jurídicas aplicables para sucesión',    type:'text' },
      // Canales de atención
      { id:'canal_atencion',            label:'Canal de atención (teléfono, email, web, etc.)',       type:'text' },
      { id:'canal_dias',                label:'Días habilitados del canal de atención',               type:'text' },
      { id:'canal_horario',             label:'Horario del canal de atención',                        type:'text' },
      { id:'canal_plazo_respuesta',     label:'Plazo de respuesta del canal de atención',             type:'text' },
      // Jurisdicción y registro PROFECO
      { id:'jurisdiccion_lugar',        label:'Lugar de jurisdicción de autoridades',                 type:'text',     src:'inmueble_municipio' },
      { id:'plazo_responsabilidad_civil',label:'Plazo prescripción: Responsabilidad civil',           type:'text' },
      { id:'legislacion_responsabilidad_civil',label:'Legislación: Responsabilidad civil',            type:'text' },
      { id:'plazo_vicios_ocultos',      label:'Plazo prescripción: Vicios ocultos del inmueble',     type:'text' },
      { id:'legislacion_vicios_ocultos',label:'Legislación: Vicios ocultos del inmueble',            type:'text' },
      { id:'plazo_eviccion',            label:'Plazo prescripción: Evicción',                         type:'text' },
      { id:'legislacion_eviccion',      label:'Legislación: Evicción',                                type:'text' },
      { id:'registro_dia',              label:'Día de registro del contrato en PROFECO',              type:'text' },
      { id:'registro_mes',              label:'Mes de registro del contrato en PROFECO',              type:'text' },
      { id:'registro_anio',             label:'Año de registro del contrato en PROFECO',              type:'text' },
      { id:'registro_num',              label:'Número de registro en PROFECO',                        type:'text' },
      { id:'firma_dia',                 label:'Día de firma del contrato',                            type:'text' },
      { id:'firma_mes',                 label:'Mes de firma del contrato',                            type:'text' },
      { id:'firma_anio',                label:'Año de firma del contrato',                            type:'text' },
      { id:'lugar_celebracion',         label:'Lugar de celebración del contrato',                    type:'text',     src:'lugar' },
    ],
  },
  {
    id: 'cv_terreno', name: 'Contrato Compraventa — Terreno', cat: 'profeco',
    desc: 'Modelo PROFECO — Contrato de adhesión de compraventa de terreno destinado a casa habitación',
    fields: [
      // Parte vendedora
      { id:'vendedor_nombre',           label:'Nombre/razón social de la parte vendedora',           type:'text',     src:'vendedor_nombre' },
      { id:'vendedor_comparece',        label:'Comparece (por su propio derecho / a través de)',      type:'text' },
      { id:'vendedor_rep_nombre',       label:'Nombre del apoderado/representante legal (vendedora)', type:'text' },
      { id:'vendedor_rep_cargo',        label:'Cargo del representante — vendedora (apoderado/representante legal)', type:'text' },
      { id:'vendedor_nacionalidad',     label:'Nacionalidad de la parte vendedora',                   type:'text' },
      { id:'vendedor_id_tipo',          label:'Tipo de ID vendedora (credencial, pasaporte, etc.)',   type:'text' },
      { id:'vendedor_id_folio',         label:'Número de folio ID vendedora',                         type:'text' },
      { id:'vendedor_id_autoridad',     label:'Autoridad emisora ID vendedora',                       type:'text' },
      { id:'vendedor_doc_publico_num',  label:'Número de documento público constitutivo (vendedora)', type:'text' },
      { id:'vendedor_notario_tipo',     label:'Tipo de fedatario — vendedora (Notario/Corredor)',     type:'text' },
      { id:'vendedor_notario_num',      label:'Número de Notario/Corredor — vendedora',               type:'text' },
      { id:'vendedor_notario_localidad',label:'Localidad del Notario/Corredor — vendedora',           type:'text' },
      { id:'vendedor_notario_nombre',   label:'Nombre del Notario/Corredor — vendedora',              type:'text' },
      { id:'vendedor_folio_mercantil',  label:'Folio mercantil — vendedora',                          type:'text' },
      { id:'vendedor_docs_consulta',    label:'Domicilio o link para consulta de documentos — vendedora', type:'text' },
      { id:'vendedor_ocupacion',        label:'Ocupación habitual/objeto social — vendedora',         type:'text' },
      { id:'vendedor_domicilio',        label:'Domicilio de la parte vendedora',                      type:'text' },
      { id:'vendedor_rfc',              label:'RFC de la parte vendedora',                            type:'text' },
      { id:'vendedor_notif_domicilio',  label:'Domicilio para notificaciones — vendedora',            type:'text' },
      { id:'vendedor_notif_email',      label:'Correo electrónico para notificaciones — vendedora',   type:'text',     src:'vendedor_email' },
      // Terreno / escritura
      { id:'inmueble_direccion',        label:'Dirección del terreno',                                type:'text',     src:'inmueble_direccion' },
      { id:'escritura_num',             label:'Número de escritura pública del terreno',              type:'text' },
      { id:'escritura_fecha',           label:'Fecha de escritura (día-mes-año)',                     type:'text' },
      { id:'notario_num',               label:'Número de Notario Público del terreno',               type:'text' },
      { id:'notario_localidad',         label:'Localidad del Notario Público del terreno',           type:'text',     src:'inmueble_municipio' },
      { id:'notario_nombre',            label:'Nombre del Notario Público del terreno',              type:'text' },
      { id:'rpp_fecha',                 label:'Fecha de inscripción en RPP (día-mes-año)',            type:'text' },
      { id:'rpp_localidad',             label:'Localidad del RPP',                                    type:'text' },
      { id:'folio_real',                label:'Folio real en RPP',                                    type:'text' },
      { id:'contrato_privado_fecha',    label:'Fecha del contrato privado (día-mes-año)',             type:'text' },
      { id:'ratificacion_fecha',        label:'Fecha de ratificación del contrato privado',          type:'text' },
      { id:'ratificacion_notario_num',  label:'Número de Notario Público — ratificación',            type:'text' },
      { id:'ratificacion_localidad',    label:'Localidad del Notario — ratificación',                type:'text' },
      { id:'ratificacion_notario_nombre',label:'Nombre del Notario — ratificación',                  type:'text' },
      { id:'ratificacion_rpp_fecha',    label:'Fecha inscripción RPP — ratificación',                type:'text' },
      { id:'ratificacion_rpp_localidad',label:'Localidad RPP — ratificación',                       type:'text' },
      { id:'ratificacion_folio_real',   label:'Folio real RPP — ratificación',                       type:'text' },
      // Condominio (si aplica)
      { id:'condominio_escritura_num',  label:'Escritura condominio — número',                        type:'text' },
      { id:'condominio_escritura_fecha',label:'Escritura condominio — fecha',                         type:'text' },
      { id:'condominio_notario_num',    label:'Notario condominio — número',                          type:'text' },
      { id:'condominio_notario_localidad',label:'Notario condominio — localidad',                     type:'text' },
      { id:'condominio_notario_nombre', label:'Notario condominio — nombre',                          type:'text' },
      { id:'condominio_rpp_fecha',      label:'RPP condominio — fecha inscripción',                   type:'text' },
      { id:'condominio_rpp_localidad',  label:'RPP condominio — localidad',                           type:'text' },
      { id:'condominio_folio_real',     label:'RPP condominio — folio real',                          type:'text' },
      { id:'uso_suelo',                 label:'Uso de suelo del terreno',                             type:'text' },
      { id:'licencias_permisos',        label:'Licencias, permisos y autorizaciones',                 type:'textarea' },
      // Parte compradora
      { id:'comprador_nombre',          label:'Nombre/razón social de la parte compradora',           type:'text' },
      { id:'comprador_comparece',       label:'Comparece (por su propio derecho / a través de)',      type:'text' },
      { id:'comprador_rep_nombre',      label:'Nombre del apoderado/representante legal (compradora)',type:'text' },
      { id:'comprador_rep_cargo',       label:'Cargo del representante — compradora',                 type:'text' },
      { id:'comprador_nacionalidad',    label:'Nacionalidad de la parte compradora',                  type:'text' },
      { id:'comprador_id_tipo',         label:'Tipo de ID compradora (credencial, pasaporte, etc.)',  type:'text' },
      { id:'comprador_id_folio',        label:'Número de folio ID compradora',                        type:'text' },
      { id:'comprador_id_autoridad',    label:'Autoridad emisora ID compradora',                      type:'text' },
      { id:'comprador_edad',            label:'Edad de la parte compradora',                          type:'text' },
      { id:'comprador_estado_civil',    label:'Estado civil de la parte compradora',                  type:'text' },
      { id:'comprador_doc_publico_num', label:'Número de documento público constitutivo (compradora)',type:'text' },
      { id:'comprador_notario_tipo',    label:'Tipo de fedatario — compradora (Notario/Corredor)',    type:'text' },
      { id:'comprador_notario_num',     label:'Número de Notario/Corredor — compradora',              type:'text' },
      { id:'comprador_notario_localidad',label:'Localidad del Notario/Corredor — compradora',        type:'text' },
      { id:'comprador_notario_nombre',  label:'Nombre del Notario/Corredor — compradora',             type:'text' },
      { id:'comprador_folio_mercantil', label:'Folio mercantil — compradora',                         type:'text' },
      { id:'comprador_domicilio',       label:'Domicilio de la parte compradora',                     type:'text' },
      { id:'comprador_rfc',             label:'RFC de la parte compradora',                           type:'text' },
      { id:'comprador_notif_domicilio', label:'Domicilio para notificaciones — compradora',           type:'text' },
      { id:'comprador_notif_email',     label:'Correo electrónico para notificaciones — compradora',  type:'text' },
      // Precio y pagos
      { id:'precio_total',              label:'Precio total ($)',                                      type:'text',     src:'precio_total' },
      { id:'precio_letra',              label:'Precio total con letra',                               type:'text' },
      { id:'contado_escritura_monto',   label:'Pago al contado en escritura ($)',                     type:'text' },
      { id:'contado_escritura_letra',   label:'Pago al contado en escritura (letra)',                 type:'text' },
      { id:'anticipo_fecha',            label:'Fecha del anticipo (día-mes-año)',                      type:'text' },
      { id:'anticipo_monto',            label:'Monto del anticipo ($)',                               type:'text' },
      { id:'anticipo_letra',            label:'Monto del anticipo (letra)',                           type:'text' },
      { id:'enganche_monto',            label:'Monto del enganche ($)',                               type:'text' },
      { id:'enganche_letra',            label:'Monto del enganche (letra)',                           type:'text' },
      { id:'pago_plazo_monto',          label:'Pago a plazo ($)',                                     type:'text' },
      { id:'pago_plazo_letra',          label:'Pago a plazo (letra)',                                 type:'text' },
      { id:'pago_plazo_dia',            label:'Día del pago a plazo',                                 type:'text' },
      { id:'pago_plazo_mes',            label:'Mes del pago a plazo',                                 type:'text' },
      { id:'pago_plazo_anio',           label:'Año del pago a plazo',                                 type:'text' },
      { id:'saldo_escritura_monto',     label:'Saldo en escrituración ($)',                           type:'text' },
      { id:'saldo_escritura_letra',     label:'Saldo en escrituración (letra)',                       type:'text' },
      { id:'metodo_pago',               label:'Método de pago',                                       type:'text' },
      { id:'credito_info',              label:'Información del crédito e institución acreditante',    type:'text' },
      { id:'interes_moratorio_pct',     label:'Porcentaje de interés moratorio (%)',                  type:'text' },
      { id:'interes_moratorio_periodo', label:'Periodo del interés moratorio (mensual/anual)',        type:'text' },
      { id:'interes_moratorio_calculo', label:'Parámetro de cálculo del interés moratorio',           type:'text' },
      // Gastos y plazos
      { id:'gastos_operativos',         label:'Gastos operativos a cargo de la compradora',           type:'textarea' },
      { id:'plazo_cancelar',            label:'Plazo para cancelar (días hábiles, mín. 5)',           type:'text' },
      { id:'interes_devolucion_pct',    label:'Interés moratorio por devolución tardía (%)',          type:'text' },
      { id:'interes_devolucion_periodo',label:'Periodo interés devolución (mensual/anual)',           type:'text' },
      { id:'interes_devolucion_calculo',label:'Parámetro cálculo interés devolución',                type:'text' },
      { id:'dias_escrituracion',        label:'Días naturales para firma de escritura',               type:'text' },
      // Entrega
      { id:'entrega_dia',               label:'Día de entrega del terreno',                           type:'text' },
      { id:'entrega_mes',               label:'Mes de entrega del terreno',                           type:'text' },
      { id:'entrega_anio',              label:'Año de entrega del terreno',                           type:'text' },
      // Restricciones
      { id:'restricciones_ambientales', label:'Restricciones ambientales (si aplica)',                type:'textarea' },
      { id:'colindancias_ecologicas',   label:'Colindancias con zonas ecológicas (si aplica)',        type:'textarea' },
      { id:'otras_limitaciones',        label:'Otras limitaciones oficiales (si aplica)',              type:'textarea' },
      // Pena y rescisión
      { id:'pena_convencional_pct',     label:'Porcentaje de pena convencional (%)',                  type:'text' },
      { id:'interes_rescision_pct',     label:'Interés moratorio por rescisión (%)',                  type:'text' },
      { id:'interes_rescision_periodo', label:'Periodo interés rescisión (mensual/anual)',            type:'text' },
      { id:'interes_rescision_calculo', label:'Parámetro cálculo interés rescisión',                  type:'text' },
      { id:'legislacion_sucesion',      label:'Disposiciones jurídicas aplicables para sucesión',    type:'text' },
      // Canales de atención
      { id:'canal_atencion',            label:'Canal de atención (teléfono, email, web, etc.)',       type:'text' },
      { id:'canal_dias',                label:'Días habilitados del canal de atención',               type:'text' },
      { id:'canal_horario',             label:'Horario del canal de atención',                        type:'text' },
      { id:'canal_plazo_respuesta',     label:'Plazo de respuesta del canal de atención',             type:'text' },
      // Jurisdicción y registro PROFECO
      { id:'jurisdiccion_lugar',        label:'Lugar de jurisdicción de autoridades',                 type:'text',     src:'inmueble_municipio' },
      { id:'plazo_responsabilidad_civil',label:'Plazo prescripción: Responsabilidad civil',           type:'text' },
      { id:'legislacion_responsabilidad_civil',label:'Legislación: Responsabilidad civil',            type:'text' },
      { id:'plazo_vicios_ocultos',      label:'Plazo prescripción: Vicios ocultos del inmueble',     type:'text' },
      { id:'legislacion_vicios_ocultos',label:'Legislación: Vicios ocultos del inmueble',            type:'text' },
      { id:'plazo_eviccion',            label:'Plazo prescripción: Evicción',                         type:'text' },
      { id:'legislacion_eviccion',      label:'Legislación: Evicción',                                type:'text' },
      { id:'registro_dia',              label:'Día de registro del contrato en PROFECO',              type:'text' },
      { id:'registro_mes',              label:'Mes de registro del contrato en PROFECO',              type:'text' },
      { id:'registro_anio',             label:'Año de registro del contrato en PROFECO',              type:'text' },
      { id:'registro_num',              label:'Número de registro en PROFECO',                        type:'text' },
      { id:'firma_dia',                 label:'Día de firma del contrato',                            type:'text' },
      { id:'firma_mes',                 label:'Mes de firma del contrato',                            type:'text' },
      { id:'firma_anio',                label:'Año de firma del contrato',                            type:'text' },
      { id:'lugar_celebracion',         label:'Lugar de celebración del contrato',                    type:'text',     src:'lugar' },
    ],
  },
  {
    id: 'cv_preventa', name: 'Contrato Preventa / En Planos', cat: 'profeco',
    desc: 'Modelo PROFECO — Compraventa de inmueble en construcción o planos',
    fields: [
      { id:'fecha_hoy',         label:'Fecha del contrato',        type:'date',   src:'fecha_hoy' },
      { id:'lugar',             label:'Lugar de firma',            type:'text',   src:'lugar' },
      { id:'vendedor_nombre',   label:'Nombre del vendedor / desarrollador', type:'text', src:'vendedor_nombre' },
      { id:'vendedor_rfc',      label:'RFC del vendedor',          type:'text' },
      { id:'vendedor_domicilio',label:'Domicilio fiscal del vendedor', type:'text' },
      { id:'comprador_nombre',  label:'Nombre del comprador',      type:'text' },
      { id:'comprador_curp',    label:'CURP del comprador',        type:'text' },
      { id:'comprador_rfc',     label:'RFC del comprador',         type:'text' },
      { id:'comprador_id_tipo', label:'Tipo de ID comprador',      type:'select', opts:['INE/IFE','Pasaporte','Cédula profesional'] },
      { id:'comprador_id_num',  label:'Número de ID comprador',    type:'text' },
      { id:'comprador_domicilio',label:'Domicilio del comprador',  type:'text' },
      { id:'proyecto_nombre',   label:'Nombre del proyecto / fraccionamiento', type:'text' },
      { id:'unidad_num',        label:'Número de unidad / lote',   type:'text' },
      { id:'inmueble_tipo',     label:'Tipo de inmueble',          type:'text',   src:'inmueble_tipo' },
      { id:'inmueble_municipio',label:'Municipio',                 type:'text',   src:'inmueble_municipio' },
      { id:'inmueble_estado',   label:'Estado',                    type:'text',   src:'inmueble_estado' },
      { id:'sup_construida',    label:'Superficie construida prometida (m²)', type:'text', src:'inmueble_sup_c' },
      { id:'sup_terreno',       label:'Superficie de terreno (m²)',type:'text',   src:'inmueble_sup_t' },
      { id:'descripcion_unidad',label:'Descripción de la unidad (recámaras, acabados)', type:'textarea' },
      { id:'precio_total',      label:'Precio total ($)',           type:'text',   src:'precio_total' },
      { id:'precio_letra',      label:'Precio con letra',          type:'text' },
      { id:'anticipo_monto',    label:'Anticipo ($)',               type:'text' },
      { id:'anticipo_fecha',    label:'Fecha de anticipo',         type:'date' },
      { id:'mensualidades_num', label:'Número de mensualidades',   type:'text' },
      { id:'mensualidades_monto',label:'Monto de mensualidad ($)', type:'text' },
      { id:'saldo_escritura',   label:'Saldo en escrituración ($)',type:'text' },
      { id:'entrega_estimada',  label:'Fecha estimada de entrega', type:'date' },
      { id:'penalidad_retraso', label:'Penalidad por retraso del vendedor', type:'text' },
      { id:'licencia_construccion',label:'Número de licencia de construcción', type:'text' },
      { id:'notaria',           label:'Notaría designada',         type:'text' },
      { id:'testigo1_nombre',   label:'Testigo 1 — nombre',        type:'text' },
      { id:'testigo2_nombre',   label:'Testigo 2 — nombre',        type:'text' },
      { id:'agente_nombre',     label:'Agente inmobiliario',       type:'text',   src:'agente_nombre' },
      { id:'agente_agencia',    label:'Agencia',                   type:'text',   src:'agente_agencia' },
    ],
  },
]

// ─── Categorías ───────────────────────────────────────────────────────────────
const CAT_META = {
  captacion:  { label: 'Captación',         color: '#22d3ee', icon: '📋' },
  negociacion:{ label: 'Negociación',        color: '#fb923c', icon: '🤝' },
  profeco:    { label: 'Contratos PROFECO',  color: '#a78bfa', icon: '📜' },
}

// ════════════════════════════════════════════════════════════════════════════════
// HTML de cada documento
// ════════════════════════════════════════════════════════════════════════════════
function _buildDocHTML(tplId, data) {
  const W = (k) => `{{${k}}}`   // shorthand (replaced by _fill)

  switch (tplId) {

    // ── 1. REGISTRO DE CAPTACIÓN ────────────────────────────────────────────
    case 'registro_captacion': return `
      <h1>REGISTRO DE CAPTURA DE INMOBILIARIA</h1>
      <p>Fecha de elaboración: ${W('fecha_hoy')}</p>
      <h2>DATOS DEL AGENTE INMOBILIARIO</h2>
      <table>
        <tr><th>Agente Inmobiliario:</th><td>${W('agente_nombre')}</td></tr>
        <tr><th>Teléfono:</th><td>${W('agente_tel')}</td></tr>
      </table>
      <h2>DATOS GENERALES DEL PROPIETARIO</h2>
      <table>
        <tr><th>Nombre del propietario:</th><td colspan="3">${W('vendedor_nombre')}</td></tr>
        <tr><th>Estado Civil:</th><td>${W('estado_civil')}</td><th>Régimen del matrimonio:</th><td>${W('regimen_matrimonio')}</td></tr>
        <tr><th>Dirección:</th><td colspan="3">${W('vendedor_domicilio')}</td></tr>
        <tr><th>Teléfono fijo:</th><td>${W('vendedor_tel_fijo')}</td><th>Teléfono Celular:</th><td>${W('vendedor_tel')}</td></tr>
        <tr><th>Correo electrónico:</th><td colspan="3">${W('vendedor_email')}</td></tr>
      </table>
      <h2>DATOS DEL INMUEBLE A COMERCIALIZAR</h2>
      <table>
        <tr><th>Dirección del inmueble:</th><td colspan="3">${W('inmueble_direccion')}</td></tr>
        <tr><th>Tipo de inmueble:</th><td>${W('inmueble_tipo')}</td><th>Régimen de Propiedad:</th><td>${W('regimen_propiedad')}</td></tr>
        <tr><th>Antigüedad:</th><td>${W('inmueble_antiguedad')}</td><th>Estado de conservación:</th><td>${W('estado_conservacion')}</td></tr>
        <tr><th>Niveles:</th><td>${W('niveles')}</td><th>M2 Terreno:</th><td>${W('inmueble_sup_t')}</td></tr>
        <tr><th>M2 de Construcción:</th><td>${W('inmueble_sup_c')}</td><th>Estacionamientos:</th><td>${W('inmueble_estac')}</td></tr>
        <tr><th>Recámaras:</th><td>${W('inmueble_recamaras')}</td><th>Baños Completos:</th><td>${W('banos_completos')}</td></tr>
        <tr><th>Medios baños:</th><td>${W('medios_banos')}</td><th>Otras áreas:</th><td>${W('otras_areas')}</td></tr>
        <tr><th>Tipo de operación:</th><td>${W('tipo_operacion')}</td><td colspan="2"></td></tr>
        <tr><th>Instalaciones especiales:</th><td colspan="3">${W('instalaciones_especiales')}</td></tr>
        <tr><th>Distribución:</th><td colspan="3">${W('distribucion')}</td></tr>
        <tr><th>Materiales de construcción:</th><td colspan="3">${W('materiales_construccion')}</td></tr>
      </table>
      <p><strong>Acabados:</strong></p>
      <table>
        <tr><th>ESPACIO</th><th>PISOS</th><th>MUROS</th><th>PLAFONES</th></tr>
        <tr><td>Recámaras</td><td>${W('rec_pisos')}</td><td>${W('rec_muros')}</td><td>${W('rec_plafones')}</td></tr>
        <tr><td>Estancia - Sala</td><td>${W('sala_pisos')}</td><td>${W('sala_muros')}</td><td>${W('sala_plafones')}</td></tr>
        <tr><td>Baños</td><td>${W('bano_pisos')}</td><td>${W('bano_muros')}</td><td>${W('bano_plafones')}</td></tr>
        <tr><td>Escalera</td><td>${W('esc_pisos')}</td><td>${W('esc_muros')}</td><td>${W('esc_plafones')}</td></tr>
        <tr><td>Cocina</td><td>${W('coc_pisos')}</td><td>${W('coc_muros')}</td><td>${W('coc_plafones')}</td></tr>
        <tr><td>Comedor</td><td>${W('com_pisos')}</td><td>${W('com_muros')}</td><td>${W('com_plafones')}</td></tr>
        <tr><td>Patio de servicio</td><td>${W('patio_pisos')}</td><td>${W('patio_muros')}</td><td>${W('patio_plafones')}</td></tr>
        <tr><td>Estacionamiento</td><td>${W('esta_pisos')}</td><td>${W('esta_muros')}</td><td>${W('esta_plafones')}</td></tr>
        <tr><td>Fachada</td><td>${W('fach_pisos')}</td><td>${W('fach_muros')}</td><td>${W('fach_plafones')}</td></tr>
      </table>
      <table>
        <tr><th>Equipamiento general:</th><td>${W('equipo_general')}</td></tr>
        <tr><th>Clasificación de la zona:</th><td>${W('zona_clasificacion')}</td></tr>
        <tr><th>Construcciones predominantes:</th><td>${W('construcciones_predominantes')}</td></tr>
        <tr><th>Electrificación:</th><td>${W('electrificacion')}</td><th>Agua Potable:</th><td>${W('agua_potable')}</td></tr>
        <tr><th>Drenaje:</th><td>${W('drenaje')}</td><td colspan="2"></td></tr>
        <tr><th>Vigilancia:</th><td>${W('vigilancia')}</td><th>Transporte:</th><td>${W('transporte')}</td></tr>
      </table>`

    // ── 2. LEVANTAMIENTO DE MEDIDAS ─────────────────────────────────────────
    case 'levantamiento': return `
      <p>Agente Inmobiliario: ${W('agente_nombre')}</p>
      <p>Teléfono: ${W('agente_tel')}</p>
      <p>Fecha de elaboración: ${W('fecha_hoy')}</p>
      <h1>LEVANTAMIENTO DE INFORMACIÓN DEL INMUEBLE</h1>
      <table>
        <tr><th>Nombre del propietario:</th><td colspan="3">${W('vendedor_nombre')}</td></tr>
        <tr><th>Dirección del inmueble:</th><td colspan="3">${W('inmueble_direccion')}</td></tr>
        <tr><th>Tipo de inmueble:</th><td>${W('inmueble_tipo')}</td><th>Régimen de Propiedad:</th><td>${W('regimen_propiedad')}</td></tr>
        <tr><th>Antigüedad</th><td>${W('inmueble_antiguedad')} años</td><th>Estado de conservación:</th><td>${W('estado_conservacion')}</td></tr>
        <tr><th>Niveles:</th><td>${W('niveles')}</td><th>M2 Terreno:</th><td>${W('inmueble_sup_t')}</td></tr>
        <tr><th>M2 de Construcción:</th><td>${W('inmueble_sup_c')}</td><th>Estacionamientos:</th><td>${W('inmueble_estac')}</td></tr>
        <tr><th>Recámaras:</th><td>${W('inmueble_recamaras')}</td><th>Baños Completos:</th><td>${W('banos_completos')}</td></tr>
        <tr><th>Medios baños:</th><td>${W('medios_banos')}</td><th>Otras áreas:</th><td>${W('otras_areas')}</td></tr>
        <tr><th>Tipo de operación:</th><td>${W('tipo_operacion')}</td><td colspan="2"></td></tr>
        <tr><th>Instalaciones especiales</th><td colspan="3">${W('instalaciones_especiales')}</td></tr>
        <tr><th>Distribución</th><td colspan="3">${W('distribucion')}</td></tr>
        <tr><th>Materiales de construcción</th><td colspan="3">${W('materiales_construccion')}</td></tr>
      </table>
      <p><strong>Acabados</strong></p>
      <table>
        <tr><th>ESPACIO</th><th>PISOS</th><th>MUROS</th><th>PLAFONES</th></tr>
        <tr><td>Recámaras:</td><td>${W('rec_pisos')}</td><td>${W('rec_muros')}</td><td>${W('rec_plafones')}</td></tr>
        <tr><td>Estancia - Sala:</td><td>${W('sala_pisos')}</td><td>${W('sala_muros')}</td><td>${W('sala_plafones')}</td></tr>
        <tr><td>Baños:</td><td>${W('bano_pisos')}</td><td>${W('bano_muros')}</td><td>${W('bano_plafones')}</td></tr>
        <tr><td>Escalera:</td><td>${W('esc_pisos')}</td><td>${W('esc_muros')}</td><td>${W('esc_plafones')}</td></tr>
        <tr><td>Cocina:</td><td>${W('coc_pisos')}</td><td>${W('coc_muros')}</td><td>${W('coc_plafones')}</td></tr>
        <tr><td>Comedor:</td><td>${W('com_pisos')}</td><td>${W('com_muros')}</td><td>${W('com_plafones')}</td></tr>
        <tr><td>Patio de servicio:</td><td>${W('patio_pisos')}</td><td>${W('patio_muros')}</td><td>${W('patio_plafones')}</td></tr>
        <tr><td>Estacionamiento:</td><td>${W('esta_pisos')}</td><td>${W('esta_muros')}</td><td>${W('esta_plafones')}</td></tr>
        <tr><td>Fachada:</td><td>${W('fach_pisos')}</td><td>${W('fach_muros')}</td><td>${W('fach_plafones')}</td></tr>
      </table>
      <table>
        <tr><th>Equipamiento general</th><td colspan="3">${W('equipo_general')}</td></tr>
        <tr><th colspan="4">Infraestructura y urbanización</th></tr>
        <tr><th>Clasificación de la zona:</th><td colspan="3">${W('zona_clasificacion')}</td></tr>
        <tr><th>Construcciones predominantes:</th><td colspan="3">${W('construcciones_predominantes')}</td></tr>
        <tr><th>Electrificación:</th><td>${W('electrificacion')}</td><th>Agua Potable:</th><td>${W('agua_potable')}</td></tr>
        <tr><th>Drenaje:</th><td>${W('drenaje')}</td><td colspan="2"></td></tr>
        <tr><th>Vigilancia:</th><td>${W('vigilancia')}</td><th>Transporte:</th><td>${W('transporte')}</td></tr>
      </table>`

    // ── 3. FICHA TÉCNICA ────────────────────────────────────────────────────
    case 'ficha_tecnica': return `
      <p>Agente Inmobiliario: ${W('agente_nombre')}</p>
      <p>Teléfono: ${W('agente_tel')}</p>
      <p>Fecha de elaboración: ${W('fecha_hoy')}</p>
      <h1>FICHA TÉCNICA</h1>
      <table>
        <tr><th>Tipo de inmueble:</th><td colspan="3">${W('inmueble_tipo')}</td></tr>
        <tr><th>Descripción:</th><td colspan="3">${W('descripcion')}</td></tr>
        <tr><th>Régimen de Propiedad:</th><td>${W('regimen_propiedad')}</td><th>Árboles:</th><td>${W('arboles')}</td></tr>
        <tr><th>Antigüedad:</th><td>${W('inmueble_antiguedad')}</td><th>Closets:</th><td>${W('closets')}</td></tr>
        <tr><th>Estado de conservación:</th><td>${W('estado_conservacion')}</td><th>Cocina Integral:</th><td>${W('cocina_integral')}</td></tr>
        <tr><th>Área de Terreno:</th><td>${W('inmueble_sup_t')}</td><th>Cisterna:</th><td>${W('cisterna')}I</td></tr>
        <tr><th>Área construida:</th><td>${W('inmueble_sup_c')} años</td><th>Caseta de vigilancia:</th><td>${W('caseta_vigilancia')}</td></tr>
        <tr><th>Espacios para autos:</th><td>${W('inmueble_estac')}</td><th>Urbanización privada:</th><td>${W('urbanizacion_privada')}</td></tr>
        <tr><th>Recamaras:</th><td>${W('inmueble_recamaras')} m2</td><th>Seguridad privada:</th><td>${W('seguridad_privada')}</td></tr>
        <tr><th>Baños:</th><td>${W('banos_completos')} m2</td><th>Área de eventos:</th><td>${W('area_eventos')}</td></tr>
        <tr><th>Medios Baños:</th><td>${W('medios_banos')}</td><th>Asador:</th><td>${W('asador')}</td></tr>
        <tr><th>Patio:</th><td>${W('patio')}</td><th>Área deportiva:</th><td>${W('area_deportiva')}</td></tr>
        <tr><th>Jardín(es):</th><td>${W('jardin')}</td><th>Cancha(s):</th><td>${W('cancha')}</td></tr>
        <tr><th>Dirección:</th><td colspan="3">${W('inmueble_direccion')}</td></tr>
        <tr><th>Valor:</th><td>$ ${W('precio_total')}</td><th>Divisa:</th><td>${W('moneda')}</td></tr>
      </table>
      <p><strong>DISTRIBUCIÓN</strong></p>
      <table>
        <tr><th>Planta Baja:</th><td>${W('planta_baja')}</td></tr>
        <tr><th>Planta alta:</th><td>${W('planta_alta')}</td></tr>
        <tr><th>Situación legal:</th><td>${W('situacion_legal')}</td></tr>
      </table>
      <p><strong>CROQUIS</strong></p>
      <p>Zona: ${W('zona_clasificacion')}</p>
      <table>
        <tr><th>Microlocalización</th><th>Macrolocalización</th></tr>
        <tr>
          <td style="text-align:center;">${W('micro_localizacion')}</td>
          <td style="text-align:center;">${W('macro_localizacion')}</td>
        </tr>
      </table>
      <p><strong>FOTOGRAFÍAS</strong></p>
      <table>
        <tr>
          <td style="text-align:center;width:50%;">${W('foto_01') ? `<img src="${W('foto_01')}" style="max-width:100%;max-height:160px;object-fit:cover;">` : '[Foto 001]'}</td>
          <td style="text-align:center;width:50%;">${W('foto_02') ? `<img src="${W('foto_02')}" style="max-width:100%;max-height:160px;object-fit:cover;">` : '[Foto 002]'}</td>
        </tr>
        <tr>
          <td style="text-align:center;">${W('foto_03') ? `<img src="${W('foto_03')}" style="max-width:100%;max-height:160px;object-fit:cover;">` : '[Foto 003]'}</td>
          <td style="text-align:center;">${W('foto_04') ? `<img src="${W('foto_04')}" style="max-width:100%;max-height:160px;object-fit:cover;">` : '[Foto 004]'}</td>
        </tr>
        <tr>
          <td style="text-align:center;">${W('foto_05') ? `<img src="${W('foto_05')}" style="max-width:100%;max-height:160px;object-fit:cover;">` : '[Foto 005]'}</td>
          <td style="text-align:center;">${W('foto_06') ? `<img src="${W('foto_06')}" style="max-width:100%;max-height:160px;object-fit:cover;">` : '[Foto 006]'}</td>
        </tr>
      </table>`

    // ── 4. PERFILAMIENTO DEL VENDEDOR ───────────────────────────────────────
    case 'perfilamiento': return `
      <p>Agente Inmobiliario: ${W('agente_nombre')}</p>
      <p>Teléfono: ${W('agente_tel')}</p>
      <p>Fecha de elaboración: ${W('fecha_hoy')}</p>
      <h1>PERFILAMIENTO DEL PROSPECTO VENDEDOR</h1>
      <table>
        <tr><th>Nombre del propietario:</th><td colspan="3">${W('vendedor_nombre')}</td></tr>
        <tr><th>Fecha de nacimiento:</th><td colspan="3">${W('fecha_nacimiento')}</td></tr>
        <tr><th>Estado civil :</th><td>${W('estado_civil')}</td><th>Régimen del matrimonio:</th><td>${W('regimen_matrimonio')}</td></tr>
        <tr><th>Estado civil al momento de comprar el inmueble:</th><td colspan="3">${W('estado_civil_compra')}</td></tr>
        <tr><th>Nacionalidad:</th><td>${W('nacionalidad')}</td><th>Correo electrónico:</th><td>${W('vendedor_email')}</td></tr>
        <tr><th>Dirección:</th><td colspan="3">${W('vendedor_domicilio')}</td></tr>
        <tr><th>Teléfono fijo:</th><td>${W('vendedor_tel_fijo')}</td><th>Teléfono Celular:</th><td>${W('vendedor_tel')}</td></tr>
      </table>
      <h2>PERFILAMIENTO DEL INMUEBLE</h2>
      <table>
        <tr><th>Ubicación:</th><td colspan="3">${W('inmueble_direccion')}</td></tr>
        <tr><th>Tipo de propiedad:</th><td colspan="3">${W('inmueble_tipo')}</td></tr>
        <tr><th>Régimen de Propiedad:</th><td>${W('regimen_propiedad')}</td><th>Uso de suelo:</th><td>${W('uso_suelo')}</td></tr>
        <tr><th>Antigüedad:</th><td>${W('inmueble_antiguedad')} años</td><th>Estado de conservación:</th><td>${W('estado_conservacion')}</td></tr>
        <tr><th>Características:</th><td colspan="3">${W('caracteristicas')}</td></tr>
        <tr><th>Metros cuadrados Construcción:</th><td>${W('inmueble_sup_c')}</td><th>Terreno:</th><td>${W('inmueble_sup_t')}</td></tr>
      </table>
      <h2>SITUACION LEGAL DEL INMUEBLE</h2>
      <table>
        <tr><th>¿Ha exentado el ISR en la venta de un bien inmueble en los últimos 3 años?</th><td colspan="3">${W('isr_exento')}</td></tr>
        <tr><th>¿El inmueble presenta algún gravamen?</th><td>${W('gravamen')}</td><th>Tipo:</th><td>${W('tipo_gravamen')}</td></tr>
        <tr><th>Monto:</th><td colspan="3">${W('monto_gravamen')}</td></tr>
        <tr><th>¿El inmueble se encuentra en régimen de condominio?</th><td colspan="3">${W('regimen_condominio')}</td></tr>
        <tr><th>Monto de la cuota de mantenimiento mensual en su caso</th><td colspan="3">${W('cuota_mantenimiento')}</td></tr>
        <tr><th>Es viable su comercialización:</th><td>${W('viable_comercializacion')}</td><th>Motivo:</th><td>${W('motivo_venta')}</td></tr>
      </table>
      <br><br>
      <table><tr>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;">${W('vendedor_nombre')}<br>Propietario</div></td>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;">${W('agente_nombre')}<br>Agente Inmobiliario</div></td>
      </tr></table>
      <br>
      <p><strong>AVISO DE PRIVACIDAD</strong></p>
      <p>CON FUNDAMENTO EN LOS ARTICULOS 15 Y 16 DE LA LEY FEDERAL DE PROTECCION DE DATOS PERSONALES EN POSESIÓN DE PARTICULARES HACEMOS DE SU CONOCIMIENTO QUE EL AGENTE INMOBILIARIO _________ CON DOMICILIO EN _____________ES RESPONSABLE DE RECABAR SUS DATOS PERSONALES, DEL USO QUE SE LES DÉ A LOS MISMOS Y DE SU PROTECCIÓN. SU INFORMACIÓN PERSONAL SERÁ UTILIZADA PARA LAS SIGUIENTES FINALIDADES: PROVEER LOS SERVICIOS Y PRODUCTOS QUE HA SOLICITADO; NOTIFICARLE SOBRE NUEVOS SERVICIOS O PRODUCTOS QUE TENGAN RELACIÓN CON LOS YA CONTRATADOS O ADQUIRIDOS, COMUNICARLE SOBRE CAMBIOS EN LOS MISMOS; ELABORAR ESTUDIOS Y PROGRAMAS QUE SON NECESARIOS PARA DETERMINAR HÁBITOS GENERALES DE CONSUMO; REALIZAR EVALUACIONES PERIÓDICAS DE NUESTROS PRODUCTOS Y SERVICIOS A EFECTO DE MEJORAR LA CALIDAD DE LOS MISMOS; EVALUAR LA CALIDAD DEL SERVICIO QUE BRINDAMOS Y, EN GENERAL, PARA DAR CUMPLIMIENTO A LAS OBLIGACIONES QUE HEMOS CONTRAIDO CON USTED.</p>`

    // ── 5. AVISO DE PRIVACIDAD ──────────────────────────────────────────────
    case 'aviso_privacidad': return `
      <h1>AVISO DE PRIVACIDAD</h1>
      <p>CON FUNDAMENTO EN LOS ARTÍCULOS 15 Y 16 DE LA LEY FEDERAL DE PROTECCIÓN DE DATOS PERSONALES EN POSESIÓN DE PARTICULARES HACEMOS DE SU CONOCIMIENTO QUE LA ASESOR INMOBILIARIO ${W('agente_nombre')} CON DOMICILIO EN: ${W('agente_domicilio')} ES RESPONSABLE DE RECABAR SUS DATOS PERSONALES, DEL USO QUE SE LES DÉ A LOS MISMOS Y DE SU PROTECCIÓN. SU INFORMACIÓN PERSONAL SERA UTILIZADA PARA LAS SIGUIENTES FINALIDADES: PROVEER LOS SERVICIOS Y PRODUCTOS QUE HA SOLICITADO; NOTIFICARLE SOBRE NUEVOS SERVICIOS O PRODUCTOS QUE TENGAN RELACIÓN CON LOS YA CONTRATADOS O ADQUIRIDOS, COMUNICARLE SOBRE CAMBIOS EN LOS MISMOS; ELABORAR ESTUDIOS Y PROGRAMAS QUE SON NECESARIOS PARA DETERMINAR HÁBITOS GENERALES DE CONSUMO; REALIZAR EVALUACIONES PERIÓDICAS DE NUESTROS PRODUCTOS Y SERVICIOS A EFECTO DE MEJORAR LA CALIDAD DE LOS MISMOS; EVALUAR LA CALIDAD DEL SERVICIO QUE BRINDAMOS Y, EN GENERAL, DAR CUMPLIMIENTO A LAS OBLIGACIONES QUE HEMOS CONTRA IDO CON USTED.</p>
      <p>LUGAR: ${W('lugar')}</p>
      <p>FECHA: ${W('fecha_hoy')}</p>
      <br>
      <p><strong>AUTORIZACIÓN</strong></p>
      <br><br>
      <table><tr>
        <td style="text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;">NOMBRE Y FIRMA</div></td>
      </tr></table>`

    // ── 6. CARTA DE DERECHOS ────────────────────────────────────────────────
    case 'carta_derechos': return `
      <h1>CARTA DE DERECHOS DEL CONSUMIDOR ADQUIRENTE DE CASA HABITACIÓN.</h1>
      <p>LOS SIGUIENTES SON LOS DERECHOS DEL CONSUMIDOR QUE ${W('agente_nombre')}. SE COMPROMETE A SEGUIR EN TODAS LAS TRANSACCIONES COMERCIALES DE COMPRAVENTA/RENTA DE CASA HABITACIÓN CONFORME A LO DISPUESTO EN LA LEY FEDERAL DE PROTECCIÓN AL CONSUMIDOR (LFPC) Y LA NORMA OFICIAL MEXICANA NOM-247-SE-2021, "PRÁCTICAS COMERCIALES–REQUISITOS DE LA INFORMACIÓN COMERCIAL Y LA PUBLICIDAD DE BIENES INMUEBLES DESTINADOS A CASA HABITACIÓN Y ELEMENTOS MÍNIMOS QUE DEBEN CONTENER LOS CONTRATOS RELACIONADOS", (NOM) LA CUAL ENTRO EN VIGOR EL 18 DE SEPTIEMBRE DEL 2022.</p>
      <p><strong>PRIMERO.</strong> Recibir, respecto de los bienes inmuebles ofertados, información y publicidad veraz, clara y actualizada, sin importar el medio por el que se comunique, incluyendo los medios digitales, de forma tal que le permita al consumidor tomar la mejor decisión de compra conociendo de manera veraz las características del inmueble que está adquiriendo, conforme a lo dispuesto por la Ley.</p>
      <p><strong>SEGUNDO.</strong> Conocer la información sobre las características del inmueble, entre éstas: la extensión del terreno, superficie construida, tipo de estructura, instalaciones, acabados, accesorios, lugar de estacionamiento, áreas de uso común, servicios con que cuenta y estado general físico del inmueble.</p>
      <p><strong>TERCERO.</strong> Elegir libremente el inmueble que mejor satisfaga sus necesidades y se ajuste a su capacidad de compra.</p>
      <p><strong>CUARTO.</strong> No realizar pago alguno hasta que conste por escrito una relación contractual, o se trate de anticipos y gastos operativos, en los términos previstos por la Ley Federal de Protección al Consumidor.</p>
      <p><strong>QUINTO.</strong> Firmar un contrato de adhesión bajo el modelo inscrito en la Procuraduría Federal del Consumidor, en el que consten los términos y condiciones de la compraventa del bien inmueble. Posterior a su firma, el proveedor tiene la obligación de entregar una copia del contrato firmado al consumidor.</p>
      <p><strong>SEXTO.</strong> Adquirir un inmueble que cuente con las características de seguridad y calidad que estén contenidas en la normatividad aplicable y plasmadas en la información y publicidad que haya recibido.</p>
      <p><strong>SÉPTIMO.</strong> Recibir el bien inmueble en el plazo y condiciones acordados con el proveedor en el contrato de adhesión respectivo.</p>
      <p><strong>OCTAVO.</strong> En su caso, ejercer las garantías sobre bienes inmuebles previstas en la Ley Federal de Protección al Consumidor, considerando las especificaciones previstas en el contrato de adhesión respectivo.</p>
      <p><strong>NOVENO.</strong> Recibir la bonificación o compensación correspondiente en términos de la Ley Federal de Protección al Consumidor, sólo cuando proceda y en caso de que una vez ejercida la garantía, persistan defectos o fallas en el inmueble, a juicio de perito que así lo determine. Asimismo, a que se realicen las reparaciones necesarias en caso de defectos o fallas imputables al proveedor, u optar por la substitución del inmueble o rescisión del contrato cuando proceda.</p>
      <p><strong>DÉCIMO.</strong> Contar con canales y mecanismos de atención gratuitos y accesibles para consultas, solicitudes, reclamaciones y sugerencias al proveedor, y conocer el domicilio señalado por el proveedor para oír y recibir notificaciones.</p>
      <p><strong>DÉCIMO PRIMERO.</strong> Derecho a la protección por parte de las autoridades competentes y conforme a las leyes aplicables, incluyendo el derecho a presentar denuncias y reclamaciones ante las mismas.</p>
      <p><strong>DÉCIMO SEGUNDO.</strong> Tener a su disposición un Aviso de Privacidad para conocer el tratamiento que se dará a los datos personales que proporcione y consentirlo, en su caso; que sus datos personales sean tratados conforme a la normatividad aplicable y, conocer los mecanismos disponibles para realizar el ejercicio de sus Derechos de Acceso, Rectificación, Cancelación y Oposición.</p>
      <p><strong>DÉCIMO TERCERO.</strong> Recibir un trato libre de discriminación, sin que se le pueda negar o condicionar la atención o venta de una vivienda por razones de género, nacionalidad, étnica, preferencia sexual, religiosas o cualquiera otra particularidad en los términos de la legislación aplicable.</p>
      <p><strong>DÉCIMO CUARTO.</strong> Elegir libremente al notario público para realizar el trámite de escrituración.</p>
      <p>LUGAR: ${W('lugar')}</p>
      <p>FECHA: ${W('fecha_hoy')}</p>
      <br>
      <p><strong>AUTORIZACIÓN</strong></p>
      <br><br>
      <table><tr>
        <td style="text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;">NOMBRE Y FIRMA</div></td>
      </tr></table>`

    // ── 7. PROPUESTA PARA PROMOCIÓN EXCLUSIVA ───────────────────────────────
    case 'propuesta_exclusiva': return `
      <p>Agente Inmobiliario: ${W('agente_nombre')}</p>
      <p>Teléfono: ${W('agente_tel')}</p>
      <p>Fecha de elaboración: ${W('fecha_hoy')}</p>
      <h1>PROPUESTA PARA PROMOCIÓN EXCLUSIVA DE SU PROPIEDAD</h1>
      <p>Estimado(a) ${W('trato')} ${W('nombre_contraoferente')},</p>
      <h2>NUESTRA PROPUESTA DE VALOR PARA LA PROMOCIÓN EXCLUSIVA DE SU PROPIEDAD</h2>
      <p>Con la exclusiva, activamos un Plan de Marketing Inmobiliario 360° que abarca desde la producción de contenido de élite hasta una gestoría integral y una promoción digital sin precedentes.</p>
      <h2>A. PRODUCCIÓN DE CONTENIDO VISUAL DE ALTO IMPACTO</h2>
      <p><strong>1. Fotografía Inmobiliaria Profesional de Alta Resolución:</strong></p>
      <p>■ Capturamos la esencia de cada espacio, resaltando sus mejores atributos con iluminación y ángulos profesionales.</p>
      <p>■ Valor Agregado: Las imágenes de calidad son el primer "gancho" que detiene a un comprador.</p>
      <p><strong>2. Video Inmobiliario Dinámico y Cinematográfico:</strong></p>
      <p>■ Creamos un recorrido visual que cuenta la historia de su propiedad, mostrando su flujo y ambiente.</p>
      <p>■ Valor Agregado: Permite a los interesados visualizarse viviendo en el espacio, generando una conexión emocional.</p>
      <p><strong>3. Recorrido Virtual 360° Inmersivo:</strong></p>
      <p>■ Ofrecemos tours virtuales interactivos que permiten a los compradores explorar cada rincón de su propiedad desde cualquier dispositivo, 24/7.</p>
      <p>■ Valor Agregado: Filtra a los interesados realmente calificados, ahorrándole tiempo en visitas innecesarias y acelerando el proceso.</p>
      <p><strong>4. Droneo Profesional y Perspectivas Aéreas:</strong></p>
      <p>■ Utilizamos tecnología de dron para capturar vistas espectaculares de la propiedad, su entorno, amenidades y ubicación estratégica.</p>
      <p>■ Valor Agregado: Ofrece una dimensión única de la propiedad y su contexto, ideal para inmuebles con grandes terrenos, vistas o ubicaciones especiales.</p>
      <h2>B. ESTRATEGIA DE PUBLICIDAD DIGITAL DIRIGIDA Y MASIVA:</h2>
      <p><strong>1. Publicidad Pagada en Redes Sociales (Facebook e Instagram Ads):</strong></p>
      <p>○ Diseñamos campañas segmentadas con precisión demográfica, geográfica y por intereses, llegando directamente a su comprador ideal.</p>
      <p>○ Valor Agregado: Máxima visibilidad en las plataformas donde los compradores pasan la mayor parte de su tiempo, generando leads calificados.</p>
      <p><strong>2. Publicidad en Google Ads (Búsqueda y Display):</strong></p>
      <p>○ Posicionamos su propiedad en los primeros resultados de búsqueda cuando un comprador busca activamente inmuebles con características similares.</p>
      <p>○ Valor Agregado: Captamos la demanda más directa y con alta intención de compra.</p>
      <p><strong>3. Posicionamiento Premium en Portales Inmobiliarios (Nacionales e Internacionales):</strong></p>
      <p>○ Publicamos su propiedad de manera destacada en los portales líderes del mercado (ej. Inmuebles24, Lamudi, Metros Cúbicos, Zillow, Realtor.com, etc.), asegurando visibilidad masiva.</p>
      <p>○ Valor Agregado: Acceso a una vasta red de compradores nacionales e internacionales que buscan activamente propiedades.</p>
      <p><strong>4. Email Marketing y Red de Clientes Calificados:</strong></p>
      <p>○ Promocionamos su propiedad directamente a nuestra base de datos exclusiva de clientes e inversionistas pre-calificados que buscan oportunidades como la suya.</p>
      <p>○ Valor Agregado: Acceso a compradores con alta probabilidad de cierre, a menudo antes de que la propiedad se haga pública masivamente.</p>
      <p><strong>5. Optimización para Motores de Búsqueda (SEO) en Nuestro Sitio Web:</strong></p>
      <p>○ Su propiedad tendrá una página dedicada y optimizada en nuestro sitio web (pardesantos.mx), asegurando que sea encontrada por búsquedas orgánicas.</p>
      <p>○ Valor Agregado: Genera tráfico de calidad y credibilidad para su propiedad.</p>
      <h2>C. GESTIÓN PROFESIONAL, TRANSPARENCIA Y SOPORTE INTEGRAL:</h2>
      <p><strong>1. Plan de Marketing Inmobiliario Detallado y Personalizado:</strong></p>
      <p>○ Le entregaremos un documento formal que especifica la inversión en cada canal, el cronograma y las métricas esperadas, ofreciéndole total transparencia.</p>
      <p>○ Valor Agregado: Usted sabrá exactamente cómo se está invirtiendo en la promoción de su propiedad.</p>
      <p><strong>2. Gestoría Legal y Administrativa Integral:</strong></p>
      <p>○ Le brindamos asesoría y acompañamiento en todos los trámites legales, fiscales y administrativos (contratos, escrituración, avalúos, certificados, etc.).</p>
      <p>○ Valor Agregado: Paz mental y seguridad jurídica durante todo el proceso.</p>
      <p><strong>3. Reportes de Desempeño y Análisis de Mercado Periódicos:</strong></p>
      <p>○ Recibirá informes regulares sobre el rendimiento de la promoción (número de interesados, visitas, comentarios, ajustes de estrategia).</p>
      <p>○ Valor Agregado: Usted estará siempre informado y podrá tomar decisiones basadas en datos reales del mercado.</p>
      <p><strong>4. Colaboración Estratégica con Colegas (Bolsa Inmobiliaria / MLS):</strong></p>
      <p>○ Aunque tengamos la exclusiva, compartimos estratégicamente su propiedad con una red selecta de agentes inmobiliarios de confianza, ampliando el alcance sin perder el control de la información ni el precio.</p>
      <p>○ Valor Agregado: Multiplicamos las posibilidades de venta sin que usted tenga que lidiar con múltiples agentes.</p>
      <p><strong>5. Asesoría para Home Staging (si aplica):</strong></p>
      <p>○ Le brindamos recomendaciones para preparar su propiedad y maximizar su atractivo visual para las fotos, videos y visitas.</p>
      <p>○ Valor Agregado: Un inmueble bien presentado se vende más rápido y a mejor precio.</p>
      <h2>D. COMPROMISO CON EL RESULTADO:</h2>
      <p>Nuestro compromiso con la exclusiva nos permite dedicarle a su propiedad la atención y los recursos que merece para lograr una venta exitosa. Nos enfocamos en maximizar el valor de su inmueble y minimizar el tiempo en el mercado, asegurando que cada peso invertido en marketing se traduzca en resultados tangibles para usted.</p>
      <p>¡Permítanos demostrarle el poder de una estrategia de marketing inmobiliario exclusiva y profesional para su propiedad!</p>
      <br><br>
      <table><tr>
        <td style="text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;">Firma del Prpietario</div></td>
      </tr></table>`

    // ── 8. CONTRAOFERTA ─────────────────────────────────────────────────────
    case 'contraoferta': return `
      <p>Agente Inmobiliario: ${W('agente_nombre')}</p>
      <p>Teléfono: ${W('agente_tel')}</p>
      <p>Fecha de elaboración: ${W('fecha_hoy')}</p>
      <h1>CONTRA OFERTA DE COMPRA INMOBILIARIA</h1>
      <p>En respuesta a la oferta recibida por parte de ${W('nombre_ofertante')}, y derivado de la evaluación del inmueble ubicado en ${W('inmueble_direccion')}, el suscrito ${W('nombre_contraoferente')}, con domicilio en ${W('dir_contraoferente')}, ${W('ciudad_contraoferente')}, ${W('estado_contraoferente')}, y con número de contacto ${W('tel_contraoferente')}, emite la presente Contraoferta formal bajo los siguientes términos y condiciones:</p>
      <p><strong>I. Objeto de la Contraoferta:</strong> La presente contraoferta se refiere al bien inmueble, cuyas características son:</p>
      <p>● Tipo de Inmueble: ${W('inmueble_tipo')}<br>
      ● Ubicación: ${W('inmueble_direccion')}<br>
      ● Superficie de Terreno: ${W('inmueble_sup_t')} m²<br>
      ● Superficie de Construcción: ${W('inmueble_sup_c')} m²<br>
      ● Características Relevantes: ${W('caracteristicas')}</p>
      <p><strong>II. Propuesta de Precio:</strong> Se ofrece la cantidad de:</p>
      <p>${W('monto_contraoferta_num')}<br>(${W('monto_contraoferta_letra')})</p>
      <p><strong>III. Estructura de Pago Propuesta:</strong> La forma de pago se propone de la siguiente manera:</p>
      <p>1. Anticipo a la Firma de esta Contraoferta (o Compromiso Inicial):<br>
      ${W('monto_anticipo_num')}<br>
      (${W('monto_anticipo_letra')} M.N.) en efectivo o transferencia, según se requiera.</p>
      <p>2. Pago a la Firma del Contrato Privado de Compra-Venta:<br>
      ${W('monto_contrato_num')}<br>
      (${W('monto_contrato_letra')} M.N.) a ser abonado a más tardar ${W('fecha_max_contrato')}.</p>
      <p>3. Saldo Remanente a la Firma de Escritura Pública:<br>
      ${W('monto_saldo_num')}<br>
      (${W('monto_saldo_letra')} M.N.) a ser liquidado en la Notaría designada, el día de la firma de la Escritura Pública.</p>
      <p><strong>IV. Plazo Estimado para Escrituración:</strong> El suscrito declara estar en posibilidad y disposición de firmar la Escritura Pública de Compra-Venta a más tardar el ${W('fecha_escrituracion')}.</p>
      <p><strong>V. Vigencia de la Contraoferta:</strong> La presente contraoferta tendrá una vigencia de ${W('num_dias')} (${W('num_dias_letra')}) días hábiles contados a partir de la fecha de su emisión. Durante este periodo, se espera recibir por escrito la resolución del propietario. En caso de aceptación, el Contraoferente se compromete a formalizar el Contrato Privado de Compra-Venta en la fecha acordada con la brevedad posible.</p>
      <p>Agradeciendo su consideración a esta propuesta, quedo a su entera disposición.</p>
      <p>Atentamente,</p>
      <br>
      <p>${W('nombre_contraoferente')}<br>
      ${W('tipo_id')} clave o número ${W('clave_id')}<br>
      ${W('tel_contraoferente')}<br>
      ${W('correo_contraoferente')}</p>
      <br><br>
      <table><tr>
        <td style="text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;">Firma del Ofertante</div></td>
      </tr></table>`

    // ── 9. RESOLUCIÓN A — ACEPTA ────────────────────────────────────────────
    case 'resolucion_a': return `
      <p>Agente Inmobiliario: ${W('agente_nombre')}</p>
      <p>Teléfono: ${W('agente_tel')}</p>
      <p>Fecha de elaboración: ${W('fecha_hoy')}</p>
      <h1>RESOLUCIÓN FORMAL DEL PROPIETARIO SOBRE OFERTA</h1>
      <p>Estimado(a) ${W('trato')} ${W('nombre_contraoferente')},</p>
      <p>En mi carácter de legítimo propietario del bien inmueble ubicado en ${W('inmueble_direccion')}, y en respuesta a la ${W('tipo_documento')} recibida de su parte con fecha ${W('fecha_oferta_recibida')}, por medio del presente documento comunico mi resolución formal respecto a la adquisición del mencionado inmueble:</p>
      <p>Con el presente, ACEPTO de forma incondicional el precio y los términos propuestos en su ${W('tipo_documento')} por la cantidad de ${W('monto_aceptado_num')} (${W('monto_aceptado_letra')}). Propongo como fecha para la celebración del Contrato Privado de Compra-Venta el día ${W('fecha_firma_contrato')} en un horario y lugar a definir de mutuo acuerdo.</p>
      <p>Atentamente,</p>
      <br>
      <p>${W('vendedor_nombre')}<br>
      ${W('tipo_id')} clave o número ${W('clave_id')}<br>
      ${W('vendedor_tel')}<br>
      ${W('vendedor_email')}</p>
      <br><br>
      <table><tr>
        <td style="text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;">Firma del Prpietario</div></td>
      </tr></table>`

    // ── 10. RESOLUCIÓN B — ACEPTA CON MODIFICACIONES ────────────────────────
    case 'resolucion_b': return `
      <p>Agente Inmobiliario: ${W('agente_nombre')}</p>
      <p>Teléfono: ${W('agente_tel')}</p>
      <p>Fecha de elaboración: ${W('fecha_hoy')}</p>
      <h1>RESOLUCIÓN FORMAL DEL PROPIETARIO SOBRE OFERTA</h1>
      <p>Estimado(a) ${W('trato')} ${W('nombre_contraoferente')},</p>
      <p>En mi carácter de legítimo propietario del bien inmueble ubicado en ${W('inmueble_direccion')}, y en respuesta a la ${W('tipo_documento')} recibida de su parte con fecha ${W('fecha_oferta_recibida')}, por medio del presente documento comunico mi resolución formal respecto a la adquisición del mencionado inmueble:</p>
      <p>Con el presente, ACEPTO el principio de su ${W('tipo_documento')}, sin embargo, propongo las siguientes modificaciones a los términos para su consideración final:</p>
      <p>● Precio Propuesto: ${W('nuevo_precio_num')} (${W('nuevo_precio_letra')})<br>
      ● Condiciones: ${W('condiciones')}</p>
      <p>Propongo como fecha para la celebración del Contrato Privado de Compra-Venta el día ${W('fecha_firma_contrato')} en un horario y lugar a definir de mutuo acuerdo, sujeto a la aceptación de estas nuevas condiciones de su parte.</p>
      <p>Atentamente,</p>
      <br>
      <p>${W('vendedor_nombre')}<br>
      ${W('tipo_id')} clave o número ${W('clave_id')}<br>
      ${W('vendedor_tel')}<br>
      ${W('vendedor_email')}</p>
      <br><br>
      <table><tr>
        <td style="text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;">Firma del Prpietario</div></td>
      </tr></table>`

    // ── 11. RESOLUCIÓN C — NO ACEPTA ─────────────────────────────────────────
    case 'resolucion_c': return `
      <p>Agente Inmobiliario: ${W('agente_nombre')}</p>
      <p>Teléfono: ${W('agente_tel')}</p>
      <p>Fecha de elaboración: ${W('fecha_hoy')}</p>
      <h1>RESOLUCIÓN FORMAL DEL PROPIETARIO SOBRE OFERTA</h1>
      <p>Estimado(a) ${W('trato')} ${W('nombre_contraoferente')},</p>
      <p>En mi carácter de legítimo propietario del bien inmueble ubicado en ${W('inmueble_direccion')}, y en respuesta a la ${W('tipo_documento')} recibida de su parte con fecha ${W('fecha_oferta_recibida')}, por medio del presente documento comunico mi resolución formal respecto a la adquisición del mencionado inmueble:</p>
      <p>Lamento informarle: NO ES POSIBLE ACEPTAR su ${W('tipo_documento')}, ${W('causa_rechazo')}. Agradezco su interés en mi propiedad y atención a este proceso. Quedo a su disposición para coordinar los siguientes pasos en caso de aceptación.</p>
      <p>Atentamente,</p>
      <br>
      <p>${W('vendedor_nombre')}<br>
      ${W('tipo_id')} clave o número ${W('clave_id')}<br>
      ${W('vendedor_tel')}<br>
      ${W('vendedor_email')}</p>
      <br><br>
      <table><tr>
        <td style="text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;">Firma del Prpietario</div></td>
      </tr></table>`

    // ── 12. CONTRATO COMPRAVENTA — VIVIENDA ─────────────────────────────────
    // ── 12. CONTRATO COMPRAVENTA — VIVIENDA (PROFECO verbatim) ──────────────────
    case 'cv_vivienda': return `
      <h1>CONTRATO DE COMPRAVENTA DE TERRENO</h1>
      <p>Contrato de adhesión de compraventa de terreno destinado a casa habitación, al que, en lo sucesivo, se le denominará el "contrato", que celebran, por una parte, ${W('vendedor_nombre')}, quien comparece al presente acto jurídico ${W('vendedor_comparece')} ${W('vendedor_rep_nombre')}, en su carácter de ${W('vendedor_rep_cargo')}, a quien en lo sucesivo se le denominara, la "parte vendedora", y por la otra, ${W('comprador_nombre')}, quien comparece al presente acto jurídico ${W('comprador_comparece')} ${W('comprador_rep_nombre')}, en su carácter de ${W('comprador_rep_cargo')}, a quien en lo sucesivo se le denominara, la "parte compradora", ambos sujetos contractuales que en su conjunto serán designados como "las partes".</p>
      <h2>DECLARACIONES</h2>
      <p><strong>I. Declara la parte vendedora que:</strong></p>
      <p>a.1. En caso de ser persona física. - Es de nacionalidad ${W('vendedor_nacionalidad')} acredita su identidad en términos de ${W('vendedor_id_tipo')}, con numero de folio ${W('vendedor_id_folio')} documento oficial emitido por ${W('vendedor_id_autoridad')}.</p>
      <p>a.2. En caso de ser persona jurídica. – Es una sociedad mercantil ${W('vendedor_nacionalidad')} legalmente constituida de conformidad con las Leyes de los Estados Unidos Mexicanos, según consta en el documento público ${W('vendedor_doc_publico_num')} otorgado ante la fe del ${W('vendedor_notario_tipo')} Público ${W('vendedor_notario_num')} de ${W('vendedor_notario_localidad')}, el Licenciado ${W('vendedor_notario_nombre')}, instrumento que consta inscrito en el registro publico de comercio de ${W('vendedor_notario_localidad')} bajo el folio mercantil ${W('vendedor_folio_mercantil')} y que puede ser consultado por la compradora en ${W('vendedor_docs_consulta')}.</p>
      <p>b. En caso de ser persona física representada o jurídica.- Su ${W('vendedor_rep_cargo')}, cuenta con facultades suficientes para obligarla en los términos y condiciones del presente contrato, lo cual se acredita en términos del instrumento publico ${W('vendedor_doc_publico_num')}, otorgado ante la fe del ${W('vendedor_notario_tipo')} Público ${W('vendedor_notario_num')} de ${W('vendedor_notario_localidad')}, el Licenciado ${W('vendedor_notario_nombre')}, mismo que consta inscrito en el Registro Público de Comercio de ${W('vendedor_notario_localidad')} bajo el folio mercantil ${W('vendedor_folio_mercantil')}, facultades que no le han sido revocadas ni modificadas en forma alguna. Tal documentación puede ser consultada por la parte compradora en ${W('vendedor_docs_consulta')}.</p>
      <p>c. Su ${W('vendedor_ocupacion')} versa sobre la construcción, promoción, comercialización y compraventa de toda clase de inmuebles destinados a casa habitación y la concertación de contratos relacionados con dichos actos jurídicos.</p>
      <p>d. Su domicilio es el ubicado en ${W('vendedor_domicilio')} y su Registro Federal de Contribuyentes es ${W('vendedor_rfc')}.</p>
      <p>e. Es legitima propietaria del terreno ubicado en ${W('inmueble_direccion')}; como se acredita en términos de:</p>
      <p>● Escritura publica ${W('escritura_num')}, otorgada en fecha ${W('escritura_fecha')}, ante la de del Notario Público ${W('notario_num')} de ${W('notario_localidad')}, el Licenciado ${W('notario_nombre')} y debidamente inscrita el ${W('rpp_fecha')}, en el Registro Publico de la Propiedad de ${W('rpp_localidad')} bajo el folio real ${W('folio_real')}.</p>
      <p>● Contrato privado celebrado entre ${W('vendedor_nombre')} y ${W('comprador_nombre')} el ${W('contrato_privado_fecha')}, ratificado el ${W('ratificacion_fecha')}, ante autoridad administrativa / la fe pública del Notario Público ${W('ratificacion_notario_num')} de ${W('ratificacion_localidad')}, el Licenciado ${W('ratificacion_notario_nombre')}, ratificación debidamente inscrita el ${W('ratificacion_rpp_fecha')} en el Registro Publico de la Propiedad de ${W('ratificacion_rpp_localidad')} bajo el folio real ${W('ratificacion_folio_real')}.</p>
      <p>Dicha documentación puede ser consultada por la parte compradora en ${W('vendedor_docs_consulta')}.</p>
      <p>f. En caso de que el inmueble referido en el inciso previo este sujeto al régimen de propiedad en condominio.- El inmueble indicado en el inciso previo, esta sujeto al régimen de propiedad en condominio; en términos de la escritura publica ${W('condominio_escritura_num')}, otorgada en la fecha ${W('condominio_escritura_fecha')}, ante la fe del Notario Público ${W('condominio_notario_num')} de ${W('condominio_notario_localidad')}, el Licenciado ${W('condominio_notario_nombre')} y debidamente inscrita el ${W('condominio_rpp_fecha')} en el Registro Público de la Propiedad de ${W('condominio_rpp_localidad')} bajo el folio real ${W('condominio_folio_real')}, instrumento en el cual están referidas las correspondientes áreas de uso común y porcentaje indiviso y que puede ser consultado en ${W('vendedor_docs_consulta')}.</p>
      <p>g. El terreno indicado en el inciso e previo, cuenta con uso de suelo ${W('uso_suelo')}, como se acredita en términos de las documentales que se agregan en el "Anexo A" del presente contrato. Asimismo, respecto de este se cuenta con las siguientes licencias, permisos y autorizaciones: ${W('licencias_permisos')}. Dicha documentación puede ser consultada por la compradora en: ${W('vendedor_docs_consulta')}.</p>
      <p>h. El terreno objeto del contrato, no se encuentra sujeto algún régimen especial, se puede escriturar de inmediato y no está sujeto a régimen ejidal o comunal.</p>
      <p>i. El terreno cuenta con estudio de factibilidad técnico, oficial o avalado por autoridad competente para la instalación de servicios básicos (suministro de energía eléctrica, instalaciones adecuadas para gas natural o LP, agua potable, drenaje, alcantarillado y alumbrado público); documental que se adjunta al presente contrato en el "Anexo B".</p>
      <p>j. Al momento de la escrituración que formalice el contrato de compraventa del inmueble, éste debe estar libre de todo gravamen que afecte la propiedad de la compradora sobre el mismo.</p>
      <p>k. Puso a disposición de la parte compradora, la información y documentación especificada en los "Anexos D y E" del presente contrato.</p>
      <p><strong>II. Declara la parte compradora que:</strong></p>
      <p>a.1. En caso de ser persona física. - Es de nacionalidad ${W('comprador_nacionalidad')} acredita su identidad en términos de ${W('comprador_id_tipo')}, con numero de folio ${W('comprador_id_folio')} documento oficial emitido por ${W('comprador_id_autoridad')}; tiene ${W('comprador_edad')}; y su estado civil es ${W('comprador_estado_civil')}.</p>
      <p>a.2. En caso de ser persona jurídica. – Es una sociedad mercantil ${W('comprador_nacionalidad')} legalmente constituida de conformidad con las Leyes de los Estados Unidos Mexicanos, según consta en el documento publico ${W('comprador_doc_publico_num')} otorgado ante la fe del ${W('comprador_notario_tipo')} Publico ${W('comprador_notario_num')} de ${W('comprador_notario_localidad')}, el Licenciado ${W('comprador_notario_nombre')}, instrumento que consta inscrito en el registro publico de comercio de ${W('comprador_notario_localidad')} bajo el folio mercantil ${W('comprador_folio_mercantil')}.</p>
      <p>b. En caso de ser persona física representada o jurídica.- Su ${W('comprador_rep_cargo')}, cuenta con facultades suficientes para obligarla en los términos y condiciones del presente contrato, lo cual se acredita en términos del instrumento publico ${W('comprador_doc_publico_num')}, otorgado ante la fe del ${W('comprador_notario_tipo')} Público ${W('comprador_notario_num')} de ${W('comprador_notario_localidad')}, el Licenciado ${W('comprador_notario_nombre')}, mismo que consta inscrito en el Registro Público de Comercio de ${W('comprador_notario_localidad')} bajo el folio mercantil ${W('comprador_folio_mercantil')}, facultades que no le han sido revocadas ni modificadas en forma alguna.</p>
      <p>c. Su domicilio es el ubicado en ${W('comprador_domicilio')} y su Registro Federal de Contribuyentes es ${W('comprador_rfc')}.</p>
      <p>d. Tiene capacidad jurídica y económica para obligarse en los términos del presente contrato.</p>
      <p><strong>III. Declaran las partes que:</strong></p>
      <p>a. Es su voluntad celebrar el presente contrato.</p>
      <h2>CLÁUSULAS</h2>
      <p><strong>Primera. Objeto.-</strong> En virtud del presente contrato, la parte vendedora vende a la parte compradora, quien adquiere para sí, el terreno indicado en la declaración 1, inciso e) anterior, el cual tiene las especificaciones de identificación, características, extensión, estado físico general, en su caso áreas de uso común con otros inmuebles y porcentaje de indiviso referidos en el "Anexo C" del presente contrato, el cual firmado por ambas partes forma parte integrante del mismo; anexo en el que también se detalla el equipamiento urbano existente en la localidad dónde se encuentra el inmueble, así como los sistemas y medios de transporte existentes para llegar a él.</p>
      <p><strong>Segunda. Precio, forma y método de pago.-</strong> Las partes convienen que el precio total de esta compraventa será la cantidad de $ ${W('precio_total')} M.N. (${W('precio_letra')} con 00/100 Moneda Nacional); precio total que la compradora se obliga a pagar a la vendedora de la siguiente forma:</p>
      <p>De contado:</p>
      <p>● En la fecha de firma de la escritura pública de compraventa, la cantidad de de $ ${W('contado_escritura_monto')} M.N. (${W('contado_escritura_letra')} con 00/100 Moneda Nacional).</p>
      <p>A plazos:</p>
      <p>● En caso de anticipo. - En fecha ${W('anticipo_fecha')}, la parte compradora pago a la vendedora la cantidad de $ ${W('anticipo_monto')} M.N. (${W('anticipo_letra')} con 00/100 Moneda Nacional) por concepto de anticipo; pago que resulta un abono al precio referido previamente.</p>
      <p>● En caso de enganche. - La cantidad de $ ${W('enganche_monto')} M.N. (${W('enganche_letra')} con 00/100 Moneda Nacional), a la firma del presente contrato como enganche de la compraventa, cantidad que la vendedora en este acto recibe a su entera satisfacción y se aplicara como parte del precio del terreno, constando el presente contrato como el recibo de dicho pago.</p>
      <p>● La cantidad de $ ${W('pago_plazo_monto')} M.N. (${W('pago_plazo_letra')} con 00/100 Moneda Nacional), el ${W('pago_plazo_dia')} de ${W('pago_plazo_mes')} de ${W('pago_plazo_anio')}.</p>
      <p>● En la fecha de firma de la escritura publica de compraventa, la cantidad de $ ${W('saldo_escritura_monto')} M.N. (${W('saldo_escritura_letra')} con 00/100 Moneda Nacional)</p>
      <p>El precio por la compraventa es en moneda Nacional, en caso de expresarse en moneda extranjera, se estará al tipo de cambio que rija en el lugar y fecha en el que se realice el pago, de conformidad con la legislación aplicable.</p>
      <p>Los conceptos de pago a cargo de la compradora, deben ser cubiertos con el método de pago referido a continuación: ${W('metodo_pago')}.</p>
      <p>En caso de que la compradora pague a través de un crédito. - La compradora pagara a la vendedora a través del ${W('credito_info')}</p>
      <p>Si la compradora demora en el pago del precio, se constituirá en la obligación de pagar a la vendedora el interés moratorio del ${W('interes_moratorio_pct')}% ${W('interes_moratorio_periodo')} sobre el importe pagadero por el tiempo que medie el retraso en el pago; interés que no debe resultar inequitativo, desproporcional, abusivo, ni excesivo. Dicho interés moratorio calcula de la siguiente manera: ${W('interes_moratorio_calculo')}.</p>
      <p>Los pagos que realice la compradora, aun en forma extemporánea y que sean aceptados por la vendedora, liberan a la compradora de las obligaciones inherentes a dichos pagos.</p>
      <p>Los importes señalados en esta cláusula son todas las cantidades a cargo de la compradora por concepto de la compraventa, por lo que, la vendedora se obliga a respetar en todo momento dicho costo.</p>
      <p><strong>Tercera. Gastos operativos. –</strong> En virtud del presente contrato, la compradora debe pagar los siguientes gastos operativo, distintos del precio de la venta: ${W('gastos_operativos')}.</p>
      <p><strong>Cuarta. información para gestionar crédito. –</strong> En su caso, la vendedora en este acto se obliga a entregar a la compradora toda la información del terreno que se requiera con el fin de que esta cumpla con los requisitos de cualquier institución acreditante establezca para el otorgamiento del crédito.</p>
      <p><strong>Quinta. Revocación. –</strong> La parte compradora cuenta con un plazo de ${W('plazo_cancelar')} días hábiles (plazo que no debe ser menor a 5 días hábiles a partir de la firma del contrato) posteriores a la firma del presente contrato para revocar su consentimiento sobre la operación sin responsabilidad alguna de su parte, mediante aviso escrito, de conformidad con la clausula decima quinta. Para el caso de que la revocación se realice por correo certificado o registrado o servicio de mensajería, se tomara como fecha de revocación, la de recepción para su envió.</p>
      <p>Ante la cancelación de la compraventa, la vendedora se obliga a reintegrar todas las cantidades a la compradora por el mismo medio en el que ésta haya efectuado el pago, dentro de los 75 días hábiles siguientes a la fecha en que le sea notificada la revocación.</p>
      <p>En caso de anticipo, la vendedora lo devolverá a la compradora en el mismo número y monto de las exhibiciones mediante las cuales ésta efectuó dicho pago, salvo pacto en contrario.</p>
      <p>En caso de que no se restituyeren las cantidades a la compradora dentro del plazo establecido, la vendedora debe pagarle a su contraparte el interés moratorio del ${W('interes_devolucion_pct')}% ${W('interes_devolucion_periodo')} sobre la cantidad no devuelta por el tiempo que medie el retraso. Dicho interés moratorio se calcula de la siguiente manera: ${W('interes_devolucion_calculo')}.</p>
      <p><strong>Sexta. Firma de escritura pública. –</strong> Las partes acuerdan que dentro de los ${W('dias_escrituracion')} naturales siguientes a la fecha de firma del presente contrato de compraventa, concurrirán ante el notario Público que en su momento sea designado por la compradora, con el fin de otorgar y formalizar la escritura publica de la compraventa; acto en el cual la vendedora entregará a la compradora una carta de responsiva de seguridad estructural y póliza de garantía, en la forma que se agrega al presente contrato como "Anexo D", el cual firmado por las contratantes forma parte integrante del mismo, así como todos aquellos documentos relativos a la casa habitación que deban ser entregados a la compradora de conformidad con la legislación aplicable.</p>
      <p>Las partes acuerdan que, el costo del avalúo inmobiliario, gastos de escrituración, honorarios, impuestos, derechos y comisiones o gastos aplicables por apertura de crédito, en su caso, que se causen con motivo de dicho acto correrán a cargo de la compradora, con excepción del impuesto sobre la renta que por Ley corresponde pagar a la vendedora, quien a partir de dicha formalización se obliga ante la compradora a responder por el saneamiento para el caso de evicción.</p>
      <p>En caso de que el terreno objeto del contrato esté sujeto a algún Reglamento de adecuaciones o construcción aplicable al fraccionamiento, condominio o conjunto habitacional al que forme parte o a restricciones oficiales aplicables a la construcción en éste; dicha información debe consignarse en la escritura pública que contenga la operación de compraventa respectiva.</p>
      <p><strong>Séptima. Entrega y recepción del inmueble. -</strong> La vendedora se obliga a entregar a la compradora la propiedad y posesión material del terreno libre de todo gravamen y limitación de dominio, a más tardar el ${W('entrega_dia')} de ${W('entrega_mes')} de ${W('entrega_anio')}. El retraso en la fecha de entrega del bien inmueble, dará lugar a la aplicación de la pena convencional dispuesta en la cláusula décima primera; salvo que la vendedora acredite fehacientemente que dicho incumplimiento es consecuencia del caso fortuito o fuerza mayor que afecte directamente a la vendedora o al inmueble, pudiéndose pactar para tal caso, sin responsabilidad alguna, una nueva fecha de entrega.</p>
      <p>Al momento de entregar el inmueble, la vendedora, conjuntamente con la compradora realizarán una revisión ocular a éste al tenor de lo pactado por las partes en el "Anexo C" del presente contrato. En caso de que la compradora esté de acuerdo, las partes firmarán un acta de entrega y recepción del inmueble.</p>
      <p><strong>Octava. Destino y modificación del inmueble.-</strong> La compradora se obliga a respetar el uso habitacional del inmueble, por lo que, le está prohibido instalar en el mismo cualquier tipo de comercio.</p>
      <p>En caso de que el terreno se encuentre en un fraccionamiento, condominio o conjunto habitacional. - A fin de preservar el entorno urbanístico y arquitectónico del lugar en donde se encuentra ubicado el terreno, en su caso, la compradora se obliga a obtener de las autoridades correspondientes, las autorizaciones necesarias a efecto de realizarle cualquier modificación. El fraccionamiento, condominio o conjunto habitacional:</p>
      <p>● Cuenta con un Reglamento de adecuaciones o construcción, por lo que, la compradora se obliga a respetar dicha normativa, misma que se adjunta al presente en el "Anexo F".</p>
      <p>● No cuenta con un Reglamento de adecuaciones o construcción.</p>
      <p><strong>Novena. Restricciones oficiales aplicables a la construcción en el terreno. -</strong> En su caso, el terreno objeto del contrato está sujeto a las siguientes restricciones oficiales aplicables a la construcción:</p>
      <p>● Restricciones ambientales. - ${W('restricciones_ambientales')}.</p>
      <p>● Colindancias con zonas ecológicas, reservas forestales y reserva federales. - ${W('colindancias_ecologicas')}</p>
      <p>● Cualquier otra limitación decretada por las autoridades competentes y/o prevista en la legislación aplicable. - ${W('otras_limitaciones')}</p>
      <p><strong>Décima. Relación de los derechos y obligaciones de las partes. –</strong> Los derechos y obligaciones de las partes contractuales son los siguientes (listado enunciativo más no limitativo)</p>
      <table>
        <tr><th colspan="2">Parte vendedora</th></tr>
        <tr><th>Derechos</th><th>Obligaciones</th></tr>
        <tr>
          <td><p>● Recibir por la entrega del inmueble objeto del contrato un precio cierto y en dinero.</p><p>● Recibir los pagos en el tiempo, lugar y forma acordados.</p></td>
          <td><p>● Brindar información y publicidad veraz, clara y actualizada dl inmueble.</p><p>● Poner a disposición de la compradora la información y documentación del inmueble.</p><p>● No condicionar la compraventa a la contratación de servicio(s) adicional(es).</p><p>● Respetar el derecho de la compradora a cancelar la operación de consumo sin responsabilidad alguna dentro de los ${W('plazo_cancelar')} días hábiles (plazo que no debe ser menor a 5 días hábiles contados a partir de la firma del contrato) posteriores a la firma del contrato.</p><p>● Transferir la propiedad del inmueble a la compradora.</p><p>● Entregar a la compradora el inmueble en los términos y plazos acordados.</p><p>● Responsabilizarse de los daños y prejuicios ocasionados a la compradora si procede con dolo o mala fe en la contratación.</p><p>● Responder ante evicción o vicios ocultos.</p></td>
        </tr>
        <tr><th colspan="2">Parte compradora</th></tr>
        <tr><th>Derechos</th><th>Obligaciones</th></tr>
        <tr>
          <td><p>● Recibir información y publicidad veraz, clara y actualizada del inmueble.</p><p>● Recibir la información y documentación del inmueble.</p><p>● Cancelar la operación sin responsabilidad alguna dentro de los 15 días naturales posteriores a la firma del contrato.</p><p>● Recibir la propiedad del inmueble en los términos acordados.</p><p>● Exigir los daños y perjuicios ocasionados en caso de que la vendedora proceda con dolo o mala fe en la contratación.</p><p>● Ejercer acción civil ante la evicción o vicios ocultos.</p></td>
          <td><p>● Pagar por el inmueble objeto del contrato un precio cierto y en dinero.</p><p>● Pagar el precio en tiempo, lugar y forma acordados.</p></td>
        </tr>
      </table>
      <p><strong>Décima primera. Pena convencional. -</strong> Las partes acuerdan para el caso de incumplimiento de cualquiera de las obligaciones contraídas en el presente contrato, una pena convencional de la cantidad equivalente al ${W('pena_convencional_pct')}% del precio total de compraventa establecido en la cláusula segunda, salvo indicación específica pactada en el presente contrato. No podrá hacerse efectiva la pena cuando el obligado a ella no haya podido cumplir el contrato por hecho de su contraparte, caso fortuito o fuerza insuperable.</p>
      <p><strong>Décima segunda. Rescisión. -</strong> Para el caso de que una de las partes no cumpliere las obligaciones a su cargo, sin necesidad de resolución judicial, el perjudicado podrá escoger entre exigir el cumplimiento o la resolución de la obligación, así como el pago de la pena convencional dispuesta en la cláusula décima primera. Si se rescinde la venta, la vendedora y la compradora deben restituirse las prestaciones que se hubieren hecho.</p>
      <p>Si el incumplimiento fuera a cargo de la vendedora, además de la pena señalada en la cláusula décima primera, debe restituir a la compradora todas las cantidades pagadas por ésta (de manera enunciativa, mas no limitativa, el precio de compraventa, así como los pagos por concepto de gastos de escrituración, impuestos, avalúo, administración, apertura de crédito, erogaciones de investigación, costos por los accesorios o complementos, entre otros); si el incumplimiento fuera a cargo de la parte compradora, la vendedora podrá retener la pena convencional, de aquella cantidad entregada por la compradora.</p>
      <p>La vendedora debe restituir a la compradora los saldos excedentes a su favor por el mismo medio en el que efectuó el pago, dentro de los 75 días hábiles siguientes a la rescisión del contrato. En caso de anticipo, la vendedora lo devolverá a la compradora en el mismo número y monto de las exhibiciones mediante las cuales ésta efectuó dicho pago, salvo pacto en contrario.</p>
      <p>En caso de que no se restituyeren las cantidades dentro del plazo establecido, se debe pagar a la contraparte el interés moratorio del ${W('interes_rescision_pct')}% ${W('interes_rescision_periodo')} sobre la cantidad no devuelta por el tiempo que medie el retraso; interés que no debe resultar inequitativo, desproporcional, abusivo, ni excesivo. Dicho interés moratoria se calcula de la siguiente manera: ${W('interes_rescision_calculo')}.</p>
      <p>Si la parte vendedora hubiere entregado el inmueble vendido, tiene derecho a exigir a la compradora, por el uso de éste, el pago de un alquiler o renta fijada y, en su caso, una indemnización por el deterioro que haya sufrido el bien; con base en la determinación de un perito.</p>
      <p>En los casos de operaciones en que el precio deba cubrirse en exhibiciones periódicas, cuando la parte compradora haya pagado más de la tercera parte del precio o del número total de los pagos convenidos y la vendedora exija la rescisión o cumplimiento del contrato por mora, la compradora tendrá derecho a optar por la rescisión o por el pago del adeudo vencido más los intereses moratorias generados de conformidad con los párrafos antepenúltimo y penúltimo de la cláusula segunda.</p>
      <p><strong>Décima tercera. Proceder en caso del fenecimiento de la parte compradora.-</strong> En caso de fallecimiento de la parte compradora antes de la firma de la escritura pública de compraventa, se presume que su(s) sucesor(es) legítimo(s) la sucede(n) en todos losderechos y obligaciones derivados del presente contrato, salvo que manifieste(n) a la vendedora su deseo de no continuar con la compraventa, debiendo la vendedora restituirle(s) las cantidades que le hubiere pagado la compradora con motivo del presente contrato; de conformidad con ${W('legislacion_sucesion')}</p>
      <p><strong>Décima cuarta. Servicios adicionales. -</strong> En caso de que la vendedora ofrezca servicios adicionales. - El listado de los servicios adicionales, especiales o conexos, que puede solicitar la compradora de forma opcional por conducto y medio de la compraventa son detallados en cuanto a su descripción y costo en el "Anexo G".</p>
      <p>La vendedora sólo puede prestar servicios adicionales, especiales o conexos, si cuenta con el consentimiento escrito de la compradora sobre los mismos. Las erogaciones distintas al precio de venta, deben ser aceptadas por escrito por la compradora, por lo que, la vendedora sólo podrá hacer efectivo su pago, de manera posterior a haber recabado dicho consentimiento.</p>
      <p>La compradora en cualquier momento podrá solicitar dar por terminada la prestación de los servicios adicionales, especiales o conexos a la compraventa, mediante aviso por escrito a la vendedora, sin que ello implique la conclusión de la contratación principal.</p>
      <p><strong>Décima quinta. Notificaciones entre las partes. -</strong> Todas las notificaciones, requerimientos, autorizaciones, avisos o cualquier otra comunicación que deban darse las partes conforme a este contrato, deben hacerse por escrito y considerarse como debidamente entregadas si se encuentran firmadas por la respectiva parte contractual o su representante o apoderado legal y entregadas con acuse de recibo al destinatario o confirmación de recepción en:</p>
      <table>
        <tr><th>Parte vendedora</th><th>Parte compradora</th></tr>
        <tr>
          <td><p>● Domicilio: ${W('vendedor_notif_domicilio')}</p><p>● Correo electrónico: ${W('vendedor_notif_email')}</p></td>
          <td><p>● Domicilio: ${W('comprador_notif_domicilio')}</p><p>● Correo electrónico: ${W('comprador_notif_email')}</p></td>
        </tr>
      </table>
      <p><strong>Décima sexta. Canales de atención. -</strong> La parte vendedora cuenta con el siguiente canal de atención para recibir comentarios, sugerencias y quejas de la compradora: ${W('canal_atencion')}. Dicho canal esta habilitado los días ${W('canal_dias')} en un horario de ${W('canal_horario')} y el plazo respuesta es de ${W('canal_plazo_respuesta')}.</p>
      <p><strong>Décima séptima. Datos personales. -</strong> Los datos personales que se obtengan por la parte vendedora deben ser tratados conforme a los principios de licitud, consentimiento, información, calidad, finalidad, lealtad, proporcionalidad y responsabilidad.</p>
      <p>Para efectos de lo dispuesto en la Ley Federal de Protección de Datos Personales en Posesión de los Particulares, la parte vendedora adjunta al presente contrato su Aviso de Privacidad en el "Anexo H", en el cual informa al titular de los datos personales, qué información recabará y con qué finalidades.</p>
      <p>En caso de tratarse de datos personales sensibles, la parte vendedora debe obtener consentimiento expreso y por escrito del titular para su tratamiento. No podrán crearse bases de datos que contengan datos personales sensibles, sin que se justifique la creación de las mismas para finalidades legítimas, concretas y acordes con las actividades o fines explícitos que persigue el sujeto regulado.</p>
      <p>En caso de que los datos personales fueren obtenidos de manera indirecta del titular, se debe informar a los titulares de los datos personales que así lo soliciten cómo se dio la transferencia u obtención de dichos datos y se deben observar las siguientes reglas:</p>
      <p>1. Si fueron tratados para una finalidad distinta prevista en una transferencia consentida, o si los datos fueron obtenidos de una fuente de acceso público, el aviso de privacidad se debe de dar a conocer a la compradora en el primer contacto que se tenga con él.</p>
      <p>2. Cuando la vendedora pretenda utilizar los datos para una finalidad distinta a la consentida, el aviso de privacidad debe ser actualizado y darse a conocer al titular previo aprovechamiento de los datos personales.</p>
      <p>La persona titular de los datos personales o su representante legal podrá solicitar a la vendedora en cualquier momento el acceso, rectificación, cancelación u oposición respecto a sus datos personales y datos personales sensibles.</p>
      <p><strong>Décima octava. Competencia administrativa de la Procuraduría Federal del Consumidor (Profeco). -</strong> Ante cualquier controversia que se suscite sobre la interpretación o cumplimiento del presente contrato, la parte compradora puede acudir a la Profeco, la cual tiene funciones de autoridad administrativa encargada de promover y proteger los derechos e intereses de los consumidores y procurar la equidad y certeza jurídica en las relaciones de consumo, desde su ámbito competencial.</p>
      <p><strong>Décima novena. Competencia de las autoridades jurisdiccionales.-</strong> Para resolver cualquier controversia que se suscite sobre la interpretación o cumplimiento del presente contrato, las partes se someten a las autoridades jurisdiccionales competentes de ${W('jurisdiccion_lugar')}, renunciando expresamente a cualquier otra jurisdicción que pudiera corresponderles, por razón de sus domicilios presentes o futuros o cualquier otra razón.</p>
      <p><strong>Vigésima. Plazos para que la parte compradora ejerza acciones civiles relacionadas con el inmueble. -</strong> La parte compradora cuenta con los siguientes plazos para ejercer las acciones civiles relacionadas con el inmueble objeto del contrato ante las autoridades jurisdiccionales indicadas en la cláusula décima novena:</p>
      <table>
        <tr><th>Acción civil</th><th>Plazo en el cual prescribe la acción</th><th>Disposiciones jurídicas y legislación aplicable</th></tr>
        <tr><td>Responsabilidad civil</td><td>${W('plazo_responsabilidad_civil')}</td><td>${W('legislacion_responsabilidad_civil')}</td></tr>
        <tr><td>Vicios ocultos del inmueble</td><td>${W('plazo_vicios_ocultos')}</td><td>${W('legislacion_vicios_ocultos')}</td></tr>
        <tr><td>Evicción</td><td>${W('plazo_eviccion')}</td><td>${W('legislacion_eviccion')}</td></tr>
      </table>
      <p><strong>Vigesima primera. Registro del modelo de contrato de adhesión. –</strong> El presente modelo de contrato de adhesión fue inscrito el ${W('registro_dia')} de ${W('registro_mes')} de ${W('registro_anio')} en el Registro Publico de Contratos de Adhesion de la Profeco bajo el numero ${W('registro_num')}. Cualquier diferencia entre el texto del contrato de adhesión registrado ante la Procuraduria y el utilizado en perjuicio de los consumidores, se tendrá por no puesta.</p>
      <p>Leido que fue por las partes el contenido del presente contrato y sabedoras de su alcance legal, lo firman por duplicado el ${W('firma_dia')} de ${W('firma_mes')} de ${W('firma_anio')} en ${W('lugar_celebracion')}, por lo que, la vendedora esta obligada a entregar un tanto del contrato y sus anexos originales y firmados a la compradora.</p>
      <br>
      <table><tr>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;">Firma de la parte vendedora</div></td>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;">Firma de la parte compradora</div></td>
      </tr></table>
      <p>El presente contrato y sus anexos pueden signarse: de manera autógrafa original; o a través de una firma electrónica avanzada o fiable que será considerada para todos los efectos con la misma fuerza y consecuencias que la firma autógrafa original física de la parte firmante.</p>
      <p>Autorización para la utilización de información con fines mercadotécnicos o publicitarios. - La parte compradora si ( ) no ( ) acepta que la vendedora ceda o transmita a terceros, con fines mercadotécnicos o publicitarios, la información proporcionada con motivo del presente contrato y si () no () acepta que la vendedora le envíe publicidad sobre bienes y servicios.</p>
      <br>
      <table><tr>
        <td style="text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;">Firma de la parte compradora</div></td>
      </tr></table>
      <p>Todo consumidor que no desee recibir publicidad por parte de los proveedores en términos de la Ley Federal de Protección al Consumidor, puede inscribir de manera gratuita su número telefónico en el Registro Público de Consumidores (también denominado Registro Público para Evitar Publicidad) de la Profeco, a través del portal web https://repep.profeco.gob.mx/ o al 5596280000 (desde la Ciudad de México, Guadalajara y Monterrey) u 8009628000 (desde el resto de la República Mexicana).</p>
      <p>Queda prohibido a los proveedores que utilicen información sobre consumidores con fines mercadotécnicos o publicitarios y a sus clientes, utilizar la información relativa a los consumidores con fines diferentes a los mercadotécnicos o publicitarios, asícomo enviar publicidad a los consumidores que expresamente les hubieren manifestado su voluntad de no recibirla o que estén inscritos en el Registro Público de Consumidores (también denominado Registro Público para Evitar Publicidad). Los proveedores que sean objeto de publicidad son corresponsables del manejo de la información de consumidores cuando dicha publicidad la envíen a través de terceros.</p>
      <h2>Anexo A</h2>
      <p><strong>Uso de suelo aplicable al terreno</strong></p>
      <p>(En el presente anexo debe: indicarse el uso de suelo aplicable al terreno conforme al plan de desarrollo urbano vigente, con su respectiva interpretación; y agregarse copia del documento oficial vigente que acredite la licencia de uso de suelo del terreno)</p>
      <h2>Anexo B</h2>
      <p><strong>Estudio de factibilidad técnico, oficial o avalado por autoridad competente para la instalación de servicios básicos en el terreno</strong></p>
      <p>(El presente anexo debe contener el estudio de factibilidad técnico, oficial o avalado por autoridad competente para la instalación de servicios básicos -suministro de energía eléctrica, instalaciones adecuadas para gas natural o LP, agua potable, drenaje, alcantarillado y alumbrado público- en el terreno)</p>
      <h2>Anexo C</h2>
      <p><strong>Especificaciones del bien inmueble destinado a casa habitación</strong></p>
      <p>(El presente anexo debe contener la información relativa a las especificaciones de identificación, características, extensión, estado físico general, en su caso áreas de uso común con otros inmuebles y porcentaje de indiviso y el detalle del equipamiento urbano existente en la localidad dónde se encuentra el inmueble, así como los sistemas y medios de transporte existentes para llegar a él)</p>
      <table><tr>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;">Parte vendedora</div></td>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;">Parte compradora</div></td>
      </tr></table>
      <h2>Anexo D</h2>
      <p><strong>Información y documentación del inmueble que se pone a disposición de la compradora</strong></p>
      <table>
        <tr><th>Información / Documentación</th><th>¿Le informaron sobre/exhibieron la documentación correspondiente? Si / No</th><th>Medio a través del cual se pone a disposición de la compradora (domicilio o link del sitio web en el cual esta la documentación para consulta)</th></tr>
        <tr><td>Documentos que acrediten la propiedad del inmueble</td><td></td><td></td></tr>
        <tr><td>Personalidad del vendedor y autorización para promover la venta</td><td></td><td></td></tr>
        <tr><td>Programa Interno de Protección Civil</td><td></td><td></td></tr>
        <tr><td>Uso de suelo aplicable al terreno conforme al plan de desarrollo urbano vigente</td><td></td><td></td></tr>
        <tr><td>Copia del documento oficial vigente que acredite la licencia de uso de suelo del terreno</td><td></td><td></td></tr>
        <tr><td>Licencias, permisos y autorizaciones sobre fraccionamientos, subdivisiones, fusiones, relotificaciones, condominios, entre otras</td><td></td><td></td></tr>
        <tr><td>Estudio de factibilidad técnico, oficial o avalado por autoridad competente para la instalación de servicios básicos en el terreno</td><td></td><td></td></tr>
        <tr><td>Características y especificaciones del bien inmueble destinado a casa habitación</td><td></td><td></td></tr>
        <tr><td>Reglamento de adecuaciones o construcción aplicable al fraccionamiento, condominio o conjunto habitacional</td><td></td><td></td></tr>
        <tr><td>Existencia de gravámenes que afecten la propiedad del inmueble</td><td></td><td></td></tr>
        <tr><td>Condiciones en que se encuentre el pago de contribuciones</td><td></td><td></td></tr>
        <tr><td>Beneficios adicionales</td><td></td><td></td></tr>
        <tr><td>Opciones de pago, con especificación del monto a pagar en cada una de ellas</td><td></td><td></td></tr>
        <tr><td>Condiciones bajo las cuales se llevará a cabo el proceso de escrituración</td><td></td><td></td></tr>
        <tr><td>Erogaciones distintas del precio de la venta</td><td></td><td></td></tr>
        <tr><td>Condiciones bajo las cuales puede cancelar la operación</td><td></td><td></td></tr>
        <tr><td>Listado de servicios adicionales, especiales o conexos</td><td></td><td></td></tr>
        <tr><td>Carta de derechos</td><td></td><td></td></tr>
        <tr><td>Aviso de privacidad</td><td></td><td></td></tr>
      </table>
      <p>Importante para la compradora. - Antes de que firme como constancia de que tuvo a su disposición la información y documentación relativa al inmueble, es importante cerciorarse de que la misma coincide con la que efectivamente le haya mostrado y/o proporcionado la vendedora.</p>
      <table><tr>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;">Parte vendedora</div></td>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;">Parte compradora</div></td>
      </tr></table>
      <h2>Anexo E</h2>
      <p><strong>Carta de derechos de la parte compradora</strong></p>
      <p>● Recibir información y publicidad veraz, clara y actualizada de los bienes inmuebles que le fueron ofertados por la parte vendedora; de forma tal, que esté en posibilidad de tomar la mejor decisión de compra.</p>
      <p>● Conocer la información sobre las características del inmueble, entre éstas: la extensión del terreno, áreas de uso común y estado general físico.</p>
      <p>● Elegir libremente el inmueble que mejor satisfaga sus necesidades y se ajuste a su capacidad de compra.</p>
      <p>● No realizar pago alguno hasta que conste por escrito la relación contractual, con excepción de los anticipos o gastos operativos.</p>
      <p>● Firmar un contrato de adhesión bajo el modelo inscrito en la Procuraduría Federal del Consumidor, en el cual consten los términos y condiciones de la compraventa del bien inmueble. Posterior a su firma, la parte vendedora tiene la obligación de entregar una copia del contrato firmado a la compradora.</p>
      <p>● Adquirir un inmueble que cuente con las características de seguridad y calidad que estén contenidas en la normatividad aplicable y plasmadas en la información y publicidad que haya recibido.</p>
      <p>● Recibir el bien inmueble en el plazo y condiciones acordados con la parte vendedora en el contrato de adhesión respectivo.</p>
      <p>● Contar con canales y mecanismos de atención gratuitos y accesibles para consultas, solicitudes, reclamaciones y sugerencias al proveedor y conocer el domicilio señalado por el proveedor para oír y recibir notificaciones.</p>
      <p>● Tener a su disposición un Aviso de Privacidad para conocer y en su caso consentir el tratamiento que se dará a los datos personales que proporcione, que sus datos personales sean tratados conforme a la normatividad aplicable y conocer los mecanismos disponibles para realizar el ejercicio de sus derechos de acceso, rectificación, cancelación y oposición.</p>
      <p>● Derecho a la protección por parte de las autoridades competentes y conforme a las leyes aplicables, incluyendo el derecho a presentar denuncias y reclamaciones ante las mismas.</p>
      <p>Los derechos previstos en esta carta, no excluyen otros derivados de tratados o convenciones internacionales de los que los Estados Unidos Mexicanos sea signatario; de la legislación interna ordinaria; o de reglamentos expedidos por las autoridades administrativas competentes.</p>
      <h2>Anexo F</h2>
      <p><strong>Reglamento de adecuaciones o construcción aplicable al fraccionamiento, condominio o conjunto habitacional</strong></p>
      <p>(En su caso, agregar el Reglamento de adecuaciones o construcción aplicable al fraccionamiento, condominio o conjunto habitacional al que forme parte el bien objeto del contrato)</p>
      <h2>Anexo G</h2>
      <p><strong>Listado de servicios adicionales, especiales o conexos a la compraventa</strong></p>
      <p>(El presente formato debe contener el listado de los servicios adicionales, especiales o conexos que la compradora puede solicitar de forma opcional por conducto de la compraventa, en concordancia con lo dispuesto en la cláusula décima cuarta del contrato de compraventa del cual forma parte integrante)</p>
      <table><tr>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;">Parte vendedora</div></td>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;">Parte compradora</div></td>
      </tr></table>
      <h2>Anexo H</h2>
      <p><strong>Aviso de privacidad</strong></p>
      <p>(El presente formato debe contener el aviso de privacidad de la vendedora, mismo que debe ser acorde a lo estipulado en la cláusula décima séptima del contrato de compraventa del cual forma parte integrante y a las disposiciones aplicables de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares)</p>
      <br>
      <table><tr>
        <td style="text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;">Firma de la parte compradora</div></td>
      </tr></table>`

    // ── 13. CONTRATO COMPRAVENTA — TERRENO (PROFECO verbatim) ───────────────
    case 'cv_terreno': return `
      <h1>CONTRATO DE COMPRAVENTA DE TERRENO</h1>
      <p>Contrato de adhesión de compraventa de terreno destinado a casa habitación, al que, en lo sucesivo, se le denominará el "contrato", que celebran, por una parte, ${W('vendedor_nombre')}, quien comparece al presente acto jurídico ${W('vendedor_comparece')} ${W('vendedor_rep_nombre')}, en su carácter de ${W('vendedor_rep_cargo')}, a quien en lo sucesivo se le denominara, la "parte vendedora", y por la otra, ${W('comprador_nombre')}, quien comparece al presente acto jurídico ${W('comprador_comparece')} ${W('comprador_rep_nombre')}, en su carácter de ${W('comprador_rep_cargo')}, a quien en lo sucesivo se le denominara, la "parte compradora", ambos sujetos contractuales que en su conjunto serán designados como "las partes".</p>
      <h2>DECLARACIONES</h2>
      <p><strong>I. Declara la parte vendedora que:</strong></p>
      <p>a.1. En caso de ser persona física. - Es de nacionalidad ${W('vendedor_nacionalidad')} acredita su identidad en términos de ${W('vendedor_id_tipo')}, con numero de folio ${W('vendedor_id_folio')} documento oficial emitido por ${W('vendedor_id_autoridad')}.</p>
      <p>a.2. En caso de ser persona jurídica. – Es una sociedad mercantil ${W('vendedor_nacionalidad')} legalmente constituida de conformidad con las Leyes de los Estados Unidos Mexicanos, según consta en el documento público ${W('vendedor_doc_publico_num')} otorgado ante la fe del ${W('vendedor_notario_tipo')} Público ${W('vendedor_notario_num')} de ${W('vendedor_notario_localidad')}, el Licenciado ${W('vendedor_notario_nombre')}, instrumento que consta inscrito en el registro publico de comercio de ${W('vendedor_notario_localidad')} bajo el folio mercantil ${W('vendedor_folio_mercantil')} y que puede ser consultado por la compradora en ${W('vendedor_docs_consulta')}.</p>
      <p>b. En caso de ser persona física representada o jurídica.- Su ${W('vendedor_rep_cargo')}, cuenta con facultades suficientes para obligarla en los términos y condiciones del presente contrato, lo cual se acredita en términos del instrumento publico ${W('vendedor_doc_publico_num')}, otorgado ante la fe del ${W('vendedor_notario_tipo')} Público ${W('vendedor_notario_num')} de ${W('vendedor_notario_localidad')}, el Licenciado ${W('vendedor_notario_nombre')}, mismo que consta inscrito en el Registro Público de Comercio de ${W('vendedor_notario_localidad')} bajo el folio mercantil ${W('vendedor_folio_mercantil')}, facultades que no le han sido revocadas ni modificadas en forma alguna. Tal documentación puede ser consultada por la parte compradora en ${W('vendedor_docs_consulta')}.</p>
      <p>c. Su ${W('vendedor_ocupacion')} versa sobre la construcción, promoción, comercialización y compraventa de toda clase de inmuebles destinados a casa habitación y la concertación de contratos relacionados con dichos actos jurídicos.</p>
      <p>d. Su domicilio es el ubicado en ${W('vendedor_domicilio')} y su Registro Federal de Contribuyentes es ${W('vendedor_rfc')}.</p>
      <p>e. Es legitima propietaria del terreno ubicado en ${W('inmueble_direccion')}; como se acredita en términos de:</p>
      <p>● Escritura publica ${W('escritura_num')}, otorgada en fecha ${W('escritura_fecha')}, ante la de del Notario Público ${W('notario_num')} de ${W('notario_localidad')}, el Licenciado ${W('notario_nombre')} y debidamente inscrita el ${W('rpp_fecha')}, en el Registro Publico de la Propiedad de ${W('rpp_localidad')} bajo el folio real ${W('folio_real')}.</p>
      <p>● Contrato privado celebrado entre ${W('vendedor_nombre')} y ${W('comprador_nombre')} el ${W('contrato_privado_fecha')}, ratificado el ${W('ratificacion_fecha')}, ante autoridad administrativa / la fe pública del Notario Público ${W('ratificacion_notario_num')} de ${W('ratificacion_localidad')}, el Licenciado ${W('ratificacion_notario_nombre')}, ratificación debidamente inscrita el ${W('ratificacion_rpp_fecha')} en el Registro Publico de la Propiedad de ${W('ratificacion_rpp_localidad')} bajo el folio real ${W('ratificacion_folio_real')}.</p>
      <p>Dicha documentación puede ser consultada por la parte compradora en ${W('vendedor_docs_consulta')}.</p>
      <p>f. En caso de que el inmueble referido en el inciso previo este sujeto al régimen de propiedad en condominio.- El inmueble indicado en el inciso previo, esta sujeto al régimen de propiedad en condominio; en términos de la escritura publica ${W('condominio_escritura_num')}, otorgada en la fecha ${W('condominio_escritura_fecha')}, ante la fe del Notario Público ${W('condominio_notario_num')} de ${W('condominio_notario_localidad')}, el Licenciado ${W('condominio_notario_nombre')} y debidamente inscrita el ${W('condominio_rpp_fecha')} en el Registro Público de la Propiedad de ${W('condominio_rpp_localidad')} bajo el folio real ${W('condominio_folio_real')}, instrumento en el cual están referidas las correspondientes áreas de uso común y porcentaje indiviso y que puede ser consultado en ${W('vendedor_docs_consulta')}.</p>
      <p>g. El terreno indicado en el inciso e previo, cuenta con uso de suelo ${W('uso_suelo')}, como se acredita en términos de las documentales que se agregan en el "Anexo A" del presente contrato. Asimismo, respecto de este se cuenta con las siguientes licencias, permisos y autorizaciones: ${W('licencias_permisos')}. Dicha documentación puede ser consultada por la compradora en: ${W('vendedor_docs_consulta')}.</p>
      <p>h. El terreno objeto del contrato, no se encuentra sujeto algún régimen especial, se puede escriturar de inmediato y no está sujeto a régimen ejidal o comunal.</p>
      <p>i. El terreno cuenta con estudio de factibilidad técnico, oficial o avalado por autoridad competente para la instalación de servicios básicos (suministro de energía eléctrica, instalaciones adecuadas para gas natural o LP, agua potable, drenaje, alcantarillado y alumbrado público); documental que se adjunta al presente contrato en el "Anexo B".</p>
      <p>j. Al momento de la escrituración que formalice el contrato de compraventa del inmueble, éste debe estar libre de todo gravamen que afecte la propiedad de la compradora sobre el mismo.</p>
      <p>k. Puso a disposición de la parte compradora, la información y documentación especificada en los "Anexos D y E" del presente contrato.</p>
      <p><strong>II. Declara la parte compradora que:</strong></p>
      <p>a.1. En caso de ser persona física. - Es de nacionalidad ${W('comprador_nacionalidad')} acredita su identidad en términos de ${W('comprador_id_tipo')}, con numero de folio ${W('comprador_id_folio')} documento oficial emitido por ${W('comprador_id_autoridad')}; tiene ${W('comprador_edad')}; y su estado civil es ${W('comprador_estado_civil')}.</p>
      <p>a.2. En caso de ser persona jurídica. – Es una sociedad mercantil ${W('comprador_nacionalidad')} legalmente constituida de conformidad con las Leyes de los Estados Unidos Mexicanos, según consta en el documento publico ${W('comprador_doc_publico_num')} otorgado ante la fe del ${W('comprador_notario_tipo')} Publico ${W('comprador_notario_num')} de ${W('comprador_notario_localidad')}, el Licenciado ${W('comprador_notario_nombre')}, instrumento que consta inscrito en el registro publico de comercio de ${W('comprador_notario_localidad')} bajo el folio mercantil ${W('comprador_folio_mercantil')}.</p>
      <p>b. En caso de ser persona física representada o jurídica.- Su ${W('comprador_rep_cargo')}, cuenta con facultades suficientes para obligarla en los términos y condiciones del presente contrato, lo cual se acredita en términos del instrumento publico ${W('comprador_doc_publico_num')}, otorgado ante la fe del ${W('comprador_notario_tipo')} Público ${W('comprador_notario_num')} de ${W('comprador_notario_localidad')}, el Licenciado ${W('comprador_notario_nombre')}, mismo que consta inscrito en el Registro Público de Comercio de ${W('comprador_notario_localidad')} bajo el folio mercantil ${W('comprador_folio_mercantil')}, facultades que no le han sido revocadas ni modificadas en forma alguna.</p>
      <p>c. Su domicilio es el ubicado en ${W('comprador_domicilio')} y su Registro Federal de Contribuyentes es ${W('comprador_rfc')}.</p>
      <p>d. Tiene capacidad jurídica y económica para obligarse en los términos del presente contrato.</p>
      <p><strong>III. Declaran las partes que:</strong></p>
      <p>a. Es su voluntad celebrar el presente contrato.</p>
      <h2>CLÁUSULAS</h2>
      <p><strong>Primera. Objeto.-</strong> En virtud del presente contrato, la parte vendedora vende a la parte compradora, quien adquiere para sí, el terreno indicado en la declaración 1, inciso e) anterior, el cual tiene las especificaciones de identificación, características, extensión, estado físico general, en su caso áreas de uso común con otros inmuebles y porcentaje de indiviso referidos en el "Anexo C" del presente contrato, el cual firmado por ambas partes forma parte integrante del mismo; anexo en el que también se detalla el equipamiento urbano existente en la localidad dónde se encuentra el inmueble, así como los sistemas y medios de transporte existentes para llegar a él.</p>
      <p><strong>Segunda. Precio, forma y método de pago.-</strong> Las partes convienen que el precio total de esta compraventa será la cantidad de $ ${W('precio_total')} M.N. (${W('precio_letra')} con 00/100 Moneda Nacional); precio total que la compradora se obliga a pagar a la vendedora de la siguiente forma:</p>
      <p>De contado:</p>
      <p>● En la fecha de firma de la escritura pública de compraventa, la cantidad de de $ ${W('contado_escritura_monto')} M.N. (${W('contado_escritura_letra')} con 00/100 Moneda Nacional).</p>
      <p>A plazos:</p>
      <p>● En caso de anticipo. - En fecha ${W('anticipo_fecha')}, la parte compradora pago a la vendedora la cantidad de $ ${W('anticipo_monto')} M.N. (${W('anticipo_letra')} con 00/100 Moneda Nacional) por concepto de anticipo; pago que resulta un abono al precio referido previamente.</p>
      <p>● En caso de enganche. - La cantidad de $ ${W('enganche_monto')} M.N. (${W('enganche_letra')} con 00/100 Moneda Nacional), a la firma del presente contrato como enganche de la compraventa, cantidad que la vendedora en este acto recibe a su entera satisfacción y se aplicara como parte del precio del terreno, constando el presente contrato como el recibo de dicho pago.</p>
      <p>● La cantidad de $ ${W('pago_plazo_monto')} M.N. (${W('pago_plazo_letra')} con 00/100 Moneda Nacional), el ${W('pago_plazo_dia')} de ${W('pago_plazo_mes')} de ${W('pago_plazo_anio')}.</p>
      <p>● En la fecha de firma de la escritura publica de compraventa, la cantidad de $ ${W('saldo_escritura_monto')} M.N. (${W('saldo_escritura_letra')} con 00/100 Moneda Nacional)</p>
      <p>El precio por la compraventa es en moneda Nacional, en caso de expresarse en moneda extranjera, se estará al tipo de cambio que rija en el lugar y fecha en el que se realice el pago, de conformidad con la legislación aplicable.</p>
      <p>Los conceptos de pago a cargo de la compradora, deben ser cubiertos con el método de pago referido a continuación: ${W('metodo_pago')}.</p>
      <p>En caso de que la compradora pague a través de un crédito. - La compradora pagara a la vendedora a través del ${W('credito_info')}</p>
      <p>Si la compradora demora en el pago del precio, se constituirá en la obligación de pagar a la vendedora el interés moratorio del ${W('interes_moratorio_pct')}% ${W('interes_moratorio_periodo')} sobre el importe pagadero por el tiempo que medie el retraso en el pago; interés que no debe resultar inequitativo, desproporcional, abusivo, ni excesivo. Dicho interés moratorio calcula de la siguiente manera: ${W('interes_moratorio_calculo')}.</p>
      <p>Los pagos que realice la compradora, aun en forma extemporánea y que sean aceptados por la vendedora, liberan a la compradora de las obligaciones inherentes a dichos pagos.</p>
      <p>Los importes señalados en esta cláusula son todas las cantidades a cargo de la compradora por concepto de la compraventa, por lo que, la vendedora se obliga a respetar en todo momento dicho costo.</p>
      <p><strong>Tercera. Gastos operativos. –</strong> En virtud del presente contrato, la compradora debe pagar los siguientes gastos operativo, distintos del precio de la venta: ${W('gastos_operativos')}.</p>
      <p><strong>Cuarta. información para gestionar crédito. –</strong> En su caso, la vendedora en este acto se obliga a entregar a la compradora toda la información del terreno que se requiera con el fin de que esta cumpla con los requisitos de cualquier institución acreditante establezca para el otorgamiento del crédito.</p>
      <p><strong>Quinta. Revocación. –</strong> La parte compradora cuenta con un plazo de ${W('plazo_cancelar')} días hábiles (plazo que no debe ser menor a 5 días hábiles a partir de la firma del contrato) posteriores a la firma del presente contrato para revocar su consentimiento sobre la operación sin responsabilidad alguna de su parte, mediante aviso escrito, de conformidad con la clausula decima quinta. Para el caso de que la revocación se realice por correo certificado o registrado o servicio de mensajería, se tomara como fecha de revocación, la de recepción para su envió.</p>
      <p>Ante la cancelación de la compraventa, la vendedora se obliga a reintegrar todas las cantidades a la compradora por el mismo medio en el que ésta haya efectuado el pago, dentro de los 75 días hábiles siguientes a la fecha en que le sea notificada la revocación.</p>
      <p>En caso de anticipo, la vendedora lo devolverá a la compradora en el mismo número y monto de las exhibiciones mediante las cuales ésta efectuó dicho pago, salvo pacto en contrario.</p>
      <p>En caso de que no se restituyeren las cantidades a la compradora dentro del plazo establecido, la vendedora debe pagarle a su contraparte el interés moratorio del ${W('interes_devolucion_pct')}% ${W('interes_devolucion_periodo')} sobre la cantidad no devuelta por el tiempo que medie el retraso. Dicho interés moratorio se calcula de la siguiente manera: ${W('interes_devolucion_calculo')}.</p>
      <p><strong>Sexta. Firma de escritura pública. –</strong> Las partes acuerdan que dentro de los ${W('dias_escrituracion')} naturales siguientes a la fecha de firma del presente contrato de compraventa, concurrirán ante el notario Público que en su momento sea designado por la compradora, con el fin de otorgar y formalizar la escritura publica de la compraventa; acto en el cual la vendedora entregará a la compradora una carta de responsiva de seguridad estructural y póliza de garantía, en la forma que se agrega al presente contrato como "Anexo D", el cual firmado por las contratantes forma parte integrante del mismo, así como todos aquellos documentos relativos a la casa habitación que deban ser entregados a la compradora de conformidad con la legislación aplicable.</p>
      <p>Las partes acuerdan que, el costo del avalúo inmobiliario, gastos de escrituración, honorarios, impuestos, derechos y comisiones o gastos aplicables por apertura de crédito, en su caso, que se causen con motivo de dicho acto correrán a cargo de la compradora, con excepción del impuesto sobre la renta que por Ley corresponde pagar a la vendedora, quien a partir de dicha formalización se obliga ante la compradora a responder por el saneamiento para el caso de evicción.</p>
      <p>En caso de que el terreno objeto del contrato esté sujeto a algún Reglamento de adecuaciones o construcción aplicable al fraccionamiento, condominio o conjunto habitacional al que forme parte o a restricciones oficiales aplicables a la construcción en éste; dicha información debe consignarse en la escritura pública que contenga la operación de compraventa respectiva.</p>
      <p><strong>Séptima. Entrega y recepción del inmueble. -</strong> La vendedora se obliga a entregar a la compradora la propiedad y posesión material del terreno libre de todo gravamen y limitación de dominio, a más tardar el ${W('entrega_dia')} de ${W('entrega_mes')} de ${W('entrega_anio')}. El retraso en la fecha de entrega del bien inmueble, dará lugar a la aplicación de la pena convencional dispuesta en la cláusula décima primera; salvo que la vendedora acredite fehacientemente que dicho incumplimiento es consecuencia del caso fortuito o fuerza mayor que afecte directamente a la vendedora o al inmueble, pudiéndose pactar para tal caso, sin responsabilidad alguna, una nueva fecha de entrega.</p>
      <p>Al momento de entregar el inmueble, la vendedora, conjuntamente con la compradora realizarán una revisión ocular a éste al tenor de lo pactado por las partes en el "Anexo C" del presente contrato. En caso de que la compradora esté de acuerdo, las partes firmarán un acta de entrega y recepción del inmueble.</p>
      <p><strong>Octava. Destino y modificación del inmueble.-</strong> La compradora se obliga a respetar el uso habitacional del inmueble, por lo que, le está prohibido instalar en el mismo cualquier tipo de comercio.</p>
      <p>En caso de que el terreno se encuentre en un fraccionamiento, condominio o conjunto habitacional. - A fin de preservar el entorno urbanístico y arquitectónico del lugar en donde se encuentra ubicado el terreno, en su caso, la compradora se obliga a obtener de las autoridades correspondientes, las autorizaciones necesarias a efecto de realizarle cualquier modificación. El fraccionamiento, condominio o conjunto habitacional:</p>
      <p>● Cuenta con un Reglamento de adecuaciones o construcción, por lo que, la compradora se obliga a respetar dicha normativa, misma que se adjunta al presente en el "Anexo F".</p>
      <p>● No cuenta con un Reglamento de adecuaciones o construcción.</p>
      <p><strong>Novena. Restricciones oficiales aplicables a la construcción en el terreno. -</strong> En su caso, el terreno objeto del contrato está sujeto a las siguientes restricciones oficiales aplicables a la construcción:</p>
      <p>● Restricciones ambientales. - ${W('restricciones_ambientales')}.</p>
      <p>● Colindancias con zonas ecológicas, reservas forestales y reserva federales. - ${W('colindancias_ecologicas')}</p>
      <p>● Cualquier otra limitación decretada por las autoridades competentes y/o prevista en la legislación aplicable. - ${W('otras_limitaciones')}</p>
      <p><strong>Décima. Relación de los derechos y obligaciones de las partes. –</strong> Los derechos y obligaciones de las partes contractuales son los siguientes (listado enunciativo más no limitativo)</p>
      <table>
        <tr><th colspan="2">Parte vendedora</th></tr>
        <tr><th>Derechos</th><th>Obligaciones</th></tr>
        <tr>
          <td><p>● Recibir por la entrega del inmueble objeto del contrato un precio cierto y en dinero.</p><p>● Recibir los pagos en el tiempo, lugar y forma acordados.</p></td>
          <td><p>● Brindar información y publicidad veraz, clara y actualizada dl inmueble.</p><p>● Poner a disposición de la compradora la información y documentación del inmueble.</p><p>● No condicionar la compraventa a la contratación de servicio(s) adicional(es).</p><p>● Respetar el derecho de la compradora a cancelar la operación de consumo sin responsabilidad alguna dentro de los ${W('plazo_cancelar')} días hábiles (plazo que no debe ser menor a 5 días hábiles contados a partir de la firma del contrato) posteriores a la firma del contrato.</p><p>● Transferir la propiedad del inmueble a la compradora.</p><p>● Entregar a la compradora el inmueble en los términos y plazos acordados.</p><p>● Responsabilizarse de los daños y prejuicios ocasionados a la compradora si procede con dolo o mala fe en la contratación.</p><p>● Responder ante evicción o vicios ocultos.</p></td>
        </tr>
        <tr><th colspan="2">Parte compradora</th></tr>
        <tr><th>Derechos</th><th>Obligaciones</th></tr>
        <tr>
          <td><p>● Recibir información y publicidad veraz, clara y actualizada del inmueble.</p><p>● Recibir la información y documentación del inmueble.</p><p>● Cancelar la operación sin responsabilidad alguna dentro de los 15 días naturales posteriores a la firma del contrato.</p><p>● Recibir la propiedad del inmueble en los términos acordados.</p><p>● Exigir los daños y perjuicios ocasionados en caso de que la vendedora proceda con dolo o mala fe en la contratación.</p><p>● Ejercer acción civil ante la evicción o vicios ocultos.</p></td>
          <td><p>● Pagar por el inmueble objeto del contrato un precio cierto y en dinero.</p><p>● Pagar el precio en tiempo, lugar y forma acordados.</p></td>
        </tr>
      </table>
      <p><strong>Décima primera. Pena convencional. -</strong> Las partes acuerdan para el caso de incumplimiento de cualquiera de las obligaciones contraídas en el presente contrato, una pena convencional de la cantidad equivalente al ${W('pena_convencional_pct')}% del precio total de compraventa establecido en la cláusula segunda, salvo indicación específica pactada en el presente contrato. No podrá hacerse efectiva la pena cuando el obligado a ella no haya podido cumplir el contrato por hecho de su contraparte, caso fortuito o fuerza insuperable.</p>
      <p><strong>Décima segunda. Rescisión. -</strong> Para el caso de que una de las partes no cumpliere las obligaciones a su cargo, sin necesidad de resolución judicial, el perjudicado podrá escoger entre exigir el cumplimiento o la resolución de la obligación, así como el pago de la pena convencional dispuesta en la cláusula décima primera. Si se rescinde la venta, la vendedora y la compradora deben restituirse las prestaciones que se hubieren hecho.</p>
      <p>Si el incumplimiento fuera a cargo de la vendedora, además de la pena señalada en la cláusula décima primera, debe restituir a la compradora todas las cantidades pagadas por ésta (de manera enunciativa, mas no limitativa, el precio de compraventa, así como los pagos por concepto de gastos de escrituración, impuestos, avalúo, administración, apertura de crédito, erogaciones de investigación, costos por los accesorios o complementos, entre otros); si el incumplimiento fuera a cargo de la parte compradora, la vendedora podrá retener la pena convencional, de aquella cantidad entregada por la compradora.</p>
      <p>La vendedora debe restituir a la compradora los saldos excedentes a su favor por el mismo medio en el que efectuó el pago, dentro de los 75 días hábiles siguientes a la rescisión del contrato. En caso de anticipo, la vendedora lo devolverá a la compradora en el mismo número y monto de las exhibiciones mediante las cuales ésta efectuó dicho pago, salvo pacto en contrario.</p>
      <p>En caso de que no se restituyeren las cantidades dentro del plazo establecido, se debe pagar a la contraparte el interés moratorio del ${W('interes_rescision_pct')}% ${W('interes_rescision_periodo')} sobre la cantidad no devuelta por el tiempo que medie el retraso; interés que no debe resultar inequitativo, desproporcional, abusivo, ni excesivo. Dicho interés moratoria se calcula de la siguiente manera: ${W('interes_rescision_calculo')}.</p>
      <p>Si la parte vendedora hubiere entregado el inmueble vendido, tiene derecho a exigir a la compradora, por el uso de éste, el pago de un alquiler o renta fijada y, en su caso, una indemnización por el deterioro que haya sufrido el bien; con base en la determinación de un perito.</p>
      <p>En los casos de operaciones en que el precio deba cubrirse en exhibiciones periódicas, cuando la parte compradora haya pagado más de la tercera parte del precio o del número total de los pagos convenidos y la vendedora exija la rescisión o cumplimiento del contrato por mora, la compradora tendrá derecho a optar por la rescisión o por el pago del adeudo vencido más los intereses moratorias generados de conformidad con los párrafos antepenúltimo y penúltimo de la cláusula segunda.</p>
      <p><strong>Décima tercera. Proceder en caso del fenecimiento de la parte compradora.-</strong> En caso de fallecimiento de la parte compradora antes de la firma de la escritura pública de compraventa, se presume que su(s) sucesor(es) legítimo(s) la sucede(n) en todos losderechos y obligaciones derivados del presente contrato, salvo que manifieste(n) a la vendedora su deseo de no continuar con la compraventa, debiendo la vendedora restituirle(s) las cantidades que le hubiere pagado la compradora con motivo del presente contrato; de conformidad con ${W('legislacion_sucesion')}</p>
      <p><strong>Décima cuarta. Servicios adicionales. -</strong> En caso de que la vendedora ofrezca servicios adicionales. - El listado de los servicios adicionales, especiales o conexos, que puede solicitar la compradora de forma opcional por conducto y medio de la compraventa son detallados en cuanto a su descripción y costo en el "Anexo G".</p>
      <p>La vendedora sólo puede prestar servicios adicionales, especiales o conexos, si cuenta con el consentimiento escrito de la compradora sobre los mismos. Las erogaciones distintas al precio de venta, deben ser aceptadas por escrito por la compradora, por lo que, la vendedora sólo podrá hacer efectivo su pago, de manera posterior a haber recabado dicho consentimiento.</p>
      <p>La compradora en cualquier momento podrá solicitar dar por terminada la prestación de los servicios adicionales, especiales o conexos a la compraventa, mediante aviso por escrito a la vendedora, sin que ello implique la conclusión de la contratación principal.</p>
      <p><strong>Décima quinta. Notificaciones entre las partes. -</strong> Todas las notificaciones, requerimientos, autorizaciones, avisos o cualquier otra comunicación que deban darse las partes conforme a este contrato, deben hacerse por escrito y considerarse como debidamente entregadas si se encuentran firmadas por la respectiva parte contractual o su representante o apoderado legal y entregadas con acuse de recibo al destinatario o confirmación de recepción en:</p>
      <table>
        <tr><th>Parte vendedora</th><th>Parte compradora</th></tr>
        <tr>
          <td><p>● Domicilio: ${W('vendedor_notif_domicilio')}</p><p>● Correo electrónico: ${W('vendedor_notif_email')}</p></td>
          <td><p>● Domicilio: ${W('comprador_notif_domicilio')}</p><p>● Correo electrónico: ${W('comprador_notif_email')}</p></td>
        </tr>
      </table>
      <p><strong>Décima sexta. Canales de atención. -</strong> La parte vendedora cuenta con el siguiente canal de atención para recibir comentarios, sugerencias y quejas de la compradora: ${W('canal_atencion')}. Dicho canal esta habilitado los días ${W('canal_dias')} en un horario de ${W('canal_horario')} y el plazo respuesta es de ${W('canal_plazo_respuesta')}.</p>
      <p><strong>Décima séptima. Datos personales. -</strong> Los datos personales que se obtengan por la parte vendedora deben ser tratados conforme a los principios de licitud, consentimiento, información, calidad, finalidad, lealtad, proporcionalidad y responsabilidad.</p>
      <p>Para efectos de lo dispuesto en la Ley Federal de Protección de Datos Personales en Posesión de los Particulares, la parte vendedora adjunta al presente contrato su Aviso de Privacidad en el "Anexo H", en el cual informa al titular de los datos personales, qué información recabará y con qué finalidades.</p>
      <p>En caso de tratarse de datos personales sensibles, la parte vendedora debe obtener consentimiento expreso y por escrito del titular para su tratamiento. No podrán crearse bases de datos que contengan datos personales sensibles, sin que se justifique la creación de las mismas para finalidades legítimas, concretas y acordes con las actividades o fines explícitos que persigue el sujeto regulado.</p>
      <p>En caso de que los datos personales fueren obtenidos de manera indirecta del titular, se debe informar a los titulares de los datos personales que así lo soliciten cómo se dio la transferencia u obtención de dichos datos y se deben observar las siguientes reglas:</p>
      <p>1. Si fueron tratados para una finalidad distinta prevista en una transferencia consentida, o si los datos fueron obtenidos de una fuente de acceso público, el aviso de privacidad se debe de dar a conocer a la compradora en el primer contacto que se tenga con él.</p>
      <p>2. Cuando la vendedora pretenda utilizar los datos para una finalidad distinta a la consentida, el aviso de privacidad debe ser actualizado y darse a conocer al titular previo aprovechamiento de los datos personales.</p>
      <p>La persona titular de los datos personales o su representante legal podrá solicitar a la vendedora en cualquier momento el acceso, rectificación, cancelación u oposición respecto a sus datos personales y datos personales sensibles.</p>
      <p><strong>Décima octava. Competencia administrativa de la Procuraduría Federal del Consumidor (Profeco). -</strong> Ante cualquier controversia que se suscite sobre la interpretación o cumplimiento del presente contrato, la parte compradora puede acudir a la Profeco, la cual tiene funciones de autoridad administrativa encargada de promover y proteger los derechos e intereses de los consumidores y procurar la equidad y certeza jurídica en las relaciones de consumo, desde su ámbito competencial.</p>
      <p><strong>Décima novena. Competencia de las autoridades jurisdiccionales.-</strong> Para resolver cualquier controversia que se suscite sobre la interpretación o cumplimiento del presente contrato, las partes se someten a las autoridades jurisdiccionales competentes de ${W('jurisdiccion_lugar')}, renunciando expresamente a cualquier otra jurisdicción que pudiera corresponderles, por razón de sus domicilios presentes o futuros o cualquier otra razón.</p>
      <p><strong>Vigésima. Plazos para que la parte compradora ejerza acciones civiles relacionadas con el inmueble. -</strong> La parte compradora cuenta con los siguientes plazos para ejercer las acciones civiles relacionadas con el inmueble objeto del contrato ante las autoridades jurisdiccionales indicadas en la cláusula décima novena:</p>
      <table>
        <tr><th>Acción civil</th><th>Plazo en el cual prescribe la acción</th><th>Disposiciones jurídicas y legislación aplicable</th></tr>
        <tr><td>Responsabilidad civil</td><td>${W('plazo_responsabilidad_civil')}</td><td>${W('legislacion_responsabilidad_civil')}</td></tr>
        <tr><td>Vicios ocultos del inmueble</td><td>${W('plazo_vicios_ocultos')}</td><td>${W('legislacion_vicios_ocultos')}</td></tr>
        <tr><td>Evicción</td><td>${W('plazo_eviccion')}</td><td>${W('legislacion_eviccion')}</td></tr>
      </table>
      <p><strong>Vigesima primera. Registro del modelo de contrato de adhesión. –</strong> El presente modelo de contrato de adhesión fue inscrito el ${W('registro_dia')} de ${W('registro_mes')} de ${W('registro_anio')} en el Registro Publico de Contratos de Adhesion de la Profeco bajo el numero ${W('registro_num')}. Cualquier diferencia entre el texto del contrato de adhesión registrado ante la Procuraduria y el utilizado en perjuicio de los consumidores, se tendrá por no puesta.</p>
      <p>Leido que fue por las partes el contenido del presente contrato y sabedoras de su alcance legal, lo firman por duplicado el ${W('firma_dia')} de ${W('firma_mes')} de ${W('firma_anio')} en ${W('lugar_celebracion')}, por lo que, la vendedora esta obligada a entregar un tanto del contrato y sus anexos originales y firmados a la compradora.</p>
      <br>
      <table><tr>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;">Firma de la parte vendedora</div></td>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;">Firma de la parte compradora</div></td>
      </tr></table>
      <p>El presente contrato y sus anexos pueden signarse: de manera autógrafa original; o a través de una firma electrónica avanzada o fiable que será considerada para todos los efectos con la misma fuerza y consecuencias que la firma autógrafa original física de la parte firmante.</p>
      <p>Autorización para la utilización de información con fines mercadotécnicos o publicitarios. - La parte compradora si ( ) no ( ) acepta que la vendedora ceda o transmita a terceros, con fines mercadotécnicos o publicitarios, la información proporcionada con motivo del presente contrato y si () no () acepta que la vendedora le envíe publicidad sobre bienes y servicios.</p>
      <br>
      <table><tr>
        <td style="text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;">Firma de la parte compradora</div></td>
      </tr></table>
      <p>Todo consumidor que no desee recibir publicidad por parte de los proveedores en términos de la Ley Federal de Protección al Consumidor, puede inscribir de manera gratuita su número telefónico en el Registro Público de Consumidores (también denominado Registro Público para Evitar Publicidad) de la Profeco, a través del portal web https://repep.profeco.gob.mx/ o al 5596280000 (desde la Ciudad de México, Guadalajara y Monterrey) u 8009628000 (desde el resto de la República Mexicana).</p>
      <p>Queda prohibido a los proveedores que utilicen información sobre consumidores con fines mercadotécnicos o publicitarios y a sus clientes, utilizar la información relativa a los consumidores con fines diferentes a los mercadotécnicos o publicitarios, asícomo enviar publicidad a los consumidores que expresamente les hubieren manifestado su voluntad de no recibirla o que estén inscritos en el Registro Público de Consumidores (también denominado Registro Público para Evitar Publicidad). Los proveedores que sean objeto de publicidad son corresponsables del manejo de la información de consumidores cuando dicha publicidad la envíen a través de terceros.</p>
      <h2>Anexo A</h2>
      <p><strong>Uso de suelo aplicable al terreno</strong></p>
      <p>(En el presente anexo debe: indicarse el uso de suelo aplicable al terreno conforme al plan de desarrollo urbano vigente, con su respectiva interpretación; y agregarse copia del documento oficial vigente que acredite la licencia de uso de suelo del terreno)</p>
      <h2>Anexo B</h2>
      <p><strong>Estudio de factibilidad técnico, oficial o avalado por autoridad competente para la instalación de servicios básicos en el terreno</strong></p>
      <p>(El presente anexo debe contener el estudio de factibilidad técnico, oficial o avalado por autoridad competente para la instalación de servicios básicos -suministro de energía eléctrica, instalaciones adecuadas para gas natural o LP, agua potable, drenaje, alcantarillado y alumbrado público- en el terreno)</p>
      <h2>Anexo C</h2>
      <p><strong>Especificaciones del bien inmueble destinado a casa habitación</strong></p>
      <p>(El presente anexo debe contener la información relativa a las especificaciones de identificación, características, extensión, estado físico general, en su caso áreas de uso común con otros inmuebles y porcentaje de indiviso y el detalle del equipamiento urbano existente en la localidad dónde se encuentra el inmueble, así como los sistemas y medios de transporte existentes para llegar a él)</p>
      <table><tr>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;">Parte vendedora</div></td>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;">Parte compradora</div></td>
      </tr></table>
      <h2>Anexo D</h2>
      <p><strong>Información y documentación del inmueble que se pone a disposición de la compradora</strong></p>
      <table>
        <tr><th>Información / Documentación</th><th>¿Le informaron sobre/exhibieron la documentación correspondiente? Si / No</th><th>Medio a través del cual se pone a disposición de la compradora (domicilio o link del sitio web en el cual esta la documentación para consulta)</th></tr>
        <tr><td>Documentos que acrediten la propiedad del inmueble</td><td></td><td></td></tr>
        <tr><td>Personalidad del vendedor y autorización para promover la venta</td><td></td><td></td></tr>
        <tr><td>Programa Interno de Protección Civil</td><td></td><td></td></tr>
        <tr><td>Uso de suelo aplicable al terreno conforme al plan de desarrollo urbano vigente</td><td></td><td></td></tr>
        <tr><td>Copia del documento oficial vigente que acredite la licencia de uso de suelo del terreno</td><td></td><td></td></tr>
        <tr><td>Licencias, permisos y autorizaciones sobre fraccionamientos, subdivisiones, fusiones, relotificaciones, condominios, entre otras</td><td></td><td></td></tr>
        <tr><td>Estudio de factibilidad técnico, oficial o avalado por autoridad competente para la instalación de servicios básicos en el terreno</td><td></td><td></td></tr>
        <tr><td>Características y especificaciones del bien inmueble destinado a casa habitación</td><td></td><td></td></tr>
        <tr><td>Reglamento de adecuaciones o construcción aplicable al fraccionamiento, condominio o conjunto habitacional</td><td></td><td></td></tr>
        <tr><td>Existencia de gravámenes que afecten la propiedad del inmueble</td><td></td><td></td></tr>
        <tr><td>Condiciones en que se encuentre el pago de contribuciones</td><td></td><td></td></tr>
        <tr><td>Beneficios adicionales</td><td></td><td></td></tr>
        <tr><td>Opciones de pago, con especificación del monto a pagar en cada una de ellas</td><td></td><td></td></tr>
        <tr><td>Condiciones bajo las cuales se llevará a cabo el proceso de escrituración</td><td></td><td></td></tr>
        <tr><td>Erogaciones distintas del precio de la venta</td><td></td><td></td></tr>
        <tr><td>Condiciones bajo las cuales puede cancelar la operación</td><td></td><td></td></tr>
        <tr><td>Listado de servicios adicionales, especiales o conexos</td><td></td><td></td></tr>
        <tr><td>Carta de derechos</td><td></td><td></td></tr>
        <tr><td>Aviso de privacidad</td><td></td><td></td></tr>
      </table>
      <p>Importante para la compradora. - Antes de que firme como constancia de que tuvo a su disposición la información y documentación relativa al inmueble, es importante cerciorarse de que la misma coincide con la que efectivamente le haya mostrado y/o proporcionado la vendedora.</p>
      <table><tr>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;">Parte vendedora</div></td>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;">Parte compradora</div></td>
      </tr></table>
      <h2>Anexo E</h2>
      <p><strong>Carta de derechos de la parte compradora</strong></p>
      <p>● Recibir información y publicidad veraz, clara y actualizada de los bienes inmuebles que le fueron ofertados por la parte vendedora; de forma tal, que esté en posibilidad de tomar la mejor decisión de compra.</p>
      <p>● Conocer la información sobre las características del inmueble, entre éstas: la extensión del terreno, áreas de uso común y estado general físico.</p>
      <p>● Elegir libremente el inmueble que mejor satisfaga sus necesidades y se ajuste a su capacidad de compra.</p>
      <p>● No realizar pago alguno hasta que conste por escrito la relación contractual, con excepción de los anticipos o gastos operativos.</p>
      <p>● Firmar un contrato de adhesión bajo el modelo inscrito en la Procuraduría Federal del Consumidor, en el cual consten los términos y condiciones de la compraventa del bien inmueble. Posterior a su firma, la parte vendedora tiene la obligación de entregar una copia del contrato firmado a la compradora.</p>
      <p>● Adquirir un inmueble que cuente con las características de seguridad y calidad que estén contenidas en la normatividad aplicable y plasmadas en la información y publicidad que haya recibido.</p>
      <p>● Recibir el bien inmueble en el plazo y condiciones acordados con la parte vendedora en el contrato de adhesión respectivo.</p>
      <p>● Contar con canales y mecanismos de atención gratuitos y accesibles para consultas, solicitudes, reclamaciones y sugerencias al proveedor y conocer el domicilio señalado por el proveedor para oír y recibir notificaciones.</p>
      <p>● Tener a su disposición un Aviso de Privacidad para conocer y en su caso consentir el tratamiento que se dará a los datos personales que proporcione, que sus datos personales sean tratados conforme a la normatividad aplicable y conocer los mecanismos disponibles para realizar el ejercicio de sus derechos de acceso, rectificación, cancelación y oposición.</p>
      <p>● Derecho a la protección por parte de las autoridades competentes y conforme a las leyes aplicables, incluyendo el derecho a presentar denuncias y reclamaciones ante las mismas.</p>
      <p>Los derechos previstos en esta carta, no excluyen otros derivados de tratados o convenciones internacionales de los que los Estados Unidos Mexicanos sea signatario; de la legislación interna ordinaria; o de reglamentos expedidos por las autoridades administrativas competentes.</p>
      <h2>Anexo F</h2>
      <p><strong>Reglamento de adecuaciones o construcción aplicable al fraccionamiento, condominio o conjunto habitacional</strong></p>
      <p>(En su caso, agregar el Reglamento de adecuaciones o construcción aplicable al fraccionamiento, condominio o conjunto habitacional al que forme parte el bien objeto del contrato)</p>
      <h2>Anexo G</h2>
      <p><strong>Listado de servicios adicionales, especiales o conexos a la compraventa</strong></p>
      <p>(El presente formato debe contener el listado de los servicios adicionales, especiales o conexos que la compradora puede solicitar de forma opcional por conducto de la compraventa, en concordancia con lo dispuesto en la cláusula décima cuarta del contrato de compraventa del cual forma parte integrante)</p>
      <table><tr>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;">Parte vendedora</div></td>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;">Parte compradora</div></td>
      </tr></table>
      <h2>Anexo H</h2>
      <p><strong>Aviso de privacidad</strong></p>
      <p>(El presente formato debe contener el aviso de privacidad de la vendedora, mismo que debe ser acorde a lo estipulado en la cláusula décima séptima del contrato de compraventa del cual forma parte integrante y a las disposiciones aplicables de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares)</p>
      <br>
      <table><tr>
        <td style="text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;">Firma de la parte compradora</div></td>
      </tr></table>`

    // ── 14. CONTRATO PREVENTA ────────────────────────────────────────────────
    case 'cv_preventa': return `
      <h1>CONTRATO DE COMPRAVENTA EN PREVENTA</h1>
      <p class="centrado">(Inmueble en Construcción o en Planos — Modelo PROFECO)</p>
      <p class="centrado">En ${W('lugar')}, a ${W('fecha_hoy')}.</p>
      <p>Los suscritos <strong>${W('vendedor_nombre')}</strong> (RFC: ${W('vendedor_rfc')}, en adelante "EL VENDEDOR") y <strong>${W('comprador_nombre')}</strong> (CURP: ${W('comprador_curp')}, RFC: ${W('comprador_rfc')}, en adelante "EL COMPRADOR"), celebran el presente contrato de compraventa en preventa:</p>
      <h2>DECLARACIONES</h2>
      <h3>I. Del Vendedor</h3>
      <p>Domicilio fiscal: ${W('vendedor_domicilio')}</p>
      <p>Declara ser desarrollador o titular del proyecto denominado <strong>${W('proyecto_nombre')}</strong>, con licencia de construcción No. <strong>${W('licencia_construccion')}</strong>, y tener facultades para celebrar el presente contrato.</p>
      <h3>II. Del Comprador</h3>
      <p>ID: ${W('comprador_id_tipo')} No. ${W('comprador_id_num')}</p>
      <p>Domicilio: ${W('comprador_domicilio')}</p>
      <h2>CLÁUSULAS</h2>
      <h3>PRIMERA. — OBJETO</h3>
      <p>EL VENDEDOR se obliga a construir y transmitir la propiedad de la unidad número <strong>${W('unidad_num')}</strong> del proyecto <strong>${W('proyecto_nombre')}</strong>, tipo <strong>${W('inmueble_tipo')}</strong>, ubicado en ${W('inmueble_municipio')}, ${W('inmueble_estado')}, con superficie construida de <strong>${W('sup_construida')} m²</strong> y superficie de terreno (en su caso) de <strong>${W('sup_terreno')} m²</strong>.</p>
      <h3>SEGUNDA. — DESCRIPCIÓN DE LA UNIDAD</h3>
      <p>${W('descripcion_unidad')}</p>
      <h3>TERCERA. — PRECIO Y FORMA DE PAGO</h3>
      <p>El precio total se pacta en <strong>$${W('precio_total')}</strong> (${W('precio_letra')} pesos 00/100 M.N.), conforme al siguiente esquema:</p>
      <table>
        <tr><th>Anticipo</th><td>$${W('anticipo_monto')}</td><th>Fecha</th><td>${W('anticipo_fecha')}</td></tr>
        <tr><th>Mensualidades durante obra</th><td>${W('mensualidades_num')} pagos de $${W('mensualidades_monto')}</td><th colspan="2">Al inicio de cada mes</th></tr>
        <tr><th>Saldo en escrituración</th><td>$${W('saldo_escritura')}</td><th>Fecha estimada</th><td>${W('entrega_estimada')}</td></tr>
      </table>
      <h3>CUARTA. — FECHA DE ENTREGA</h3>
      <p>EL VENDEDOR se obliga a entregar la unidad terminada, en perfectas condiciones de habitabilidad, a más tardar el <strong>${W('entrega_estimada')}</strong>. En caso de retraso imputable al VENDEDOR, éste pagará al COMPRADOR <strong>${W('penalidad_retraso')}</strong> por cada mes de retraso.</p>
      <h3>QUINTA. — MODIFICACIONES AL PROYECTO</h3>
      <p>EL VENDEDOR no podrá realizar modificaciones sustanciales al proyecto sin el consentimiento expreso del COMPRADOR. Las especificaciones de acabados y materiales pactadas son obligatorias y no podrán ser sustituidas sin previa autorización escrita del COMPRADOR.</p>
      <h3>SEXTA. — GARANTÍAS</h3>
      <p>EL VENDEDOR garantiza que el inmueble será entregado conforme a las especificaciones pactadas, libre de vicios ocultos, y al corriente en el pago de todos los servicios e impuestos hasta la fecha de entrega.</p>
      <h3>SÉPTIMA. — ESCRITURACIÓN</h3>
      <p>La formalización notarial se realizará ante <strong>${W('notaria')}</strong>. Los gastos de escrituración correrán a cargo de <strong>${W('gastos_escritura')}</strong>.</p>
      <h3>OCTAVA. — PENAS CONVENCIONALES</h3>
      <p>En caso de incumplimiento de EL VENDEDOR (cancelación o entrega fuera de especificaciones), éste devolverá al COMPRADOR las cantidades recibidas actualizadas conforme al INPC, más el 10% del precio pactado como pena convencional. En caso de incumplimiento de EL COMPRADOR, EL VENDEDOR podrá retener el 10% de las cantidades recibidas.</p>
      <h3>NOVENA. — JURISDICCIÓN</h3>
      <p>Las partes se someten a la jurisdicción de los Tribunales de ${W('inmueble_municipio')}, ${W('inmueble_estado')}, y a los organismos de protección al consumidor (PROFECO).</p>
      <br>
      <table>
        <tr>
          <td style="width:33%;text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;font-size:9pt;">EL VENDEDOR / DESARROLLADOR<br><strong>${W('vendedor_nombre')}</strong></div></td>
          <td style="width:33%;text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;font-size:9pt;">EL COMPRADOR<br><strong>${W('comprador_nombre')}</strong></div></td>
          <td style="width:33%;text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;font-size:9pt;">AGENTE INMOBILIARIO<br><strong>${W('agente_nombre')}</strong><br>${W('agente_agencia')}</div></td>
        </tr>
        <tr>
          <td style="text-align:center;"><div style="border-top:1px solid #333;margin-top:50px;padding-top:5px;font-size:9pt;">TESTIGO 1<br>${W('testigo1_nombre')}</div></td>
          <td style="text-align:center;"><div style="border-top:1px solid #333;margin-top:50px;padding-top:5px;font-size:9pt;">TESTIGO 2<br>${W('testigo2_nombre')}</div></td>
          <td></td>
        </tr>
      </table>`

    default: return `<h1>${tplId}</h1><p>Plantilla no encontrada.</p>`
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// BASE DE DATOS
// ════════════════════════════════════════════════════════════════════════════════
export async function loadPropertyDocs(propId) {
  const { data, error } = await supabase
    .from('property_documents')
    .select('*')
    .eq('property_id', propId)
    .order('created_at', { ascending: false })
  if (!error && data) _docs[propId] = data
  return _docs[propId] || []
}

async function _saveDoc(propId, templateId, formData, docId) {
  const { data: { user } } = await supabase.auth.getUser()
  const tpl = TEMPLATES.find(t => t.id === templateId)
  const payload = {
    property_id:   propId,
    user_id:       user.id,
    template_id:   templateId,
    template_name: tpl?.name || templateId,
    data:          formData,
    status:        'borrador',
    updated_at:    new Date().toISOString(),
  }
  if (docId) {
    const { data, error } = await supabase.from('property_documents').update(payload).eq('id', docId).select().single()
    if (error) throw error
    const idx = (_docs[propId] || []).findIndex(d => d.id === docId)
    if (idx >= 0) _docs[propId][idx] = data
    return data
  } else {
    const { data, error } = await supabase.from('property_documents').insert(payload).select().single()
    if (error) throw error
    if (!_docs[propId]) _docs[propId] = []
    _docs[propId].unshift(data)
    return data
  }
}

async function _deleteDoc(docId, propId) {
  const { error } = await supabase.from('property_documents').delete().eq('id', docId)
  if (error) throw error
  if (_docs[propId]) _docs[propId] = _docs[propId].filter(d => d.id !== docId)
}

// ════════════════════════════════════════════════════════════════════════════════
// RENDER — TAB DE DOCUMENTOS
// ════════════════════════════════════════════════════════════════════════════════
export function renderDocumentos(propId) {
  const docs = _docs[propId] || []

  const byCategory = {}
  for (const cat of Object.keys(CAT_META)) byCategory[cat] = []
  for (const tpl of TEMPLATES) byCategory[tpl.cat]?.push(tpl)

  const newBtns = Object.entries(byCategory).map(([cat, tpls]) => {
    if (!tpls.length) return ''
    const cm = CAT_META[cat]
    return `
      <div style="margin-bottom:14px;">
        <div style="font-size:10px;font-weight:700;color:${cm.color};text-transform:uppercase;letter-spacing:1px;margin-bottom:7px;">
          ${cm.icon} ${cm.label}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${tpls.map(tpl => `
            <button onclick="docOpenNew('${propId}','${tpl.id}')"
              style="padding:5px 11px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);
              color:#94a3b8;border-radius:7px;cursor:pointer;font-size:12px;transition:all 0.15s;"
              onmouseover="this.style.borderColor='${cm.color}50';this.style.color='${cm.color}'"
              onmouseout="this.style.borderColor='rgba(255,255,255,0.1)';this.style.color='#94a3b8'">
              + ${_esc(tpl.name)}
            </button>`).join('')}
        </div>
      </div>`
  }).join('')

  const docList = docs.length
    ? docs.map(doc => {
        const tpl = TEMPLATES.find(t => t.id === doc.template_id) || {}
        const cat = tpl.cat || 'captacion'
        const cm  = CAT_META[cat] || CAT_META.captacion
        const dateStr = new Date(doc.created_at).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' })
        return `
          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);
          border-radius:10px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:700;color:#e8f0f9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${cm.icon} ${_esc(doc.template_name || tpl.name || doc.template_id)}</div>
              <div style="font-size:11px;color:#7a8899;margin-top:2px;">${dateStr}</div>
            </div>
            <div style="display:flex;gap:5px;flex-shrink:0;">
              <button onclick="docOpenEdit('${propId}','${doc.id}')" title="Editar"
                style="padding:5px 10px;background:rgba(34,211,238,0.1);border:1px solid rgba(34,211,238,0.25);
                color:#22d3ee;border-radius:6px;cursor:pointer;font-size:11px;">✏️</button>
              <button onclick="docExportDOC('${propId}','${doc.id}')" title="Descargar DOC"
                style="padding:5px 10px;background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.25);
                color:#60a5fa;border-radius:6px;cursor:pointer;font-size:11px;">📄 DOC</button>
              <button onclick="docExportPDF('${propId}','${doc.id}')" title="Descargar PDF"
                style="padding:5px 10px;background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.25);
                color:#a78bfa;border-radius:6px;cursor:pointer;font-size:11px;">🖨 PDF</button>
              <button onclick="docDelete('${propId}','${doc.id}')" title="Eliminar"
                style="padding:5px 8px;background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.2);
                color:#f87171;border-radius:6px;cursor:pointer;font-size:11px;">🗑</button>
            </div>
          </div>`
      }).join('')
    : `<div style="text-align:center;padding:20px;color:#4b5563;font-size:13px;">Sin documentos guardados</div>`

  return `
    <div>
      <!-- Header con link Par de Santos -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
        <div style="font-size:12px;font-weight:700;color:#7a8899;text-transform:uppercase;letter-spacing:1px;">
          Documentos de la Propiedad</div>
        <a href="https://sites.google.com/view/pardesantos/área-de-oficina" target="_blank" rel="noopener"
          style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#a78bfa;text-decoration:none;
          padding:4px 10px;background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.2);border-radius:6px;">
          📌 Originales Par de Santos ↗
        </a>
      </div>
      <!-- Documentos guardados -->
      <div style="margin-bottom:20px;">
        <div id="docs-list-${_esc(propId)}">${docList}</div>
      </div>
      <!-- Nueva plantilla -->
      <div style="border-top:1px solid rgba(255,255,255,0.07);padding-top:16px;">
        <div style="font-size:12px;font-weight:700;color:#7a8899;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">
          Crear Nuevo Documento</div>
        ${newBtns}
      </div>
    </div>`
}

// ════════════════════════════════════════════════════════════════════════════════
// MODAL DE EDICIÓN DEL FORMULARIO
// ════════════════════════════════════════════════════════════════════════════════
function _buildFormFields(tpl, values) {
  return tpl.fields.map(f => {
    const val = _esc(values[f.id] ?? '')
    const inputStyle = 'width:100%;box-sizing:border-box;background:rgba(14,20,34,0.8);border:1px solid rgba(255,255,255,0.12);border-radius:7px;padding:7px 10px;color:#e8f0f9;font-size:13px;'

    let input
    if (f.type === 'textarea') {
      input = `<textarea id="df-${f.id}" rows="3" style="${inputStyle}resize:vertical;">${val}</textarea>`
    } else if (f.type === 'select') {
      const opts = (f.opts || []).map(o =>
        `<option value="${_esc(o)}" ${val === o ? 'selected' : ''}>${_esc(o)}</option>`
      ).join('')
      input = `<select id="df-${f.id}" style="${inputStyle}">${opts}</select>`
    } else if (f.type === 'date') {
      // Convert "12 de mayo de 2026" → YYYY-MM-DD if needed for date inputs
      let dateVal = val
      if (val && !/^\d{4}-\d{2}-\d{2}$/.test(val)) dateVal = ''
      input = `<input type="date" id="df-${f.id}" value="${dateVal}" style="${inputStyle}"/>`
    } else {
      input = `<input type="text" id="df-${f.id}" value="${val}" style="${inputStyle}"/>`
    }

    return `
      <div style="margin-bottom:12px;">
        <label style="display:block;font-size:11px;color:#7a8899;font-weight:600;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">
          ${_esc(f.label)}</label>
        ${input}
      </div>`
  }).join('')
}

function _openDocModal(propId, tpl, doc, prop) {
  document.getElementById('doc-modal-overlay')?.remove()
  const values = doc ? { ...(_autoFill(prop)), ...(doc.data || {}) } : _autoFill(prop)
  const docId   = doc?.id || null

  const overlay = document.createElement('div')
  overlay.id = 'doc-modal-overlay'
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:9500;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px);'
  overlay.onclick = e => { if (e.target === overlay) overlay.remove() }

  const cm = CAT_META[tpl.cat] || CAT_META.captacion

  overlay.innerHTML = `
    <div style="background:#0e1422;border:1px solid rgba(34,211,238,0.2);border-radius:14px;
    width:100%;max-width:680px;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 24px 80px rgba(0,0,0,0.7);">

      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px 12px;
      border-bottom:1px solid rgba(255,255,255,0.07);">
        <div>
          <div style="font-size:10px;color:${cm.color};font-weight:700;text-transform:uppercase;letter-spacing:1px;">
            ${cm.icon} ${cm.label}</div>
          <h3 style="margin:2px 0 0;font-size:14px;font-weight:800;color:#e8f0f9;">${_esc(tpl.name)}</h3>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <button onclick="docSave('${propId}','${tpl.id}','${docId || ''}')"
            style="padding:7px 16px;background:rgba(34,211,238,0.15);border:1px solid rgba(34,211,238,0.4);
            color:#22d3ee;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;">💾 Guardar</button>
          <button onclick="document.getElementById('doc-modal-overlay').remove()"
            style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
            color:#94a3b8;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:16px;">✕</button>
        </div>
      </div>

      <!-- Formulario -->
      <div style="overflow-y:auto;padding:18px;flex:1;">
        ${_buildFormFields(tpl, values)}
      </div>

      <!-- Footer -->
      <div style="padding:12px 18px;border-top:1px solid rgba(255,255,255,0.07);display:flex;gap:8px;justify-content:flex-end;">
        ${docId ? `
          <button onclick="docExportDOC('${propId}','${docId}')"
            style="padding:7px 14px;background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.3);
            color:#60a5fa;border-radius:8px;cursor:pointer;font-size:12px;">📄 DOC</button>
          <button onclick="docExportPDF('${propId}','${docId}')"
            style="padding:7px 14px;background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.3);
            color:#a78bfa;border-radius:8px;cursor:pointer;font-size:12px;">🖨 PDF</button>` : ''}
        <button onclick="docSave('${propId}','${tpl.id}','${docId || ''}')"
          style="padding:7px 18px;background:linear-gradient(135deg,rgba(34,211,238,0.2),rgba(167,139,250,0.15));
          border:1px solid rgba(34,211,238,0.4);color:#22d3ee;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;">
          💾 Guardar documento</button>
      </div>
    </div>`

  document.body.appendChild(overlay)
}

// ════════════════════════════════════════════════════════════════════════════════
// WINDOW HANDLERS
// ════════════════════════════════════════════════════════════════════════════════

// Abrir formulario nuevo
window.docOpenNew = async (propId, templateId) => {
  const tpl = TEMPLATES.find(t => t.id === templateId)
  if (!tpl) return
  // Buscar prop desde inmuebles (expuesto via window._nexusProps)
  const prop = (window._nexusProps || []).find(p => p.id === propId) || {}
  _openDocModal(propId, tpl, null, prop)
}

// Abrir formulario de edición
window.docOpenEdit = async (propId, docId) => {
  await loadPropertyDocs(propId)
  const doc = (_docs[propId] || []).find(d => d.id === docId)
  if (!doc) return
  const tpl = TEMPLATES.find(t => t.id === doc.template_id)
  if (!tpl) return
  const prop = (window._nexusProps || []).find(p => p.id === propId) || {}
  _openDocModal(propId, tpl, doc, prop)
}

// Guardar desde modal
window.docSave = async (propId, templateId, docId) => {
  const tpl = TEMPLATES.find(t => t.id === templateId)
  if (!tpl) return
  const saveBtn = document.querySelector('[onclick*="docSave"]')
  if (saveBtn) { saveBtn.textContent = '⏳ Guardando...'; saveBtn.disabled = true }
  try {
    const formData = {}
    for (const f of tpl.fields) {
      const el = document.getElementById('df-' + f.id)
      if (el) formData[f.id] = el.value?.trim() || ''
    }
    const saved = await _saveDoc(propId, templateId, formData, docId || null)

    // Refresh list in detail modal
    const listEl = document.getElementById('docs-list-' + propId)
    if (listEl) {
      const tmp = document.createElement('div')
      tmp.innerHTML = renderDocumentos(propId)
      const newList = tmp.querySelector('#docs-list-' + propId)
      if (newList) listEl.replaceWith(newList)
    }

    window.showToast?.('✅ Documento guardado')

    // Update docId in footer buttons
    if (!docId && saved?.id) {
      document.querySelectorAll('[onclick*="docExportDOC"]').forEach(b => {
        b.setAttribute('onclick', `docExportDOC('${propId}','${saved.id}')`)
        b.style.display = 'inline-block'
      })
      document.querySelectorAll('[onclick*="docExportPDF"]').forEach(b => {
        b.setAttribute('onclick', `docExportPDF('${propId}','${saved.id}')`)
        b.style.display = 'inline-block'
      })
    }
  } catch (err) {
    console.error('[docs-inmuebles] save:', err)
    window.showToast?.('❌ Error al guardar: ' + err.message)
  } finally {
    if (saveBtn) { saveBtn.textContent = '💾 Guardar'; saveBtn.disabled = false }
  }
}

// Exportar DOC
window.docExportDOC = async (propId, docId) => {
  const doc = (_docs[propId] || []).find(d => d.id === docId)
  if (!doc) { window.showToast?.('❌ Documento no encontrado'); return }
  const tpl = TEMPLATES.find(t => t.id === doc.template_id)
  if (!tpl) return
  const rawHtml = _buildDocHTML(tpl.id, doc.data || {})
  const filledHtml = _fill(rawHtml, doc.data || {})
  const filename = `${tpl.name} — ${new Date().toLocaleDateString('es-MX')}`
  _exportDOC(filledHtml, filename)
  window.showToast?.('📄 Descargando DOC...')
}

// Exportar PDF
window.docExportPDF = async (propId, docId) => {
  const btn = event?.target
  if (btn) { btn.textContent = '⏳...'; btn.disabled = true }
  try {
    const doc = (_docs[propId] || []).find(d => d.id === docId)
    if (!doc) { window.showToast?.('❌ Documento no encontrado'); return }
    const tpl = TEMPLATES.find(t => t.id === doc.template_id)
    if (!tpl) return
    const rawHtml = _buildDocHTML(tpl.id, doc.data || {})
    const filledHtml = _fill(rawHtml, doc.data || {})
    const filename = `${tpl.name} — ${new Date().toLocaleDateString('es-MX')}`
    await _exportPDF(filledHtml, filename)
    window.showToast?.('🖨 PDF generado')
  } catch (err) {
    console.error('[docs-inmuebles] PDF:', err)
    window.showToast?.('❌ Error al generar PDF')
  } finally {
    if (btn) { btn.textContent = '🖨 PDF'; btn.disabled = false }
  }
}

// Eliminar documento
window.docDelete = async (propId, docId) => {
  if (!confirm('¿Eliminar este documento? Esta acción no se puede deshacer.')) return
  try {
    await _deleteDoc(docId, propId)
    const listEl = document.getElementById('docs-list-' + propId)
    if (listEl) {
      const tmp = document.createElement('div')
      tmp.innerHTML = renderDocumentos(propId)
      const newList = tmp.querySelector('#docs-list-' + propId)
      if (newList) listEl.replaceWith(newList)
    }
    window.showToast?.('🗑 Documento eliminado')
  } catch (err) {
    window.showToast?.('❌ Error al eliminar: ' + err.message)
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// BIBLIOTECA DE TRÁMITES — acceso desde tab raíz del módulo
// ════════════════════════════════════════════════════════════════════════════════

// Exponer templates para _renderTramites() en inmuebles.js
if (typeof window !== 'undefined') {
  window._INMUEBLES_TEMPLATES = TEMPLATES
}

/** Vista previa del documento con datos en blanco */
window.docPreviewFromLib = (templateId) => {
  const tpl = TEMPLATES.find(t => t.id === templateId)
  if (!tpl) return
  const cm = CAT_META[tpl.cat] || CAT_META.captacion
  const emptyData = Object.fromEntries(tpl.fields.map(f => [f.id, '']))
  const html = _buildDocHTML(templateId, emptyData)
  const filled = _fill(html, emptyData)

  const overlay = document.createElement('div')
  overlay.id = 'doc-preview-overlay'
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(6px);'
  overlay.onclick = e => { if (e.target === overlay) overlay.remove() }

  overlay.innerHTML = `
    <div style="background:#fff;border-radius:14px;width:100%;max-width:760px;max-height:92vh;overflow-y:auto;
    box-shadow:0 32px 100px rgba(0,0,0,0.8);display:flex;flex-direction:column;">
      <!-- Header del preview -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;
      background:#0e1422;border-radius:14px 14px 0 0;border-bottom:1px solid rgba(255,255,255,0.08);">
        <div>
          <div style="font-size:13px;font-weight:800;color:#e8f0f9;">${_esc(tpl.name)}</div>
          <div style="font-size:11px;color:${cm.color};margin-top:2px;">${cm.icon} ${cm.label}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button onclick="
            document.getElementById('doc-preview-overlay')?.remove();
            docCreateFromLib('${templateId}');"
            style="padding:7px 14px;background:${cm.color}20;border:1px solid ${cm.color}50;
            color:${cm.color};border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;">
            ✚ Crear documento
          </button>
          <button onclick="document.getElementById('doc-preview-overlay')?.remove()"
            style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:#94a3b8;
            width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:16px;line-height:1;">✕</button>
        </div>
      </div>
      <!-- Contenido del documento -->
      <div style="padding:24px 32px;font-family:Arial,sans-serif;font-size:10pt;line-height:1.6;color:#000;overflow-y:auto;">
        <style>
          h1{font-size:13pt;font-weight:bold;text-align:center;text-transform:uppercase;margin:0 0 6pt}
          h2{font-size:10pt;font-weight:bold;border-bottom:1px solid #ccc;padding-bottom:2pt;margin:12pt 0 4pt}
          table{width:100%;border-collapse:collapse;margin-bottom:8pt;font-size:9pt}
          th,td{border:0.5pt solid #ccc;padding:4pt 5pt;text-align:left}
          th{background:#f0f0f0;font-weight:bold;width:28%}
          .centrado{text-align:center;color:#555;font-size:9pt;margin:4pt 0 8pt}
          p{margin:4pt 0}
        </style>
        ${filled}
      </div>
      <div style="padding:12px 20px;background:#0e1422;border-radius:0 0 14px 14px;
      border-top:1px solid rgba(255,255,255,0.07);font-size:11px;color:#475569;text-align:center;">
        Vista previa · Los campos en amarillo se rellenan al crear el documento
      </div>
    </div>`

  document.body.appendChild(overlay)
}

/** Crear documento desde la biblioteca (con selector de propiedad) */
window.docCreateFromLib = (templateId) => {
  const tpl = TEMPLATES.find(t => t.id === templateId)
  if (!tpl) return
  const cm = CAT_META[tpl.cat] || CAT_META.captacion

  // Obtener lista de propiedades del módulo
  const props = window._nexusProps || []

  const overlay = document.createElement('div')
  overlay.id = 'doc-lib-overlay'
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(6px);'
  overlay.onclick = e => { if (e.target === overlay) overlay.remove() }

  overlay.innerHTML = `
    <div style="background:#0e1422;border:1px solid rgba(34,211,238,0.2);border-radius:16px;
    width:100%;max-width:520px;box-shadow:0 32px 100px rgba(0,0,0,0.8);">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px 14px;
      border-bottom:1px solid rgba(255,255,255,0.07);">
        <div>
          <div style="font-size:14px;font-weight:800;color:#e8f0f9;">${_esc(tpl.name)}</div>
          <div style="font-size:11px;color:${cm.color};margin-top:2px;">${cm.icon} ${cm.label}</div>
        </div>
        <button onclick="document.getElementById('doc-lib-overlay').remove()"
          style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;
          width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:16px;line-height:1;">✕</button>
      </div>
      <div style="padding:20px 22px 22px;">
        <label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:8px;">
          Propiedad a asociar <span style="color:#475569;">(opcional)</span>
        </label>
        <select id="doc-lib-prop-sel"
          style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);
          border-radius:8px;color:#e8f0f9;font-size:13px;outline:none;margin-bottom:18px;cursor:pointer;">
          <option value="">— Sin propiedad asociada —</option>
          ${props.map(p=>`<option value="${p.id}">${_esc(p.folio_interno||p.id.slice(0,8))} · ${_esc(p.titulo||p.tipo||'Propiedad')}</option>`).join('')}
        </select>
        <button onclick="
          const sel = document.getElementById('doc-lib-prop-sel');
          const propId = sel?.value || '';
          document.getElementById('doc-lib-overlay').remove();
          if (propId) {
            docOpenNew(propId, '${templateId}');
          } else {
            docOpenNewStandalone('${templateId}');
          }"
          style="width:100%;padding:12px;background:linear-gradient(135deg,${cm.color},${cm.color}99);
          color:#0d0f1f;font-weight:800;border:none;border-radius:10px;cursor:pointer;font-size:14px;">
          ✚ Continuar con este documento
        </button>
      </div>
    </div>`

  document.body.appendChild(overlay)
}

/** Crear documento standalone (sin propiedad) */
window.docOpenNewStandalone = async (templateId) => {
  const tpl = TEMPLATES.find(t => t.id === templateId)
  if (!tpl) return
  const emptyData = {}
  const agData = {
    agente_nombre:  localStorage.getItem('nexus_agent_name')   || '',
    agente_tel:     localStorage.getItem('nexus_agent_tel')    || '',
    agente_email:   localStorage.getItem('nexus_agent_email')  || '',
    agente_agencia: localStorage.getItem('nexus_agent_agency') || 'Nexus OS Inmobiliario',
    fecha_hoy:      new Date().toLocaleDateString('es-MX', { day:'numeric', month:'long', year:'numeric' }),
    lugar:          localStorage.getItem('nexus_agent_ciudad') || '',
  }
  _renderDocModal(null, tpl, null, { ...emptyData, ...agData })
}

/** Renderiza el modal de edición de documento (usado tanto desde propiedad como standalone) */
function _renderDocModal(propId, tpl, docId, prefill) {
  const cm = CAT_META[tpl.cat] || CAT_META.captacion
  const existing = document.getElementById('doc-edit-overlay')
  if (existing) existing.remove()

  const overlay = document.createElement('div')
  overlay.id = 'doc-edit-overlay'
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:10001;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(6px);'
  overlay.onclick = e => { if (e.target === overlay) overlay.remove() }

  overlay.innerHTML = `
    <div style="background:#0e1422;border:1px solid rgba(34,211,238,0.18);border-radius:16px;
    width:100%;max-width:700px;max-height:92vh;overflow-y:auto;box-shadow:0 32px 100px rgba(0,0,0,0.8);">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px 14px;
      border-bottom:1px solid rgba(255,255,255,0.07);position:sticky;top:0;background:#0e1422;z-index:1;">
        <div>
          <div style="font-size:14px;font-weight:800;color:#e8f0f9;">${_esc(tpl.name)}</div>
          <div style="font-size:11px;color:${cm.color};margin-top:2px;">${cm.icon} ${cm.label}</div>
        </div>
        <button onclick="document.getElementById('doc-edit-overlay').remove()"
          style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;
          width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:16px;line-height:1;">✕</button>
      </div>
      <div style="padding:20px 22px;">
        ${_buildFormFields(tpl, prefill || {})}
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.07);">
          <button onclick="docExportFromModal('${propId||''}','${tpl.id}','DOC')"
            style="padding:9px 16px;background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.3);
            color:#60a5fa;border-radius:9px;cursor:pointer;font-size:12px;font-weight:600;">📄 DOC</button>
          <button onclick="docExportFromModal('${propId||''}','${tpl.id}','PDF')"
            style="padding:9px 16px;background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.3);
            color:#a78bfa;border-radius:9px;cursor:pointer;font-size:12px;font-weight:600;">🖨 PDF</button>
          <button onclick="docSaveFromModal('${propId||''}','${tpl.id}','${docId||''}')"
            style="padding:9px 20px;background:linear-gradient(135deg,#22d3ee,#0891b2);color:#0d0f1f;
            font-weight:800;border:none;border-radius:9px;cursor:pointer;font-size:13px;">💾 Guardar</button>
        </div>
      </div>
    </div>`

  document.body.appendChild(overlay)
}

window.docSaveFromModal = async (propId, templateId, docId) => {
  const tpl    = TEMPLATES.find(t => t.id === templateId)
  if (!tpl) return
  const data   = {}
  tpl.fields.forEach(f => {
    const el = document.getElementById('doc-f-' + f.id)
    if (el) data[f.id] = el.value || ''
  })
  const user = (await supabase.auth.getUser()).data.user
  if (!user) { window.showToast?.('❌ Sin sesión'); return }
  const payload = {
    template_id:   templateId,
    template_name: tpl.name,
    data,
    status: 'borrador',
    user_id: user.id,
    property_id: propId || null,
  }
  const { error } = docId
    ? await supabase.from('property_documents').update(payload).eq('id', docId)
    : await supabase.from('property_documents').insert(payload)
  if (error) { window.showToast?.('❌ ' + error.message); return }
  window.showToast?.('✅ Documento guardado')
  document.getElementById('doc-edit-overlay')?.remove()
}

window.docExportFromModal = (propId, templateId, format) => {
  const tpl  = TEMPLATES.find(t => t.id === templateId)
  if (!tpl) return
  const data = {}
  tpl.fields.forEach(f => {
    const el = document.getElementById('doc-f-' + f.id)
    if (el) data[f.id] = el.value || ''
  })
  const html = _fill(_buildDocHTML(templateId, data), data)
  if (format === 'DOC') _exportDOC(html, tpl.name.toLowerCase().replace(/\s+/g,'-'))
  else                  _exportPDF(html, tpl.name.toLowerCase().replace(/\s+/g,'-'))
}
