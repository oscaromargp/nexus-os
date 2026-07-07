-- Nexus OS — Columna metadata (jsonb) en properties
-- Versión: 2.12.0 · creado 2026-07-01
-- Aplicada vía Supabase MCP (migration: properties_metadata_jsonb)
--
-- api/propiedad.js ya seleccionaba `metadata` y el formulario de inmuebles
-- (tipo Prefabricada) guarda en metadata.prefab, pero la columna no existía →
-- el guardado tronaba ("Error — reintentar"). Se agrega como jsonb.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
