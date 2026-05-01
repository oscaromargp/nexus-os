# NEXUS OS — LOG DEL PROYECTO
> Archivo de memoria para continuidad entre sesiones de Claude.
> Actualizar al final de cada sesión.

---

## 🗓️ Última actualización
**1 de mayo de 2026** — Fase 4 completa (Sprints 4A/4B/4C). README profesional generado. Auto-refresh proyectos. Próximo: Crónica vs Línea de Tiempo + Fase 5 (Salud).

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
| `v2.14-stable-2026-04-30` | 30 abril | Sprint 14 ✅ |
| `v2.14.1-backup-pre-sprint15` | 30 abril | Backup pre-Phase 1 |
| `v2.15-phase0-hotfixes` | 30 abril | Phase 0 ✅ |
| `v2.16-phase1-proveedor` | 1 mayo | Phase 1 ✅ Proveedor enriquecido |
| `v2.17-phase2-cotizaciones` | 1 mayo | Phase 2 ✅ Cotizaciones + Proyectos base |
| `v2.18-phase3-pagos` | 1 mayo | Phase 3 ✅ Semáforo + pago asistido splits |
| `v2.19-sprint4a` | 1 mayo | Sprint 4A ✅ autoLink + category + anticipo |
| `v2.20-sprint4b` | 1 mayo | Sprint 4B ✅ Vista Proyectos dedicada |
| `v2.21-sprint4c` | 1 mayo | Sprint 4C ✅ expense_type + picker + pre-fill |
| `v2.22-polish` | 1 mayo | **✅ ÚLTIMO ESTABLE — auto-refresh + README** |

Para restaurar: `git checkout v2.22-polish`

---

## 📁 Archivos principales
```
nexus-os/
├── app.html      # SPA principal — todo el HTML de las vistas (~2100 líneas)
├── app.js        # Lógica completa — parser, CRUD, renders, modals (~5200+ líneas)
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
8. **Edit tool**: siempre re-leer el archivo antes de editar si se usó Bash/sed entre medias.
9. **Charts filtro**: `toggleFinanceCharts` pasa `filtered` (by account), no `allNodes`.
10. **`dominance-label`**: `id` en el span del finance-hero para hacerlo reactivo.

---

## 🧩 Módulos implementados (12 vistas)

| Vista | ID HTML | Estado |
|---|---|---|
| Panel de Comandos / Feed | `view-feed` | ✅ Pulso Semanal + semáforo cuentas + alertas hábitos + filtros |
| Muro Táctico (Kanban) | `view-kanban` | ✅ Drag-drop, modal detalle, checklist, etiquetas, conexiones, cover image |
| Bio-Finanzas | `view-finance` | ✅ Multi-cuenta, dashboard reactivo, gráficas filtradas por cuenta, hero reactivo |
| Bóveda Neural | `view-notes` | ✅ Google Keep style, fullscreen, transform note, imágenes Ctrl+V |
| Línea de Tiempo | `view-calendar` | ✅ Mes/Semana/Día, eventos |
| Crónica | `view-cronica` | ✅ Histórico diario 3 columnas |
| Contactos & CRM | `view-contacts` | ✅ Import/Export CSV, ficha detalle, Proveedores enriquecidos (servicios, cuentas, cripto) |
| 🏗️ **Proyectos** | `view-proyectos` | ✅ **NUEVO** Grid de tarjetas + dashboard por proyecto con 5 métricas financieras |
| Agenda Financiera | `view-agenda` | ✅ Tarjetas completas, suscripciones, pagos con contacto, Plan del Mes |
| Herramientas | `view-herramientas` | ✅ Conversor fiat↔cripto, calc inversa, cronómetro, cuenta regresiva |
| 🏷️ Inteligencia Tags | `view-tags` | ✅ Tag Cloud, Top 10, Durmientes, Co-ocurrencias, Hábitos |
| Ayuda + Configuración | `view-ayuda` / `view-settings` | ✅ Tema claro/oscuro, clima configurable |

---

## 🔧 Funciones clave en app.js (referencia rápida)

| Función | Qué hace |
|---|---|
| `parseNode(raw)` | Parser semántico principal (detecta tipo, monto, cuenta, tags, proyecto) |
| `insertNodeRaw(raw)` | Inserta nodo con update optimista |
| `renderAll()` | Re-renderiza todas las vistas + proyectos (si activo) + buildFuseIndex() |
| `renderFeed(nodes)` | Feed con filtros y agrupación |
| `renderFinance(nodes)` | Bio-Finanzas con cuentas reactivas + hero reactivo |
| `renderSemaforoCuentas()` | Pastillas de cuentas con balance (🟢/🔴) en Panel de Comandos |
| `renderAgenda(nodes)` | Agenda Financiera completa |
| `renderContacts()` | Grid de contactos (personas + proveedores + bancos + cripto) |
| `renderProyectos()` | Grid de tarjetas por proyecto con métricas rápidas |
| `renderProjectCard(p)` | Tarjeta individual de proyecto (gauge, 3 métricas, alertas) |
| `openProjectDashboard(id)` | Dashboard completo: 5 métricas, proveedores, cotizaciones, materiales, tareas |
| `autoLinkToProject(nodeId, tag)` | Vincula cotización/pago al proyecto vía linkedTo[] |
| `openCotizacionModal(id, prefillTag)` | CRUD cotizaciones con pre-fill de proyecto |
| `saveCotizacion()` | Guarda cotización + autoLink al proyecto |
| `changeCotizacionStatus(id, status)` | Cambia estado + autoLink + banner anticipo si acepta |
| `openPaymentModal(cid, svcId, projTag)` | Modal pago asistido con splits, expense_type, pre-fill proyecto |
| `savePayment()` | Guarda gasto con splits, expense_type, autoLink al proyecto |
| `openProveedorPicker(projTag)` | Picker "Contratar sin cotización" — filtra proveedores |
| `showEnrichPrompt(id, name)` | Banner flotante post-guardado nuevo proveedor (9s) |
| `openContactSheet(id)` | Ficha detalle proveedor con servicios, cuentas, pagos |
| `renderTagsView()` | Tag Cloud + Top 10 + Durmientes + Co-ocurrencias |
| `renderHabitosSection()` | Tracking de hábitos con rachas (en vista Tags) |
| `renderPulsoSemanal()` | Panel semanal automático en el feed |
| `checkHabitAlerts()` | Alertas de hábitos dormidos ≥3 días |
| `openGlobalSearch()` | Modal de búsqueda Fuse.js (Ctrl+K) |
| `buildFuseIndex()` | Construye índice Fuse.js con todos los nodos |
| `toggleFinanceCharts()` | Muestra/oculta gráficas — pasa nodos filtrados por cuenta |
| `renderFinanceCharts(nodes)` | Renderiza 3 gráficas: barras, donut, línea de tiempo |

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

## 👤 Perfil del usuario (Oscar)
- **Nombre**: Oscar Omar Gómez Peña
- **Ubicación**: La Paz, BCS, México
- **Perfil profesional**: Ingeniero Bioquímico, asistente de Luis Moreno Lacalle Zaldivar
- **Proyectos activos**:
  - **Nexus OS** — este dashboard personal
  - **Abasto Mayorista** — distribución de abarrotes, inventario pendiente
  - **9Stratex** — proyecto estratégico
  - **BN Records** — sello musical
  - **PardeSantos** — marca gastronómica
  - **PayPaps** — fintech/pagos
  - Marcas gastronómicas, videografía de eventos
- **Hardware**: HUAWEI MateBook Ryzen, Linux Mint XFCE, DJI Mavic 3 Pro Cine, Canon EOS Rebel T7, Insta360 X5
- **Vehículos**: Italika FT150, SEAT Ateca
- **Skills técnicos**: n8n (experto), GitHub/Vercel (avanzado), videografía/edición
- **Hobbies**: pesca de orilla / kayak / senderismo, 3 perros, pareja Ana Karen
- **Filosofía**: "Lo que no se mide no se puede mejorar"
- **Flujo típico**: Agenda Financiera → liquidez → pagos a contactos → registro en Bio-Finanzas
- **XRP Address**: `rBthUCndKy3Xbb19Ln4xkZeMwusX9NrYfj`
- **GitHub**: `@oscaromargp`

---

## 🗺️ PLAN DE FASES (roadmap activo)

### ✅ Phase 0 — Hotfixes (COMPLETADO — v2.15)
- [x] 0.1 Bio-Finanzas: gráficas filtran por cuenta activa (`toggleFinanceCharts` con `filtered`)
- [x] 0.2 Finance-hero: label + balance reactivos al `activeAccount`
- [x] 0.3 Kanban: cover image (thumbnail) cuando el nodo tiene imágenes adjuntas

### ✅ Phase 1 — Proveedor Enriquecido (COMPLETADO — v2.16)
- [x] Modal proveedor: RFC, dirección, día de pago, cuenta bancaria, cripto
- [x] Post-guardado: prompt flotante "¿Enriquecer ficha?" (9s auto-dismiss)
- [x] Ficha proveedor: servicios propios, cuentas bancarias/cripto con copia rápida
- [x] `metadata.services[]` y `metadata.contact_accounts[]`

### ✅ Phase 2 — Gestión de Proyectos (COMPLETADO — v2.17)
- [x] Tipo nodo `cotizacion` con estados: pendiente / aceptada / rechazada
- [x] Parser: `#cotizacion $monto @proyecto`
- [x] Campo `rol` en proyectos: dueño / ejecutor / colaborador
- [x] CRUD completo cotizaciones con modal

### ✅ Phase 3 — Pago Asistido + Semáforo (COMPLETADO — v2.18)
- [x] Modal pago asistido con splits (múltiples métodos/cuentas)
- [x] Rating de calidad por proveedor (1-5 estrellas + nota)
- [x] Semáforo de cuentas en Panel de Comandos (🟢/🔴)
- [x] Contactos como entidades ricas (César use case)

### ✅ Sprint 4A — Foundation Links (COMPLETADO — v2.19)
- [x] `autoLinkToProject()`: hard-link cotización/pago → proyecto en `linkedTo[]`
- [x] `changeCotizacionStatus()`: auto-link al aceptar + banner anticipo 10s
- [x] Campo `category` en cotizaciones con datalist autocomplete
- [x] `openPaymentModal(cid, svcId, projTag)`: pre-fill proyecto desde anticipo

### ✅ Sprint 4B — Vista Proyectos (COMPLETADO — v2.20)
- [x] Nav `🏗️ Proyectos` (entre Contactos y Agenda)
- [x] Grid de tarjetas con gauge de presupuesto, 3 métricas, alerta overbudget
- [x] Dashboard completo: 5 métricas financieras, proveedores contratados con excedente detection
- [x] Cotizaciones agrupadas por categoría con quick-accept, sección materiales, sección tareas

### ✅ Sprint 4C — Workflow Final (COMPLETADO — v2.21)
- [x] `expense_type` (servicio/material/overhead): auto-detectado, overrideable, tag en metadata
- [x] Modal picker `🔧 Sin cotización`: búsqueda de proveedores → pago directo
- [x] `openCotizacionModal(id, prefillTag)`: todos los botones del dashboard pre-llenan proyecto
- [x] `renderAll()` re-renderiza proyectos si la vista está activa

### 🔄 Pendiente inmediato
- [ ] **Crónica vs Línea de Tiempo**: decidir rol de cada vista (pueden ser complementarias, no redundantes)
- [ ] **Banner real** para README (Canva o carbon.now.sh)
- [ ] **Demo GIF** del parser en acción

### 🏥 Phase 5 — Módulo Salud (próximo)
- [ ] Schema biomarcador: peso, presión, glucosa, talla
- [ ] Vista dedicada `view-salud` con gráficas de tendencia
- [ ] Integración futura con Ollama local

### 📊 Phase 6 — Inteligencia Operativa
- [ ] Dashboard KPIs personales
- [ ] Webhook Supabase Edge Function → n8n
- [ ] Módulo inventario Abasto Mayorista

### 🌐 Phase 7 — Ecosistema Extendido (Sprint 20+)
- [ ] CFDI / Facturación
- [ ] PWA offline mejorada (Service Worker)
- [ ] Notificaciones push (Web Notifications API)
- [ ] Exportación PDF del Pulso Semanal / reporte mensual ejecutivo
- [ ] Modo multi-usuario / workspace compartido

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

### Phase 0 — Hotfixes (30 abril sesión 3)
- Fix 0.1: `toggleFinanceCharts` ahora pasa nodos filtrados por `activeAccount` a `renderFinanceCharts`
- Fix 0.2: `finance-hero` reactivo: label cambia entre "Balance Neto Consolidado" y "Balance • {cuenta}"
- Fix 0.3: Kanban cards muestran imagen como cover (Trello-style) cuando `metadata.images[0]` existe

---

## ⚠️ Errores conocidos / lecciones aprendidas
1. **Modal anidados**: nunca poner un modal dentro del div de otro modal.
2. **Funciones no en window**: cualquier función llamada desde `onclick` en HTML debe ser `window.nombreFuncion`.
3. **Tema claro**: necesita CSS muy específico — `[style*="color:#fff"] { color: #111827 !important; }`.
4. **Tabla Supabase**: se llama `nodes` (NO `nexus_nodos`).
5. **Deploy**: `vercel deploy --prod --yes`. El `vercel --prod` solo no funciona.
6. **buildFuseIndex()**: debe llamarse después de cargar datos (en `renderAll()`) y en `openGlobalSearch()`.
7. **Tag autocomplete**: solo activar cuando `#` aparece DESPUÉS del primer carácter (no es comando).
8. **Edit tool post-Bash**: si se ejecutó `sed` o Bash que modifica el archivo, re-leer antes de Edit.
9. **Charts bug original**: `toggleFinanceCharts` llamaba `renderFinanceCharts(allNodes)` → corregido a `filtered`.
10. **IIFE en template literals**: `${(() => { ... })()}` funciona para lógica compleja en HTML generado por JS.

---

## 🔄 Cómo retomar una sesión nueva

1. Leer este archivo completo.
2. Verificar estado: `git log --oneline -5` y `git tag -l "v*"`.
3. Revisar sección "PLAN DE FASES" para ver qué sigue.
4. Leer sección relevante de app.js antes de editar.
5. Build: `npm run build` — verificar 0 errores antes de continuar.
6. Deploy: `vercel deploy --prod --yes`.

---

*Log actualizado por Claude — 30 abril 2026, sesión 3 (Phase 0 completa, Phase 1 en curso).*
