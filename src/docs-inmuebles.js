/**
 * Nexus OS — Documentos Inmobiliarios v1.0
 * src/docs-inmuebles.js
 *
 * 14 plantillas legales inmobiliarias:
 *   Captación (7) + Negociación (4) + Contratos Profeco (3)
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL  || '',
  import.meta.env.VITE_SUPABASE_ANON_KEY || ''
)

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
    agente_nombre:    localStorage.getItem('nexus_agent_name')   || '',
    agente_tel:       localStorage.getItem('nexus_agent_tel')    || '',
    agente_email:     localStorage.getItem('nexus_agent_email')  || '',
    agente_agencia:   localStorage.getItem('nexus_agent_agency') || 'Nexus OS Inmobiliario',
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
    id: 'registro_captacion', name: 'Registro de Captación', cat: 'captacion',
    desc: 'Hoja de datos inicial de la propiedad y propietario',
    fields: [
      { id:'fecha_hoy',       label:'Fecha',             type:'date',     src:'fecha_hoy' },
      { id:'folio',           label:'Folio interno',     type:'text',     src:'folio' },
      { id:'agente_nombre',   label:'Agente captador',   type:'text',     src:'agente_nombre' },
      { id:'agente_agencia',  label:'Agencia',           type:'text',     src:'agente_agencia' },
      { id:'vendedor_nombre', label:'Nombre del propietario', type:'text', src:'vendedor_nombre' },
      { id:'vendedor_tel',    label:'Teléfono propietario',   type:'text', src:'vendedor_tel' },
      { id:'vendedor_email',  label:'Correo propietario',     type:'text', src:'vendedor_email' },
      { id:'inmueble_tipo',   label:'Tipo de inmueble',       type:'text', src:'inmueble_tipo' },
      { id:'inmueble_direccion', label:'Dirección completa',  type:'text', src:'inmueble_direccion' },
      { id:'inmueble_municipio', label:'Municipio/Ciudad',    type:'text', src:'inmueble_municipio' },
      { id:'inmueble_estado',    label:'Estado',              type:'text', src:'inmueble_estado' },
      { id:'inmueble_sup_t',  label:'Sup. terreno (m²)',  type:'text', src:'inmueble_sup_t' },
      { id:'inmueble_sup_c',  label:'Sup. construida (m²)',type:'text', src:'inmueble_sup_c' },
      { id:'precio_total',    label:'Precio solicitado ($)', type:'text', src:'precio_total' },
      { id:'comision_pct',    label:'Comisión acordada',   type:'text', src:'comision_pct' },
      { id:'tipo_operacion',  label:'Tipo de operación',   type:'select', opts:['Venta','Renta','Venta y Renta'] },
      { id:'exclusividad',    label:'Exclusividad',        type:'select', opts:['Sí, exclusiva','No exclusiva','Por definir'] },
      { id:'situacion_legal', label:'Situación legal',     type:'select', opts:['Escritura a nombre del dueño','Sucesión','Hipotecada','En trámite','Otro'] },
      { id:'motivo_venta',    label:'Motivo de venta',     type:'textarea' },
      { id:'notas',           label:'Observaciones',       type:'textarea' },
    ],
  },
  {
    id: 'levantamiento', name: 'Levantamiento de Medidas', cat: 'captacion',
    desc: 'Registro detallado de áreas y medidas del inmueble',
    fields: [
      { id:'fecha_hoy',       label:'Fecha',               type:'date',  src:'fecha_hoy' },
      { id:'agente_nombre',   label:'Agente',              type:'text',  src:'agente_nombre' },
      { id:'vendedor_nombre', label:'Propietario presente',type:'text',  src:'vendedor_nombre' },
      { id:'inmueble_direccion',label:'Dirección',         type:'text',  src:'inmueble_direccion' },
      { id:'sup_total_m2',    label:'Sup. total (m²)',     type:'text',  src:'inmueble_sup_t' },
      { id:'frente_ml',       label:'Frente (ml)',         type:'text' },
      { id:'fondo_ml',        label:'Fondo (ml)',          type:'text' },
      { id:'m2_sala',         label:'Sala (m²)',           type:'text' },
      { id:'m2_comedor',      label:'Comedor (m²)',        type:'text' },
      { id:'m2_cocina',       label:'Cocina (m²)',         type:'text' },
      { id:'m2_rec1',         label:'Recámara 1 (m²)',     type:'text' },
      { id:'m2_rec2',         label:'Recámara 2 (m²)',     type:'text' },
      { id:'m2_rec3',         label:'Recámara 3 (m²)',     type:'text' },
      { id:'m2_bano1',        label:'Baño principal (m²)', type:'text' },
      { id:'m2_bano2',        label:'Baño secundario (m²)',type:'text' },
      { id:'m2_estac',        label:'Estacionamiento (m²)',type:'text' },
      { id:'m2_jardin',       label:'Jardín / patio (m²)', type:'text' },
      { id:'m2_otras',        label:'Otras áreas (m²)',    type:'text' },
      { id:'obs_estructura',  label:'Estado de estructura',type:'textarea' },
      { id:'obs_instalaciones',label:'Instalaciones (agua/luz/gas)',type:'textarea' },
      { id:'notas',           label:'Observaciones generales',type:'textarea' },
    ],
  },
  {
    id: 'ficha_tecnica', name: 'Ficha Técnica', cat: 'captacion',
    desc: 'Documento de presentación técnica de la propiedad',
    fields: [
      { id:'fecha_hoy',        label:'Fecha',              type:'date',   src:'fecha_hoy' },
      { id:'folio',            label:'Folio',              type:'text',   src:'folio' },
      { id:'inmueble_tipo',    label:'Tipo',               type:'text',   src:'inmueble_tipo' },
      { id:'inmueble_direccion',label:'Dirección',         type:'text',   src:'inmueble_direccion' },
      { id:'precio_total',     label:'Precio de lista ($)',type:'text',   src:'precio_total' },
      { id:'inmueble_sup_t',   label:'Sup. terreno (m²)', type:'text',   src:'inmueble_sup_t' },
      { id:'inmueble_sup_c',   label:'Sup. construida (m²)',type:'text', src:'inmueble_sup_c' },
      { id:'inmueble_recamaras',label:'Recámaras',         type:'text',   src:'inmueble_recamaras' },
      { id:'inmueble_banos',   label:'Baños',              type:'text',   src:'inmueble_banos' },
      { id:'inmueble_estac',   label:'Estacionamientos',   type:'text',   src:'inmueble_estac' },
      { id:'inmueble_pisos',   label:'Plantas/Pisos',      type:'text',   src:'inmueble_pisos' },
      { id:'inmueble_antiguedad',label:'Antigüedad',       type:'text',   src:'inmueble_antiguedad' },
      { id:'servicios',        label:'Servicios',          type:'text' },
      { id:'amenidades',       label:'Amenidades',         type:'text' },
      { id:'inmueble_descripcion',label:'Descripción',     type:'textarea',src:'inmueble_descripcion' },
      { id:'agente_nombre',    label:'Agente responsable', type:'text',   src:'agente_nombre' },
      { id:'agente_tel',       label:'Teléfono agente',    type:'text',   src:'agente_tel' },
      { id:'agente_agencia',   label:'Agencia',            type:'text',   src:'agente_agencia' },
    ],
  },
  {
    id: 'perfilamiento', name: 'Perfilamiento del Vendedor', cat: 'captacion',
    desc: 'Análisis de motivación y situación del propietario',
    fields: [
      { id:'fecha_hoy',       label:'Fecha',               type:'date',  src:'fecha_hoy' },
      { id:'agente_nombre',   label:'Agente',              type:'text',  src:'agente_nombre' },
      { id:'vendedor_nombre', label:'Nombre del vendedor', type:'text',  src:'vendedor_nombre' },
      { id:'vendedor_tel',    label:'Teléfono',            type:'text',  src:'vendedor_tel' },
      { id:'vendedor_email',  label:'Correo electrónico',  type:'text',  src:'vendedor_email' },
      { id:'curp_rfc',        label:'CURP / RFC',          type:'text' },
      { id:'estado_civil',    label:'Estado civil',        type:'select', opts:['Soltero(a)','Casado(a) sociedad conyugal','Casado(a) separación de bienes','Divorciado(a)','Viudo(a)'] },
      { id:'motivo_venta',    label:'Motivo de venta',     type:'select', opts:['Cambio de residencia','Necesidad económica','Divorcio / herencia','Inversión','Otro'] },
      { id:'tiempo_disposicion',label:'Tiempo disponible para vender', type:'select', opts:['Urgente (< 1 mes)','Corto plazo (1-3 meses)','Mediano plazo (3-6 meses)','Sin prisa (> 6 meses)'] },
      { id:'precio_minimo',   label:'Precio mínimo aceptado ($)', type:'text' },
      { id:'acepta_credito',  label:'¿Acepta crédito hipotecario?', type:'select', opts:['Sí','No','Depende del banco'] },
      { id:'situacion_legal', label:'Situación legal del inmueble', type:'select', opts:['Escritura libre de gravamen','Hipotecado','En sucesión','Litigio','Régimen condominal','Otro'] },
      { id:'adeudos',         label:'Adeudos (predial, servicios, etc.)', type:'textarea' },
      { id:'historial_ofertas',label:'Historial de ofertas previas', type:'textarea' },
      { id:'observaciones',   label:'Perfil y observaciones del agente', type:'textarea' },
    ],
  },
  {
    id: 'aviso_privacidad', name: 'Aviso de Privacidad', cat: 'captacion',
    desc: 'Aviso de privacidad conforme LFPDPPP',
    fields: [
      { id:'agente_agencia',  label:'Nombre de la agencia/empresa',  type:'text', src:'agente_agencia' },
      { id:'agente_nombre',   label:'Responsable del tratamiento',   type:'text', src:'agente_nombre' },
      { id:'agente_email',    label:'Correo para consultas',         type:'text', src:'agente_email' },
      { id:'agente_tel',      label:'Teléfono de contacto',          type:'text', src:'agente_tel' },
      { id:'vendedor_nombre', label:'Nombre del titular de datos',   type:'text', src:'vendedor_nombre' },
      { id:'lugar',           label:'Lugar',                         type:'text', src:'lugar' },
      { id:'fecha_hoy',       label:'Fecha',                         type:'date', src:'fecha_hoy' },
    ],
  },
  {
    id: 'carta_derechos', name: 'Carta de Derechos del Consumidor', cat: 'captacion',
    desc: 'Carta de derechos del consumidor inmobiliario (PROFECO)',
    fields: [
      { id:'vendedor_nombre', label:'Nombre del consumidor',   type:'text', src:'vendedor_nombre' },
      { id:'agente_nombre',   label:'Agente inmobiliario',     type:'text', src:'agente_nombre' },
      { id:'agente_agencia',  label:'Empresa / Agencia',       type:'text', src:'agente_agencia' },
      { id:'inmueble_direccion',label:'Inmueble de referencia',type:'text', src:'inmueble_direccion' },
      { id:'lugar',           label:'Lugar',                   type:'text', src:'lugar' },
      { id:'fecha_hoy',       label:'Fecha',                   type:'date', src:'fecha_hoy' },
    ],
  },
  {
    id: 'propuesta_exclusiva', name: 'Propuesta de Valor / Exclusiva', cat: 'captacion',
    desc: 'Carta propuesta y contrato de captación exclusiva',
    fields: [
      { id:'fecha_hoy',       label:'Fecha',                   type:'date', src:'fecha_hoy' },
      { id:'vendedor_nombre', label:'Nombre del propietario',  type:'text', src:'vendedor_nombre' },
      { id:'inmueble_direccion',label:'Dirección del inmueble',type:'text', src:'inmueble_direccion' },
      { id:'precio_total',    label:'Precio de lista ($)',      type:'text', src:'precio_total' },
      { id:'comision_pct',    label:'Comisión acordada (%)',    type:'text', src:'comision_pct' },
      { id:'vigencia_dias',   label:'Vigencia de exclusiva (días)', type:'text' },
      { id:'fecha_inicio',    label:'Fecha de inicio',         type:'date' },
      { id:'fecha_fin',       label:'Fecha de vencimiento',    type:'date' },
      { id:'estrategia_precio',label:'Estrategia de precio',   type:'textarea' },
      { id:'plan_marketing',  label:'Plan de marketing',       type:'textarea' },
      { id:'compromisos',     label:'Compromisos del agente',  type:'textarea' },
      { id:'agente_nombre',   label:'Agente responsable',      type:'text', src:'agente_nombre' },
      { id:'agente_tel',      label:'Teléfono',                type:'text', src:'agente_tel' },
      { id:'agente_agencia',  label:'Agencia',                 type:'text', src:'agente_agencia' },
    ],
  },
  // ── NEGOCIACIÓN ───────────────────────────────────────────────────────────
  {
    id: 'contraoferta', name: 'Contraoferta', cat: 'negociacion',
    desc: 'Formulario de contraoferta del vendedor al comprador',
    fields: [
      { id:'fecha_hoy',       label:'Fecha',                   type:'date', src:'fecha_hoy' },
      { id:'lugar',           label:'Lugar',                   type:'text', src:'lugar' },
      { id:'vendedor_nombre', label:'Nombre del vendedor',     type:'text', src:'vendedor_nombre' },
      { id:'comprador_nombre',label:'Nombre del comprador',    type:'text' },
      { id:'comprador_tel',   label:'Teléfono comprador',      type:'text' },
      { id:'inmueble_direccion',label:'Inmueble',              type:'text', src:'inmueble_direccion' },
      { id:'oferta_original', label:'Monto de oferta original ($)', type:'text' },
      { id:'precio_contraoferta',label:'Precio en contraoferta ($)',type:'text', src:'precio_total' },
      { id:'condiciones_pago',label:'Condiciones de pago propuestas', type:'textarea' },
      { id:'fecha_limite',    label:'Fecha límite de respuesta', type:'date' },
      { id:'obs_agente',      label:'Observaciones del agente', type:'textarea' },
      { id:'agente_nombre',   label:'Agente mediador',         type:'text', src:'agente_nombre' },
      { id:'agente_tel',      label:'Teléfono agente',         type:'text', src:'agente_tel' },
    ],
  },
  {
    id: 'resolucion_a', name: 'Resolución A — Acepta', cat: 'negociacion',
    desc: 'Carta de aceptación de oferta sin modificaciones',
    fields: [
      { id:'fecha_hoy',       label:'Fecha',                   type:'date', src:'fecha_hoy' },
      { id:'lugar',           label:'Lugar',                   type:'text', src:'lugar' },
      { id:'vendedor_nombre', label:'Nombre del vendedor',     type:'text', src:'vendedor_nombre' },
      { id:'comprador_nombre',label:'Nombre del comprador',    type:'text' },
      { id:'inmueble_direccion',label:'Inmueble',              type:'text', src:'inmueble_direccion' },
      { id:'precio_total',    label:'Precio acordado ($)',      type:'text', src:'precio_total' },
      { id:'condiciones_pago',label:'Condiciones de pago',     type:'textarea' },
      { id:'fecha_escritura', label:'Fecha estimada de escrituración', type:'date' },
      { id:'agente_nombre',   label:'Agente',                  type:'text', src:'agente_nombre' },
    ],
  },
  {
    id: 'resolucion_b', name: 'Resolución B — Acepta con Modificaciones', cat: 'negociacion',
    desc: 'Carta de aceptación condicionada',
    fields: [
      { id:'fecha_hoy',       label:'Fecha',                   type:'date', src:'fecha_hoy' },
      { id:'lugar',           label:'Lugar',                   type:'text', src:'lugar' },
      { id:'vendedor_nombre', label:'Nombre del vendedor',     type:'text', src:'vendedor_nombre' },
      { id:'comprador_nombre',label:'Nombre del comprador',    type:'text' },
      { id:'inmueble_direccion',label:'Inmueble',              type:'text', src:'inmueble_direccion' },
      { id:'precio_total',    label:'Precio acordado ($)',      type:'text', src:'precio_total' },
      { id:'modificaciones',  label:'Modificaciones a la oferta original', type:'textarea' },
      { id:'condiciones_adicionales',label:'Condiciones adicionales', type:'textarea' },
      { id:'fecha_limite_respuesta',label:'Fecha límite de respuesta', type:'date' },
      { id:'agente_nombre',   label:'Agente',                  type:'text', src:'agente_nombre' },
    ],
  },
  {
    id: 'resolucion_c', name: 'Resolución C — No Acepta', cat: 'negociacion',
    desc: 'Carta de rechazo de oferta',
    fields: [
      { id:'fecha_hoy',       label:'Fecha',                   type:'date', src:'fecha_hoy' },
      { id:'lugar',           label:'Lugar',                   type:'text', src:'lugar' },
      { id:'vendedor_nombre', label:'Nombre del vendedor',     type:'text', src:'vendedor_nombre' },
      { id:'comprador_nombre',label:'Nombre del comprador',    type:'text' },
      { id:'inmueble_direccion',label:'Inmueble',              type:'text', src:'inmueble_direccion' },
      { id:'motivo_rechazo',  label:'Motivo del rechazo',      type:'textarea' },
      { id:'condiciones_futuras',label:'Condiciones bajo las que reconsideraría', type:'textarea' },
      { id:'agente_nombre',   label:'Agente',                  type:'text', src:'agente_nombre' },
    ],
  },
  // ── CONTRATOS PROFECO ─────────────────────────────────────────────────────
  {
    id: 'cv_vivienda', name: 'Contrato Compraventa — Vivienda', cat: 'profeco',
    desc: 'Modelo PROFECO — Compraventa de casa o departamento habitado',
    fields: [
      { id:'fecha_hoy',         label:'Fecha del contrato',        type:'date',   src:'fecha_hoy' },
      { id:'lugar',             label:'Lugar de firma',            type:'text',   src:'lugar' },
      { id:'vendedor_nombre',   label:'Nombre del vendedor',       type:'text',   src:'vendedor_nombre' },
      { id:'vendedor_curp',     label:'CURP del vendedor',         type:'text' },
      { id:'vendedor_rfc',      label:'RFC del vendedor',          type:'text' },
      { id:'vendedor_id_tipo',  label:'Tipo de ID vendedor',       type:'select', opts:['INE/IFE','Pasaporte','Cédula profesional'] },
      { id:'vendedor_id_num',   label:'Número de ID vendedor',     type:'text' },
      { id:'vendedor_domicilio',label:'Domicilio del vendedor',    type:'text' },
      { id:'comprador_nombre',  label:'Nombre del comprador',      type:'text' },
      { id:'comprador_curp',    label:'CURP del comprador',        type:'text' },
      { id:'comprador_rfc',     label:'RFC del comprador',         type:'text' },
      { id:'comprador_id_tipo', label:'Tipo de ID comprador',      type:'select', opts:['INE/IFE','Pasaporte','Cédula profesional'] },
      { id:'comprador_id_num',  label:'Número de ID comprador',    type:'text' },
      { id:'comprador_domicilio',label:'Domicilio del comprador',  type:'text' },
      { id:'inmueble_direccion',label:'Dirección del inmueble',    type:'text',   src:'inmueble_direccion' },
      { id:'inmueble_colonia',  label:'Colonia',                   type:'text',   src:'inmueble_colonia' },
      { id:'inmueble_municipio',label:'Municipio / Delegación',    type:'text',   src:'inmueble_municipio' },
      { id:'inmueble_estado',   label:'Estado',                    type:'text',   src:'inmueble_estado' },
      { id:'inmueble_cp',       label:'Código postal',             type:'text',   src:'inmueble_cp' },
      { id:'sup_terreno',       label:'Superficie de terreno (m²)',type:'text',   src:'inmueble_sup_t' },
      { id:'sup_construida',    label:'Superficie construida (m²)',type:'text',   src:'inmueble_sup_c' },
      { id:'descripcion_notarial',label:'Descripción notarial / antecedentes registrales', type:'textarea' },
      { id:'precio_total',      label:'Precio de venta ($)',        type:'text',   src:'precio_total' },
      { id:'precio_letra',      label:'Precio con letra',          type:'text' },
      { id:'anticipo_monto',    label:'Anticipo ($)',               type:'text' },
      { id:'anticipo_fecha',    label:'Fecha de anticipo',         type:'date' },
      { id:'saldo_monto',       label:'Saldo a liquidar ($)',       type:'text' },
      { id:'saldo_fecha',       label:'Fecha de pago del saldo',   type:'date' },
      { id:'forma_pago',        label:'Forma de pago',             type:'select', opts:['Contado','Crédito hipotecario FOVISSSTE','Crédito hipotecario INFONAVIT','Crédito hipotecario bancario','Contado + crédito'] },
      { id:'entrega_fecha',     label:'Fecha de entrega del inmueble', type:'date' },
      { id:'notaria',           label:'Notaría designada',         type:'text' },
      { id:'gastos_escritura',  label:'Gastos de escrituración a cargo de', type:'select', opts:['El comprador','El vendedor','Ambas partes en igual proporción'] },
      { id:'testigo1_nombre',   label:'Testigo 1 — nombre',        type:'text' },
      { id:'testigo2_nombre',   label:'Testigo 2 — nombre',        type:'text' },
      { id:'agente_nombre',     label:'Agente inmobiliario',       type:'text',   src:'agente_nombre' },
      { id:'agente_agencia',    label:'Agencia',                   type:'text',   src:'agente_agencia' },
    ],
  },
  {
    id: 'cv_terreno', name: 'Contrato Compraventa — Terreno', cat: 'profeco',
    desc: 'Modelo PROFECO — Compraventa de terreno',
    fields: [
      { id:'fecha_hoy',         label:'Fecha del contrato',        type:'date',   src:'fecha_hoy' },
      { id:'lugar',             label:'Lugar de firma',            type:'text',   src:'lugar' },
      { id:'vendedor_nombre',   label:'Nombre del vendedor',       type:'text',   src:'vendedor_nombre' },
      { id:'vendedor_curp',     label:'CURP del vendedor',         type:'text' },
      { id:'vendedor_rfc',      label:'RFC del vendedor',          type:'text' },
      { id:'vendedor_id_tipo',  label:'Tipo de ID vendedor',       type:'select', opts:['INE/IFE','Pasaporte','Cédula profesional'] },
      { id:'vendedor_id_num',   label:'Número de ID vendedor',     type:'text' },
      { id:'vendedor_domicilio',label:'Domicilio del vendedor',    type:'text' },
      { id:'comprador_nombre',  label:'Nombre del comprador',      type:'text' },
      { id:'comprador_curp',    label:'CURP del comprador',        type:'text' },
      { id:'comprador_rfc',     label:'RFC del comprador',         type:'text' },
      { id:'comprador_id_tipo', label:'Tipo de ID comprador',      type:'select', opts:['INE/IFE','Pasaporte','Cédula profesional'] },
      { id:'comprador_id_num',  label:'Número de ID comprador',    type:'text' },
      { id:'comprador_domicilio',label:'Domicilio del comprador',  type:'text' },
      { id:'inmueble_direccion',label:'Ubicación del terreno',     type:'text',   src:'inmueble_direccion' },
      { id:'inmueble_municipio',label:'Municipio / Delegación',    type:'text',   src:'inmueble_municipio' },
      { id:'inmueble_estado',   label:'Estado',                    type:'text',   src:'inmueble_estado' },
      { id:'inmueble_cp',       label:'Código postal',             type:'text',   src:'inmueble_cp' },
      { id:'sup_terreno',       label:'Superficie del terreno (m²)',type:'text',  src:'inmueble_sup_t' },
      { id:'frente_ml',         label:'Frente (ml)',               type:'text' },
      { id:'fondo_ml',          label:'Fondo (ml)',                type:'text' },
      { id:'colindancias',      label:'Colindancias',              type:'textarea' },
      { id:'uso_suelo',         label:'Uso de suelo',              type:'text' },
      { id:'descripcion_notarial',label:'Descripción notarial / antecedentes registrales', type:'textarea' },
      { id:'precio_total',      label:'Precio de venta ($)',        type:'text',   src:'precio_total' },
      { id:'precio_letra',      label:'Precio con letra',          type:'text' },
      { id:'anticipo_monto',    label:'Anticipo ($)',               type:'text' },
      { id:'anticipo_fecha',    label:'Fecha de anticipo',         type:'date' },
      { id:'saldo_monto',       label:'Saldo a liquidar ($)',       type:'text' },
      { id:'saldo_fecha',       label:'Fecha de pago del saldo',   type:'date' },
      { id:'forma_pago',        label:'Forma de pago',             type:'select', opts:['Contado','Crédito hipotecario bancario','Otro'] },
      { id:'entrega_fecha',     label:'Fecha de entrega',          type:'date' },
      { id:'notaria',           label:'Notaría designada',         type:'text' },
      { id:'gastos_escritura',  label:'Gastos de escrituración a cargo de', type:'select', opts:['El comprador','El vendedor','Ambas partes en igual proporción'] },
      { id:'testigo1_nombre',   label:'Testigo 1 — nombre',        type:'text' },
      { id:'testigo2_nombre',   label:'Testigo 2 — nombre',        type:'text' },
      { id:'agente_nombre',     label:'Agente inmobiliario',       type:'text',   src:'agente_nombre' },
      { id:'agente_agencia',    label:'Agencia',                   type:'text',   src:'agente_agencia' },
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
      <h1>REGISTRO DE CAPTACIÓN INMOBILIARIA</h1>
      <p class="centrado">Folio: ${W('folio')} &nbsp;·&nbsp; Fecha: ${W('fecha_hoy')}</p>
      <h2>Datos del Agente</h2>
      <table><tr><th>Agente captador</th><td>${W('agente_nombre')}</td><th>Agencia</th><td>${W('agente_agencia')}</td></tr></table>
      <h2>Datos del Propietario</h2>
      <table>
        <tr><th>Nombre</th><td colspan="3">${W('vendedor_nombre')}</td></tr>
        <tr><th>Teléfono</th><td>${W('vendedor_tel')}</td><th>Correo</th><td>${W('vendedor_email')}</td></tr>
      </table>
      <h2>Datos del Inmueble</h2>
      <table>
        <tr><th>Tipo</th><td>${W('inmueble_tipo')}</td><th>Operación</th><td>${W('tipo_operacion')}</td></tr>
        <tr><th>Dirección</th><td colspan="3">${W('inmueble_direccion')}</td></tr>
        <tr><th>Municipio</th><td>${W('inmueble_municipio')}</td><th>Estado</th><td>${W('inmueble_estado')}</td></tr>
        <tr><th>Sup. terreno</th><td>${W('inmueble_sup_t')} m²</td><th>Sup. construida</th><td>${W('inmueble_sup_c')} m²</td></tr>
        <tr><th>Precio solicitado</th><td>$${W('precio_total')}</td><th>Comisión</th><td>${W('comision_pct')}</td></tr>
        <tr><th>Exclusividad</th><td>${W('exclusividad')}</td><th>Situación legal</th><td>${W('situacion_legal')}</td></tr>
      </table>
      <h2>Motivo de Venta</h2><p>${W('motivo_venta')}</p>
      <h2>Observaciones</h2><p>${W('notas')}</p>
      <br><br>
      <table><tr>
        <td style="width:50%;text-align:center;">
          <div style="border-top:1px solid #333;margin-top:50px;padding-top:5px;">Propietario<br><strong>${W('vendedor_nombre')}</strong></div>
        </td>
        <td style="width:50%;text-align:center;">
          <div style="border-top:1px solid #333;margin-top:50px;padding-top:5px;">Agente Inmobiliario<br><strong>${W('agente_nombre')}</strong></div>
        </td>
      </tr></table>`

    // ── 2. LEVANTAMIENTO DE MEDIDAS ─────────────────────────────────────────
    case 'levantamiento': return `
      <h1>LEVANTAMIENTO DE MEDIDAS</h1>
      <p class="centrado">Fecha: ${W('fecha_hoy')} &nbsp;·&nbsp; Agente: ${W('agente_nombre')}</p>
      <h2>Inmueble</h2>
      <table>
        <tr><th>Dirección</th><td colspan="3">${W('inmueble_direccion')}</td></tr>
        <tr><th>Propietario presente</th><td colspan="3">${W('vendedor_nombre')}</td></tr>
        <tr><th>Sup. total</th><td>${W('sup_total_m2')} m²</td><th>Frente</th><td>${W('frente_ml')} ml</td></tr>
        <tr><th>Fondo</th><td>${W('fondo_ml')} ml</td><td colspan="2"></td></tr>
      </table>
      <h2>Desglose de Áreas</h2>
      <table>
        <tr><th>Área</th><th>Medida (m²)</th><th>Área</th><th>Medida (m²)</th></tr>
        <tr><td>Sala</td><td>${W('m2_sala')}</td><td>Comedor</td><td>${W('m2_comedor')}</td></tr>
        <tr><td>Cocina</td><td>${W('m2_cocina')}</td><td>Recámara 1</td><td>${W('m2_rec1')}</td></tr>
        <tr><td>Recámara 2</td><td>${W('m2_rec2')}</td><td>Recámara 3</td><td>${W('m2_rec3')}</td></tr>
        <tr><td>Baño principal</td><td>${W('m2_bano1')}</td><td>Baño secundario</td><td>${W('m2_bano2')}</td></tr>
        <tr><td>Estacionamiento</td><td>${W('m2_estac')}</td><td>Jardín / Patio</td><td>${W('m2_jardin')}</td></tr>
        <tr><td colspan="2">Otras áreas</td><td colspan="2">${W('m2_otras')}</td></tr>
      </table>
      <h2>Estado de Estructura</h2><p>${W('obs_estructura')}</p>
      <h2>Instalaciones</h2><p>${W('obs_instalaciones')}</p>
      <h2>Observaciones Generales</h2><p>${W('notas')}</p>
      <br><br>
      <table><tr>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:50px;padding-top:5px;">Propietario<br>${W('vendedor_nombre')}</div></td>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:50px;padding-top:5px;">Agente<br>${W('agente_nombre')}</div></td>
      </tr></table>`

    // ── 3. FICHA TÉCNICA ────────────────────────────────────────────────────
    case 'ficha_tecnica': return `
      <h1>FICHA TÉCNICA DE PROPIEDAD</h1>
      <p class="centrado">Folio: ${W('folio')} &nbsp;·&nbsp; Fecha: ${W('fecha_hoy')}</p>
      <h2>Identificación</h2>
      <table>
        <tr><th>Tipo</th><td>${W('inmueble_tipo')}</td><th>Precio</th><td><strong>$${W('precio_total')}</strong></td></tr>
        <tr><th>Dirección</th><td colspan="3">${W('inmueble_direccion')}</td></tr>
      </table>
      <h2>Especificaciones</h2>
      <table>
        <tr><th>Sup. terreno</th><td>${W('inmueble_sup_t')} m²</td><th>Sup. construida</th><td>${W('inmueble_sup_c')} m²</td></tr>
        <tr><th>Recámaras</th><td>${W('inmueble_recamaras')}</td><th>Baños</th><td>${W('inmueble_banos')}</td></tr>
        <tr><th>Estacionamientos</th><td>${W('inmueble_estac')}</td><th>Plantas</th><td>${W('inmueble_pisos')}</td></tr>
        <tr><th>Antigüedad</th><td>${W('inmueble_antiguedad')}</td><th></th><td></td></tr>
        <tr><th>Servicios</th><td colspan="3">${W('servicios')}</td></tr>
        <tr><th>Amenidades</th><td colspan="3">${W('amenidades')}</td></tr>
      </table>
      <h2>Descripción</h2><p>${W('inmueble_descripcion')}</p>
      <h2>Contacto del Agente</h2>
      <table>
        <tr><th>Agente</th><td>${W('agente_nombre')}</td><th>Teléfono</th><td>${W('agente_tel')}</td></tr>
        <tr><th>Agencia</th><td>${W('agente_agencia')}</td><td colspan="2"></td></tr>
      </table>`

    // ── 4. PERFILAMIENTO DEL VENDEDOR ───────────────────────────────────────
    case 'perfilamiento': return `
      <h1>PERFILAMIENTO DEL VENDEDOR</h1>
      <p class="centrado">Fecha: ${W('fecha_hoy')} &nbsp;·&nbsp; Agente: ${W('agente_nombre')}</p>
      <h2>Datos del Vendedor</h2>
      <table>
        <tr><th>Nombre completo</th><td colspan="3">${W('vendedor_nombre')}</td></tr>
        <tr><th>Teléfono</th><td>${W('vendedor_tel')}</td><th>Correo</th><td>${W('vendedor_email')}</td></tr>
        <tr><th>CURP / RFC</th><td>${W('curp_rfc')}</td><th>Estado civil</th><td>${W('estado_civil')}</td></tr>
      </table>
      <h2>Análisis de Venta</h2>
      <table>
        <tr><th>Motivo de venta</th><td>${W('motivo_venta')}</td></tr>
        <tr><th>Tiempo disponible</th><td>${W('tiempo_disposicion')}</td></tr>
        <tr><th>Precio mínimo aceptado</th><td>$${W('precio_minimo')}</td></tr>
        <tr><th>¿Acepta crédito hipotecario?</th><td>${W('acepta_credito')}</td></tr>
        <tr><th>Situación legal</th><td>${W('situacion_legal')}</td></tr>
      </table>
      <h2>Adeudos</h2><p>${W('adeudos')}</p>
      <h2>Historial de Ofertas Previas</h2><p>${W('historial_ofertas')}</p>
      <h2>Observaciones del Agente</h2><p>${W('observaciones')}</p>
      <br><br>
      <table><tr>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:50px;padding-top:5px;">Vendedor<br>${W('vendedor_nombre')}</div></td>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:50px;padding-top:5px;">Agente<br>${W('agente_nombre')}</div></td>
      </tr></table>`

    // ── 5. AVISO DE PRIVACIDAD ──────────────────────────────────────────────
    case 'aviso_privacidad': return `
      <h1>AVISO DE PRIVACIDAD</h1>
      <p class="centrado">${W('agente_agencia')}</p>
      <p>En cumplimiento a lo dispuesto en la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) y su Reglamento, <strong>${W('agente_agencia')}</strong>, con domicilio para oír y recibir notificaciones en ${W('lugar')}, representado por <strong>${W('agente_nombre')}</strong>, correo electrónico: ${W('agente_email')}, teléfono: ${W('agente_tel')}, en su carácter de responsable del tratamiento de los datos personales, pone a su disposición el presente Aviso de Privacidad.</p>
      <h2>Finalidad del Tratamiento</h2>
      <p>Los datos personales que recabamos de usted serán utilizados para las siguientes finalidades necesarias para la relación jurídica que nos vincula:</p>
      <p>a) Prestar servicios de intermediación inmobiliaria.<br>b) Elaborar contratos, fichas técnicas y documentos relacionados con la compraventa o arrendamiento del inmueble.<br>c) Dar seguimiento a su expediente inmobiliario.<br>d) Cumplir obligaciones derivadas de la relación comercial o de servicios.</p>
      <h2>Datos Recabados</h2>
      <p>Para las finalidades señaladas, recabaremos los siguientes datos personales: nombre completo, domicilio, teléfono, correo electrónico, CURP, RFC, datos del inmueble de su propiedad o interés.</p>
      <h2>Derechos ARCO</h2>
      <p>Usted tiene derecho a Acceder, Rectificar, Cancelar u Oponerse (derechos ARCO) al tratamiento de sus datos personales, enviando solicitud al correo: <strong>${W('agente_email')}</strong>.</p>
      <h2>Transferencia de Datos</h2>
      <p>Sus datos no serán transferidos a terceros sin su consentimiento, salvo cuando sea requerido por autoridad competente o sea necesario para el cierre de la operación inmobiliaria (notarías, instituciones financieras).</p>
      <p>Al proporcionar sus datos personales, usted manifiesta haber leído y aceptado el presente Aviso de Privacidad.</p>
      <br>
      <p>Fecha: ${W('fecha_hoy')} &nbsp;·&nbsp; Lugar: ${W('lugar')}</p>
      <br><br>
      <table><tr>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:50px;padding-top:5px;">Titular de los datos<br>${W('vendedor_nombre')}</div></td>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:50px;padding-top:5px;">Responsable<br>${W('agente_nombre')}<br>${W('agente_agencia')}</div></td>
      </tr></table>`

    // ── 6. CARTA DE DERECHOS ────────────────────────────────────────────────
    case 'carta_derechos': return `
      <h1>CARTA DE DERECHOS DEL CONSUMIDOR INMOBILIARIO</h1>
      <p class="centrado">PROFECO — Procuraduría Federal del Consumidor</p>
      <p>En ${W('lugar')}, a ${W('fecha_hoy')}.</p>
      <p>Estimado(a) Sr./Sra. <strong>${W('vendedor_nombre')}</strong>:</p>
      <p>El(la) agente inmobiliario(a) <strong>${W('agente_nombre')}</strong>, de la empresa <strong>${W('agente_agencia')}</strong>, le informa que como consumidor inmobiliario, usted tiene los siguientes derechos:</p>
      <h2>Sus Derechos</h2>
      <p><strong>1. Información veraz y oportuna.</strong> Tiene derecho a recibir información clara, completa y oportuna sobre el inmueble: características, precio, forma de pago, gravámenes y situación legal.</p>
      <p><strong>2. Contrato por escrito.</strong> Toda operación inmobiliaria deberá constar en un contrato escrito, firmado por ambas partes, con los términos y condiciones perfectamente establecidos.</p>
      <p><strong>3. Precio firme.</strong> El precio pactado en el contrato es definitivo. No se le podrán cobrar cargos adicionales no previstos en el mismo.</p>
      <p><strong>4. Rescisión del contrato.</strong> Tiene derecho a rescindir el contrato si el proveedor incumple alguna de las condiciones pactadas.</p>
      <p><strong>5. Devolución de cantidades.</strong> En caso de rescisión imputable al proveedor, tiene derecho a la devolución de las cantidades entregadas, más los intereses legales correspondientes.</p>
      <p><strong>6. Inmueble conforme a lo pactado.</strong> El inmueble debe entregarse con las características, dimensiones, acabados y en la fecha acordada en el contrato.</p>
      <p><strong>7. Reclamación ante PROFECO.</strong> Si sus derechos son violados, puede presentar una queja ante la Procuraduría Federal del Consumidor (PROFECO) al teléfono 800 468 8722, o en www.profeco.gob.mx.</p>
      <p><strong>8. Asesoría legal.</strong> Tiene derecho a asesorarse con un abogado o notario de su confianza antes de firmar cualquier documento.</p>
      <p><strong>9. Protección de datos personales.</strong> Sus datos personales están protegidos conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.</p>
      <h2>Inmueble de Referencia</h2>
      <p>${W('inmueble_direccion')}</p>
      <br><br>
      <table><tr>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:50px;padding-top:5px;">Consumidor<br>${W('vendedor_nombre')}</div></td>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:50px;padding-top:5px;">Agente Inmobiliario<br>${W('agente_nombre')}<br>${W('agente_agencia')}</div></td>
      </tr></table>`

    // ── 7. PROPUESTA DE VALOR / EXCLUSIVA ───────────────────────────────────
    case 'propuesta_exclusiva': return `
      <h1>PROPUESTA DE VALOR Y CAPTACIÓN EXCLUSIVA</h1>
      <p class="centrado">Fecha: ${W('fecha_hoy')}</p>
      <p>Estimado(a) <strong>${W('vendedor_nombre')}</strong>:</p>
      <p>Por medio de la presente, <strong>${W('agente_nombre')}</strong> de <strong>${W('agente_agencia')}</strong>, le presentamos nuestra propuesta formal para la venta exclusiva del inmueble ubicado en:</p>
      <p style="text-align:center;"><strong>${W('inmueble_direccion')}</strong></p>
      <h2>Términos de la Captación</h2>
      <table>
        <tr><th>Precio de lista</th><td>$${W('precio_total')}</td></tr>
        <tr><th>Comisión acordada</th><td>${W('comision_pct')}</td></tr>
        <tr><th>Tipo de captación</th><td>Exclusiva</td></tr>
        <tr><th>Vigencia</th><td>${W('vigencia_dias')} días</td></tr>
        <tr><th>Fecha de inicio</th><td>${W('fecha_inicio')}</td></tr>
        <tr><th>Fecha de vencimiento</th><td>${W('fecha_fin')}</td></tr>
      </table>
      <h2>Estrategia de Precio</h2><p>${W('estrategia_precio')}</p>
      <h2>Plan de Marketing</h2><p>${W('plan_marketing')}</p>
      <h2>Compromisos del Agente</h2><p>${W('compromisos')}</p>
      <h2>Contacto</h2>
      <p>${W('agente_nombre')} &nbsp;·&nbsp; Tel: ${W('agente_tel')} &nbsp;·&nbsp; ${W('agente_agencia')}</p>
      <br><br>
      <table><tr>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:50px;padding-top:5px;">Propietario<br>${W('vendedor_nombre')}</div></td>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:50px;padding-top:5px;">Agente<br>${W('agente_nombre')}</div></td>
      </tr></table>`

    // ── 8. CONTRAOFERTA ─────────────────────────────────────────────────────
    case 'contraoferta': return `
      <h1>CONTRAOFERTA</h1>
      <p class="centrado">Fecha: ${W('fecha_hoy')} &nbsp;·&nbsp; Lugar: ${W('lugar')}</p>
      <p>El suscrito <strong>${W('vendedor_nombre')}</strong>, en su calidad de vendedor del inmueble ubicado en <strong>${W('inmueble_direccion')}</strong>, en respuesta a la oferta presentada por <strong>${W('comprador_nombre')}</strong> (Tel: ${W('comprador_tel')}), manifiesta lo siguiente:</p>
      <h2>Condiciones de la Contraoferta</h2>
      <table>
        <tr><th>Oferta original recibida</th><td>$${W('oferta_original')}</td></tr>
        <tr><th>Precio en contraoferta</th><td><strong>$${W('precio_contraoferta')}</strong></td></tr>
        <tr><th>Fecha límite de respuesta</th><td>${W('fecha_limite')}</td></tr>
      </table>
      <h2>Condiciones de Pago Propuestas</h2><p>${W('condiciones_pago')}</p>
      <h2>Observaciones</h2><p>${W('obs_agente')}</p>
      <p>La presente contraoferta es válida únicamente hasta la fecha límite indicada. Transcurrido dicho plazo sin respuesta, se considerará rechazada.</p>
      <br><br>
      <table><tr>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:50px;padding-top:5px;">Vendedor<br>${W('vendedor_nombre')}</div></td>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:50px;padding-top:5px;">Agente Mediador<br>${W('agente_nombre')}</div></td>
      </tr></table>`

    // ── 9. RESOLUCIÓN A — ACEPTA ────────────────────────────────────────────
    case 'resolucion_a': return `
      <h1>RESOLUCIÓN A — ACEPTACIÓN DE OFERTA</h1>
      <p class="centrado">Fecha: ${W('fecha_hoy')} &nbsp;·&nbsp; Lugar: ${W('lugar')}</p>
      <p>El suscrito <strong>${W('vendedor_nombre')}</strong>, vendedor del inmueble ubicado en <strong>${W('inmueble_direccion')}</strong>, manifiesta por medio del presente documento su <strong>ACEPTACIÓN TOTAL</strong> de la oferta presentada por <strong>${W('comprador_nombre')}</strong>.</p>
      <h2>Condiciones Aceptadas</h2>
      <table>
        <tr><th>Precio acordado</th><td><strong>$${W('precio_total')}</strong></td></tr>
        <tr><th>Forma de pago</th><td>${W('condiciones_pago')}</td></tr>
        <tr><th>Fecha estimada de escrituración</th><td>${W('fecha_escritura')}</td></tr>
      </table>
      <p>Las partes se comprometen a proceder con la formalización de la compraventa mediante contrato ante notario público en la fecha acordada.</p>
      <br><br>
      <table><tr>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:50px;padding-top:5px;">Vendedor<br>${W('vendedor_nombre')}</div></td>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:50px;padding-top:5px;">Comprador<br>${W('comprador_nombre')}</div></td>
      </tr></table>`

    // ── 10. RESOLUCIÓN B — ACEPTA CON MODIFICACIONES ────────────────────────
    case 'resolucion_b': return `
      <h1>RESOLUCIÓN B — ACEPTACIÓN CON MODIFICACIONES</h1>
      <p class="centrado">Fecha: ${W('fecha_hoy')} &nbsp;·&nbsp; Lugar: ${W('lugar')}</p>
      <p>El suscrito <strong>${W('vendedor_nombre')}</strong>, vendedor del inmueble en <strong>${W('inmueble_direccion')}</strong>, manifiesta su <strong>ACEPTACIÓN CONDICIONADA</strong> de la oferta de <strong>${W('comprador_nombre')}</strong> bajo las siguientes modificaciones:</p>
      <h2>Precio Final Acordado</h2>
      <p style="font-size:14pt;font-weight:bold;text-align:center;">$${W('precio_total')}</p>
      <h2>Modificaciones a la Oferta Original</h2><p>${W('modificaciones')}</p>
      <h2>Condiciones Adicionales</h2><p>${W('condiciones_adicionales')}</p>
      <p>El comprador deberá confirmar su aceptación de las presentes modificaciones a más tardar el ${W('fecha_limite_respuesta')}.</p>
      <br><br>
      <table><tr>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:50px;padding-top:5px;">Vendedor<br>${W('vendedor_nombre')}</div></td>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:50px;padding-top:5px;">Agente<br>${W('agente_nombre')}</div></td>
      </tr></table>`

    // ── 11. RESOLUCIÓN C — NO ACEPTA ─────────────────────────────────────────
    case 'resolucion_c': return `
      <h1>RESOLUCIÓN C — NO ACEPTACIÓN DE OFERTA</h1>
      <p class="centrado">Fecha: ${W('fecha_hoy')} &nbsp;·&nbsp; Lugar: ${W('lugar')}</p>
      <p>El suscrito <strong>${W('vendedor_nombre')}</strong>, vendedor del inmueble ubicado en <strong>${W('inmueble_direccion')}</strong>, manifiesta su <strong>NO ACEPTACIÓN</strong> de la oferta presentada por <strong>${W('comprador_nombre')}</strong>.</p>
      <h2>Motivo del Rechazo</h2><p>${W('motivo_rechazo')}</p>
      <h2>Condiciones Bajo las Cuales Reconsideraría</h2><p>${W('condiciones_futuras')}</p>
      <p>Se agradece el interés mostrado e invitamos al comprador a contactar al agente para explorar posibles acuerdos futuros.</p>
      <br><br>
      <table><tr>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:50px;padding-top:5px;">Vendedor<br>${W('vendedor_nombre')}</div></td>
        <td style="width:50%;text-align:center;"><div style="border-top:1px solid #333;margin-top:50px;padding-top:5px;">Agente<br>${W('agente_nombre')}</div></td>
      </tr></table>`

    // ── 12. CONTRATO COMPRAVENTA — VIVIENDA ─────────────────────────────────
    case 'cv_vivienda': return `
      <h1>CONTRATO DE COMPRAVENTA DE VIVIENDA</h1>
      <p class="centrado">(Modelo de Contrato — PROFECO)</p>
      <p class="centrado">En ${W('lugar')}, a ${W('fecha_hoy')}.</p>
      <p>Los suscritos <strong>${W('vendedor_nombre')}</strong> (en adelante "EL VENDEDOR") y <strong>${W('comprador_nombre')}</strong> (en adelante "EL COMPRADOR"), mayores de edad, con capacidad legal para contratar, comparecen a suscribir el presente Contrato de Compraventa de Vivienda al tenor de las siguientes:</p>
      <h2>DECLARACIONES</h2>
      <h3>I. Del Vendedor</h3>
      <p>CURP: ${W('vendedor_curp')} &nbsp;·&nbsp; RFC: ${W('vendedor_rfc')} &nbsp;·&nbsp; ID: ${W('vendedor_id_tipo')} No. ${W('vendedor_id_num')}</p>
      <p>Domicilio: ${W('vendedor_domicilio')}</p>
      <p>Declara ser legítimo propietario del inmueble objeto del presente contrato, que el mismo se encuentra libre de todo gravamen, litigio, embargo o limitación de dominio, y que tiene plena capacidad para disponer del mismo.</p>
      <h3>II. Del Comprador</h3>
      <p>CURP: ${W('comprador_curp')} &nbsp;·&nbsp; RFC: ${W('comprador_rfc')} &nbsp;·&nbsp; ID: ${W('comprador_id_tipo')} No. ${W('comprador_id_num')}</p>
      <p>Domicilio: ${W('comprador_domicilio')}</p>
      <p>Declara tener interés en adquirir el inmueble descrito en el presente instrumento, en los términos y condiciones aquí establecidos.</p>
      <h2>CLÁUSULAS</h2>
      <h3>PRIMERA. — OBJETO DEL CONTRATO</h3>
      <p>EL VENDEDOR transmite la propiedad del inmueble ubicado en: <strong>${W('inmueble_direccion')}</strong>, Colonia ${W('inmueble_colonia')}, Municipio/Delegación ${W('inmueble_municipio')}, Estado de ${W('inmueble_estado')}, C.P. ${W('inmueble_cp')}, con una superficie de terreno de <strong>${W('sup_terreno')} m²</strong> y superficie construida de <strong>${W('sup_construida')} m²</strong>.</p>
      <p>Antecedentes registrales: ${W('descripcion_notarial')}</p>
      <h3>SEGUNDA. — PRECIO</h3>
      <p>El precio de la compraventa se pacta en la cantidad de <strong>$${W('precio_total')}</strong> (${W('precio_letra')} pesos 00/100 M.N.), que EL COMPRADOR pagará a EL VENDEDOR de la siguiente manera:</p>
      <table>
        <tr><th>Anticipo</th><td>$${W('anticipo_monto')}</td><th>Fecha</th><td>${W('anticipo_fecha')}</td></tr>
        <tr><th>Saldo a liquidar</th><td>$${W('saldo_monto')}</td><th>Fecha</th><td>${W('saldo_fecha')}</td></tr>
        <tr><th>Forma de pago</th><td colspan="3">${W('forma_pago')}</td></tr>
      </table>
      <h3>TERCERA. — ENTREGA DEL INMUEBLE</h3>
      <p>EL VENDEDOR se obliga a entregar el inmueble en la fecha <strong>${W('entrega_fecha')}</strong>, libre de personas, enseres ajenos al mismo y al corriente en el pago de servicios (agua, luz, predial).</p>
      <h3>CUARTA. — ESCRITURACIÓN</h3>
      <p>Las partes acuerdan formalizar la presente compraventa ante Notario Público, designando para tal efecto la <strong>${W('notaria')}</strong>. Los gastos notariales, impuestos y derechos de registro correrán a cargo de <strong>${W('gastos_escritura')}</strong>.</p>
      <h3>QUINTA. — GARANTÍAS</h3>
      <p>EL VENDEDOR responde de los vicios ocultos del inmueble, en los términos del Código Civil Federal y el de la entidad en que se ubica el bien. EL VENDEDOR se obliga a hacer entrega del inmueble en las mismas condiciones en que fue exhibido al COMPRADOR al momento de la firma del presente contrato.</p>
      <h3>SEXTA. — PENAS CONVENCIONALES</h3>
      <p>En caso de incumplimiento por parte de EL VENDEDOR, éste devolverá al COMPRADOR las cantidades recibidas más el equivalente al 10% del precio pactado como pena convencional. En caso de incumplimiento de EL COMPRADOR, EL VENDEDOR podrá retener el anticipo entregado como pena convencional.</p>
      <h3>SÉPTIMA. — RESCISIÓN</h3>
      <p>Cualquiera de las partes podrá rescindir el presente contrato en caso de incumplimiento de la otra parte, previa notificación por escrito con 15 días naturales de anticipación, sin perjuicio de las penas convencionales establecidas.</p>
      <h3>OCTAVA. — JURISDICCIÓN</h3>
      <p>Para la interpretación y cumplimiento del presente contrato, las partes se someten a las leyes vigentes en el Estado de ${W('inmueble_estado')}, y a la jurisdicción de los Tribunales competentes de ${W('inmueble_municipio')}, renunciando expresamente a cualquier otro fuero que pudiera corresponderles.</p>
      <h3>NOVENA. — CONFORMIDAD</h3>
      <p>Las partes manifiestan haber leído íntegramente el presente contrato, estar conformes con su contenido y firmarlo libre de todo vicio del consentimiento.</p>
      <br>
      <table>
        <tr>
          <td style="width:33%;text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;font-size:9pt;">EL VENDEDOR<br><strong>${W('vendedor_nombre')}</strong></div></td>
          <td style="width:33%;text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;font-size:9pt;">EL COMPRADOR<br><strong>${W('comprador_nombre')}</strong></div></td>
          <td style="width:33%;text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;font-size:9pt;">AGENTE INMOBILIARIO<br><strong>${W('agente_nombre')}</strong><br>${W('agente_agencia')}</div></td>
        </tr>
        <tr>
          <td style="text-align:center;"><div style="border-top:1px solid #333;margin-top:50px;padding-top:5px;font-size:9pt;">TESTIGO 1<br>${W('testigo1_nombre')}</div></td>
          <td style="text-align:center;"><div style="border-top:1px solid #333;margin-top:50px;padding-top:5px;font-size:9pt;">TESTIGO 2<br>${W('testigo2_nombre')}</div></td>
          <td></td>
        </tr>
      </table>`

    // ── 13. CONTRATO COMPRAVENTA — TERRENO ──────────────────────────────────
    case 'cv_terreno': return `
      <h1>CONTRATO DE COMPRAVENTA DE TERRENO</h1>
      <p class="centrado">(Modelo de Contrato — PROFECO)</p>
      <p class="centrado">En ${W('lugar')}, a ${W('fecha_hoy')}.</p>
      <p>Los suscritos <strong>${W('vendedor_nombre')}</strong> (en adelante "EL VENDEDOR") y <strong>${W('comprador_nombre')}</strong> (en adelante "EL COMPRADOR"), celebran el presente Contrato de Compraventa de Terreno conforme a las siguientes:</p>
      <h2>DECLARACIONES</h2>
      <h3>I. Del Vendedor</h3>
      <p>CURP: ${W('vendedor_curp')} &nbsp;·&nbsp; RFC: ${W('vendedor_rfc')} &nbsp;·&nbsp; ID: ${W('vendedor_id_tipo')} No. ${W('vendedor_id_num')}</p>
      <p>Domicilio: ${W('vendedor_domicilio')}</p>
      <p>Declara ser legítimo propietario del terreno objeto del presente contrato, que el mismo se encuentra libre de todo gravamen o litigio.</p>
      <h3>II. Del Comprador</h3>
      <p>CURP: ${W('comprador_curp')} &nbsp;·&nbsp; RFC: ${W('comprador_rfc')} &nbsp;·&nbsp; ID: ${W('comprador_id_tipo')} No. ${W('comprador_id_num')}</p>
      <p>Domicilio: ${W('comprador_domicilio')}</p>
      <h2>CLÁUSULAS</h2>
      <h3>PRIMERA. — OBJETO</h3>
      <p>EL VENDEDOR transmite la propiedad del terreno ubicado en: <strong>${W('inmueble_direccion')}</strong>, Municipio/Delegación ${W('inmueble_municipio')}, Estado de ${W('inmueble_estado')}, C.P. ${W('inmueble_cp')}.</p>
      <table>
        <tr><th>Superficie</th><td>${W('sup_terreno')} m²</td><th>Frente</th><td>${W('frente_ml')} ml</td></tr>
        <tr><th>Fondo</th><td>${W('fondo_ml')} ml</td><th>Uso de suelo</th><td>${W('uso_suelo')}</td></tr>
        <tr><th>Colindancias</th><td colspan="3">${W('colindancias')}</td></tr>
      </table>
      <p>Antecedentes registrales: ${W('descripcion_notarial')}</p>
      <h3>SEGUNDA. — PRECIO</h3>
      <p>El precio se pacta en <strong>$${W('precio_total')}</strong> (${W('precio_letra')} pesos 00/100 M.N.):</p>
      <table>
        <tr><th>Anticipo</th><td>$${W('anticipo_monto')}</td><th>Fecha</th><td>${W('anticipo_fecha')}</td></tr>
        <tr><th>Saldo</th><td>$${W('saldo_monto')}</td><th>Fecha</th><td>${W('saldo_fecha')}</td></tr>
        <tr><th>Forma de pago</th><td colspan="3">${W('forma_pago')}</td></tr>
      </table>
      <h3>TERCERA. — ENTREGA</h3>
      <p>EL VENDEDOR entregará el terreno el día <strong>${W('entrega_fecha')}</strong>, al corriente en el pago de impuestos y servicios.</p>
      <h3>CUARTA. — ESCRITURACIÓN</h3>
      <p>Se formalizará ante <strong>${W('notaria')}</strong>. Gastos a cargo de: <strong>${W('gastos_escritura')}</strong>.</p>
      <h3>QUINTA. — GARANTÍAS Y PENAS</h3>
      <p>EL VENDEDOR garantiza el saneamiento del bien. En caso de incumplimiento, el VENDEDOR devolverá las cantidades recibidas más el 10% como pena convencional. Incumplimiento del COMPRADOR faculta al VENDEDOR a retener el anticipo.</p>
      <h3>SEXTA. — JURISDICCIÓN</h3>
      <p>Ambas partes se someten a la jurisdicción de los Tribunales competentes de ${W('inmueble_municipio')}, ${W('inmueble_estado')}.</p>
      <br>
      <table>
        <tr>
          <td style="width:33%;text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;font-size:9pt;">EL VENDEDOR<br><strong>${W('vendedor_nombre')}</strong></div></td>
          <td style="width:33%;text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;font-size:9pt;">EL COMPRADOR<br><strong>${W('comprador_nombre')}</strong></div></td>
          <td style="width:33%;text-align:center;"><div style="border-top:1px solid #333;margin-top:60px;padding-top:5px;font-size:9pt;">AGENTE<br><strong>${W('agente_nombre')}</strong></div></td>
        </tr>
        <tr>
          <td style="text-align:center;"><div style="border-top:1px solid #333;margin-top:50px;padding-top:5px;font-size:9pt;">TESTIGO 1<br>${W('testigo1_nombre')}</div></td>
          <td style="text-align:center;"><div style="border-top:1px solid #333;margin-top:50px;padding-top:5px;font-size:9pt;">TESTIGO 2<br>${W('testigo2_nombre')}</div></td>
          <td></td>
        </tr>
      </table>`

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
            const ov=this.closest('[style*=position\\:fixed]');
            ov.remove();
            docCreateFromLib('${templateId}');"
            style="padding:7px 14px;background:${cm.color}20;border:1px solid ${cm.color}50;
            color:${cm.color};border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;">
            ✚ Crear documento
          </button>
          <button onclick="this.closest('[style*=position\\:fixed]').remove()"
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
