<p align="center">
  <img src="assets/banner.png" alt="Nexus OS" width="100%"/>
</p>

<h1 align="center">⬡ Nexus OS</h1>

<p align="center">
  <strong>Dashboard personal con parser semántico bilingüe — captura todo, entiende todo, conecta todo.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/versión-6.0-green?style=for-the-badge" alt="Version"/>
  <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="License"/>
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
  <a href="#-parser-semántico-v2">Parser</a> •
  <a href="#-comenzando">Comenzando</a> •
  <a href="#-migración-sql-supabase">SQL</a> •
  <a href="#-estructura-del-proyecto">Estructura</a> •
  <a href="#-deploy-en-vercel">Deploy</a> •
  <a href="#-contacto">Contacto</a>
</p>

---

## 📖 Acerca del Proyecto

<p align="center">
  <img src="assets/screenshots/dashboard.png" alt="Nexus OS Dashboard" width="700"/>
</p>

**Nexus OS** es un sistema operativo personal de productividad construido como SPA (*Single Page Application*). Centraliza tareas, finanzas, notas, contactos y proyectos en un solo lugar, conectados por un **parser semántico bilingüe** que entiende lenguaje natural en español e inglés.

Todo en Nexus OS existe como un **nodo** — una unidad de información con tipo, contenido y metadatos — almacenado en Supabase. Las `#etiquetas` actúan como sistema nervioso que conecta nodos entre vistas sin duplicar datos.

### 🛠️ Construido Con

<p align="left">
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite"/>
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript"/>
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind"/>
  <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase"/>
  <img src="https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel"/>
  <img src="https://img.shields.io/badge/chrono--node-FF6B6B?style=for-the-badge" alt="chrono-node"/>
  <img src="https://img.shields.io/badge/SortableJS-4A90E2?style=for-the-badge" alt="SortableJS"/>
</p>

---

## ✨ Características

| Característica | Descripción |
|---|---|
| ⌨️ **Parser Semántico v2** | Bilingüe (ES/EN), fechas en lenguaje natural (mañana, lunes, next friday), prioridades (p1/p2/p3, !alta) |
| 🗂️ **Muro Táctico Kanban** | Drag & drop real con SortableJS, checklist por tarjeta con persona+fecha, modal de detalle |
| 💰 **Bio-Finanzas** | Multi-cuenta, tabla con saldo corriente, impresión, CSV, motor financiero unificado |
| 🧠 **Bóveda Neural** | Notas estilo Google Keep, adjuntos Ctrl+V, colores, pin, editor enriquecido |
| 🏗️ **Proyectos completos** | Kanban + Wiki + Notas + Finanzas + Hitos + Cotizaciones + Equipo |
| 📖 **Wiki de Proyecto** | Editor Markdown con preview, índice automático, estilo GitHub Wiki |
| 📅 **Calendario & Crónica** | Vistas mes/semana/día, crónica histórica en 3 columnas, agenda financiera |
| 🔁 **Hábitos** | Tracker con racha automática, formato `- [ ] Hábito #habito` |
| 👥 **Contactos & Proveedores** | Roles múltiples, catálogo de especialidades, búsqueda universal |
| 🔍 **Búsqueda global** | Fuzzy search con Fuse.js por tags, tipo, contenido |
| 🏷️ **Inteligencia de Tags** | Co-ocurrencias, tags durmientes, tendencias semanales |
| 🔐 **Auth completa** | Registro, login, reset password, sesión persistente vía Supabase Auth |

---

## 🎬 Demo

<p align="center">
  <img src="assets/screenshots/demo.gif" alt="Demo animado de Nexus OS" width="700"/>
</p>

> ¿No ves el GIF? [Ve el repositorio en GitHub](https://github.com/oscaromargp/nexus-os)

<p align="center">
  <img src="assets/screenshots/kanban.png" alt="Muro Táctico Kanban" width="45%"/>
  &nbsp;&nbsp;
  <img src="assets/screenshots/finanzas.png" alt="Bio-Finanzas" width="45%"/>
</p>

---

## ⌨️ Parser Semántico v2

El parser entiende texto natural y crea el nodo correcto automáticamente. Escribe en la barra inferior y presiona `Enter`.

### Tipos de nodo

```
#tarea Revisar propuesta Q2 p1 lunes     → Tarea kanban, alta prioridad, próximo lunes
+$1500 Pago freelance @bbva today        → Ingreso $1,500 en cuenta BBVA, fecha hoy
-$350 Renta oficina @efectivo #oficina   → Gasto $350, vinculado al tag #oficina
Reflexión sobre el producto #idea        → Nota en Bóveda Neural
#persona Juan Pérez — CEO Startup XYZ   → Nuevo contacto tipo Persona
📅 Reunión con cliente jueves 3pm        → Evento en Calendario
- [ ] Leer 20 min #habito                → Registro de hábito diario con tracker de racha
```

### Prioridades

| Sintaxis | Nivel |
|---|---|
| `p1` · `!alta` · `!high` | 🔴 Alta |
| `p2` · `!media` · `!medium` | 🟠 Media |
| `p3` · `!baja` · `!low` | 🟢 Baja |

### Fechas en lenguaje natural

El parser detecta fechas en cualquier posición del texto. Si el día ya pasó en la semana actual, toma el próximo:

```
hoy · mañana · pasado mañana
lunes · martes · miércoles · jueves · viernes · sábado · domingo
today · tomorrow · monday · tuesday · wednesday · thursday · friday · saturday · sunday
DD/MM/YYYY · YYYY-MM-DD
```

---

## 🚀 Comenzando

### Prerrequisitos

- [Node.js](https://nodejs.org) `>= 18`
- Cuenta en [Supabase](https://supabase.com) (gratuita)
- [Git](https://git-scm.com)

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

3. Crea el archivo de variables de entorno
   ```sh
   cp .env.example .env
   ```

4. Edita `.env` con tus credenciales de Supabase:
   ```env
   VITE_SUPABASE_URL=https://tuproyecto.supabase.co
   VITE_SUPABASE_ANON_KEY=tu-anon-key-aqui
   ```

5. Ejecuta la migración SQL en Supabase (ver sección abajo)

6. Inicia el servidor de desarrollo
   ```sh
   npm run dev
   ```

---

## 🗄️ Migración SQL Supabase

Ejecuta este SQL en **Supabase → SQL Editor** para crear la tabla de nodos con Row Level Security habilitado:

```sql
-- Tabla principal de nodos
CREATE TABLE IF NOT EXISTS nodes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  content     TEXT,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS nodes_user_id_idx    ON nodes(user_id);
CREATE INDEX IF NOT EXISTS nodes_type_idx       ON nodes(type);
CREATE INDEX IF NOT EXISTS nodes_created_at_idx ON nodes(created_at DESC);
CREATE INDEX IF NOT EXISTS nodes_metadata_idx   ON nodes USING GIN(metadata);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER nodes_updated_at
  BEFORE UPDATE ON nodes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Row Level Security (RLS)
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios ven solo sus nodos"
  ON nodes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuarios insertan sus nodos"
  ON nodes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuarios actualizan sus nodos"
  ON nodes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Usuarios eliminan sus nodos"
  ON nodes FOR DELETE
  USING (auth.uid() = user_id);
```

### Tipos de nodo (`type`) disponibles

| Tipo | Descripción |
|---|---|
| `note` | Nota libre / hábito |
| `kanban` | Tarea del Muro Táctico |
| `income` | Ingreso financiero |
| `expense` | Gasto financiero |
| `contact` | Contacto / proveedor |
| `persona` | Persona (formato legado) |
| `proyecto` | Proyecto |
| `event` | Evento de calendario |
| `cotizacion` | Cotización vinculada a proyecto |
| `account` | Cuenta financiera |
| `bill` | Factura / recibo |
| `subscription` | Suscripción recurrente |
| `card` | Tarjeta de crédito/débito |

---

## 💡 Uso

### Hábitos

```
- [ ] Leer 20 min #habito
- [ ] Ejercicio 30 min #habito
- [ ] Meditar #habito
```

El sistema detecta el `- [ ]` como checkbox Markdown + el tag `#habito` y crea un nodo de hábito con fecha. El tracker calcula la racha automáticamente.

### Vincular transacciones a un proyecto

```
-$500 Cemento @efectivo #casatulum
+$15000 Anticipo cliente @bbva #casatulum
```

Cualquier nodo con el tag del proyecto aparece automáticamente en el dashboard financiero de ese proyecto.

### Wiki de Proyecto

Cada proyecto tiene una pestaña **📖 Wiki** con editor Markdown. Soporta encabezados, listas, código, tablas y links. El índice lateral se genera automáticamente de los encabezados `#`, `##`, `###`.

---

## 📁 Estructura del Proyecto

```
nexus-os/
├── index.html              # Landing page / registro
├── app.html                # SPA principal (7 vistas)
├── app.js                  # Lógica principal (~10,000 líneas)
├── style.css               # Estilos globales
├── src/
│   ├── parser.js           # Parser semántico v2 (bilingüe + chrono-node)
│   ├── finance-engine.js   # Motor financiero unificado
│   ├── logic.js            # Helpers compartidos
│   └── __tests__/          # Tests unitarios (Vitest)
├── assets/
│   ├── banner.png          # Banner del proyecto
│   └── screenshots/        # Capturas de pantalla
├── public/                 # Assets estáticos
├── privacy.html            # Política de privacidad
├── terms.html              # Términos de uso
├── reset-password.html     # Reset de contraseña
├── vite.config.js          # Config de Vite (multi-page)
├── tailwind.config.js      # Config de Tailwind CSS
└── package.json
```

### Las 7 vistas de la app

| Vista | Descripción |
|---|---|
| 📡 **Panel de Comandos** (Feed) | Color-coding por tipo, búsqueda, hábitos, transformar nodos |
| 🗂️ **Muro Táctico** | Kanban con drag & drop, checklist avanzado, modal de detalle |
| 💰 **Bio-Finanzas** | Multi-cuenta, tabla con saldo corriente, KPIs, impresión, CSV |
| 🧠 **Bóveda Neural** | Notas estilo Keep, pin, colores, adjuntos, editor enriquecido |
| 📅 **Calendario / Línea de Tiempo** | Vistas mes/semana/día, agenda financiera |
| 📜 **Crónica** | Histórico diario en 3 columnas (mañana · tarde · noche) |
| 🏗️ **Proyectos** | Kanban + Wiki + Notas + Finanzas + Hitos + Cotizaciones |

---

## 🌐 Deploy en Vercel

El proyecto está configurado para deploy multi-página en Vercel.

### Deploy automático desde GitHub

1. Importa el repositorio en [vercel.com](https://vercel.com/new)
2. Framework preset: **Vite**
3. Agrega las variables de entorno:
   ```
   VITE_SUPABASE_URL=https://tuproyecto.supabase.co
   VITE_SUPABASE_ANON_KEY=tu-anon-key-aqui
   ```
4. Clic en **Deploy** — Vercel auto-despliega en cada push a `main`

### URL de producción

🔗 **[nexus-os-chi.vercel.app](https://nexus-os-chi.vercel.app)**

---

## 🧪 Tests

```sh
npm run test          # Ejecutar tests una vez
npm run test:watch    # Watch mode
```

Tests unitarios del parser semántico y motor financiero en `src/__tests__/`.

---

## 🤝 Contribuyendo

¡Las contribuciones son bienvenidas!

1. Fork del repositorio
2. Crea tu rama: `git checkout -b feature/nueva-funcionalidad`
3. Haz commit: `git commit -m 'feat: agrega nueva funcionalidad'`
4. Push: `git push origin feature/nueva-funcionalidad`
5. Abre un Pull Request

---

## 💖 Apoya este Proyecto

Si Nexus OS te fue útil, considera hacer una contribución. Esto me ayuda a seguir creando herramientas de código abierto.

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
  <a href="https://github.com/oscaromargp/nexus-os">Ver Repositorio</a> •
  <a href="https://nexus-os-chi.vercel.app">Ver Demo en Vivo</a>
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

- [Supabase](https://supabase.com) — por el backend sin servidor
- [chrono-node](https://github.com/wanasit/chrono) — por el parser de fechas en lenguaje natural
- [SortableJS](https://sortablejs.github.io/Sortable/) — por el drag & drop del Kanban
- [Fuse.js](https://www.fusejs.io/) — por la búsqueda fuzzy
- [Shields.io](https://shields.io) — por los badges
- [awesome-readme](https://github.com/matiassingers/awesome-readme) — por la inspiración
