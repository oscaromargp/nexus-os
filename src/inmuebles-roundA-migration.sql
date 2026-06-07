-- Ronda A — Reporte geomarketing + links múltiples
-- Aplicado en Supabase: 2026-06-07 (vía MCP)

-- 1) Links múltiples por inmueble
CREATE TABLE IF NOT EXISTS property_links (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  tipo         text NOT NULL CHECK (tipo IN ('video','foto','tour','archivo','otro')),
  url          text NOT NULL,
  label        text,
  orden        int  DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_property_links_property ON property_links(property_id, orden);

-- 2) Cache de reportes geomarketing generados
CREATE TABLE IF NOT EXISTS property_reports (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id         uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  presenter_node_id   uuid REFERENCES nodes(id) ON DELETE SET NULL,
  presenter_data      jsonb,
  proposito           text,
  contexto_json       jsonb,
  html_content        text,
  model               text,
  generated_at        timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_property_reports_property ON property_reports(property_id, generated_at DESC);

-- 3) Drop campos IA viejos (intento descartado)
ALTER TABLE properties DROP COLUMN IF EXISTS descripcion_ai;
ALTER TABLE properties DROP COLUMN IF EXISTS descripcion_ai_updated_at;
