-- Nexus OS — Fase 1 inmuebles
-- Aplicado en Supabase: 2026-06-07 (vía MCP)
-- Soft delete + campos descriptivos + narrativa IA

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS descripcion_ai text,
  ADD COLUMN IF NOT EXISTS descripcion_ai_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS uso_suelo text,
  ADD COLUMN IF NOT EXISTS regularizacion text,
  ADD COLUMN IF NOT EXISTS topografia text;

CREATE INDEX IF NOT EXISTS idx_properties_deleted_at
  ON properties(deleted_at) WHERE deleted_at IS NULL;

COMMENT ON COLUMN properties.deleted_at IS 'Soft delete: NULL = activo. Papelera de 30 días.';
COMMENT ON COLUMN properties.uso_suelo IS 'residencial, comercial, mixto, rustico, industrial, agricola';
COMMENT ON COLUMN properties.regularizacion IS 'privada, ejidal, comunal, posesion, escritura_publica, sin_titulo';
COMMENT ON COLUMN properties.topografia IS 'plana, pendiente_leve, pendiente_pronunciada, irregular, en_esquina';
