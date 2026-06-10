-- Nexus OS — Módulo Disparadores (Automatizaciones)
-- Versión: 2.8.0 · creado 2026-06-10
--
-- Habilita una capa de recetas pre-armadas (IFTTT-style) sobre n8n.
-- Cada usuario activa/desactiva con un toggle; el sistema crea el
-- workflow en n8n vía API y guarda el id aquí.

-- ────────────────────────────────────────────────────────────────────
-- TABLA: user_automations
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_automations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipe_id       text NOT NULL,
  recipe_version  text DEFAULT '1.0',
  enabled         boolean NOT NULL DEFAULT true,
  params          jsonb NOT NULL DEFAULT '{}'::jsonb,
  n8n_workflow_id text,
  n8n_webhook_url text,
  last_run_at     timestamptz,
  last_run_status text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_automations_owner_recipe_unique UNIQUE (owner_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_user_automations_owner ON public.user_automations (owner_id);
CREATE INDEX IF NOT EXISTS idx_user_automations_enabled ON public.user_automations (enabled) WHERE enabled = true;

ALTER TABLE public.user_automations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_automations_owner_all" ON public.user_automations;
CREATE POLICY "user_automations_owner_all" ON public.user_automations
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ────────────────────────────────────────────────────────────────────
-- TABLA: automation_runs
-- Log compacto de ejecuciones (1 row por ejecución exitosa o errror).
-- Limpiar periódicamente: filas con ran_at < now() - interval '90 days'.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.automation_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id   uuid NOT NULL REFERENCES public.user_automations(id) ON DELETE CASCADE,
  owner_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status          text NOT NULL CHECK (status IN ('success','error','skipped')),
  detail          text,
  duration_ms     integer,
  ran_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_owner_time ON public.automation_runs (owner_id, ran_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_runs_automation ON public.automation_runs (automation_id, ran_at DESC);

ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "automation_runs_owner_select" ON public.automation_runs;
CREATE POLICY "automation_runs_owner_select" ON public.automation_runs
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

-- El service_role inserta directamente desde n8n; no requiere policy de INSERT.

-- ────────────────────────────────────────────────────────────────────
-- Trigger: updated_at
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_automations_touch_updated()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_automations_updated_at ON public.user_automations;
CREATE TRIGGER trg_user_automations_updated_at
  BEFORE UPDATE ON public.user_automations
  FOR EACH ROW EXECUTE FUNCTION public.user_automations_touch_updated();
