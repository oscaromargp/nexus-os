-- Nexus OS — Salud v2: Laboratorio + Signos vitales (mediciones enriquecidas)
-- Versión: 2.9.0 · creado 2026-06-24
-- Aplicada vía Supabase MCP (migration: health_v2_labs_vitals)
--
-- Extiende health_readings para soportar:
--   · value2      → segundo valor (presión arterial sistólica/diastólica)
--   · source      → 'manual' | 'photo_ai' | 'import'  (trazabilidad de captura)
--   · category    → agrupar por tipo (vitales, química, lípidos, orina…)
-- Y health_goals para Hábitos v2:
--   · target_type → 'binary' | 'count' | 'time'  (3 tipos de hábito)

-- ── health_readings ────────────────────────────────────────────────
ALTER TABLE public.health_readings
  ADD COLUMN IF NOT EXISTS value2   numeric,
  ADD COLUMN IF NOT EXISTS source   text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS category text;

-- Índice para agrupar series por marcador/fecha rápido
CREATE INDEX IF NOT EXISTS idx_health_readings_owner_marker
  ON public.health_readings (owner_id, marker, measured_at DESC);

-- ── health_goals: tipo de hábito ───────────────────────────────────
ALTER TABLE public.health_goals
  ADD COLUMN IF NOT EXISTS target_type text NOT NULL DEFAULT 'count';
  -- 'binary' = sí/no (1 = cumplido), 'count' = numérico (vasos, pasos),
  -- 'time'   = minutos (ejercicio, meditación)
