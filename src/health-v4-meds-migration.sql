-- Nexus OS — Salud v4: Medicamentos / Vitaminas / Suplementos
-- Versión: 2.11.0 · creado 2026-06-24
-- Aplicada vía Supabase MCP (migration: health_v4_medications)

-- ── Catálogo de lo que la persona toma ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.health_medications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            text NOT NULL,                 -- "Vitamina D", "Metformina"
  kind            text DEFAULT 'medicamento',    -- medicamento | vitamina | suplemento
  dose            text,                          -- "500 mg", "2 cápsulas"
  purpose         text,                          -- para qué: "energía", "diabetes"
  schedule_times  text[] DEFAULT '{}',           -- ['08:00','20:00']
  frequency       text DEFAULT 'diario',         -- diario | dias | prn (según necesidad)
  days_of_week    int[]  DEFAULT '{}',           -- 0=Dom..6=Sab (si frequency='dias')
  active          boolean NOT NULL DEFAULT true,
  notify_telegram boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_health_meds_owner ON public.health_medications (owner_id, active);
ALTER TABLE public.health_medications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hmed_owner_all" ON public.health_medications;
CREATE POLICY "hmed_owner_all" ON public.health_medications FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ── Registro de cada toma (historial cuantificable) ────────────────
CREATE TABLE IF NOT EXISTS public.health_medication_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  medication_id   uuid NOT NULL REFERENCES public.health_medications(id) ON DELETE CASCADE,
  scheduled_for   date NOT NULL DEFAULT CURRENT_DATE,
  scheduled_time  text,                          -- '08:00' (toma específica del día)
  status          text NOT NULL DEFAULT 'pendiente', -- tomado | no_tomado | pendiente
  taken_at        timestamptz,
  dose_taken      text,                          -- proporción real tomada
  notes           text,
  source          text NOT NULL DEFAULT 'app',   -- app | telegram
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, medication_id, scheduled_for, scheduled_time)
);
CREATE INDEX IF NOT EXISTS idx_health_medlogs_owner ON public.health_medication_logs (owner_id, scheduled_for DESC);
CREATE INDEX IF NOT EXISTS idx_health_medlogs_med   ON public.health_medication_logs (medication_id, scheduled_for DESC);
ALTER TABLE public.health_medication_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hmedlog_owner_all" ON public.health_medication_logs;
CREATE POLICY "hmedlog_owner_all" ON public.health_medication_logs FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
