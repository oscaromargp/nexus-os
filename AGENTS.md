# Nexus OS — Guía para opencode

> **Referencia principal**: [CLAUDE.md](./CLAUDE.md) + [NEXUS_PROJECT_LOG.md](./NEXUS_PROJECT_LOG.md)

## Quick Start
```bash
npm run dev      # Vite dev server (localhost:5173)
npm run build    # build a dist/
npm run preview  # preview del build
npm test         # vitest run (22 tests, ~1s)
npm run handoff  # genera HANDOFF.md para cambio de herramienta
```

## Stack
- **Build**: Vite 6 (multi-entry: `index.html`, `app.html`, `propiedad.html`, `privacy.html`, `terms.html`, `reset-password.html`)
- **UI**: Tailwind 3 + DaisyUI 5 + `tailwindcss-animate`, Lucide icons
- **Datos**: Supabase JS v2 (auth, DB, storage)
- **Generación documental**: jsPDF + jspdf-autotable + html2canvas + qrcode
- **Otros**: chart.js, chrono-node (parser fechas), fuse.js (búsqueda), sortablejs (drag)
- **Tests**: Vitest (Node env, sólo `src/__tests__/**/*.test.js`). Playwright + puppeteer-core para E2E
- **Deploy**: Vercel (proyecto `nexus-os-app`). Rewrites en `vercel.json` para `/app` y `/reset-password`

## Variables de entorno (`.env`)
**Cliente (Vite)**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
**Servidor (api/ Vercel)**: `NEXUS_WEBHOOK_SECRET`, `NEXUS_SUPABASE_SERVICE_KEY`

## Convenciones críticas
- Migraciones Supabase: `src/*-migration.sql` versionadas. No editar tras aplicar; crear nueva.
- Plantillas PROFECO: texto verbatim oficial. No resumir. `<<campo>>` = auto-fill.
- Auto-fill: propiedad (Supabase) + agente (localStorage).
- Historial documental: tabla `property_documents` en Supabase.
- Idioma: español (UI, mensajes, commits, docs).

## Flujo de trabajo
1. Usuario da instrucción → opencode analiza, pregunta si duda, propone acotar.
2. Mantener sincronizado **GitHub + Supabase + Vercel**.
3. Cada avance: reportar + checklist verificación/testing.
4. Auto mode activo — proceder sin pausas salvo bloqueo real.

## Memoria compartida (bidireccional con Claude Code)
- **NEXUS_PROJECT_LOG.md** — Fuente de verdad única. Leer al inicio, actualizar al final.
- **HANDOFF.md** — Generado por `npm run handoff` para cambios rápidos de herramienta.
- **context-agent** — Snapshots automáticos en `.opencode/context/`.

## Herramientas locales
- `gh`, `node 18.19.1`, `npm 9.2.0`
- `vercel` CLI (`~/.npm-global/bin/vercel`)
- `supabase` CLI 2.105.0 (`~/.npm-global/bin/supabase`)

## Pendientes actuales (ver NEXUS_PROJECT_LOG.md)
- Crónica vs Línea de Tiempo: decidir rol de cada vista
- Phase 5 — Módulo Salud (schema biomarcador, vista `view-salud`, Ollama local)