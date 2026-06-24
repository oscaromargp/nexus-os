-- Nexus OS — Salud v3: Rutinas/Gym + Ciclo menstrual
-- Versión: 2.10.0 · creado 2026-06-24
-- Aplicada vía Supabase MCP (migration: health_v3_gym_cycle)

-- ── GYM: sesiones de entrenamiento ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.health_workouts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_date  date NOT NULL DEFAULT CURRENT_DATE,
  title         text,
  notes         text,
  duration_min  integer,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_health_workouts_owner ON public.health_workouts (owner_id, workout_date DESC);
ALTER TABLE public.health_workouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hw_owner_all" ON public.health_workouts;
CREATE POLICY "hw_owner_all" ON public.health_workouts FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ── GYM: series de cada sesión ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.health_workout_sets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_id    uuid NOT NULL REFERENCES public.health_workouts(id) ON DELETE CASCADE,
  exercise      text NOT NULL,
  muscle_group  text,
  weight        numeric,
  reps          integer,
  set_order     integer,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_health_sets_owner   ON public.health_workout_sets (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_sets_workout ON public.health_workout_sets (workout_id);
CREATE INDEX IF NOT EXISTS idx_health_sets_ex      ON public.health_workout_sets (owner_id, exercise);
ALTER TABLE public.health_workout_sets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hws_owner_all" ON public.health_workout_sets;
CREATE POLICY "hws_owner_all" ON public.health_workout_sets FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ── CICLO MENSTRUAL ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.health_cycles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date  date NOT NULL,
  end_date    date,
  flow        text,           -- 'ligero' | 'medio' | 'abundante'
  symptoms    text[] DEFAULT '{}',
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_health_cycles_owner ON public.health_cycles (owner_id, start_date DESC);
ALTER TABLE public.health_cycles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hc_owner_all" ON public.health_cycles;
CREATE POLICY "hc_owner_all" ON public.health_cycles FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
