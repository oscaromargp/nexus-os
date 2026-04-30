# NEXUS OS — LOG DEL PROYECTO
> Archivo de memoria para continuidad entre sesiones de Claude.
> Actualizar al final de cada sesión.

---

## 🗓️ Última actualización
**30 de abril de 2026** — Sprints 9-14 completados. Plan maestro finalizado.

---

## 🚀 URL de producción
**https://nexus-os-chi.vercel.app**
Repositorio: https://github.com/oscaromargp/nexus-os

---

## 🔐 Puntos de restauración (git tags)
| Tag | Fecha | Estado |
|---|---|---|
| `v1.0-stable-2026-04-28` | 28 abril | Sprint 1-3 |
| `v1.1-stable-2026-04-29` | 29 abril | Sprint 4-6 |
| `v2.8-stable-2026-04-30` | 30 abril | Sprint 7-8 |
| `v2.9-stable-2026-04-30` | 30 abril | Sprint 9 |
| `v2.10-stable-2026-04-30` | 30 abril | Sprint 10 |
| `v2.11-stable-2026-04-30` | 30 abril | Sprint 11 |
| `v2.12-stable-2026-04-30` | 30 abril | Sprint 12 |
| `v2.13-stable-2026-04-30` | 30 abril | Sprint 13 |
| `v2.14-stable-2026-04-30` | 30 abril | Sprint 14 ✅ ÚLTIMO ESTABLE |

Para restaurar: `git checkout v2.14-stable-2026-04-30`

---

## 📁 Archivos principales
```
nexus-os/
├── app.html      # SPA principal — todo el HTML de las vistas (~2100 líneas)
├── app.js        # Lógica completa — parser, CRUD, renders, modals (~5200 líneas)
├── index.html    # Landing page + Auth modal
├── main.js       # Auth Supabase + animación landing
├── style.css     # CSS global (app.html tiene su propio <style> interno)
├── vercel.json   # Rewrite /app → /app.html
├── vite.config.js
└── NEXUS_PROJECT_LOG.md  # Este archivo — memoria del proyecto
```

---

## 🏗️ Stack técnico
- **Frontend**: Vite + Vanilla JS ES Modules (sin framework)
- **DB + Auth**: Supabase (tabla `nodes`, RLS por `owner_id`)
- **CSS**: Tailwind (build) + CSS Variables "Deep Ocean Tech"
- **Gráficas**: Chart.js 4.4.4 (CDN)
- **Búsqueda**: Fuse.js (~24KB, fuzzy search)
- **Deploy**: Vercel CLI (`vercel deploy --prod --yes`)
- **APIs externas gratuitas**:
  - `open.er-api.com/v6/latest/{FROM}` — tipo de cambio fiat
  - `cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/{sym}.json` — cripto
  - `api.open-meteo.com` — clima (sin API key)

---

## 📋 Reglas técnicas críticas (no olvidar)
1. **Funciones en `window.*`** — todo lo que se llama desde `onclick` en HTML debe estar en `window`.
2. **Optimistic updates** — los nodos se insertan en `allNodes` con `_tmp_` ID antes de Supabase.
3. **Deploy**: `vercel build --prod` primero (opcional), luego `vercel deploy --prod --yes`.
4. **`renderAll()`** — llama a todas las vistas. Cambios en datos → `renderAll()`.
5. **Tabla Supabase**: se llama `nodes`. Columnas: `id, owner_id, content, type, metadata (jsonb), created_at`.
6. **Fuse.js**: importado como ES module (`import Fuse from 'fuse.js'`). `buildFuseIndex()` se llama en `renderAll()`.
7. **Tag autocomplete**: detecta `#` mid-input (no en primer char como comando) y sugiere etiquetas de `allNodes`.

---

## 🧩 Módulos implementados (11 vistas)

| Vista | ID HTML | Estado |
|---|---|---|
| Panel de Comandos / Feed | `view-feed` | ✅ Pulso Semanal + alertas hábitos + filtros |
| Muro Táctico (Kanban) | `view-kanban` | ✅ Drag-drop, modal detalle, checklist, etiquetas, **conexiones** |
| Bio-Finanzas | `view-finance` | ✅ Multi-cuenta, dashboard reactivo por cuenta, gráficas |
| Bóveda Neural | `view-notes` | ✅ Google Keep style, fullscreen, transform note |
| Línea de Tiempo | `view-calendar` | ✅ Mes/Semana/Día, eventos |
| Crónica | `view-cronica` | ✅ Histórico diario 3 columnas |
| Contactos & CRM | `view-contacts` | ✅ Import/Export CSV, ficha detalle, **Proveedores** |
| Agenda Financiera | `view-agenda` | ✅ Tarjetas completas, suscripciones, pagos con contacto, Plan del Mes |
| Herramientas | `view-herramientas` | ✅ Conversor fiat↔cripto, calc inversa, cronómetro, cuenta regresiva |
| **🏷️ Inteligencia Tags** | `view-tags` | ✅ Tag Cloud, Top 10, Durmientes, Co-ocurrencias, Hábitos, Carpeta por tag |
| Ayuda + Configuración | `view-ayuda` / `view-settings` | ✅ Tema claro/oscuro, clima configurable |

---

## 🔧 Funciones clave en app.js (referencia rápida)

| Función | Qué hace |
|---|---|
| `parseNode(raw)` | Parser semántico principal |
| `insertNodeRaw(raw)` | Inserta nodo con update optimista |
| `renderAll()` | Re-renderiza todas las vistas + buildFuseIndex() + Pulso + alertas hábitos |
| `renderFeed(nodes)` | Feed con filtros y agrupación |
| `renderFinance(nodes)` | Bio-Finanzas con cuentas reactivas |
| `renderAgenda(nodes)` | Agenda Financiera completa |
| `renderContacts()` | Grid de contactos (personas + proveedores + bancos + cripto) |
| `renderTagsView()` | Tag Cloud + Top 10 + Durmientes + Co-ocurrencias |
| `renderHabitosSection()` | Tracking de hábitos con rachas (en vista Tags) |
| `renderPulsoSemanal()` | Panel semanal automático en el feed |
| `checkHabitAlerts()` | Alertas de hábitos dormidos ≥3 días |
| `openGlobalSearch()` | Modal de búsqueda Fuse.js (Ctrl+K) |
| `openProjectView(id)` | Vista unificada de proyecto — agrega nodos por tags+links |
| `linkNodeTo(src,tgt)` | Vincula dos nodos en metadata.linkedTo |
| `buildFuseIndex()` | Construye índice Fuse.js con todos los nodos |
| `extractTagData()` | Frecuencia, lastUsed, pairFreq, tagNodeMap |
| `computeHabitStreaks()` | Calcula rachas para nodos con #hábito |
| `refreshFxWidget()` | Sidebar tipo de cambio (USD/EUR/BTC/ETH/XRP/USDT vs MXN) |
| `initTickers()` | Widget clima con open-meteo |
| `setTheme(theme)` | Cambia tema claro/oscuro |
| `downloadNodeTemplate()` | Descarga CSV plantilla para importación masiva |
| `importNodesCSV(input)` | Importa nodos desde CSV |

---

## 💡 Estado del sidebar derecho
```
aside (widget panel)
├── Relojes mundiales (CDMX, Tulum, Local)
├── 🌤 Clima enriquecido (temp, condición, sensación, humedad, viento)
├── 📡 Actividad de Red (conteo de nodos activos)
└── 💱 Tipo de cambio en vivo
    └── USD, EUR, BTC, ETH, XRP, USDT vs MXN — actualiza c/60s
```

---

## 📅 SPRINTS COMPLETADOS

### Sprint 1-3 (28 abril)
- Calendario visual + Agenda Financiera base + Gráficas Chart.js + KPIs animados

### Sprint 4-6 (29 abril)
- Fix modal préstamo/transferencia, nota fullscreen, Crónica
- Filtros de tipo en feed, saldo independiente por cuenta, Print/Export CSV
- Conversor fiat↔cripto, calculadora inversa, cronómetro con alertas sonoras

### Sprint 7 (30 abril mañana)
- Agenda Financiera: tarjetas completas (banco, CLABE, titular, número, sucursal)
- Suscripciones con `<select>` de categorías predefinidas
- Pagos fijos: contacto beneficiario + método + auto-info bancaria
- Plan del Mes: selector de cuentas + disponible real
- Contactos: Export/Import CSV + plantilla
- Sidebar: tipo de cambio en vivo (c/60s)
- Feed reactivo: pulse animation + scroll-to-top

### Sprint 8 (30 abril tarde)
- Clima enriquecido: WMO, sensación, humedad, viento
- Settings: lat/lon/ciudad configurables
- Tema claro/oscuro: CSS variables + toggle
- README v2 completo

### Sprint 9 (30 abril sesión 2)
- EUR/MXN al sidebar
- Light theme: reescritura CSS completa (30+ overrides)
- Bio-Finanzas KPIs reactivos: dashboard general vs vista por cuenta
- Nexus Data Import: plantilla CSV + validación + guía

### Sprint 10 (30 abril sesión 2)
- Fuse.js: buscador global (Ctrl+K) — fuzzy search en todos los nodos
- Tag autocomplete: `#` mid-input sugiere etiquetas existentes por frecuencia
- `data-node-id` en feed items para highlight post-navegación

### Sprint 11 (30 abril sesión 2)
- Nueva vista 🏷️ Inteligencia Tags en nav
- Tag Cloud visual (tamaño proporcional a frecuencia)
- Top 10 etiquetas con tendencia mensual (↑↓→)
- Etiquetas durmientes (>30 días sin uso)
- Co-ocurrencias: pares que aparecen juntos
- Carpeta por tag: todos los nodos de una etiqueta

### Sprint 12 (30 abril sesión 2)
- Nuevo tipo 🔧 Proveedor en Contactos
- Campos: especialidad, zona, tarifa, teléfono, estado, rating ⭐
- Filtro Proveedores en vista Contactos
- Ficha: total pagado, última interacción, todos los campos
- PROV_STATUS_LABEL para normalización

### Sprint 13 (30 abril sesión 2)
- Pulso Semanal: KPIs semana (gasto, ingresos, tareas, notas) + delta vs anterior + eventos próximos
- Tracking de hábitos: nodos con `#hábito + #nombreTag`, racha 🔥, dots 14 días
- Alertas contextuales: banner amarillo cuando ≥3 días sin registrar hábito
- Botón "Registrar" inyecta tag en la barra de comandos
- Sección Hábitos en vista Tags

### Sprint 14 (30 abril sesión 2)
- `metadata.linkedTo[]`: vínculos explícitos entre nodos
- Panel 🔗 Conexiones en modal de tarea: vincular/desvincular nodos con búsqueda
- Vista de Proyecto 📁: agrega automáticamente tareas+gastos+ingresos+contactos+notas por tags compartidos
- Botón 📁 en feed para nodos tipo `proyecto`

---

## 🗺️ PLAN DE SPRINTS FUTUROS (ideas)

### Posibles Sprints 15+
- Notificaciones push / recordatorios (Web Notifications API)
- Modo offline completo mejorado (Service Worker)
- Exportación PDF del Pulso Semanal
- Modo multi-usuario / workspace compartido
- Dashboard de KPIs ejecutivos (resumen mensual/anual)
- Integración con Google Calendar (OAuth)
- App móvil nativa (PWA mejorada o React Native)

---

## 🧠 Contexto del usuario
- **Perfil**: Empresario / emprendedor en La Paz, BCS (México)
- **Caso de uso**: Liquidez diaria, nómina, proveedores para proyectos (paneles solares en Tulum)
- **Filosofía**: "Lo que no se mide no se puede mejorar"
- **Flujo típico**: Agenda Financiera → liquidez → pagos a contactos → registro en Bio-Finanzas
- **Prioridad datos**: Agenda Financiera es el tablero de liquidez real

---

## ⚠️ Errores conocidos / lecciones aprendidas
1. **Modal anidados**: nunca poner un modal dentro del div de otro modal.
2. **Funciones no en window**: cualquier función llamada desde `onclick` en HTML debe ser `window.nombreFuncion`.
3. **Tema claro**: necesita CSS muy específico — `[style*="color:#fff"] { color: #111827 !important; }`.
4. **Tabla Supabase**: se llama `nodes` (NO `nexus_nodos`).
5. **Deploy**: `vercel deploy --prod --yes`. El `vercel --prod` solo no funciona.
6. **buildFuseIndex()**: debe llamarse después de cargar datos (en `renderAll()`) y en `openGlobalSearch()`.
7. **Tag autocomplete**: solo activar cuando `#` aparece DESPUÉS del primer carácter (no es comando).

---

## 🔄 Cómo retomar una sesión nueva

1. Leer este archivo completo.
2. Verificar estado: `git log --oneline -5` y `git tag -l "v*"`.
3. Revisar si hay sprints futuros pendientes o nuevas peticiones del usuario.
4. Leer sección relevante de app.js antes de editar.
5. Build: `npm run build` — verificar 0 errores antes de continuar.
6. Deploy: `vercel deploy --prod --yes`.

---

*Log generado automáticamente por Claude — actualizado 30 abril 2026, sesión 2.*
