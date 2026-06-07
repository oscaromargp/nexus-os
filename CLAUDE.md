# Nexus OS — Guía para Claude

Dashboard personal **all-in-one** con parser semántico en lenguaje natural.
Versión actual: **2.5.0**. Stack: vanilla JS + Vite + Tailwind/DaisyUI, Supabase backend, deploy en Vercel.

## Stack

- **Build**: Vite 6 (multi-entry: `index.html`, `app.html`, `propiedad.html`, `privacy.html`, `terms.html`, `reset-password.html`).
- **UI**: Tailwind 3 + DaisyUI 5 + `tailwindcss-animate`, Lucide icons.
- **Datos**: Supabase JS v2 (auth, DB, storage).
- **Generación documental**: jsPDF + jspdf-autotable + html2canvas + qrcode.
- **Otros**: chart.js, chrono-node (parser fechas), fuse.js (búsqueda), sortablejs (drag).
- **Tests**: Vitest (Node env, sólo `src/__tests__/**/*.test.js`). Playwright + puppeteer-core para E2E.
- **Deploy**: Vercel (proyecto `nexus-os-app`, ya linkeado via `.env.vercel`). Rewrites en `vercel.json` para `/app` y `/reset-password`.

## Comandos

```bash
npm run dev      # Vite dev server (localhost:5173)
npm run build    # build a dist/
npm run preview  # preview del build
npm test         # vitest run (22 tests, ~1s)
npm run test:watch
```

## Layout del repo

```
/                   HTML entrypoints (index, app, propiedad, privacy, terms, reset-password)
api/                Endpoints serverless Vercel (incluye n8n webhook)
src/                Lógica de la app
  parser.js         Parser semántico (lenguaje natural → acciones)
  supabase.js       Cliente Supabase
  logic.js          Reglas de negocio
  finance-engine.js Motor financiero
  inmuebles.js      Gestión propiedades
  docs-inmuebles.js 14 plantillas PROFECO (captación / negociación / contratos)
  pdf-inmuebles.js  Generador PDF de contratos
  pdf-reports.js    PDFs de reportes
  *-migration.sql   Migraciones Supabase (cotizaciones, inmuebles, media, ext, performance, tramites, movimientos)
  __tests__/        Tests Vitest
scripts/            Scripts utilitarios
docs/               database_schema.md, n8n-guide.md, n8n-workflows/
public/, assets/    Estáticos
```

## Variables de entorno (`.env`)

Cliente (Vite, expuestas al browser):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Servidor (api/ de Vercel, **secret**):
- `NEXUS_WEBHOOK_SECRET` — token para autenticar peticiones de n8n. Generar con `openssl rand -hex 32`.
- `NEXUS_SUPABASE_SERVICE_KEY` — service_role key (bypassa RLS). Sólo para el webhook serverless.

`.env.vercel` ya contiene un OIDC token del proyecto en development.

## Convenciones del proyecto

- **Migraciones Supabase**: archivos `src/*-migration.sql` versionados en repo. No editar después de aplicadas; crear una nueva migración.
- **Plantillas PROFECO**: texto verbatim oficial. **No resumir ni adaptar**. Los `<<campo>>` son auto-fill.
- **Auto-fill**: desde propiedad (Supabase) + desde agente (localStorage).
- **Historial documental**: tabla `property_documents` en Supabase.
- **Idioma**: español (UI, mensajes, commits, docs).

## Flujo de trabajo acordado con el usuario

1. Usuario da instrucción → Claude analiza, pregunta si hay duda, propone acotar con antiprompt cuando aplique.
2. Mantener proyecto siempre sincronizado en **GitHub + Supabase + Vercel**.
3. Cada vez que haya avance: reportar y entregar **checklist de verificación/testing** para que el usuario pruebe.
4. Auto mode activo — proceder sin pausas innecesarias salvo bloqueo real.

## Herramientas del entorno local

- `gh`, `node 18.19.1`, `npm 9.2.0`.
- `vercel` CLI (`~/.npm-global/bin/vercel`) — agregar `~/.npm-global/bin` al PATH si no aparece.
- `supabase` CLI 2.105.0 (`~/.npm-global/bin/supabase`).
- Supabase MCP disponible como complemento al CLI.

## Cosas a recordar

- Hay 4 vulnerabilidades npm (3 moderate, 1 high) — pendiente decidir si correr `npm audit fix`.
- `package.json` lista `lucide@^1.16.0` (paquete legacy); la versión moderna es `lucide@^0.5xx`. Verificar antes de tocar iconos.
- Vite ya tiene `manualChunks` configurado (vendor-pdf, vendor-charts, vendor-fuse, vendor-sortable) para bundle splitting.
