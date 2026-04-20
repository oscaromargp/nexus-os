<p align="center">
  <img src="https://via.placeholder.com/1200x400/02040a/00F6FF?text=⬡+NEXUS+OS+—+Everything+is+a+Node" alt="Nexus OS Banner" width="100%"/>
</p>

<h1 align="center">⬡ Nexus OS</h1>

<p align="center">
  <strong>Tu Sistema Operativo Personal — Del Caos Cognitivo a la Inteligencia Situacional Absoluta</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="License"/>
  <img src="https://img.shields.io/badge/version-2.0.0-brightgreen?style=for-the-badge" alt="Version"/>
  <img src="https://img.shields.io/badge/status-live-brightgreen?style=for-the-badge" alt="Status"/>
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite"/>
  <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase"/>
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind"/>
  <img src="https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel"/>
</p>

<p align="center">
  <a href="#-acerca-del-proyecto">Acerca</a> •
  <a href="#-características">Características</a> •
  <a href="#-parser-semántico">Parser</a> •
  <a href="#-arquitectura">Arquitectura</a> •
  <a href="#-comenzando">Comenzando</a> •
  <a href="#-deploy-en-vercel">Deploy</a> •
  <a href="#-contacto">Contacto</a>
</p>

---

## 📖 Acerca del Proyecto

**Nexus OS** nació para resolver el problema más silencioso de la productividad moderna: la **fatiga de aplicaciones**. Ideas en notas, tareas en Trello, finanzas en Excel, contactos en otro silo. Cada app consume energía cognitiva y destruye el contexto.

La solución es radical: **Todo es un Nodo.**

Una sola barra de comandos. Un solo sistema. Todo clasificado automáticamente por un **Parser Semántico** en tiempo real que detecta el tipo de información por su contenido y sintaxis.

<p align="center">
  <img src="https://via.placeholder.com/800x450/02040a/00F6FF?text=🎬+Demo+GIF+—+Próximamente" alt="Demo Nexus OS" width="800"/>
</p>

---

## ✨ Características

| Módulo | Descripción |
|---|---|
| 📊 **Panel de Comandos** | Feed unificado con color-coding por tipo de nodo. Vista cronológica de toda tu actividad. |
| 📌 **Muro Táctico** | Kanban completo: drag-and-drop, modal detalle, checklist, miembros, etiquetas, fechas e imágenes adjuntas. |
| 💹 **Bio-Finanzas** | Multi-cuenta con `@cuenta` en comandos, modal de detalle por transacción, comentarios, adjuntos y exportación CSV. |
| 🧠 **Bóveda Neural** | Notas estilo Google Keep: colores, pin, etiquetas y **Transform Note** (convierte en tarea, ingreso, gasto o evento). |
| 📅 **Línea de Tiempo** | Calendario con vistas Mes / Semana / Día, dots por tipo de nodo y exportación CSV. |
| 📖 **Crónica** | Histórico diario: elige cualquier fecha y ve todo lo que registraste en 3 columnas (tareas · notas · finanzas) con balance neto del día. |
| ❓ **Ayuda** | Guía de uso integrada: parser, atajos de teclado, instrucciones por módulo. |
| ⚙️ **Configuración** | Preferencias, cambio de contraseña, zona horaria, unidades y donación XRP. |
| 🔒 **Auth Segura** | Login / registro con Supabase Auth + JWT + Row Level Security. |
| 📎 **Adjuntos de Imagen** | Pega capturas de pantalla con **Ctrl+V** o selecciona archivo. Compresión automática a JPEG 0.7. Máx. 3 por nodo. |
| 🌐 **Modo Demo** | Acceso sin cuenta con datos de ejemplo precargados. |

---

## ⌨️ Parser Semántico

La barra de comandos inferior clasifica automáticamente cada entrada:

```bash
# TAREAS → Muro Táctico
#tarea Revisar informe Q2
→ { type: "kanban", status: "todo" }

# INGRESOS con cuenta asignada
+$1500 @bbva  Pago proyecto freelance
→ { type: "income", amount: 1500, account: "bbva" }

# GASTOS con cuenta asignada
-$350 @efectivo  Gasolina
→ { type: "expense", amount: 350, account: "efectivo" }

# NOTAS libres → Bóveda Neural
Reflexión sobre el producto #idea #startup
→ { type: "note", tags: ["#idea", "#startup"] }

# CONTACTOS / CRM
#persona Juan Pérez — CEO Startup XYZ
→ { type: "persona" }

# PROYECTOS
#proyecto Rediseño landing Q3
→ { type: "proyecto" }
```

> **Tip:** Al escribir `+$` o `-$`, aparece un selector de cuentas encima del input para asignar con un clic.

---

## 🏗️ Arquitectura

### "Everything is a Node"

```
INPUT DEL USUARIO
        │
        ▼
┌───────────────────────┐
│   Parser Semántico    │  ← Analiza en tiempo real
└───────────────────────┘
        │
        ├── #tarea      → kanban   → Muro Táctico
        ├── +$  @cuenta → income   → Bio-Finanzas
        ├── -$  @cuenta → expense  → Bio-Finanzas
        ├── #persona    → persona  → Bóveda Neural
        ├── #proyecto   → proyecto → Bóveda Neural
        └── texto libre → note     → Bóveda Neural
                                │
                    ┌───────────▼──────────┐
                    │     nexus_nodos      │  ← Supabase PostgreSQL
                    │   + metadata JSONB   │     con RLS habilitado
                    └──────────────────────┘
                                │
           ┌────────────────────┼────────────────────┐
           ▼                    ▼                    ▼
    Panel Comandos         Crónica           Línea de Tiempo
    Muro Táctico         Bio-Finanzas        Bóveda Neural
```

### Estructura del Proyecto

```
nexus-os/
├── index.html              # Landing page + Modal Auth
├── app.html                # Dashboard (7 vistas, ruta /app)
├── app.js                  # Core: Parser + CRUD + Renders + Modals
├── main.js                 # Auth Supabase + animación landing
├── style.css               # Design system Deep Ocean Tech
├── reset-password.html     # Flujo reset de contraseña
├── tailwind.config.js
├── vite.config.js
├── vercel.json             # Rewrite /app → /app.html
├── docs/
│   └── database_schema.md  # SQL completo para Supabase
└── assets/
```

---

## 🚀 Comenzando

### Prerrequisitos

- Node.js `>= 18.0` · npm `>= 9.0`
- Cuenta en [Supabase](https://supabase.com) (gratuita)

### Instalación

```bash
git clone https://github.com/oscaromargp/nexus-os.git
cd nexus-os
npm install
cp .env.example .env   # Agrega tus credenciales Supabase
npm run dev
```

### Base de datos — Supabase SQL Editor

```sql
create table nexus_nodos (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid references auth.users not null,
  content    text not null,
  type       text not null,
  metadata   jsonb default '{}',
  created_at timestamptz default now()
);

alter table nexus_nodos enable row level security;

create policy "user_data" on nexus_nodos
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create index idx_nodos_owner   on nexus_nodos (owner_id);
create index idx_nodos_type    on nexus_nodos (type);
create index idx_nodos_created on nexus_nodos (created_at desc);
```

---

## 🚢 Deploy en Vercel

1. Conecta el repositorio en [vercel.com](https://vercel.com)
2. Agrega las variables de entorno:

| Variable | Descripción |
|---|---|
| `VITE_SUPABASE_URL` | URL de tu proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clave anon pública |

3. Deploy automático — el `vercel.json` ya incluye la reescritura `/app → /app.html`

---

## 🛠️ Stack Tecnológico

<p align="left">
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black"/>
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white"/>
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white"/>
  <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white"/>
  <img src="https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white"/>
  <img src="https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white"/>
</p>

---

## 🤝 Contribuyendo

```bash
git checkout -b feature/nueva-funcionalidad
git commit -m 'feat: descripción del cambio'
git push origin feature/nueva-funcionalidad
# Abre un Pull Request
```

---

## 💖 Apoya este Proyecto

<p align="center">
  <strong>Donaciones en Criptomonedas — Red XRP</strong><br><br>
  <img src="https://img.shields.io/badge/XRP-rBthUCndKy3Xbb19Ln4xkZeMwusX9NrYfj-00AAE4?style=for-the-badge&logo=ripple" alt="XRP Address"/>
</p>

> Dirección XRP: `rBthUCndKy3Xbb19Ln4xkZeMwusX9NrYfj`

---

## 📄 Licencia

Distribuido bajo la licencia MIT. Consulta el archivo [LICENSE](LICENSE).

---

## 📬 Contacto

<p align="center"><strong>Oscar Omar Gómez Peña</strong></p>

<p align="center">
  <a href="https://oscaromargp.github.io/Oscaromargp/">
    <img src="https://img.shields.io/badge/Portafolio-Web-blueviolet?style=for-the-badge&logo=github" alt="Portafolio"/>
  </a>
  &nbsp;
  <a href="https://github.com/oscaromargp">
    <img src="https://img.shields.io/badge/GitHub-oscaromargp-181717?style=for-the-badge&logo=github" alt="GitHub"/>
  </a>
</p>

---

## 🙏 Agradecimientos

<p align="center">
  <em>
    "Porque Dios es el que en vosotros produce<br/>
    así el querer como el hacer,<br/>
    por su buena voluntad."
  </em><br/>
  <strong>— Filipenses 2:13</strong><br/><br/>
  A Dios, toda la gloria.
</p>

---

[Supabase](https://supabase.com) · [Vite](https://vitejs.dev) · [Shields.io](https://shields.io) · [Vercel](https://vercel.com)
