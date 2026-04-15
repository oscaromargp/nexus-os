<p align="center">
  <img src="https://via.placeholder.com/1200x400/0B132B/00F0FF?text=⬡+NEXUS+OS+—+Everything+is+a+Node" alt="Nexus OS Banner" width="100%"/>
</p>

<h1 align="center">⬡ Nexus OS</h1>

<p align="center">
  <strong>Sistema Operativo Personal Unificado — De la Fragmentación a la Inteligencia Situacional Absoluta</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="License"/>
  <img src="https://img.shields.io/badge/version-1.0.0-green?style=for-the-badge" alt="Version"/>
  <img src="https://img.shields.io/badge/status-active-brightgreen?style=for-the-badge" alt="Status"/>
  <img src="https://img.shields.io/badge/PRs-welcome-orange?style=for-the-badge" alt="PRs"/>
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite"/>
  <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase"/>
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind"/>
</p>

<p align="center">
  <a href="#-acerca-del-proyecto">Acerca</a> •
  <a href="#-características">Características</a> •
  <a href="#-arquitectura">Arquitectura</a> •
  <a href="#-demo">Demo</a> •
  <a href="#-comenzando">Comenzando</a> •
  <a href="#-uso">Uso</a> •
  <a href="#-contacto">Contacto</a>
</p>

---

## 📖 Acerca del Proyecto

<p align="center">
  <img src="https://via.placeholder.com/700x400/0B132B/00F0FF?text=Dashboard+—+Nexus+OS" alt="Nexus OS Dashboard" width="700"/>
</p>

**Nexus OS** nació para resolver uno de los problemas más silenciosos de la productividad moderna: la **fatiga de aplicaciones**. Hoy en día tienes ideas en una app de notas, tareas en un gestor de proyectos, finanzas en hojas de cálculo aisladas. Cada silo consume energía cognitiva y destruye el contexto.

La solución es radical: **Todo es un Nodo**.

En lugar de sistemas separados, Nexus OS propone una única fuente de verdad centralizada. Cada pieza de información ingresada al sistema es un nodo básico que adquiere su propósito a través de metadatos dinámicos llamados **Supertags**. El texto determina el tipo; el contexto lo clasifica automáticamente.

### 🛠️ Construido Con

<p align="left">
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript"/>
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite"/>
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS"/>
  <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase"/>
  <img src="https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL"/>
</p>

---

## ✨ Características

| Característica | Descripción |
|---|---|
| 🧠 **Everything is a Node** | Una sola entrada de texto se clasifica automáticamente según su contenido |
| 📌 **Kanban Inteligente** | Escribe `#tarea` y el nodo se transforma en tarjeta de proyecto |
| 💸 **Flujo Financiero** | `-$500` registra un gasto, `+$1500` un ingreso — balance en tiempo real |
| 📝 **Segunda Mente** | Notas con Supertags (`#idea`, `#importante`) para conexiones semánticas |
| 🔒 **Auth Segura** | Login y registro con Supabase Auth + JWT + Row Level Security |
| 📊 **Dashboard Unificado** | Stats en vivo: nodos totales, tareas, notas y balance financiero |
| ⚡ **Parser Semántico** | Análisis de texto en tiempo real con preview del tipo de nodo detectado |
| 🎨 **Deep Ocean Tech UI** | Interfaz glassmorphism con fondo `#0B132B` y acentos `#00F0FF` |

---

## 🏗️ Arquitectura

<p align="center">
  <img src="assets/user-flow-preview.png" alt="Diagrama de flujo Nexus OS" width="700"/>
</p>

> El diagrama completo en formato editable está en [`user-flow.excalidraw`](./user-flow.excalidraw)

### Arquitectura "Everything is a Node"

```
INPUT DEL USUARIO
      │
      ▼
┌─────────────────────┐
│   Parser Semántico  │  ← Analiza texto en tiempo real
└─────────────────────┘
      │
      ├── #tarea texto    → node_type: "kanban"   → Vista Kanban
      ├── -$500 label     → node_type: "expense"  → Balance Financiero
      ├── +$1500 label    → node_type: "income"   → Balance Financiero
      └── texto libre     → node_type: "note"     → Segunda Mente
                                    │
                                    ▼
                          ┌──────────────────┐
                          │  nexus_nodos     │  ← Supabase PostgreSQL
                          │  + metadata JSONB│     con RLS habilitado
                          └──────────────────┘
```

### Estructura del proyecto

```
nexus-os-app/
├── index.html          # Landing Page comercial + Modal Auth
├── app.html            # Dashboard (ruta protegida)
├── main.js             # Auth Supabase + demo animado
├── app.js              # Core: Parser Semántico + CRUD nodos
├── style.css           # Design system Deep Ocean Tech
├── tailwind.config.js  # Config Tailwind personalizada
├── postcss.config.js   # Config PostCSS
├── docs/
│   └── database_schema.md  # SQL completo para Supabase
├── assets/             # Imágenes y banners
└── user-flow.excalidraw    # Diagrama de arquitectura
```

---

## 🎬 Demo

<p align="center">
  <img src="https://via.placeholder.com/700x400/0B132B/00F0FF?text=Demo+GIF+coming+soon..." alt="Demo animado" width="700"/>
</p>

### El Parser Semántico en acción

```
› #tarea Revisar el PRD de Nexus
  📌 Tipo: kanban | status: todo | priority: medium

› -$500 Renta oficina
  💸 Tipo: expense | USD 500 — Renta oficina

› +$1500 Proyecto freelance
  💰 Tipo: income | USD 1500 — Proyecto freelance

› Idea: integrar análisis con IA
  🧠 Tipo: note | supertags: []
```

---

## 🚀 Comenzando

### Prerrequisitos

- [Node.js](https://nodejs.org/) `>= 18.0`
- [npm](https://www.npmjs.com/) `>= 9.0`
- Cuenta en [Supabase](https://supabase.com) (gratuita)

### Instalación

1. Clona el repositorio
   ```sh
   git clone https://github.com/oscaromargp/nexus-os.git
   cd nexus-os
   ```

2. Instala las dependencias
   ```sh
   npm install
   ```

3. Configura las variables de entorno
   ```sh
   cp .env.example .env
   # Edita .env con tus credenciales de Supabase
   ```

4. Crea la base de datos en Supabase
   ```
   Abre: Supabase > SQL Editor
   Pega y ejecuta el contenido de: docs/database_schema.md
   ```

5. Inicia el servidor de desarrollo
   ```sh
   npm run dev
   ```

---

## 💡 Uso

### Sintaxis del Parser Semántico

```javascript
// Kanban — comienza con #tarea
"#tarea Revisar informe Q2"
// → { node_type: "kanban", metadata: { status: "todo", priority: "medium" } }

// Gasto — comienza con -$monto
"-$500 Renta oficina"
// → { node_type: "expense", metadata: { amount: 500, currency: "USD" } }

// Ingreso — comienza con +$monto
"+$1500 Pago freelance"
// → { node_type: "income", metadata: { amount: 1500, currency: "USD" } }

// Nota libre — cualquier otro texto
"Reflexión sobre el product-market fit"
// → { node_type: "note", metadata: { supertags: [] } }
```

### Schema de la base de datos

```sql
CREATE TABLE public.nexus_nodos (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID        REFERENCES auth.users(id),
  raw_content  TEXT        NOT NULL,
  node_type    TEXT        CHECK (node_type IN ('note','task','income','expense','kanban')),
  metadata     JSONB       DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
-- RLS habilitado — cada usuario solo ve sus propios nodos
```

---

## 🤝 Contribuyendo

¡Las contribuciones son bienvenidas! Por favor lee las guías de contribución.

1. Haz un fork del repositorio
2. Crea tu rama: `git checkout -b feature/nueva-funcionalidad`
3. Haz commit: `git commit -m 'feat: agrega nueva funcionalidad'`
4. Push: `git push origin feature/nueva-funcionalidad`
5. Abre un Pull Request

---

## 💖 Apoya este Proyecto

Si este proyecto te fue útil, considera hacer una contribución. Esto me ayuda a seguir creando herramientas de código abierto.

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

- [Supabase](https://supabase.com) — por la infraestructura backend
- [Shields.io](https://shields.io) — por los badges
- [awesome-readme](https://github.com/matiassingers/awesome-readme) — por la inspiración
- [Vite](https://vitejs.dev) — por el tooling de desarrollo
