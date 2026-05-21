<p align="center">
  <img src="assets/banner.png" alt="Nexus OS — Dashboard personal con parser semántico" width="100%"/>
</p>

<h1 align="center">Nexus OS</h1>

<p align="center">
  <strong>Dashboard personal all-in-one con parser semántico de lenguaje natural.<br/>
  Escribe como piensas — el sistema clasifica, registra y organiza solo.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.1.0-green?style=for-the-badge" alt="Version"/>
  <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="License"/>
  <img src="https://img.shields.io/badge/status-active-brightgreen?style=for-the-badge" alt="Status"/>
  <img src="https://img.shields.io/badge/deploy-Vercel-black?style=for-the-badge&logo=vercel" alt="Deploy Vercel"/>
  <img src="https://img.shields.io/badge/PRs-welcome-orange?style=for-the-badge" alt="PRs Welcome"/>
</p>

<p align="center">
  <a href="#-acerca-del-proyecto">Acerca</a> •
  <a href="#-características">Características</a> •
  <a href="#-vistas-del-sistema">Vistas</a> •
  <a href="#-contactos--ficha-completa">Contactos</a> •
  <a href="#-sintaxis-del-parser">Parser</a> •
  <a href="#-comenzando">Comenzando</a> •
  <a href="#-stack">Stack</a> •
  <a href="#-deploy">Deploy</a> •
  <a href="#-contacto">Contacto</a>
</p>

---

## 📖 Acerca del Proyecto

<p align="center">
  <img src="https://via.placeholder.com/800x450?text=Nexus+OS+Demo" alt="Nexus OS Demo" width="800"/>
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
</p>

---

## ✨ Características

| Característica | Descripción |
|---|---|
| ⚡ **Parser semántico** | Detecta tipo de entrada por prefijos: `#tarea`, `-$gasto`, `+$ingreso`, `@cuenta` |
| 🏗️ **Everything is a Node** | Un único modelo de datos fluye entre todas las vistas del sistema |
| 🔄 **Transform Note** | Convierte cualquier nodo en otro tipo sin perder datos (`nota → tarea`, `gasto → evento`) |
| 🔒 **Auth completa** | Login/registro con Supabase Auth — cada usuario solo ve sus propios datos (RLS) |
| 🖼️ **Adjuntos con Ctrl+V** | Pega imágenes directamente desde el portapapeles con compresión automática |
| 🔍 **Búsqueda global** | Fuzzy search con Fuse.js sobre todo el contenido, filtros por tipo y tag |
| 📊 **Dashboard ejecutivo** | KPIs, próximos pagos, proyectos activos, eventos de contactos próximos (30 días) |
| 📤 **Print / Export CSV** | Exporta transacciones y movimientos financieros en un clic |
| 📱 **PWA-ready** | Diseño responsivo, usable en móvil y tablet |
| 🎨 **Editor rico** | Bóveda Neural con colores de texto, resaltado, tamaños y formato completo |
| 📝 **Bóveda Neural full-page** | Editor de notas a página completa (igual que Contactos/Proyectos) con retorno a grilla |
| 👤 **Ficha de contacto** | Perfil de página completa con tabs (Info/Docs/Pagos/Proyectos), upload de foto, preview docs e impresión |
| 🖼️ **Upload de foto** | Sube fotos directamente (compresión automática + Supabase Storage) o pega URLs de Drive |
| 👁️ **Preview de documentos** | Lightbox con iframe para ver documentos Drive, PDFs e imágenes sin salir de la app |
| 🧾 **CEP universal** | Comprobante Electrónico de Pago accesible desde cualquier vista — clic en ingreso/gasto/cotización abre el detalle |
| 📥 **CSV masivo** | Importación masiva de contactos con 48 columnas y detección de duplicados por nombre (fuzzy) |
| 💎 **Portafolio Crypto** | Seguimiento multi-moneda con edición de compras y precio actual |
| 📋 **Paste limpio** | Pega texto sin formato por defecto — mantiene tu estilo limpio sin heredar fuentes externas |
| 🧹 **Limpiar formato** | Botón en la barra de herramientas del editor para eliminar formato de selección |
| 📊 **Stats visuales Kanban** | Donut chart, progress bar y gráfica semanal con Chart.js en Muro Táctico y Kanban de proyectos |
| 📈 **Reporte financiero** | Timeline de pagos con gráfica Chart.js, filtros por proveedor/fecha, comprobantes, deduplicación inteligente |
| 📄 **Cotización detalle** | Vista rica universal para cotizaciones: historial de pagos, comprobantes, notas/prórrogas, impresión |
| 🔗 **Auto-link a proyectos** | Al escribir en la línea de comandos dentro de un proyecto, el nodo se vincula automáticamente |
| 🧠 **Notas full-page en proyectos** | Editor de notas a página completa dentro del contexto de cada proyecto |
| 📊 **Orquestador OTC** | Calculadora cripto-fiat con comisiones, tabla de dispersión bancaria con semáforo, copiado rápido CLABE/monto, intersección con proyectos |
| 💬 **Mensaje WhatsApp OTC** | Genera texto pre-aprobación para validar dispersión con socio antes de enviar SPEIs |
| 🧾 **Comprobantes SPEI** | Drag & drop de capturas SPEI por beneficiario con export PDF ejecutivo |
| 💳 **Centro de Pagos** | Vista limpia de cuentas propias con botón gigante de copiar CLABE/cuenta para compartir con clientes |
| 📜 **Documentos legales** | Generador de pagarés, contratos de arrendamiento/compraventa, cartas poder y recomendación con auto-fill desde contactos |
| 🪙 **Bitso real-time** | Precio de venta USDT/BTC/ETH/XRP/SOL desde API Bitso en el OTC, editable manualmente |
| 📋 **Histórico legal** | Documentos generados se guardan como nodos — busca, reimprime o elimina del historial |
| 📊 **Stats en Panel** | Distribución de tareas Kanban (pendientes/progreso/completadas/vencidas) visible desde el Panel de Comandos |
| 🔍 **Resumen por proyecto** | Expandir cualquier proyecto en el Panel para ver tareas, deuda y botón de acceso directo |

---

## 🗂️ Vistas del Sistema

Nexus OS tiene **9 vistas** accesibles desde la barra lateral:

| Vista | Descripción |
|---|---|
| 🖥️ **Panel de Comandos** | Dashboard ejecutivo con KPI strip, próximos pagos, proyectos y widget de cumpleaños/aniversarios (30 días) |
| 🗂️ **Muro Táctico** | Kanban drag & drop por columnas (Pendiente / En Progreso / Hecho). Modal de detalle por tarjeta |
| 💰 **Bio-Finanzas** | Registro financiero multi-cuenta. Vista de cuentas con saldo disponible, modal de detalle y portafolio crypto |
| 🧠 **Bóveda Neural** | Notas estilo Google Keep con vista de página completa, editor rico, colores, etiquetas, pin y recordatorios |
| 📅 **Calendario** | Línea de tiempo con vistas mes / semana / día. Sincronizado con tareas y eventos del parser |
| 📜 **Crónica** | Histórico diario en 3 columnas: lo que pasó, decisiones tomadas, pendientes |
| 👥 **Contactos** | Directorio con ficha completa: foto, teléfonos múltiples, documentos Drive, WhatsApp, historial de pagos |
| 🧮 **Herramientas** | Módulo con 3 tabs: Orquestador OTC, Centro de Trámites y Plantillas, Utilidades |
| ❓ **Ayuda** | Guía interactiva completa de la sintaxis del parser y todas las funciones del sistema |

---

## 👤 Contactos — Ficha Completa

El módulo de contactos es un **CRM ligero** integrado con el resto del sistema:

### Datos del contacto
- **Foto de perfil** — URL (Google Drive, Dropbox, cualquier imagen pública)
- **Múltiples teléfonos** — con etiqueta (Personal, Trabajo, WhatsApp, Casa, Otro)
- **Múltiples emails** — con etiqueta (Personal, Trabajo, Facturación, Otro)
- **Dirección postal** — calle, C.P., estado, país
- **Fechas especiales** — 🎂 Cumpleaños y 💑 Aniversario
- **Cuentas de cobro** — CLABE, wallet crypto, efectivo (con botón copiar)
- **Roles** — Persona, Proveedor, Cliente, Colaborador (multi-selección)
- **Calificación** — 1 a 5 estrellas
- **Especialidades** — catálogo editable

### 📎 Documentos vinculados a Google Drive

Vincula archivos del contacto directamente desde Drive, Dropbox o cualquier servicio:

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

### 📄 Ficha de Perfil — Página completa con Tabs

Al hacer clic en cualquier tarjeta de contacto se abre la **Ficha de Perfil como vista completa** (igual que Proyectos):

- **Hero**: foto grande, nombre, roles, rating, especialidades, ciudad, RFC
- **Acciones rápidas**: 📞 Llamar, 💬 WhatsApp, ✉️ Email, 🧾 Copiar RFC, 🖨️ Imprimir, ✏️ Editar
- **Tab 📋 Info**: teléfonos, correos, dirección, fechas especiales, cuentas de cobro, notas
- **Tab 📎 Docs**: grid de documentos — clic abre **lightbox iframe** para preview dentro de la app
- **Tab 💰 Pagos**: historial financiero con totales de ingresos y egresos vinculados al contacto
- **Tab 🏗️ Proyectos**: proyectos donde aparece como equipo/cliente con acceso directo

### 📸 Foto de perfil — Dos métodos

1. **URL directa**: pega link de Google Drive (se auto-convierte), Dropbox o imagen pública
2. **Subir archivo**: botón `📎 Subir` → comprime a 400×400 JPEG → sube a Supabase Storage → se guarda como URL pública

### 🖨️ Impresión

Botón **🖨️ Imprimir** en la ficha genera una ventana de impresión limpia con todos los datos del contacto.

---

## 💰 Bio-Finanzas — Portafolio Crypto

Seguimiento de inversiones en criptomonedas sin depender de APIs externas:

- **KPIs**: total invertido, valor actual, ganancia/pérdida, rendimiento %
- **Tabla de monedas**: holdings, invertido, valor actual, ganancia por moneda
- **Historial de compras**: editable (✏️) y eliminable (✕)
- **Precio actual**: actualizable manualmente por moneda
- Monedas soportadas: XRP, BTC, ETH, USDT, SOL, MANA, ADA + cualquier otra

---

## 🧠 Bóveda Neural — Editor de Notas

Las notas se visualizan como tarjetas estilo Google Keep en una grilla. Al hacer clic en cualquier nota se abre un **editor de página completa** (igual que Contactos y Proyectos) con botón de retorno a la grilla.

### Vista de página completa
- **Header**: título editable, botón fijar/archivar, etiquetas, selector de color, recordatorio
- **Editor rico**: toolbar completa con formato de texto profesional
- **Adjuntos**: imágenes, PDFs y links — igual que en finanzas
- **Acciones**: guardar, eliminar, imprimir, copiar como Markdown

### Toolbar del editor

| Control | Función |
|---|---|
| Selector XS/Sm/Md/Lg/XL/2X/3X | Tamaño de texto |
| Botón **A** (color) | Color de texto (foreColor) |
| Botón **M** (resaltado) | Color de fondo / marcador (hiliteColor) |
| **B** / **I** / **U** / **S** | Negrita, Cursiva, Subrayado, Tachado |
| `• ≡` / `1. ≡` | Lista de viñetas / Lista numerada |
| `— —` | Separador horizontal |
| 🔗 | Insertar hipervínculo |
| `/` en el editor | Menú de bloques estilo Notion (párrafo, cita, listas, separador) |

---

## 🧮 Herramientas — Orquestador OTC + Centro de Trámites

El módulo de Herramientas se organiza en **3 tabs**:

### Tab 1: 📊 Orquestador OTC

Calculadora de operaciones cripto-fiat con dispersión bancaria inteligente:

| Bloque | Función |
|---|---|
| **Entrada de Operación** | Moneda, cantidad, T/C Bitso, comisión reportada vs. real — math truncada a 2 decimales |
| **KPI Cards** | Venta bruta, comisión, neto a dispersar, ganancia operador (toggle oculto) |
| **Tabla de Dispersión** | Beneficiarios con autocomplete de contactos, Banco/CLABE auto-fill, monto fijo o %, copiado rápido |
| **Semáforo** | Barra visual: amarillo (<100%), verde (100%), rojo (>100%) — bloquea exceso de fondos |
| **Intersección Proyectos** | Si el beneficiario tiene cotización pendiente, tag parpadeante `🔗 Vincular a Proyecto` |
| **Mensaje WhatsApp** | Genera texto de pre-aprobación con dispersión completa — copy al portapapeles |
| **Comprobantes SPEI** | Drag & drop de capturas por beneficiario |
| **Export PDF** | Estado de cuenta ejecutivo con KPIs, tabla, comprobantes |
| **Guardar en Nexus** | Inyecta abonos en cotizaciones vinculadas automáticamente |

### Tab 2: 📄 Centro de Trámites y Plantillas

| Sub-módulo | Función |
|---|---|
| **Datos de Pago** | Tus cuentas bancarias/crypto con botón gigante de copiar — para compartir con clientes |
| **Documentos Legales** | Generador de pagarés, contratos (arrendamiento, compraventa), carta poder, carta de recomendación |

Los documentos se auto-llenan con datos de tus **Contactos** (nombre, RFC, dirección, CLABE) y se exportan como PDF imprimible.

### Tab 3: 🛠 Utilidades

Herramientas de productividad: Cronómetro, Cuenta Regresiva, Conversor Universal (Fiat ↔ Crypto), Calculadora Directa e Inversa.

---

## ⌨️ Sintaxis del Parser

El campo de entrada principal acepta lenguaje natural. El parser detecta automáticamente el tipo:

```
# Tareas / Kanban
#tarea reunión con cliente el viernes a las 10am
#proyecto rediseño web — para crear un proyecto nuevo

# Finanzas — gastos
-$500 cena con equipo @efectivo
-$1200 renta mensual @banco
-$350.50 gasolina @tarjeta

# Finanzas — ingresos
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

**Modificadores de cuentas:**

| Prefijo | Tipo | Ejemplo |
|---|---|---|
| `-$monto @cuenta` | Gasto | `-$200 uber @efectivo` |
| `+$monto @cuenta` | Ingreso | `+$5000 proyecto @banco` |
| `@cuenta` sin monto | Tag de referencia | `@tarjeta` en cualquier nodo |

**Modificadores de fecha (via chrono-node):**

```
#tarea entregar propuesta mañana
#tarea llamar al cliente el lunes a las 9
#tarea pago de renta el 1 de cada mes
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

1. Ve a [supabase.com](https://supabase.com) → crea un proyecto
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

CREATE POLICY "nodes_select_own" ON public.nodes FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "nodes_insert_own" ON public.nodes FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "nodes_update_own" ON public.nodes FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "nodes_delete_own" ON public.nodes FOR DELETE USING (auth.uid() = owner_id);
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
├── app.js              # Lógica principal — parser, render engine, todas las vistas
├── app.html            # Shell HTML — estructura de vistas y modales
├── main.js             # Entry point Vite — Supabase init, auth, router
├── style.css           # Design tokens y clases base (complementa Tailwind)
├── index.html          # Landing / login page
├── reset-password.html # Flujo de recuperación de contraseña
├── src/
│   ├── parser.js       # Parser semántico v2 — detecta tipos, fechas, montos
│   ├── finance-engine.js # Motor financiero — balances, running balance, periodos
│   ├── logic.js        # Lógica auxiliar compartida
│   └── __tests__/      # Tests unitarios (Vitest)
├── vite.config.js      # Config Vite
├── tailwind.config.js  # Config Tailwind CSS
├── vercel.json         # Config deploy Vercel (SPA routing)
├── docs/
│   └── database_schema.md   # Esquema SQL completo documentado
├── scripts/
│   └── take-screenshots.mjs # Utilidad para generar screenshots
├── assets/             # Banner, screenshots por vista
├── public/             # manifest.json, service worker
└── .env.example        # Plantilla de variables de entorno
```

**Funciones principales en `app.js`:**

| Función | Vista / Módulo |
|---|---|
| `renderPanelDashboard()` | Panel de Comandos — dashboard ejecutivo |
| `renderKanban()` | Muro Táctico — board Kanban |
| `renderFinance()` | Bio-Finanzas — cuentas y transacciones |
| `renderCryptoPortfolio()` | Portafolio Crypto (dentro de Bio-Finanzas) |
| `renderNotes()` | Bóveda Neural — grilla o editor full-page |
| `renderCalendar()` | Calendario / Línea de Tiempo |
| `renderCronica()` | Crónica — histórico diario |
| `renderProyectos()` | Proyectos — dashboard + finanzas |
| `renderContacts()` | Contactos — tarjetas del directorio |
| `openContactProfile(id)` | Ficha completa de contacto |
| `openNoteFullPage(id)` | Editor full-page de nota (Bóveda Neural) |
| `openProjNote_fp(id)` | Editor full-page de nota dentro de proyecto |
| `buildNoteBlockEditor()` | Editor rico con colores/tamaños/paste limpio |
| `printFinanceCEP()` | Comprobante Electrónico de Pago (accesible desde cualquier vista) |
| `printProjectReport(id)` | Reporte financiero con filtros (proveedor, fecha), gráfica Chart.js y deduplicación |
| `openCotizacionDetail(id)` | Vista detalle rica de cotización con historial de pagos y comprobantes |
| `printCotizacionDetail(id)` | Imprimir historial de pagos de una cotización con tabla detallada |
| `importContactsCSV()` | Importación masiva CSV con detección de duplicados |
| `_buildPaymentTimeline()` | Timeline de pagos con KPIs, tabla, comprobantes y duración |
| `_initProjKanbanChart(d)` | Donut chart de tareas en Kanban de proyecto |
| `switchHerrTab(tab)` | Navegación entre tabs de Herramientas (OTC / Trámites / Utilidades) |
| `otcRecalc()` | Motor de cálculo OTC con truncamiento a 2 decimales |
| `otcAddRow()` / `otcRenderTable()` | Tabla de dispersión bancaria con autocomplete de contactos |
| `otcCopyWhatsApp()` | Genera y copia mensaje de pre-aprobación WhatsApp |
| `otcExportPDF()` | Exporta estado de cuenta ejecutivo en PDF |
| `otcSaveToNodes()` | Inyecta abonos en cotizaciones vinculadas a proyectos |
| `renderTramitesCuentas()` | Renderiza cuentas propias con botón copiar |
| `openDocGen(type)` | Generador de documentos legales con auto-fill desde Contactos |
| `docGenExport()` | Exporta documento legal como PDF imprimible |

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
3. Haz commit con mensaje descriptivo: `git commit -m 'feat: descripción clara del cambio'`
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
- [Fuse.js](https://fusejs.io) — por el fuzzy search
- [Chrono-node](https://github.com/wanasit/chrono) — por el reconocimiento de fechas naturales
- [SortableJS](https://sortablejs.github.io/Sortable/) — por el drag & drop del Kanban
- [Chart.js](https://www.chartjs.org) — por los gráficos interactivos (donut, barras, líneas)
- [Shields.io](https://shields.io) — por los badges
- [awesome-readme](https://github.com/matiassingers/awesome-readme) — por la inspiración
