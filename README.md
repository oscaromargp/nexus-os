<p align="center">
  <img src="assets/banner.png" alt="Nexus OS" width="100%"/>
</p>

<p align="center">
  <img src="https://via.placeholder.com/1200x360/02040a/00F6FF?text=⬡+NEXUS+OS+—+Dashboard+Personal+con+Parser+Semántico" alt="Nexus OS Banner" width="100%"/>
</p>

<h1 align="center">⬡ Nexus OS</h1>

<p align="center">
  <strong>Dashboard personal con parser semántico natural — captura todo, entiende todo, conecta todo.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="License"/>
  <img src="https://img.shields.io/badge/versión-4.1-green?style=for-the-badge" alt="Version"/>
  <img src="https://img.shields.io/badge/estado-activo-brightgreen?style=for-the-badge" alt="Status"/>
  <img src="https://img.shields.io/badge/deploy-Vercel-black?style=for-the-badge&logo=vercel" alt="Vercel"/>
  <img src="https://img.shields.io/badge/backend-Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase"/>
  <img src="https://img.shields.io/badge/PRs-welcome-orange?style=for-the-badge" alt="PRs"/>
  <img src="https://img.shields.io/badge/hecho%20con-❤️-red?style=for-the-badge" alt="Made with love"/>
</p>

<p align="center">
  <a href="#-acerca-del-proyecto">Acerca</a> •
  <a href="#-características">Características</a> •
  <a href="#-demo">Demo</a> •
  <a href="#-comenzando">Comenzando</a> •
  <a href="#-parser-semántico">Parser</a> •
  <a href="#-vistas">Vistas</a> •
  <a href="#️-estructura-del-proyecto">Estructura</a> •
  <a href="#️-deploy-a-vercel">Deploy</a> •
  <a href="#-contacto">Contacto</a>
</p>

---

## 📖 Acerca del Proyecto

<p align="center">
  <img src="https://via.placeholder.com/700x420/0d1117/00F6FF?text=Panel+de+Comandos+—+Nexus+OS+v4.1" alt="Nexus OS — Panel de Comandos" width="700"/>
</p>

**Nexus OS** es un sistema operativo personal que vive en el navegador. En lugar de formularios y menús, usas lenguaje natural: escribes una línea y el parser semántico detecta si es una tarea, un gasto, un ingreso, una cotización o un evento, y lo enruta automáticamente a la vista correcta.

Construido como SPA de una sola página sin frameworks pesados, con persistencia real en **Supabase** y deploy instantáneo en **Vercel**. Diseñado para quienes manejan proyectos de construcción, proveedores, finanzas personales y notas estratégicas en un solo lugar.

La filosofía: **"Everything is a Node"** — tareas, gastos, notas, contactos y proyectos son todos nodos unificados diferenciados por `type` + `metadata` JSONB. Una sola tabla, toda la potencia.

### 🛠️ Construido Con

<p align="left">
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite"/>
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript"/>
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind"/>
  <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase"/>
  <img src="https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel"/>
  <img src="https://img.shields.io/badge/Fuse.js-FF6B35?style=for-the-badge" alt="Fuse.js"/>
</p>

---

## ✨ Características

| Característica | Descripción |
|---|---|
| 🧠 **Parser Semántico** | Escribe en lenguaje natural — detecta tipo, cuenta (`@cuenta`), monto, proyecto y etiquetas automáticamente |
| 🏗️ **Proyectos** | Dashboard financiero con 5 KPIs, gráfica SVG donut, desglose por categoría y proveedor tipo tabla dinámica, hitos con responsable y fecha, cotizaciones con historial de abonos |
| 📌 **Muro Táctico** | Kanban estilo Trello: cover image, etiquetas de color, checklists con barra de progreso, adjuntos y modal de detalle completo |
| 📄 **Cotizaciones** | CRUD con categorías, estados, auto-link a proyecto, historial de abonos por cotización con método de pago y URL de comprobante |
| 💹 **Bio-Finanzas** | Multi-cuenta, semáforo en tiempo real, gráficas reactivas, export CSV, filtro por cuenta/tipo |
| 🧠 **Bóveda Neural** | Notas estilo Google Keep con editor de texto enriquecido (negrita, color, listas, imágenes), adjuntos por `Ctrl+V`, filtro por tags |
| 📅 **Línea de Tiempo** | Calendario con vistas mes / semana / día — eventos de tareas, gastos e ingresos en un solo lugar |
| 📖 **Crónica** | Histórico diario en 3 columnas: tareas completadas, movimientos financieros, notas del día |
| 🔍 **Búsqueda Global** | Por tipo, tag, contenido — filtro instantáneo con Fuse.js en todo el historial |
| 🔄 **Transform Note** | Convierte cualquier nota en tarea, gasto, ingreso o evento con un clic |
| 🖨️ **Print / Export CSV** | Imprime la vista activa o descarga CSV de cualquier módulo. Backup completo en JSON |
| ⚙️ **Configuración** | Importar transacciones, contactos y proyectos desde CSV con validación y preview antes de confirmar |

---

## 🎬 Demo

<p align="center">
  <img src="https://via.placeholder.com/700x420/0d1117/fb923c?text=Demo+GIF+—+Próximamente" alt="Demo animado" width="700"/>
</p>

> GIF en proceso. Mientras tanto, prueba el proyecto en vivo:
> **[nexus-os-chi.vercel.app](https://nexus-os-chi.vercel.app)**

---

## 🚀 Comenzando

### Prerrequisitos

- [Node.js](https://nodejs.org/) `>= 18`
- Cuenta en [Supabase](https://supabase.com) — plan gratuito suficiente
- Cuenta en [Vercel](https://vercel.com) — plan gratuito suficiente

### 1. Clonar e instalar

```sh
git clone https://github.com/oscaromargp/nexus-os.git
cd nexus-os
npm install
```

### 2. Migración SQL en Supabase

Entra a tu proyecto de Supabase → **SQL Editor** → pega y ejecuta:

```sql
-- ============================================================
-- NEXUS OS — Schema v4.1
-- Ejecutar en: Supabase > SQL Editor
-- ============================================================

-- Extensión UUID (ya habilitada por defecto en Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabla principal: todos los elementos son nodos
CREATE TABLE IF NOT EXISTS public.nodes (
  id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id    UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     TEXT          NOT NULL DEFAULT '',
  type        TEXT          NOT NULL DEFAULT 'note'
              CHECK (type IN (
                'note', 'task', 'income', 'expense',
                'kanban', 'persona', 'proyecto', 'event'
              )),
  metadata    JSONB         NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_nodes_owner_id   ON public.nodes (owner_id);
CREATE INDEX IF NOT EXISTS idx_nodes_type       ON public.nodes (type);
CREATE INDEX IF NOT EXISTS idx_nodes_created_at ON public.nodes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nodes_metadata   ON public.nodes USING gin (metadata);

-- Row Level Security: cada usuario ve y modifica solo sus nodos
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

### 3. Variables de entorno

```sh
cp .env.example .env
```

Edita `.env` con los valores de tu proyecto (Supabase → **Project Settings → API**):

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 4. Correr en local

```sh
npm run dev
# Abre http://localhost:5173/app.html
```

---

## 🧠 Parser Semántico

El corazón de Nexus OS. Escribe una línea en el campo de entrada — el sistema detecta tipo, extrae monto, cuenta, proyecto y etiquetas sin que toques un formulario.

### Sintaxis completa

| Patrón | Tipo detectado | Ejemplo |
|---|---|---|
| `#tarea texto` | ✅ Tarea / Kanban | `#tarea llamar al arquitecto #casatulum` |
| `-$monto @cuenta` | 💸 Gasto | `-$850 cemento @efectivo #casatulum` |
| `+$monto @cuenta` | 💰 Ingreso | `+$12000 pago cliente @bbva` |
| `#cotizacion $monto` | 📄 Cotización | `#cotizacion $45000 instalación eléctrica @casatulum` |
| `#proyecto nombre` | 🏗️ Proyecto nuevo | `#proyecto Casa Centenario` |
| `#persona nombre` | 👤 Contacto | `#persona Carlos electricista` |
| texto libre | 📝 Nota | `revisar planos mañana con el arquitecto` |

### Modificadores

| Símbolo | Función |
|---|---|
| `@cuenta` | Vincula el movimiento a una cuenta (efectivo, bbva, crypto…) |
| `#tag` | Etiqueta libre — si coincide con el slug de un proyecto, aparece en "Pagado" del dashboard financiero |
| `@proyecto` en cotización | Auto-link al proyecto (aparece en su sección de cotizaciones) |

### Ejemplos reales

```
-$1200 cemento @efectivo #casatulum
+$25000 anticipo diseño @bbva #freelance
#tarea confirmar entrega de ventanas #casatulum
#cotizacion $38500 impermeabilización techo @casatulum
nota libre: el contratista llega el lunes a las 9am
#persona Juan Pérez plomero tel:612-555-1234
```

---

## 🗂️ Vistas

| Vista | Ícono | Descripción |
|---|---|---|
| **Panel de Comandos** | 📊 | Feed principal con color-coding por tipo, semáforo de cuentas y pulso semanal |
| **Muro Táctico** | 📌 | Kanban con columnas de estado, cover images, checklists, etiquetas y modal Trello-like |
| **Bio-Finanzas** | 💹 | Multi-cuenta, balance consolidado, gráficas reactivas, export CSV |
| **Bóveda Neural** | 🧠 | Notas estilo Keep con editor enriquecido, adjuntos por paste y búsqueda por tags |
| **Línea de Tiempo** | 📅 | Calendario mes / semana / día con eventos de todos los módulos |
| **Crónica** | 📖 | Histórico diario en 3 columnas: tareas, finanzas, notas |
| **Proyectos** | 🏗️ | Dashboard por proyecto: KPIs, gráfica SVG, hitos, cotizaciones con abonos, notas aisladas |
| **Contactos** | 👥 | CRM ligero: proveedores con servicios, cuentas bancarias, RFC, CLABE, cripto |
| **Configuración** | ⚙️ | Importar CSV (transacciones, contactos, proyectos), backup JSON, restaurar datos |
| **Ayuda** | ❓ | Guía completa del sistema en acordeón por módulo |

---

## 🏗️ Dashboard de Proyectos

El módulo de Proyectos incluye un **dashboard financiero visual** con:

- **5 KPIs**: Presupuesto total, Comprometido, Pagado, Pendiente, Sin comprometer
- **Gráfica SVG donut**: distribución visual pagado / pendiente / disponible
- **Desglose por categoría** (carpintería, albañilería, instalaciones…) — tipo tabla dinámica
- **Top 6 proveedores** con monto comprometido y pagado por cada uno
- **Hitos**: fecha, responsable, descripción, fecha de cumplimiento real — todo editable con modal
- **Cotizaciones**: CRUD completo + historial de abonos por cotización (fecha, monto, método, URL de comprobante)
- **Kanban interno**: tarjetas con cover image, etiquetas de color, checklists con progreso, adjuntos
- **Notas de proyecto**: aisladas del resto del sistema, editor de texto enriquecido

---

## 📸 Capturas de Pantalla

<p align="center">
  <img src="https://via.placeholder.com/700x420/0d1117/22c55e?text=Dashboard+Financiero+—+KPIs+%2B+Donut+SVG" alt="Dashboard Financiero" width="45%"/>
  &nbsp;&nbsp;
  <img src="https://via.placeholder.com/700x420/0d1117/f59e0b?text=Muro+Táctico+—+Kanban+Trello-like" alt="Muro Táctico Kanban" width="45%"/>
</p>

<p align="center">
  <img src="https://via.placeholder.com/700x420/0d1117/a855f7?text=Bóveda+Neural+—+Editor+Enriquecido" alt="Bóveda Neural" width="45%"/>
  &nbsp;&nbsp;
  <img src="https://via.placeholder.com/700x420/0d1117/3b82f6?text=Cotizaciones+—+Abonos+por+cotización" alt="Cotizaciones" width="45%"/>
</p>

> ¿No tienes imágenes aún? Revisa `assets/IMAGES.md` para la guía de qué screenshots tomar.

---

## 🗂️ Estructura del Proyecto

```
nexus-os/
├── app.html                  # SPA principal — todas las vistas (~4000 líneas)
├── app.js                    # Lógica completa — parser, módulos, render (~9000 líneas)
├── index.html                # Landing / login con auth de Supabase
├── main.js                   # Auth flow, session guard
├── reset-password.html       # Flujo de reset de contraseña
├── privacy.html              # Política de privacidad
├── terms.html                # Términos de servicio
├── style.css                 # Estilos globales (Tailwind base)
├── vite.config.js            # Configuración Vite
├── tailwind.config.js        # Configuración Tailwind CSS
├── postcss.config.js         # PostCSS para Tailwind
├── vercel.json               # Rewrites y config de Vercel
├── .env.example              # Variables de entorno de ejemplo
├── src/
│   ├── logic.js              # Utilidades y helpers compartidos
│   └── __tests__/            # Tests unitarios (Vitest)
├── scripts/
│   └── take-screenshots.mjs  # Script Puppeteer para screenshots automáticos
├── docs/
│   ├── database_schema.md    # Schema SQL completo y ejemplos de metadata
│   └── manifest.json         # PWA manifest
├── assets/
│   ├── IMAGES.md             # Guía de qué imágenes agregar
│   ├── banner.png            # Banner principal del README
│   ├── screenshot.png        # Screenshot principal
│   └── demo.gif              # Demo animado
├── public/
│   └── sw.js                 # Service Worker para PWA offline
└── dist/                     # Build de producción (generado por Vite)
```

---

## ☁️ Deploy a Vercel

**Opción A — Interfaz web (recomendado):**

1. Haz push del repo a GitHub
2. Entra a [vercel.com/new](https://vercel.com/new) → importa el repositorio
3. Vercel detecta Vite automáticamente
4. Agrega las variables de entorno:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Click en **Deploy** ✅

**Opción B — CLI:**

```sh
# Instalar CLI de Vercel (primera vez)
npm i -g vercel

# Login
vercel login

# Deploy a producción
vercel deploy --prod --yes
```

> **Variables en Vercel:** Dashboard → Project → Settings → Environment Variables

---

## 💡 Uso Rápido

### Registrar un gasto

```
-$1500 mano de obra albañil @efectivo #casatulum
```
→ Se crea un nodo `expense` con monto, cuenta y tag de proyecto. Aparece en Bio-Finanzas Y en el dashboard del proyecto.

### Crear una tarea

```
#tarea revisar planos estructurales antes del viernes #casatulum
```
→ Se crea en el Muro Táctico en columna "Por hacer", vinculada al proyecto.

### Registrar un pago parcial (abono)

1. Abre **Proyectos** → selecciona el proyecto → **Cotizaciones**
2. Click en una cotización → sección "Historial de Abonos"
3. Llena fecha, monto, método de pago y URL del comprobante
4. El dashboard actualiza el KPI "Pagado" en tiempo real

---

## 🤝 Contribuyendo

¡Las contribuciones son bienvenidas! Por favor lee las guías antes de empezar.

1. Haz un fork del repositorio
2. Crea tu rama: `git checkout -b feature/nueva-funcionalidad`
3. Haz commit: `git commit -m 'feat: agrega nueva funcionalidad'`
4. Push: `git push origin feature/nueva-funcionalidad`
5. Abre un Pull Request

---

## 💖 Apoya este Proyecto

Si Nexus OS te fue útil, considera hacer una contribución. Me ayuda a seguir construyendo herramientas de código abierto.

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
  &nbsp;
  <a href="https://wa.me/526121077805?text=Hola%20Oscar%2C%20vi%20tu%20proyecto%20Nexus%20OS%20en%20GitHub...">
    <img src="https://img.shields.io/badge/WhatsApp-Contactar-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" alt="WhatsApp"/>
  </a>
</p>

<p align="center">
  <a href="https://github.com/oscaromargp/nexus-os">Ver Repositorio</a> •
  <a href="https://nexus-os-chi.vercel.app">Demo en vivo</a>
</p>

---

## 👥 Contribuidores

<a href="https://github.com/oscaromargp">
  <img src="https://github.com/oscaromargp.png" width="50" style="border-radius:50%" alt="oscaromargp"/>
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

- [Supabase](https://supabase.com) — infraestructura de base de datos y autenticación
- [Vite](https://vitejs.dev) — build system ultrarrápido
- [Tailwind CSS](https://tailwindcss.com) — sistema de diseño utility-first
- [Fuse.js](https://fusejs.io) — búsqueda fuzzy para la búsqueda global
- [Shields.io](https://shields.io) — badges
- [awesome-readme](https://github.com/matiassingers/awesome-readme) — inspiración y guía
