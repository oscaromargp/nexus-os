<p align="center">
  <img src="assets/banner.png" alt="Nexus OS — Dashboard personal con parser semántico" width="100%"/>
</p>

<h1 align="center">Nexus OS</h1>

<p align="center">
  <strong>Dashboard personal all-in-one con parser semántico de lenguaje natural.<br/>
  Escribe como piensas — el sistema clasifica, registra y organiza solo.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.3.0-green?style=for-the-badge" alt="Version"/>
  <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="License"/>
  <img src="https://img.shields.io/badge/status-active-brightgreen?style=for-the-badge" alt="Status"/>
  <img src="https://img.shields.io/badge/deploy-Vercel-black?style=for-the-badge&logo=vercel" alt="Deploy Vercel"/>
  <img src="https://img.shields.io/badge/PRs-welcome-orange?style=for-the-badge" alt="PRs Welcome"/>
  <img src="https://img.shields.io/badge/made%20with-❤️-red?style=for-the-badge" alt="Made with love"/>
</p>

<p align="center">
  <a href="#-acerca-del-proyecto">Acerca</a> •
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
  <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase"/>
  <img src="https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel"/>
  <img src="https://img.shields.io/badge/Chart.js-FF6384?style=for-the-badge&logo=chart.js&logoColor=white" alt="Chart.js"/>
  <img src="https://img.shields.io/badge/Lucide-F56040?style=for-the-badge&logo=lucide&logoColor=white" alt="Lucide Icons"/>
  <img src="https://img.shields.io/badge/DaisyUI-5A0EF8?style=for-the-badge&logo=daisyui&logoColor=white" alt="DaisyUI"/>
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
| 📊 **Dashboard ejecutivo** | KPIs tintados por tipo, próximos pagos con estado, distribución Kanban, abonos a vencer, próximos a liquidar |
| 🔢 **KPI de cotizaciones** | Abonos a vencer (30 días) y proyectos próximos a liquidar (≥70%) en Panel de Comandos |
| 📅 **Pagos recurrentes avanzados** | Frecuencias: mensual · bimestral · trimestral · semestral · anual · bianual · trianual. Fecha específica para anclar mes+día exacto |
| ⚡ **Filtros rápidos** | Filtra movimientos del Feed y Bio-Finanzas por Todos / Ingresos / Gastos con un clic |
| 🟢 **Semáforo financiero** | Cada fila del log muestra badge visual por tipo: ingreso · gasto · evento · nota |
| 🎨 **Visual Upgrade v2.3** | Lucide Icons (~80 iconos), DaisyUI v5, tailwindcss-animate, micro-interacciones spring, tooltips glassmorphism |
| 💫 **Micro-interacciones** | Cards con lift on hover, botones con press scale, modales con slide-in, toasts animados, skeleton de carga |
| 🏷️ **Badge system** | `nxBadge()` unificado: 10 tipos de nodo + 4 estados Kanban con iconos Lucide contextuales |
| 🖼️ **Empty states** | Ilustraciones SVG propias (paleta cyan Nexus) en 6 vistas: Feed, Notas, Kanban, Contactos, Búsqueda, Finanzas |
| 📤 **Print / Export CSV** | Exporta transacciones y movimientos financieros en un clic |
| 📱 **PWA-ready** | Diseño responsivo, usable en móvil y tablet |
| 🎨 **Editor rico** | Bóveda Neural con colores de texto, resaltado, tamaños XS–3X y formato completo |
| 👤 **Ficha de contacto** | Perfil de página completa con tabs (Info/Docs/Pagos/Proyectos), upload de foto, preview docs e impresión |
| 🧾 **CEP universal** | Comprobante Electrónico de Pago accesible desde cualquier vista |
| 📥 **CSV masivo** | Importación masiva de contactos con 48 columnas y detección de duplicados (fuzzy) |
| 💎 **Portafolio Crypto** | Seguimiento multi-moneda con edición de compras y precio actual |
| 📊 **Stats visuales** | Donut chart, progress bar y gráfica semanal con Chart.js en Kanban y proyectos |
| 📈 **Reporte financiero** | Timeline de pagos con gráfica, filtros por proveedor/fecha, comprobantes |
| 📊 **Orquestador OTC** | Calculadora cripto-fiat con dispersión bancaria, semáforo, WhatsApp, PDF ejecutivo |
| 💳 **Centro de Pagos** | Cuentas propias con botón copiar CLABE/cuenta para compartir con clientes |
| 📜 **Documentos legales** | Pagarés, contratos, cartas poder y recomendación con auto-fill desde contactos |
| 🪙 **Bitso real-time** | Precio de venta USDT/BTC/ETH/XRP/SOL desde API Bitso en el OTC |
| 📋 **Histórico legal** | Documentos generados se guardan como nodos — busca, reimprime o elimina |

---

## 🗂️ Vistas del Sistema

Nexus OS tiene **9 vistas** accesibles desde la barra lateral:

| # | Vista | Descripción |
|---|---|---|
| 1 | 🖥️ **Panel de Comandos** | Dashboard ejecutivo con KPIs, próximos pagos, distribución de tareas Kanban, proyectos expandibles con deuda |
| 2 | 🗂️ **Muro Táctico** | Kanban drag & drop (Pendiente / En Progreso / Hecho). Modal de detalle por tarjeta |
| 3 | 💰 **Bio-Finanzas** | Dashboard financiero con pirámide de información: KPIs de cotizaciones pendientes + vencimiento crítico, gráficos Chart.js (bar/donut/línea), mini-calendario financiero con abonos, filtros rápidos [Todos/Ingresos/Gastos/Pendientes] y semáforo visual 🟢🔴🟡 por movimiento |
| 4 | 🧠 **Bóveda Neural** | Notas estilo Google Keep con editor de página completa, colores, etiquetas, pin y recordatorios |
| 5 | 📅 **Calendario** | Línea de tiempo con vistas mes / semana / día, sincronizado con tareas y eventos |
| 6 | 📜 **Crónica** | Histórico diario en 3 columnas: lo que pasó, decisiones tomadas, pendientes |
| 7 | 👥 **Contactos** | Directorio con ficha completa: foto, teléfonos, documentos, WhatsApp, historial de pagos |
| 8 | 🧮 **Herramientas** | Orquestador OTC, Centro de Trámites y Plantillas, Utilidades |
| 9 | ❓ **Ayuda** | Guía interactiva completa de la sintaxis del parser y todas las funciones |

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
  <img src="assets/screenshots/09-configuracion.png" alt="Configuración" width="45%"/>
  &nbsp;&nbsp;
  <img src="assets/screenshots/10-ayuda.png" alt="Ayuda" width="45%"/>
</p>

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

### Ficha de Perfil — Página completa con Tabs

- **Hero**: foto grande, nombre, roles, rating, especialidades, ciudad, RFC
- **Acciones rápidas**: 📞 Llamar · 💬 WhatsApp · ✉️ Email · 🧾 Copiar RFC · 🖨️ Imprimir · ✏️ Editar
- **Tab 📋 Info**: teléfonos, correos, dirección, fechas especiales, cuentas de cobro, notas
- **Tab 📎 Docs**: grid de documentos con lightbox iframe para preview dentro de la app
- **Tab 💰 Pagos**: historial financiero con totales de ingresos y egresos vinculados
- **Tab 🏗️ Proyectos**: proyectos donde aparece como equipo/cliente con acceso directo

---

## 🧮 Herramientas — Orquestador OTC + Centro de Trámites

El módulo se organiza en **3 tabs**:

### Tab 1: 📊 Orquestador OTC

Calculadora de operaciones cripto-fiat con dispersión bancaria inteligente:

| Bloque | Función |
|---|---|
| **Entrada de Operación** | Moneda, cantidad, T/C Bitso real-time, comisión reportada vs. real |
| **KPI Cards (2×2)** | Venta bruta, comisión cliente, neto a dispersar, ganancia operador (toggle oculto) |
| **Tabla de Dispersión** | Beneficiarios con autocomplete de contactos, Banco/CLABE auto-fill, monto fijo o %, copiar rápido |
| **Semáforo** | Barra visual: 🟡 <100% · 🟢 100% · 🔴 >100% — bloquea exceso de fondos |
| **Intersección Proyectos** | Si el beneficiario tiene cotización pendiente → tag parpadeante `🔗 Vincular a Proyecto` |
| **Mensaje WhatsApp** | Texto de pre-aprobación con dispersión completa — copiar al portapapeles |
| **Comprobantes SPEI** | Drag & drop de capturas por beneficiario |
| **Export PDF** | Estado de cuenta ejecutivo con KPIs, tabla, comprobantes |
| **Guardar en Nexus** | Inyecta abonos en cotizaciones vinculadas automáticamente |

### Tab 2: 📄 Centro de Trámites y Plantillas

| Sub-módulo | Función |
|---|---|
| **Datos de Pago** | Tus cuentas bancarias/crypto con botón gigante copiar — para compartir con clientes |
| **Documentos Legales** | Pagarés, contratos (arrendamiento, compraventa), carta poder, carta de recomendación |
| **Histórico** | Documentos generados se guardan como nodos — busca, reimprime o elimina |

Los documentos se auto-llenan con datos de tus **Contactos** (nombre, RFC, dirección, CLABE) y se exportan como PDF imprimible.

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
├── app.js                  # Lógica principal — parser, render engine, todas las vistas (~12 000 líneas)
├── app.html                # Shell HTML — estructura de vistas, modales y estilos (~5 000 líneas)
├── main.js                 # Entry point Vite — Supabase init, auth, router
├── style.css               # Design tokens y clases base (complementa Tailwind)
├── index.html              # Landing / login page
├── reset-password.html     # Flujo de recuperación de contraseña
├── src/
│   ├── parser.js           # Parser semántico v2 — detecta tipos, fechas, montos
│   ├── finance-engine.js   # Motor financiero — balances, running balance, periodos
│   ├── logic.js            # Lógica auxiliar compartida
│   └── __tests__/          # Tests unitarios (Vitest)
├── vite.config.js          # Config Vite (multi-page)
├── tailwind.config.js      # Config Tailwind + DaisyUI + tailwindcss-animate
├── vercel.json             # Config deploy Vercel (SPA routing)
├── docs/
│   └── database_schema.md  # Esquema SQL completo documentado
├── scripts/
│   └── take-screenshots.mjs # Utilidad para generar screenshots
├── assets/
│   ├── banner.png          # Banner del proyecto
│   └── screenshots/        # Capturas por vista (01 a 10)
├── public/
│   ├── manifest.json       # PWA manifest
│   ├── sw.js               # Service Worker
│   └── empty/              # SVGs de empty states (no-data, no-tasks, no-finance, no-notes, no-contacts, no-search)
└── .env.example            # Plantilla de variables de entorno
```

### Funciones principales en `app.js`

| Función | Vista / Módulo |
|---|---|
| `renderPanelDashboard()` | Panel de Comandos — KPIs, pagos, distribución Kanban, abonos |
| `renderKanban()` | Muro Táctico — board Kanban drag & drop |
| `renderFinance()` | Bio-Finanzas — cuentas, transacciones, semáforo |
| `renderNotes()` | Bóveda Neural — grilla o editor full-page |
| `renderCalendar()` | Calendario / Línea de Tiempo |
| `renderCronica()` | Crónica — histórico diario |
| `renderProyectos()` | Proyectos — dashboard + finanzas + Kanban |
| `renderContacts()` | Contactos — tarjetas del directorio |
| `calcNextDueDate(freq, dayOfMonth, weekday, customDays, specificDate)` | Calcula próxima fecha de vencimiento (soporta bianual/trianual) |
| `feedItemHtml(n)` | HTML de una fila del Feed con `nxBadge()` y Lucide icons |
| `nxBadge(label, opts)` | Genera pill de badge unificado con icono Lucide opcional |
| `NX_TYPE_BADGE[type]()` | Badge preconfigurado por tipo de nodo (10 tipos) |
| `NX_STATUS_BADGE[status]()` | Badge de estado Kanban (todo/in_progress/done/archived) |
| `nxEmptyState({ img, title, sub, cta })` | HTML de empty state con SVG + texto + botón CTA |
| `lx(name, size, cls, opts)` | Genera SVG string de Lucide para uso en innerHTML templates |
| `refreshIcons()` | Activa `data-lucide="..."` en DOM tras cada render |
| `_renderSkeletonFeed()` | Muestra skeleton de 5 filas shimmer mientras carga datos |
| `openContactProfile(id)` | Ficha completa de contacto con tabs |
| `buildNoteBlockEditor()` | Editor rico con colores/tamaños/paste limpio |
| `printFinanceCEP()` | Comprobante Electrónico de Pago |
| `printProjectReport(id)` | Reporte financiero con Chart.js |
| `openCotizacionDetail(id)` | Detalle de cotización con historial de pagos |
| `importContactsCSV()` | Importación masiva CSV con detección de duplicados |
| `otcRecalc()` | Motor de cálculo OTC con truncamiento a 2 decimales |
| `otcFetchBitso()` | Consulta precio Bitso real-time |
| `otcCopyWhatsApp()` | Genera mensaje de pre-aprobación WhatsApp |
| `otcExportPDF()` | Exporta estado de cuenta ejecutivo en PDF |
| `openDocGen(type)` | Generador de documentos legales con auto-fill |

---

## ☁️ Deploy

### Deploy en Vercel (recomendado)

```sh
# Instala Vercel CLI si no lo tienes
npm i -g vercel

# Deploy desde el directorio del proyecto
vercel

# Para producción
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
  <a href="https://github.com/oscaromargp/nexus-os">Ver Repositorio</a>
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
- [Lucide](https://lucide.dev) — por el sistema de iconos SVG consistente (~80 iconos usados)
- [DaisyUI](https://daisyui.com) — por los componentes CSS (badges, tooltips, skeletons)
- [tailwindcss-animate](https://github.com/jamiebuilds/tailwindcss-animate) — por las clases de animación spring
- [Fuse.js](https://fusejs.io) — por el fuzzy search
- [Chrono-node](https://github.com/wanasit/chrono) — por el reconocimiento de fechas naturales
- [SortableJS](https://sortablejs.github.io/Sortable/) — por el drag & drop del Kanban
- [Chart.js](https://www.chartjs.org) — por los gráficos interactivos (donut, barras, líneas)
- [Shields.io](https://shields.io) — por los badges
- [Bitso API](https://bitso.com/api_info) — por los precios crypto en tiempo real
