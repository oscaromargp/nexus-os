# NEXUS OS — LOG DEL PROYECTO
> Archivo de memoria para continuidad entre sesiones de Claude.
> Actualizar al final de cada sesión.

---

## 🗓️ Última actualización
**30 de abril de 2026** — Sprint 8 completado y desplegado.

---

## 🚀 URL de producción
**https://nexus-os-chi.vercel.app**
Repositorio: https://github.com/oscaromargp/nexus-os

---

## 🔐 Puntos de restauración (git tags locales)
| Tag | Fecha | Estado |
|---|---|---|
| `v1.0-stable-2026-04-28` | 28 abril | Sprint 1-3 |
| `v1.1-stable-2026-04-29` | 29 abril | Sprint 4-6 |
| `v2.8-stable-2026-04-30` | 30 abril | Sprint 7-8 ✅ ÚLTIMO ESTABLE |

Para restaurar: `git checkout v2.8-stable-2026-04-30`

---

## 📁 Archivos principales
```
nexus-os/
├── app.html      # SPA principal — todo el HTML de las vistas (~1900 líneas)
├── app.js        # Lógica completa — parser, CRUD, renders, modals (~4300 líneas)
├── index.html    # Landing page + Auth modal
├── main.js       # Auth Supabase + animación landing
├── style.css     # CSS global (app.html tiene su propio <style> interno)
├── vercel.json   # Rewrite /app → /app.html
└── vite.config.js
```

---

## 🏗️ Stack técnico
- **Frontend**: Vite + Vanilla JS ES Modules (sin framework)
- **DB + Auth**: Supabase (tabla `nodes`, RLS por `owner_id`)
- **CSS**: Tailwind (build) + CSS Variables "Deep Ocean Tech"
- **Gráficas**: Chart.js 4.4.4 (CDN, cargado antes del módulo ES)
- **Deploy**: Vercel CLI (`vercel deploy --prod --yes`)
- **APIs externas gratuitas**:
  - `open.er-api.com/v6/latest/{FROM}` — tipo de cambio fiat
  - `cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/{sym}.json` — cripto
  - `api.open-meteo.com` — clima (sin API key)

---

## 📋 Reglas técnicas críticas (no olvidar)
1. **Funciones en `window.*`** — todo lo que se llama desde `onclick` en HTML debe estar en `window`. Las funciones de módulo JS son invisibles al HTML.
2. **Optimistic updates** — los nodos se insertan en `allNodes` con `_tmp_` ID antes de Supabase. Ver `insertNodeRaw()` y `insertDirectNode()`.
3. **Deploy**: siempre `vercel build --prod` primero, luego `vercel deploy --prod --yes`. Nunca push a GitHub para auto-deploy (no hay `.env` en el repo).
4. **`renderAll()`** — llama a todas las vistas. Cambios en datos → `renderAll()`.
5. **DNS GitHub**: si falla `git push`, resolver con `nslookup github.com 8.8.8.8` y reintentar.
6. **Tabla Supabase**: se llama `nodes` (NO `nexus_nodos`). Columnas: `id, owner_id, content, type, metadata (jsonb), created_at`.

---

## 🧩 Módulos implementados (10 vistas)

| Vista | ID HTML | Estado |
|---|---|---|
| Panel de Comandos / Feed | `view-feed` | ✅ Completo. Filtros por tipo, agrupación, feed reactivo con pulse animation |
| Muro Táctico (Kanban) | `view-kanban` | ✅ Completo. Drag-drop, modal detalle, checklist, etiquetas |
| Bio-Finanzas | `view-finance` | ✅ Completo. Multi-cuenta @cuenta, gráficas, CSV, transferencias |
| Bóveda Neural | `view-notes` | ✅ Completo. Google Keep style, fullscreen, transform note |
| Línea de Tiempo | `view-calendar` | ✅ Completo. Mes/Semana/Día, eventos |
| Crónica | `view-cronica` | ✅ Completo. Histórico diario 3 columnas |
| Contactos & CRM | `view-contacts` | ✅ Completo. Import/Export CSV, plantilla, ficha detalle |
| Agenda Financiera | `view-agenda` | ✅ Completo. Tarjetas completas, suscripciones predefinidas, pagos con contacto/método, Plan del Mes con cuentas |
| Herramientas | `view-herramientas` | ✅ Completo. Conversor fiat↔cripto, calc inversa, cronómetro, cuenta regresiva |
| Ayuda + Configuración | `view-ayuda` / `view-settings` | ✅ Completo. Tema claro/oscuro, clima configurable |

---

## 🔧 Funciones clave en app.js (referencia rápida)

| Función | Línea aprox | Qué hace |
|---|---|---|
| `parseNode(raw)` | ~400 | Parser semántico principal |
| `insertNodeRaw(raw)` | ~653 | Inserta nodo con update optimista |
| `insertDirectNode(type, content, meta)` | ~709 | Inserta nodo directo (agenda, eventos) |
| `renderAll()` | ~979 | Re-renderiza todas las vistas |
| `renderFeed(nodes)` | ~1049 | Feed con filtros y agrupación |
| `renderFinance(nodes)` | ~1400 | Bio-Finanzas con cuentas |
| `renderAgenda(nodes)` | ~2392 | Agenda Financiera completa |
| `renderContacts()` | ~3548 | Grid de contactos |
| `openAgendaModal(type)` | ~2614 | Modal nueva tarjeta/suscripción/pago |
| `saveAgendaItem()` | ~2646 | Guarda ítem de agenda |
| `exportContactsCSV()` | ~fin | Export CSV contactos |
| `importContactsCSV(input)` | ~fin | Import CSV contactos |
| `downloadContactTemplate()` | ~fin | Plantilla CSV |
| `fetchFiatRate(from, to)` | ~1652 | Tipo de cambio fiat (open.er-api) |
| `fetchCryptoRate(from, to)` | ~1659 | Precio cripto (@fawazahmed0) |
| `initFxWidget()` | ~fin | Sidebar tipo de cambio, refresca c/60s |
| `initTickers()` | ~3181 | Widget clima con open-meteo |
| `loadSystemSettings()` | ~fin | Carga preferencias del localStorage |
| `setTheme(theme)` | ~fin | Cambia tema claro/oscuro |
| `wmoWeather(code)` | ~3175 | Código WMO → descripción e ícono |

---

## 💡 Estado del sidebar derecho
```
aside (widget panel)
├── Relojes mundiales (CDMX, Tulum, Local)
├── Cronómetro + Cuenta regresiva (view-herramientas)
├── 🌤 Clima enriquecido (temp, condición, sensación, humedad, viento)
│   └── Coordenadas configurables en Settings
├── 📡 Actividad de Red (conteo de nodos activos)
└── 💱 Tipo de cambio en vivo
    └── USD, BTC, ETH, XRP, USDT vs MXN — actualiza c/60s
```

---

## 📅 SPRINTS COMPLETADOS

### Sprint 1-3 (28 abril)
- Calendario visual + Agenda Financiera base
- Gráficas Chart.js en Bio-Finanzas
- KPIs animados

### Sprint 4-6 (29 abril)
- B1: Fix modal préstamo/transferencia (estaban anidados en HTML)
- B2: Fix nota fullscreen (CSS flex + reset inline styles)
- B3: Fix Crónica (`window.renderCronicaView`, detección de fechas en metadata)
- M1: Filtros de tipo en feed (pills con color-coding)
- M2: Saldo independiente por cuenta en Bio-Finanzas
- M3: Print/Export CSV filtrado
- M5: Conversor unificado fiat↔cripto
- M6: Calculadora inversa (neto → bruto con comisión)
- M7: Cronómetro con alertas sonoras Web Audio API

### Sprint 7 (30 abril mañana)
- Agenda Financiera: tarjetas con datos completos (banco, CLABE, titular, número completo, sucursal)
- Suscripciones: `<select>` con categorías predefinidas
- Pagos fijos: contacto beneficiario + método de pago + auto-info bancaria
- Plan del Mes: selector de cuentas por checkbox + disponible real
- Contactos: Export CSV + Import CSV + plantilla descargable
- Sidebar: tipo de cambio en vivo USD/BTC/ETH/XRP/USDT vs MXN (c/60s)
- Feed reactivo: pulse animation + scroll-to-top al insertar

### Sprint 8 (30 abril tarde)
- Clima enriquecido: condición WMO, sensación térmica, humedad, viento
- Settings: lat/lon/ciudad configurables para el clima
- Tema claro/oscuro: CSS variables + toggle en Configuración
- Settings: guardar sin reload (showToast)
- Ayuda: secciones nuevas Agenda Financiera, CSV contactos, tipo de cambio
- README v2: 10 módulos, SQL correcto, badges, quick start completo

---

## 🗺️ PLAN DE SPRINTS PENDIENTES

### Sprint 9 — Correcciones + Fundamentos
- [ ] 9.1 EUR/MXN al sidebar tipo de cambio
- [ ] 9.2 Light theme legibilidad (reescritura CSS más específica)
- [ ] 9.3 Bio-Finanzas KPIs reactivos: todas las cuentas = dashboard general, cuenta específica = solo esa cuenta
- [ ] 9.4 Nexus Data Import: reemplazar textarea libre por plantilla + validación + guía de formato

### Sprint 10 — Autocompletado + Búsqueda Global
- [ ] 10.1 Autocompletado de tags en barra de comandos (extrae tags únicos de allNodes, sugiere al escribir `#`)
- [ ] 10.2 Buscador global con Fuse.js (texto, tipo, cuenta, tag, fecha — fuzzy search)
- **Librería a instalar**: `npm install fuse.js` (24 KB, sin IA)

### Sprint 11 — Inteligencia de Tags
- [ ] 11.1 Tag Cloud visual (CSS proporcional a frecuencia)
- [ ] 11.2 Panel de frecuencia: top 10 tags, tendencia vs mes anterior, tags durmientes
- [ ] 11.3 Tags co-ocurrentes (detecta pares de tags que siempre aparecen juntos)
- [ ] 11.4 Vista por tag (click en tag → carpeta de todos sus nodos)

### Sprint 12 — Proveedores & Relaciones
- [ ] 12.1 Tipo `proveedor` en Contactos (campos: especialidad, zona, precio, rating ⭐, estado)
- [ ] 12.2 Vista agrupada por especialidad/categoría
- [ ] 12.3 Relación cuantificada automática (total pagado, última interacción, tendencia)
- [ ] 12.4 Log de interacciones cronológico en ficha de proveedor

### Sprint 13 — Pulso Semanal + Tracking de Hábitos
- [ ] 13.1 Pulso Semanal automático (síntesis: tareas vencidas, facturas próximas, gasto vs semana anterior)
- [ ] 13.2 Tracking de hábitos — tipo `#hábito`, racha, días consecutivos, días de ausencia
- [ ] 13.3 Alertas contextuales ("llevas 7 días sin un nodo #gimnasio")
- [ ] 13.4 Correlaciones manuales definidas por el usuario (si #enfermo → revisar #gimnasio)

### Sprint 14 — Arquitectura relacional
- [ ] 14.1 Nodos que referencian otros nodos (metadata: `{ linkedTo: [nodeId1, nodeId2] }`)
- [ ] 14.2 Vista de proyecto unificada (nodo #proyecto → tareas + pagos + contactos + notas vinculados)
- [ ] 14.3 Grafo de relaciones simple (lista expandible de conexiones)

---

## 🧠 Contexto del usuario (para personalizar sugerencias)

- **Perfil**: Empresario / emprendedor en La Paz, BCS (México)
- **Caso de uso principal**: Liquidez diaria, pagos de nómina y servicios, proveedores para proyectos (ej: paneles solares en Tulum)
- **Filosofía**: "Lo que no se mide no se puede mejorar" — quiere cuantificar y cualificar todo
- **Flujo típico**: Agenda Financiera → liquidez disponible → pagos a contactos → registro en Bio-Finanzas
- **Siempre abre**: ambos sidebars (nav izquierdo + panel derecho)
- **Prioridad de datos**: Agenda Financiera es el tablero de liquidez real, no solo un tracker
- **Dolor principal**: información dispersa, no poder encontrar nodos históricos rápido, duplicación de tags por typos
- **Siguiente proyecto**: instalación de paneles solares en Tulum — necesita gestionar proveedores, cotizaciones, pagos

---

## 💬 Frases clave del usuario (filosofía)
- "Todo es un nodo" — el principio arquitectónico
- "Lo que no se mide no se puede mejorar"
- "El sistema debería hablarme de mi vida"
- "Nunca me había sentido tan comprendido"
- "Quiero saber poder analizar el día a día de la vida"

---

## ⚠️ Errores conocidos / lecciones aprendidas
1. **Modal anidados**: nunca poner un modal dentro del div de otro modal en HTML — se abre el padre y aparecen ambos.
2. **Funciones no en window**: cualquier función llamada desde `onclick` en HTML debe ser `window.nombreFuncion = ...`
3. **Tema claro**: la primera versión tenía texto blanco sobre fondo claro — necesita CSS muy específico para cada componente.
4. **Tabla Supabase**: se llama `nodes`, un viejo README decía `nexus_nodos` — ya corregido.
5. **Deploy**: `vercel build --prod` primero, luego `vercel deploy --prod --yes`. El `vercel --prod` solo no funciona correctamente.
6. **DNS GitHub**: en red local puede fallar la resolución — usar `nslookup github.com 8.8.8.8` para obtener IP y reintentar.

---

## 🔄 Cómo retomar una sesión nueva

1. Leer este archivo completo.
2. Verificar estado actual: `git log --oneline -5` y `git tag -l "v*"`.
3. Revisar qué sprint sigue en "PLAN DE SPRINTS PENDIENTES".
4. Leer app.js (sección relevante) y app.html antes de editar.
5. Build: `npm run build` — verificar 0 errores antes de continuar.
6. Deploy: `vercel deploy --prod --yes`.

---

*Log generado automáticamente por Claude — actualizar al final de cada sesión.*
