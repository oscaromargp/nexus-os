<p align="center">
  <img src="https://via.placeholder.com/1200x360/02040a/00F6FF?text=⬡+NEXUS+OS+—+Dashboard+Personal+con+Parser+Semántico" alt="Nexus OS" width="100%"/>
</p>

<h1 align="center">⬡ Nexus OS</h1>

<p align="center">
  <strong>Dashboard personal con parser semántico natural — captura todo, entiende todo, conecta todo.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="License"/>
  <img src="https://img.shields.io/badge/versión-2.14-green?style=for-the-badge" alt="Version"/>
  <img src="https://img.shields.io/badge/estado-activo-brightgreen?style=for-the-badge" alt="Status"/>
  <img src="https://img.shields.io/badge/deploy-Vercel-black?style=for-the-badge&logo=vercel" alt="Vercel"/>
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
  <a href="#-contacto">Contacto</a>
</p>

---

## 📖 Acerca del Proyecto

<p align="center">
  <img src="https://via.placeholder.com/700x420/0d1117/00F6FF?text=Panel+de+Comandos+—+Nexus+OS" alt="Nexus OS — Panel de Comandos" width="700"/>
</p>

**Nexus OS** es un sistema operativo personal que vive en el navegador. En lugar de formularios y menús, usas lenguaje natural: escribes una línea y el parser semántico detecta si es una tarea, un gasto, un ingreso, una cotización o un evento, y lo enruta automáticamente a la vista correcta.

Construido como SPA de una sola página, sin frameworks pesados, con persistencia real en Supabase y deploy instantáneo en Vercel. Pensado para quienes manejan proyectos, proveedores, finanzas personales y notas en un solo lugar.

### 🛠️ Stack

<p align="left">
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite"/>
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript"/>
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind"/>
  <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase"/>
  <img src="https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel"/>
</p>

---

## ✨ Características

| Característica | Descripción |
|---|---|
| 🧠 **Parser Semántico** | Escribe en lenguaje natural — detecta tipo, cuenta, monto, proyecto y etiquetas automáticamente |
| 🏗️ **Gestión de Proyectos** | Dashboard por proyecto: presupuesto, comprometido, pagado, pendiente, sin comprometer. Proveedores agrupados por categoría con detección de excedente |
| 💸 **Pago Asistido con Splits** | Modal con múltiples métodos/cuentas en un solo pago, rating de calidad, prompt de anticipo automático al aceptar cotización |
| 📄 **Cotizaciones** | CRUD completo, categorías con autocomplete, estados (pendiente / aceptada / rechazada), auto-link a proyectos vía `linkedTo[]` |
| 📊 **Bio-Finanzas** | Multi-cuenta, gráficas reactivas por cuenta, semáforo de cuentas en tiempo real, export CSV |
| 📌 **Muro Táctico** | Kanban con drag & drop, cover images desde adjuntos, modal de detalle completo |
| 🧠 **Bóveda Neural** | Notas estilo Google Keep con imágenes (Ctrl+V para pegar), filtro por tags |
| 📅 **Línea de Tiempo** | Calendario con vistas mes / semana / día |
| 📖 **Crónica** | Histórico diario en 3 columnas: tareas, finanzas, notas |
| 👥 **Contactos Ricos** | Proveedores con servicios propios, cuentas bancarias/cripto, RFC, CLABE con copia rápida |
| 🔍 **Búsqueda Global** | Por tipo, tag, contenido — filtro instantáneo en todo el historial |
| 🖨️ **Print / Export** | Imprime la vista actual o exporta como CSV |

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
-- Tabla principal de nodos
create table nodes (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references auth.users(id) on delete cascade not null,
  type        text not null default 'note',
  content     text not null default '',
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

-- RLS: cada usuario ve únicamente sus nodos
alter table nodes enable row level security;

create policy "Users see own nodes"
  on nodes for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Índices de performance
create index nodes_owner_idx    on nodes(owner_id);
create index nodes_type_idx     on nodes(type);
create index nodes_created_idx  on nodes(created_at desc);
create index nodes_metadata_idx on nodes using gin(metadata);
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

El corazón de Nexus OS. Escribe una línea en el campo de entrada — el sistema detecta tipo, extrae monto, cuenta y etiquetas sin que toques un formulario.

### Sintaxis

| Patrón | Tipo | Ejemplo |
|---|---|---|
| `#tarea` | ✅ Tarea / Kanban | `#tarea llamar al arquitecto #casatulum` |
| `-$monto @cuenta` | 💸 Gasto | `-$850 gasolina @efectivo` |
| `+$monto @cuenta` | 💰 Ingreso | `+$12000 pago cliente @bbva` |
| `#cotizacion $monto @proyecto` | 📄 Cotización | `#cotizacion $45000 instalación eléctrica @casatulum` |
| `#proyecto` | 🏗️ Proyecto | `#proyecto Casa Tulum` |
| `#persona` | 👤 Contacto | `#persona Carlos electricista` |
| texto libre | 📝 Nota | `revisar planos mañana con el arquitecto` |

### Modificadores

| Símbolo | Función |
|---|---|
| `@cuenta` | Vincula el movimiento a una cuenta (efectivo, bbva, crypto…) |
| `#tag` | Etiqueta libre para búsqueda y agrupación |
| `@proyecto` en gasto/cotización | Auto-link duro al proyecto en el dashboard |

### Ejemplos reales

```
-$1200 cemento @efectivo #casatulum
+$25000 anticipo diseño @bbva #freelance
#tarea confirmar entrega de ventanas #casatulum
#cotizacion $38500 impermeabilización techo @casatulum
nota libre: el contratista llega el lunes a las 9am
```

---

## 🗂️ Vistas

| Vista | Ícono | Descripción |
|---|---|---|
| **Panel de Comandos** | 📊 | Feed principal con color-coding por tipo, semáforo de cuentas, pulso semanal |
| **Muro Táctico** | 📌 | Kanban drag & drop por columnas de estado |
| **Bio-Finanzas** | 💹 | Multi-cuenta, gráficas reactivas, balance consolidado, export CSV |
| **Bóveda Neural** | 🧠 | Notas estilo Keep con imágenes y búsqueda por tags |
| **Línea de Tiempo** | 📅 | Calendario mes / semana / día |
| **Crónica** | 📖 | Histórico diario en 3 columnas |
| **Contactos** | 👥 | CRM ligero: proveedores con servicios, cuentas y cripto |
| **Proyectos** | 🏗️ | Dashboard financiero por proyecto con 5 métricas y proveedores contratados |
| **Agenda Financiera** | 💳 | Pagos recurrentes y compromisos futuros |
| **Herramientas** | 🧮 | Calculadora, conversores, utilidades |
| **Inteligencia Tags** | 🏷️ | Grafo de etiquetas, hábitos, patrones |
| **Ayuda** | ❓ | Guía completa del sistema |

---

## 🏗️ Estructura del Proyecto

```
nexus-os/
├── app.html              # SPA principal (~2500 líneas)
├── app.js                # Lógica completa (~6500 líneas)
├── index.html            # Landing / login
├── main.js               # Auth flow
├── reset-password.html   # Reset de contraseña
├── privacy.html          # Política de privacidad
├── terms.html            # Términos de servicio
├── vite.config.js        # Configuración Vite
├── tailwind.config.js    # Configuración Tailwind
├── .env.example          # Variables de entorno de ejemplo
├── assets/               # Imágenes, screenshots, banner
└── dist/                 # Build de producción (generado por Vite)
```

---

## ☁️ Deploy a Vercel

```sh
# Instalar CLI de Vercel (primera vez)
npm i -g vercel

# Deploy a producción
vercel deploy --prod --yes
```

O conecta el repo directo desde [vercel.com/new](https://vercel.com/new) — Vite se detecta automáticamente.

> **Variables en Vercel:** Dashboard → Project → Settings → Environment Variables → agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

---

## 🤝 Contribuyendo

¡Las contribuciones son bienvenidas!

1. Haz fork del repositorio
2. Crea tu rama: `git checkout -b feature/nueva-funcionalidad`
3. Commit: `git commit -m 'feat: describe el cambio'`
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
</p>

<p align="center">
  <a href="https://github.com/oscaromargp/nexus-os">Ver Repositorio</a>
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
- [Shields.io](https://shields.io) — badges
- [awesome-readme](https://github.com/matiassingers/awesome-readme) — inspiración y guía
