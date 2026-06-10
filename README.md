<p align="center">
  <img src="assets/banner.png" alt="Nexus OS — Dashboard personal con parser semántico" width="100%"/>
</p>

<h1 align="center">Nexus OS</h1>

<p align="center">
  <strong>Dashboard personal all-in-one con parser semántico de lenguaje natural.<br/>
  Escribe como piensas — el sistema clasifica, registra y organiza solo.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.7.0-purple?style=for-the-badge" alt="Version"/>
  <img src="https://img.shields.io/badge/mobile-PWA%20ready-22d3ee?style=for-the-badge" alt="Mobile PWA"/>
  <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="License"/>
  <img src="https://img.shields.io/badge/status-active-brightgreen?style=for-the-badge" alt="Status"/>
  <img src="https://img.shields.io/badge/deploy-Vercel-black?style=for-the-badge&logo=vercel" alt="Deploy Vercel"/>
  <img src="https://img.shields.io/badge/PRs-welcome-orange?style=for-the-badge" alt="PRs Welcome"/>
</p>

<p align="center">
  <a href="#-acerca-del-proyecto">Acerca</a> •
  <a href="#-novedades-v270--telegram-bot--ia-conversacional">Novedades</a> •
  <a href="#-telegram-bot--nexus-en-tu-bolsillo">Bot Telegram</a> •
  <a href="#-características">Características</a> •
  <a href="#-vistas-del-sistema">Vistas</a> •
  <a href="#-demo">Demo</a> •
  <a href="#-sintaxis-del-parser">Parser</a> •
  <a href="#-comenzando">Comenzando</a> •
  <a href="#-estructura-del-proyecto">Estructura</a> •
  <a href="#-deploy">Deploy</a> •
  <a href="#-contacto">Contacto</a>
</p>

---

## 🆕 Novedades v2.7.0 — Telegram Bot + IA Conversacional

**Tu Nexus OS ahora vive en Telegram.** Captura, consulta y opera tu CRM/finanzas/agenda desde el chat — sin abrir la app.

| Feature | Detalle |
|---|---|
| 🤖 **Bot Telegram bidireccional** | Comandos `/resumen` `/leads` `/inmuebles` `/buscar` + parser semántico nativo (`+$400 @cuenta`, `#tarea p1 mañana`, `Juan #persona`, etc.) |
| 💬 **IA conversacional con Gemini** | Pregunta en lenguaje natural ("¿qué inmuebles tengo en Querétaro debajo de 2M?"). El bot ve hasta 30 inmuebles + 15 leads y responde con análisis |
| 📸 **Captura de inmueble por foto** | Mandas foto al bot con caption → sube a Supabase Storage → crea propiedad borrador → te manda link para terminar |
| ☀️ **Resumen diario 8am** | Cron automático: total inmuebles, leads hoy/7d/total, próximas citas, leads fríos sin contactar |
| 📩 **Notificación instantánea de leads** | Cualquier form de lead en `propiedad.html` te llega al instante con nombre, teléfono, mensaje y folio del inmueble |
| 🔒 **Solo tú** | Auth por `chat_id` único — nadie más puede usar tu bot aunque sepa el handle |
| 🧠 **Mismo parser que la app** | Todo lo que capturas por Telegram aparece en `nodes` table exactamente como si lo hubieras escrito en el Feed Central |

### Stack de la integración

| Capa | Tecnología |
|---|---|
| Bot | Telegram Bot API |
| Orquestador | n8n (self-hosted) |
| IA | Gemini 2.0 Flash |
| DB | Supabase (PostgREST + Storage) |
| Notificación de leads | Webhook desde `api/lead-capture.js` (server-side, vía `user_metadata.n8n_webhooks`) |

📖 **Ver documentación completa abajo** → [Telegram Bot — Nexus en tu bolsillo](#-telegram-bot--nexus-en-tu-bolsillo)

---

## 🤖 Telegram Bot — Nexus en tu bolsillo

### Qué puedes hacer

#### 📊 Consultas rápidas

| Comando | Resultado |
|---|---|
| `/resumen` | Stats: total inmuebles + leads hoy/7d/total |
| `/leads` | Últimos 5 leads con nombre, contacto, inmueble y fecha |
| `/inmuebles` | Últimos 5 inmuebles con precio, ubicación y folio |
| `/buscar <texto>` | Busca por título o folio (ej: `/buscar querétaro`) |
| `/ayuda` | Menú principal de ayuda |
| `/ayuda-finanzas` | Tutorial completo de captura de finanzas |
| `/ayuda-tareas` | Tutorial de tareas y agenda |
| `/ayuda-personas` | Contactos, proyectos, cotizaciones, hábitos |
| `/ayuda-inmuebles` | Captura por foto y comandos CRM |
| `/ayuda-ia` | Preguntas en lenguaje natural |
| `/ayuda-tips` | Trucos avanzados y workflows |

#### ✏️ Captura semántica (mismo parser de la app)

Escribe directo, sin comando. El bot detecta el tipo y guarda en `nodes`:

```
-$400 gasolina @bancomer #servicios       → 💸 gasto con cuenta y tag
+$15000 venta casa @hsbc                  → 💵 ingreso
comprar cemento #tarea p1 mañana          → ✅ tarea alta para mañana
Llamar Juan viernes #tarea                → ✅ tarea con fecha natural
Juan Pérez #persona                       → 👤 contacto
Casa Tulum #proyecto                      → 📁 proyecto
#cotizacion $50000 @casatulum             → 📋 cotización vinculada
- [x] Tomar agua #habito                  → 📝 hábito completado hoy
Recordar comprar pan                      → 📝 nota libre
```

El bot responde con la categoría detectada (emoji + tipo + metadatos) y aparece en tu Nexus al refrescar.

#### 📸 Captura de inmueble por foto

1. Toma foto del inmueble con tu cel
2. Envíala al bot
3. En el **caption** escribe título y datos:
   > "Casa Villa Magna 3rec 2.8M Querétaro"
4. El bot:
   - Sube la foto a Supabase Storage (`property-photos` bucket público)
   - Crea propiedad con `status: 'borrador'`
   - Asigna folio auto `BOT-XXXXXX`
   - Te manda link directo para terminar de capturar en la app

#### 💬 Preguntas en lenguaje natural (Gemini IA)

Escribe sin `/` ni símbolos especiales:

```
¿cuántas casas tengo en Querétaro debajo de 2M?
¿qué leads no he contestado hace más de 3 días?
¿cuál es mi inmueble más caro?
hazme un resumen ejecutivo de mi cartera
¿qué inmuebles tengo en exclusiva?
redacta mensaje para mandar a Juan que no contesta
```

El bot envía contexto (últimos 30 inmuebles + 15 leads) a Gemini 2.0 Flash y devuelve análisis conversacional.

⚠️ Limitaciones: el bot **consulta**, no modifica datos por IA. Para mover/borrar usa los comandos directos o la app.

#### 📩 Notificación automática de leads

Cuando alguien llena el form de lead en cualquier `propiedad.html` pública, te llega al instante:

> 📩 *Nuevo lead Nexus OS*
> 🏠 *Casa Villa Magna* (NX-0042)
> 👤 *Juan Pérez*
> 📞 +52 555 1234567
> ✉ juan@example.com
> 💬 _Me interesa mucho, ¿se puede visitar este fin?_

#### ☀️ Resumen diario 8am

Sin que preguntes, cada mañana recibes:

> ☀️ *Buenos días, Oscar*
> 📊 Stats:
> 🏠 Inmuebles: 42
> 📩 Leads hoy: 3 · 7d: 18 · total: 247
>
> 📅 Próximas citas (7d):
> • Notario casa Juárez — 10/06 11:00
> • Visita Casa Tulum — 12/06 17:00
>
> 🥶 Leads sin contactar (+3d):
> • María González (NX-0038) · 5d

### Setup desde cero (15 minutos)

#### 1. Crea bot en Telegram

1. Abre Telegram → busca `@BotFather` → `/newbot`
2. Sigue el flujo → guarda el **TOKEN**
3. Habla con `@userinfobot` → guarda tu **CHAT_ID** numérico

#### 2. Self-host n8n (o usa el tuyo)

Si no tienes n8n, instálalo con Docker:

```bash
docker run -d --name n8n -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n
```

Detrás de Cloudflare/Caddy/nginx con HTTPS — los webhooks de Telegram requieren TLS.

#### 3. Importa los workflows

En `docs/n8n/` están los templates JSON:
- `etapa-1-telegram-lead.json` — notificación de leads
- `etapa-2-email-smtp.json` — emails SMTP
- `etapa-3-whatsapp-lead.json` — WhatsApp Cloud API
- `etapa-4-drip-campaigns.json` — follow-up emails 3/7/14 días
- `etapa-5-backup-multi.json` — backup multi-destino

Para el bot bidireccional + cron 8am no hay template (son específicos del usuario). El código fuente del workflow está en este README más abajo o pídeselo a Claude.

#### 4. Configura credenciales en n8n

- **Telegram Bot API**: pega el TOKEN
- **Variables inline en Code nodes** (n8n community no soporta `$vars`):
  - `SUPABASE_URL` (tu instancia)
  - `SUPABASE_SERVICE_KEY` (la `service_role`)
  - `GEMINI_API_KEY`
  - `USER_ID` (tu UUID de Supabase auth)
  - `CHAT_ID` (tu ID Telegram)

#### 5. Activa los workflows

Cuando activas el workflow con **Telegram Trigger**, n8n auto-registra el webhook en Telegram. Verifica:

```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

#### 6. Conecta Nexus → bot (para notificación de leads)

1. Abre Nexus → **Configuración → Conexiones → 📩 Nuevo lead**
2. Pega la URL del webhook de tu workflow Etapa 1
3. Guardar

Esto persiste en `user_metadata.n8n_webhooks.lead_new` en Supabase — así `api/lead-capture.js` (que corre anónimo) puede leerlo y disparar.

### Arquitectura

```
┌─────────────────────┐
│  Telegram cliente   │ ← tu cel
└──────────┬──────────┘
           │ Bot API
┌──────────▼──────────┐         ┌──────────────────┐
│  Bot @web83737Bot   │────────►│  Telegram cloud  │
└──────────┬──────────┘         └─────────┬────────┘
           │                              │ webhook POST
           │                    ┌─────────▼────────┐
           │                    │   n8n trigger    │
           │                    └─────────┬────────┘
           │                              │
           │                    ┌─────────▼────────┐
           │                    │  Router (Code)   │
           │                    │  • parser        │
           │                    │  • cmd handler   │
           │                    │  • Gemini call   │
           │                    │  • Supabase query│
           │                    └─────────┬────────┘
           │                              │
           │                    ┌─────────▼────────┐
           │                    │   Supabase       │
           │                    │   • nodes        │
           │                    │   • properties   │
           │                    │   • property_leads│
           │                    │   • Storage      │
           │                    └──────────────────┘
           │
┌──────────▼──────────┐
│  propiedad.html     │ → /api/lead-capture → user_metadata → n8n webhook → Telegram
│  (form de lead)     │
└─────────────────────┘
```

### Seguridad

- Auth por `chat_id` hardcoded — solo tu Telegram recibe respuestas
- Service key de Supabase **inline** en el workflow (privado, en tu propio n8n)
- Bot token solo tú lo conoces — Telegram lo trata como password
- No expone endpoints públicos de Supabase
- El bot **no elimina datos** por diseño (sin importar el comando)

---

## 🆕 Novedades v2.6.0 — Mobile First

**A un paso del APK.** La app se reescribió pensando en tu cel:

| Feature | Detalle |
|---|---|
| 📱 **PWA Instalable** | Banner "Instalar Nexus OS" en Chrome/Safari. Queda como app nativa en home screen. Sin tiendas. |
| 🔍 **Search ⌘+K global** | Fuzzy search en TODOS los nodos + propiedades. Atajo de teclado o botón flotante en cel. |
| 🔔 **Push Notifications** | Web Push API + VAPID — estándar W3C. Sin Firebase, sin OneSignal. |
| ✉ **Emails vía n8n** | Tu propio n8n + SMTP. Sin Resend, sin lock-in. |
| 📦 **BYOS Storage** | Bring Your Own Storage: Drive, Dropbox, Nextcloud, S3 propio. |
| ✨ **Reportes IA Geomarketing** | POIs + clima + PESTEL/FODA con Gemini + OpenStreetMap + INEGI. |
| 📊 **Telemetría Privada** | Métricas de uso en TU Supabase. Nadie más las ve. |
| 🎨 **Design Tokens** | Sistema centralizado. Base para white-labeling futuro. |
| 🌟 **Reportes por inmueble** | Historial de reportes por propiedad con presentador personalizado. |
| 🗺 **Mapa Leaflet picker** | Para terrenos sin dirección clara. Geocoding inverso automático. |
| 🏷 **OG dinámico + JSON-LD** | Cuando compartes una propiedad en redes, sale título, imagen y precio reales. |

---

## 🆕 Novedades v2.5.0

### Módulo Inmuebles — 14 Plantillas PROFECO para Bienes Raíces

Nexus OS integra ahora un **motor documental inmobiliario completo** vinculado al gestor de propiedades. Cada propiedad tiene su propio historial de documentos guardado en Supabase y disponible para re-editar, re-exportar o eliminar en cualquier momento.

<p align="center">
  <img src="assets/screenshots/12-inmuebles-docs.png" alt="Módulo Inmuebles — 14 Plantillas PROFECO" width="800"/>
</p>

#### 🏡 Captación (7 plantillas)

| # | Plantilla | Campos auto-fill | Descripción |
|---|---|:---:|---|
| 1 | 📋 **Registro de Captación** | ✅ | Datos del inmueble, propietario y condiciones de captación |
| 2 | 📐 **Levantamiento de Inmueble** | ✅ | Medidas, colindancias, servicios, estado general |
| 3 | 🏠 **Ficha Técnica** | ✅ | Especificaciones completas para difusión |
| 4 | 👤 **Perfilamiento del Comprador** | ✅ | Necesidades, capacidad económica, plazos |
| 5 | 🔒 **Aviso de Privacidad** | ✅ | Formato oficial LFPDPPP para captación de datos |
| 6 | ⚖️ **Carta de Derechos** | ✅ | Derechos del consumidor inmobiliario (PROFECO) |
| 7 | ✍️ **Propuesta para Promoción Exclusiva** | ✅ | Plan de marketing 360° para exclusiva |

#### 🤝 Negociación (4 plantillas)

| # | Plantilla | Campos auto-fill | Descripción |
|---|---|:---:|---|
| 8 | 📝 **Contraoferta** | ✅ | Propuesta de contraprecio con condiciones |
| 9 | ✅ **Resolución A — Acepta** | ✅ | El comprador acepta la oferta en todos sus términos |
| 10 | 🔄 **Resolución B — Modifica** | ✅ | Acepta el principio de la oferta con modificaciones |
| 11 | ❌ **Resolución C — Rechaza** | ✅ | No es posible aceptar la contraoferta |

#### 📜 Contratos PROFECO (3 plantillas verbatim)

> **Texto oficial letra por letra** — sin adaptaciones, sin resúmenes. Cada `<<campo>>` del modelo PROFECO es un campo de formulario con auto-fill.

| # | Plantilla | Cláusulas | Anexos | Campos |
|---|---|:---:|:---:|:---:|
| 12 | 🏡 **CV Vivienda** — Compraventa de terreno | 21 | 8 (A–H) | ~100 |
| 13 | 🌱 **CV Terreno** — Contrato de adhesión PROFECO | 21 | 8 (A–H) | ~100 |
| 14 | 🏗️ **CV Preventa / En Planos** | 9+ | 4+ | ~40 |

**Características del motor documental inmobiliario:**
- **Auto-fill desde propiedad**: dirección, municipio, precio, nombre del propietario, datos del agente
- **Auto-fill desde agente**: nombre, teléfono, agencia, domicilio (desde localStorage)
- **Historial por propiedad** — guardado en `property_documents` en Supabase
- **Export PDF** — diseño listo para impresión con `jsPDF`
- **Export DOC** — descarga Word editable vía `Blob` HTML
- **Re-edición** — abre el documento guardado con todos los campos precargados
- **Enlace Par de Santos** — acceso directo a los originales desde el tab de documentos

---

## 🆕 Novedades v2.4.0

### Centro de Trámites — 10 Plantillas Legales

El módulo de documentos legales ahora cuenta con **10 plantillas** completamente funcionales (antes 5):

| # | Plantilla | Descripción |
|---|---|---|
| 1 | 📋 Prórroga de Pago de Renta | Solicitud formal al arrendador con motivo y fecha |
| 2 | 📜 Pagaré | Título de crédito con CURP/RFC/electoral y tabla de pagos en serie |
| 3 | 💰 Recibo de Dinero | Constancia con monto en número y letra, datos de identificación completos |
| 4 | ✍️ Carta Poder | Poder especial con 14 facultades seleccionables y testigos |
| 5 | 🤝 Contrato de Servicios | Contrato con 6+ cláusulas, vinculación a cotización, exportación DOC |
| 6 | 🧾 Reconocimiento de Adeudo | El deudor reconoce formalmente la deuda y fecha de pago |
| 7 | 🔏 NDA / Confidencialidad | Acuerdo de no divulgación con 7 cláusulas legales completas |
| 8 | 🤙 Convenio de Pago | Convenio en parcialidades con **tabla de amortización automática** |
| 9 | 🔧 Orden de Servicio | Autorización de trabajo técnico con costo y firma de conformidad |
| 10 | 📦 Carta Responsiva | Entrega de bienes en comodato con compromisos del responsable |

### Mejoras al módulo de Trámites

- **Forma de pago → Dropdown**: 9 opciones predefinidas (ya no texto libre)
- **Cotización vinculada en Contrato**: pre-llena descripción, monto y cliente automáticamente desde Cotizaciones
- **PDF Contrato**: cláusula OBJETO menciona el presupuesto/folio vinculado (Anexo A)
- **Exportación DOC**: descarga Word editable para Contrato y Carta Poder
- **Form Persistence**: al exportar un PDF se guarda snapshot del formulario → botón **✏️ Editar** en el historial
- **Auto-fill genérico**: todos los formularios nuevos rellenan datos desde tus contactos en un clic

---

## 📖 Acerca del Proyecto

<p align="center">
  <img src="assets/screenshots/01-panel-comandos.png" alt="Nexus OS — Panel de Comandos" width="800"/>
</p>

**Nexus OS** es un sistema operativo personal que vive en el navegador. Nació de una pregunta simple: *¿y si no tuvieras que decidir dónde guardar algo?* Solo escribes — el parser semántico detecta si es una tarea, un gasto, un ingreso, una nota o un evento, y lo enruta automáticamente a la vista correcta.

Todo en Nexus OS es un **Nodo** (`{type, content, metadata}`). Esto permite que una sola entrada fluya entre vistas: una nota puede convertirse en tarea, un gasto en evento del calendario, una cotización en proyecto activo — sin copiar, sin pegar, sin cambiar de app.

### 🛠️ Construido Con

<p align="left">
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite"/>
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript"/>
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS"/>
  <img src="https://img.shields.io/badge/DaisyUI-5A0EF8?style=for-the-badge&logo=daisyui&logoColor=white" alt="DaisyUI"/>
  <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase"/>
  <img src="https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel"/>
  <img src="https://img.shields.io/badge/jsPDF-FF5500?style=for-the-badge" alt="jsPDF"/>
  <img src="https://img.shields.io/badge/Chart.js-FF6384?style=for-the-badge&logo=chart.js&logoColor=white" alt="Chart.js"/>
  <img src="https://img.shields.io/badge/Lucide-F56040?style=for-the-badge" alt="Lucide Icons"/>
  <img src="https://img.shields.io/badge/Fuse.js-1B1F23?style=for-the-badge&logo=github&logoColor=white" alt="Fuse.js"/>
  <img src="https://img.shields.io/badge/SortableJS-FF4500?style=for-the-badge" alt="SortableJS"/>
</p>

---

## ✨ Características

| Característica | Descripción |
|---|---|
| ⚡ **Parser semántico** | Detecta tipo de entrada por prefijos: `#tarea`, `-$gasto @cuenta`, `+$ingreso @cuenta`, `#persona`, `#proyecto` |
| 🏗️ **Everything is a Node** | Un único modelo de datos fluye entre todas las vistas del sistema |
| 🔄 **Transform Note** | Convierte cualquier nodo en otro tipo sin perder datos (`nota → tarea`, `gasto → evento`) |
| 🔒 **Auth completa** | Login/registro con Supabase Auth — cada usuario solo ve sus propios datos (RLS) |
| 🖼️ **Adjuntos con Ctrl+V** | Pega imágenes directamente desde el portapapeles con compresión automática |
| 🔍 **Búsqueda global** | Fuzzy search con Fuse.js sobre todo el contenido, filtros por tipo y tag |
| 📊 **Dashboard ejecutivo** | KPIs tintados por tipo, próximos pagos con estado, distribución Kanban, abonos a vencer |
| 📅 **Pagos recurrentes avanzados** | Frecuencias: mensual · bimestral · trimestral · semestral · anual · bianual · trianual |
| ⚡ **Filtros rápidos** | Filtra movimientos por Todos / Ingresos / Gastos / Pendientes con un clic |
| 🟢 **Semáforo financiero** | Badge visual por tipo en cada fila: ingreso · gasto · evento · nota |
| 🎨 **Visual Upgrade** | Lucide Icons (~80), DaisyUI v5, micro-interacciones spring, tooltips glassmorphism |
| 💫 **Micro-interacciones** | Cards con lift on hover, botones con press scale, modales con slide-in, toasts animados |
| 📤 **Print / Export CSV** | Exporta transacciones y movimientos financieros en un clic |
| 📱 **PWA-ready** | Diseño responsivo, usable en móvil y tablet |
| 🎨 **Editor rico** | Bóveda Neural con colores de texto, resaltado, tamaños XS–3X y formato completo |
| 👤 **Ficha de contacto** | Perfil de página completa con tabs (Info/Docs/Pagos/Proyectos), foto, documentos |
| 💎 **Portafolio Crypto** | Seguimiento multi-moneda con edición de compras y precio actual |
| 📊 **Orquestador OTC** | Calculadora cripto-fiat con dispersión bancaria, semáforo, WhatsApp, PDF ejecutivo |
| 📜 **10 Plantillas Legales** | Documentos jurídicos con auto-fill desde contactos, export PDF y Word editable |
| 📋 **Form Persistence** | Guarda snapshot del formulario → re-abre con ✏️ Editar para re-exportar |
| 🤙 **Amortización automática** | Convenio de Pago genera tabla de cuotas por fecha y monto automáticamente |
| 🪙 **Bitso real-time** | Precio de venta USDT/BTC/ETH/XRP/SOL desde API Bitso en el OTC |
| 📋 **Histórico legal** | Documentos generados se guardan como nodos — busca, edita, reimprime o elimina |
| 🏡 **Módulo Inmuebles** | 14 plantillas legales para bienes raíces: captación, negociación y contratos PROFECO verbatim |
| 📜 **PROFECO Verbatim** | Contratos de adhesión PROFECO copiados letra por letra con ~100 campos de formulario |
| 🔗 **Documentos por Propiedad** | Historial de documentos vinculado a cada propiedad en Supabase con re-edición |

---

## 🗂️ Vistas del Sistema

Nexus OS tiene **9 vistas** accesibles desde la barra lateral:

| # | Vista | Descripción |
|---|---|---|
| 1 | 🖥️ **Panel de Comandos** | Dashboard ejecutivo con KPIs, próximos pagos, distribución de tareas Kanban, proyectos expandibles con deuda |
| 2 | 🗂️ **Muro Táctico** | Kanban drag & drop (Pendiente / En Progreso / Hecho). Modal de detalle por tarjeta |
| 3 | 💰 **Bio-Finanzas** | KPIs de cotizaciones, gráficos Chart.js (bar/donut/línea), mini-calendario financiero, filtros rápidos y semáforo visual 🟢🔴🟡 |
| 4 | 🧠 **Bóveda Neural** | Notas estilo Google Keep con editor de página completa, colores, etiquetas, pin y recordatorios |
| 5 | 📅 **Calendario** | Línea de tiempo con vistas mes / semana / día, sincronizado con tareas y eventos |
| 6 | 📜 **Crónica** | Histórico diario en 3 columnas: lo que pasó, decisiones tomadas, pendientes |
| 7 | 👥 **Contactos** | Directorio con ficha completa: foto, teléfonos, documentos, WhatsApp, historial de pagos |
| 8 | 🧮 **Herramientas** | Orquestador OTC, Centro de Trámites (10 plantillas), Utilidades |
| 9 | ❓ **Ayuda** | Guía interactiva completa de la sintaxis del parser y todas las funciones |
| — | 🏡 **Inmuebles** | Motor documental por propiedad — 14 plantillas PROFECO (accesible desde ficha de propiedad) |

---

## 🎬 Demo

<p align="center">
  <img src="assets/demo.gif" alt="Nexus OS — Demo animado" width="800"/>
</p>

> ¿No puedes ver el GIF? Revisa las capturas de pantalla por vista más abajo.

### 📸 Capturas por vista

<p align="center">
  <img src="assets/screenshots/01-panel-comandos.png" alt="Panel de Comandos" width="45%"/>
  &nbsp;&nbsp;
  <img src="assets/screenshots/02-muro-tactico.png" alt="Muro Táctico" width="45%"/>
</p>

<p align="center">
  <img src="assets/screenshots/03-bio-finanzas.png" alt="Bio-Finanzas" width="45%"/>
  &nbsp;&nbsp;
  <img src="assets/screenshots/04-boveda-neural.png" alt="Bóveda Neural" width="45%"/>
</p>

<p align="center">
  <img src="assets/screenshots/05-linea-de-tiempo.png" alt="Calendario" width="45%"/>
  &nbsp;&nbsp;
  <img src="assets/screenshots/06-cronica.png" alt="Crónica" width="45%"/>
</p>

<p align="center">
  <img src="assets/screenshots/07-contactos.png" alt="Contactos" width="45%"/>
  &nbsp;&nbsp;
  <img src="assets/screenshots/08-herramientas.png" alt="Herramientas" width="45%"/>
</p>

<p align="center">
  <img src="assets/screenshots/09-configuracion.png" alt="Proyectos" width="45%"/>
  &nbsp;&nbsp;
  <img src="assets/screenshots/10-ayuda.png" alt="Ayuda" width="45%"/>
</p>

### 📄 Centro de Trámites — 10 Plantillas Legales

<p align="center">
  <img src="assets/screenshots/11-tramites.png" alt="Centro de Trámites — 10 Plantillas" width="800"/>
</p>

*Todos los formularios se auto-llenan desde tu directorio de contactos (nombre, RFC, CLABE, domicilio). Los documentos se guardan en el historial y pueden re-editarse y re-exportarse en cualquier momento.*

---

## 👤 Contactos — Ficha Completa

El módulo de contactos es un **CRM ligero** integrado con el resto del sistema:

### Datos del contacto
- **Foto de perfil** — URL (Google Drive, Dropbox) o subir archivo (compresión automática + Supabase Storage)
- **Múltiples teléfonos** — con etiqueta (Personal, Trabajo, WhatsApp, Casa, Otro)
- **Múltiples emails** — con etiqueta (Personal, Trabajo, Facturación, Otro)
- **Dirección postal** — calle, C.P., estado, país
- **Fechas especiales** — 🎂 Cumpleaños y 💑 Aniversario
- **Cuentas de cobro** — CLABE, wallet crypto, efectivo (con botón copiar)
- **Roles** — Persona, Proveedor, Cliente, Colaborador (multi-selección)
- **Calificación** — 1 a 5 estrellas
- **Especialidades** — catálogo editable

### 📎 Documentos vinculados

| Tipo | Descripción |
|---|---|
| 🪪 INE / Credencial | Identificación oficial |
| 📋 CURP | Clave Única de Registro de Población |
| 📜 Acta de Nacimiento | Documento de nacimiento |
| 🛂 Pasaporte | Documento de viaje |
| 🧾 RFC / SAT | Registro fiscal |
| 📝 Contrato | Acuerdo de trabajo o servicios |
| ✍️ Firma | Rúbrica digitalizada |
| ⚖️ Poder Notarial | Representación legal |
| 🏠 Comprobante de Domicilio | Dirección verificada |
| 📷 Fotografía | Foto adicional |

---

## 🧮 Herramientas — Orquestador OTC + Centro de Trámites

El módulo se organiza en **3 tabs**:

### Tab 1: 📊 Orquestador OTC

Calculadora de operaciones cripto-fiat con dispersión bancaria inteligente:

| Bloque | Función |
|---|---|
| **Entrada de Operación** | Moneda, cantidad, T/C Bitso real-time, comisión reportada vs. real |
| **KPI Cards (2×2)** | Venta bruta, comisión cliente, neto a dispersar, ganancia operador |
| **Tabla de Dispersión** | Beneficiarios con autocomplete, Banco/CLABE auto-fill, monto fijo o % |
| **Semáforo** | Barra visual: 🟡 <100% · 🟢 100% · 🔴 >100% |
| **Mensaje WhatsApp** | Texto de pre-aprobación con dispersión completa |
| **Export PDF** | Estado de cuenta ejecutivo con KPIs, tabla y comprobantes |

### Tab 2: 📄 Centro de Trámites y Plantillas (v2.4.0)

**10 documentos legales** listos para usar:

| Plantilla | Auto-fill contactos | Export PDF | Export DOC | Tabla amortización |
|---|:---:|:---:|:---:|:---:|
| Prórroga de Renta | ✅ | ✅ | — | — |
| Pagaré | ✅ | ✅ | — | — |
| Recibo de Dinero | ✅ | ✅ | — | — |
| Carta Poder | ✅ | ✅ | ✅ | — |
| Contrato de Servicios | ✅ | ✅ | ✅ | — |
| Reconocimiento de Adeudo | ✅ | ✅ | — | — |
| NDA / Confidencialidad | ✅ | ✅ | — | — |
| Convenio de Pago | ✅ | ✅ | — | ✅ |
| Orden de Servicio | ✅ | ✅ | — | — |
| Carta Responsiva | ✅ | ✅ | — | — |

**Características del motor de documentos:**
- Todos los formularios se rellenan automáticamente desde tus **Contactos** (nombre, RFC, domicilio, CLABE)
- **Folio único** generado por documento (`NX-YYYYMMDD-XXXX`)
- **Justificación tipográfica** en el cuerpo legal (texto a dos columnas como notaría)
- **Regla MXN**: montos siempre en MXN como primario; USDT/USD solo como referencia comercial
- **Form snapshot**: al exportar, guarda todos los valores del formulario → botón **✏️ Editar** para re-exportar con cambios
- **Catálogo de cláusulas**: crea y reutiliza cláusulas personalizadas en cualquier contrato

### Tab 3: 🛠 Utilidades

Cronómetro, Cuenta Regresiva, Conversor Universal (Fiat ↔ Crypto), Calculadora Directa e Inversa.

---

## ⌨️ Sintaxis del Parser

El campo de entrada principal acepta lenguaje natural. El parser detecta automáticamente el tipo:

```
# Tareas / Kanban
#tarea reunión con cliente el viernes a las 10am
#proyecto rediseño web — para crear un proyecto nuevo

# Finanzas — gastos (con cuenta destino)
-$500 cena con equipo @efectivo
-$1200 renta mensual @banco
-$350.50 gasolina @tarjeta

# Finanzas — ingresos (con cuenta origen)
+$8000 sueldo quincenal @banco
+$2500 freelance logo @paypal @#proyecto-web

# Notas libres (todo lo demás)
recordar revisar el servidor mañana
idea: hacer una landing page para el cliente

# Personas / contactos
#persona Juan García — diseñador UX

# Cotizaciones
#cotizacion logo + branding $4500 @cliente-abc
```

### Modificadores de cuentas

| Prefijo | Tipo | Ejemplo |
|---|---|---|
| `-$monto @cuenta` | Gasto | `-$200 uber @efectivo` |
| `+$monto @cuenta` | Ingreso | `+$5000 proyecto @banco` |
| `@cuenta` sin monto | Tag de referencia | `@tarjeta` en cualquier nodo |

### Modificadores de fecha (chrono-node)

```
#tarea entregar propuesta mañana
#tarea llamar al cliente el lunes a las 9
#tarea pago de renta el 1 de cada mes
```

### Filtros de búsqueda

```
tipo:tarea                — solo tareas
tipo:gasto @efectivo      — gastos de una cuenta
#etiqueta                 — nodos con un tag específico
```

---

## 🚀 Comenzando

### Prerrequisitos

- [Node.js](https://nodejs.org/) >= 18
- Cuenta en [Supabase](https://supabase.com) (gratuita)
- Cuenta en [Vercel](https://vercel.com) (gratuita, opcional para deploy)

### 1. Clonar el repositorio

```sh
git clone https://github.com/oscaromargp/nexus-os.git
cd nexus-os
```

### 2. Instalar dependencias

```sh
npm install
```

### 3. Crear el proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com) → crea un proyecto nuevo
2. En el **SQL Editor**, ejecuta esta migración completa:

```sql
-- ============================================================
-- NEXUS OS — Schema v2.0
-- Ejecutar en: Supabase > SQL Editor
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabla principal: todos los datos son nodos
CREATE TABLE IF NOT EXISTS public.nodes (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content      TEXT        NOT NULL,
  type         TEXT        NOT NULL DEFAULT 'note'
                           CHECK (type IN (
                             'note','task','income','expense','kanban',
                             'persona','proyecto','cotizacion','milestone',
                             'bill','subscription','calendar','feedback'
                           )),
  metadata     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_nodes_owner_id ON public.nodes (owner_id);
CREATE INDEX IF NOT EXISTS idx_nodes_type     ON public.nodes (type);
CREATE INDEX IF NOT EXISTS idx_nodes_metadata ON public.nodes USING gin (metadata);

-- Row Level Security — cada usuario solo ve sus nodos
ALTER TABLE public.nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nodes_select_own" ON public.nodes
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "nodes_insert_own" ON public.nodes
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "nodes_update_own" ON public.nodes
  FOR UPDATE USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "nodes_delete_own" ON public.nodes
  FOR DELETE USING (auth.uid() = owner_id);
```

3. En **Settings → API**, copia tu `Project URL` y `anon public key`

### 4. Configurar variables de entorno

```sh
cp .env.example .env
```

Edita `.env`:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key-aqui
```

### 5. Iniciar en desarrollo

```sh
npm run dev
```

Abre [http://localhost:5173](http://localhost:5173) — crea tu cuenta y empieza a escribir.

---

## 📁 Estructura del Proyecto

```
nexus-os/
├── app.js                  # Lógica principal — parser, render engine, todas las vistas (~21 000 líneas)
├── app.html                # Shell HTML — estructura de vistas, modales y estilos (~3 000 líneas)
├── main.js                 # Entry point Vite — Supabase init, auth, router
├── style.css               # Design tokens y clases base (complementa Tailwind)
├── index.html              # Landing / login page
├── reset-password.html     # Flujo de recuperación de contraseña
├── src/
│   ├── parser.js           # Parser semántico v2 — detecta tipos, fechas, montos
│   ├── finance-engine.js   # Motor financiero — balances, running balance, periodos
│   ├── pdf-reports.js      # Motor de PDFs (jsPDF) — reportes + 10 plantillas legales
│   ├── docs-inmuebles.js   # Motor documental inmobiliario — 14 plantillas PROFECO
│   ├── supabase.js         # Singleton Supabase — evita múltiples GoTrueClient
│   ├── logic.js            # Lógica auxiliar compartida
│   └── __tests__/          # Tests unitarios (Vitest)
├── api/
│   └── bitso.js            # Proxy serverless Vercel — evita CORS con Bitso API
├── vite.config.js          # Config Vite (multi-page)
├── tailwind.config.js      # Config Tailwind + DaisyUI + tailwindcss-animate
├── vercel.json             # Config deploy Vercel (SPA routing)
├── docs/
│   └── database_schema.md  # Esquema SQL completo documentado
├── assets/
│   ├── banner.png          # Banner del proyecto
│   └── screenshots/        # Capturas por vista (01 a 10)
└── .env.example            # Plantilla de variables de entorno
```

### Funciones principales en `app.js`

| Función | Vista / Módulo |
|---|---|
| `renderPanelDashboard()` | Panel de Comandos — KPIs, pagos, distribución Kanban |
| `renderKanban()` | Muro Táctico — board Kanban drag & drop |
| `renderFinance()` | Bio-Finanzas — cuentas, transacciones, semáforo |
| `renderNotes()` | Bóveda Neural — grilla o editor full-page |
| `renderCalendar()` | Calendario / Línea de Tiempo |
| `renderCronica()` | Crónica — histórico diario |
| `renderContacts()` | Contactos — tarjetas del directorio |
| `openDocGen(type)` | Generador de documentos — abre formulario por tipo |
| `docGenFillParty()` | Auto-fill genérico desde contacto seleccionado |
| `docGenLinkCotizacion()` | Pre-popula contrato con datos de cotización vinculada |
| `editDoc(id)` | Reabre formulario con snapshot guardado para re-editar |
| `pdfReconocimientoAdeudo()` | PDF: Reconocimiento de Adeudo |
| `pdfNDA()` | PDF: NDA / Acuerdo de Confidencialidad |
| `pdfConvenioPago()` | PDF: Convenio de Pago con tabla de amortización |
| `pdfOrdenServicio()` | PDF: Orden de Servicio |
| `pdfCartaResponsiva()` | PDF: Carta Responsiva de bien entregado |
| `otcRecalc()` | Motor de cálculo OTC con truncamiento a 2 decimales |
| `otcFetchBitso()` | Consulta precio Bitso real-time |

### Funciones Inmuebles en `src/docs-inmuebles.js`

| Función / Export | Descripción |
|---|---|
| `TEMPLATES` | Array de 14 plantillas — cada una con `id`, `name`, `cat`, `desc`, `fields[]` |
| `CAT_META` | Metadatos de categorías: `captacion` (cyan) · `negociacion` (naranja) · `profeco` (morado) |
| `renderDocumentos(propId)` | Renderiza el tab de documentos para una propiedad — lista + botones de nueva plantilla |
| `loadPropertyDocs(propId)` | Carga documentos guardados desde `property_documents` en Supabase |
| `window.docOpenNew(propId, tplId)` | Abre el modal de formulario para un nuevo documento |
| `window.docOpenEdit(propId, docId)` | Abre el formulario con datos del documento guardado |
| `window.docSave(propId, tplId, docId)` | Guarda/actualiza el documento en Supabase |
| `window.docExportPDF(propId, docId)` | Genera y descarga el PDF del documento |
| `window.docExportDOC(propId, docId)` | Genera y descarga el Word editable (.doc) |
| `window.docDelete(propId, docId)` | Elimina el documento (con confirmación) |
| `_buildDocHTML(tplId, data)` | Construye el HTML verbatim con `{{campos}}` sin rellenar |
| `_fill(html, data)` | Reemplaza `{{campo}}` con valor o placeholder amarillo |
| `_autoFill(prop)` | Pre-rellena campos desde datos de propiedad y agente (localStorage) |
| `_exportPDF(html, filename)` | Imprime HTML como PDF usando `window.print()` |
| `_exportDOC(html, filename)` | Descarga HTML como `.doc` (Word editable) via Blob |

### Esquema Supabase — tabla `property_documents`

```sql
-- Migración adicional para el módulo Inmuebles
CREATE TABLE IF NOT EXISTS public.property_documents (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id  UUID        NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id  TEXT        NOT NULL,  -- ej. 'cv_terreno', 'propuesta_exclusiva'
  template_name TEXT       NOT NULL,
  data         JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- todos los campos del formulario
  status       TEXT        NOT NULL DEFAULT 'borrador',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prop_docs_property ON public.property_documents (property_id);
CREATE INDEX IF NOT EXISTS idx_prop_docs_user     ON public.property_documents (user_id);

ALTER TABLE public.property_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prop_docs_select_own" ON public.property_documents
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "prop_docs_insert_own" ON public.property_documents
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "prop_docs_update_own" ON public.property_documents
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "prop_docs_delete_own" ON public.property_documents
  FOR DELETE USING (auth.uid() = user_id);
```

### Funciones PDF en `src/pdf-reports.js`

| Función | Documento |
|---|---|
| `pdfProrroga(data, emisor)` | Prórroga de Pago de Renta |
| `pdfPagare(data, emisor)` | Pagaré |
| `pdfRecibo(data, emisor)` | Recibo de Dinero |
| `pdfCartaPoder(data, emisor)` | Carta Poder |
| `pdfContratoServicios(data, emisor)` | Contrato de Servicios |
| `pdfReconocimientoAdeudo(data, emisor)` | Reconocimiento de Adeudo *(nuevo v2.4)* |
| `pdfNDA(data, emisor)` | NDA / Confidencialidad *(nuevo v2.4)* |
| `pdfConvenioPago(data, emisor)` | Convenio de Pago en Parcialidades *(nuevo v2.4)* |
| `pdfOrdenServicio(data, emisor)` | Orden de Servicio *(nuevo v2.4)* |
| `pdfCartaResponsiva(data, emisor)` | Carta Responsiva *(nuevo v2.4)* |

---

## ☁️ Deploy

### Deploy en Vercel (recomendado)

```sh
# Instala Vercel CLI si no lo tienes
npm i -g vercel

# Deploy desde el directorio del proyecto
vercel --prod
```

**Variables de entorno en Vercel:**

Ve a tu proyecto en [vercel.com](https://vercel.com) → **Settings → Environment Variables** y agrega:

```
VITE_SUPABASE_URL      = https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY = tu-anon-key-aqui
```

El archivo `vercel.json` ya está configurado para manejar el routing de SPA:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### Build manual

```sh
npm run build   # Genera /dist
npm run preview # Preview local del build
```

---

## 🤝 Contribuyendo

¡Las contribuciones son bienvenidas! Si tienes ideas, mejoras o encuentras un bug:

1. Haz un fork del repositorio
2. Crea tu rama: `git checkout -b feature/mi-mejora`
3. Haz commit: `git commit -m 'feat: descripción clara del cambio'`
4. Push: `git push origin feature/mi-mejora`
5. Abre un Pull Request describiendo el cambio y por qué lo propones

**Guía de tipos de commit:**

| Prefijo | Uso |
|---|---|
| `feat:` | Nueva funcionalidad |
| `fix:` | Corrección de bug |
| `style:` | Cambios visuales / CSS |
| `refactor:` | Refactorización sin cambio de comportamiento |
| `docs:` | Documentación |

---

## 💖 Apoya este Proyecto

Si Nexus OS te fue útil o te ahorró tiempo, considera hacer una contribución. Esto me ayuda a seguir creando herramientas de código abierto.

<p align="center">
  <strong>Donaciones en Criptomonedas — Red XRP</strong><br><br>
  <img src="https://img.shields.io/badge/XRP-rBthUCndKy3Xbb19Ln4xkZeMwusX9NrYfj-00AAE4?style=for-the-badge&logo=ripple" alt="XRP Address"/>
</p>

> Dirección XRP: `rBthUCndKy3Xbb19Ln4xkZeMwusX9NrYfj`

---

## 📄 Licencia

Distribuido bajo la licencia MIT. Consulta el archivo [LICENSE](LICENSE) para más información.

---

## 📬 Contacto

<p align="center">
  <strong>Oscar Omar Gómez Peña</strong>
</p>

<p align="center">
  <a href="https://oscaromargp.github.io/Oscaromargp/">
    <img src="https://img.shields.io/badge/Portafolio-Web-blueviolet?style=for-the-badge&logo=github" alt="Portafolio"/>
  </a>
  &nbsp;
  <a href="https://github.com/oscaromargp">
    <img src="https://img.shields.io/badge/GitHub-oscaromargp-181717?style=for-the-badge&logo=github" alt="GitHub"/>
  </a>
</p>

<p align="center">
  <a href="https://github.com/oscaromargp/nexus-os">Ver Repositorio</a> &nbsp;·&nbsp;
  <a href="https://nexus-os-chi.vercel.app">Ver Demo en Vivo</a>
</p>

---

## 👥 Contribuidores

<a href="https://github.com/oscaromargp">
  <img src="https://github.com/oscaromargp.png" width="60" style="border-radius:50%" alt="oscaromargp"/>
</a>

---

## 🙏 Agradecimientos

<p align="center">
  <br/>
  <em>
    "Porque Dios es el que en vosotros produce<br/>
    así el querer como el hacer,<br/>
    por su buena voluntad."
  </em>
  <br/>
  <strong>— Filipenses 2:13</strong>
  <br/><br/>
  Todo lo que aquí existe nació primero como un deseo en el corazón.<br/>
  Cada proyecto, cada línea, cada idea que toma forma —<br/>
  es un regalo de Aquel que nos dio tanto el sueño como la fuerza de alcanzarlo.<br/>
  <strong>A Dios, toda la gloria.</strong>
  <br/>
</p>

---

- [Supabase](https://supabase.com) — por el backend serverless y la autenticación
- [Vite](https://vitejs.dev) — por el tooling de desarrollo ultrarrápido
- [jsPDF](https://github.com/parallax/jsPDF) — por el motor de generación de PDFs
- [jspdf-autotable](https://github.com/simonbengtsson/jsPDF-AutoTable) — por las tablas en PDF
- [Lucide](https://lucide.dev) — por el sistema de iconos SVG consistente (~80 iconos usados)
- [DaisyUI](https://daisyui.com) — por los componentes CSS (badges, tooltips, skeletons)
- [tailwindcss-animate](https://github.com/jamiebuilds/tailwindcss-animate) — por las clases de animación spring
- [Fuse.js](https://fusejs.io) — por el fuzzy search
- [Chrono-node](https://github.com/wanasit/chrono) — por el reconocimiento de fechas naturales
- [SortableJS](https://sortablejs.github.io/Sortable/) — por el drag & drop del Kanban
- [Chart.js](https://www.chartjs.org) — por los gráficos interactivos (donut, barras, líneas)
- [Shields.io](https://shields.io) — por los badges
- [Bitso API](https://bitso.com/api_info) — por los precios crypto en tiempo real
