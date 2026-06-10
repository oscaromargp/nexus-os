-- Nexus OS — Fase 2: Módulo RSS Feeds en Proyectos
-- Versión: 2.8.0 · creado 2026-06-10
-- Aplicada vía Supabase MCP (migration: rss_feeds_phase_2)

-- ────────────────────────────────────────────────────────────────────
-- TABLA: project_rss_sources
-- Fuentes RSS (canales/perfiles) registradas por proyecto.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_rss_sources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
  owner_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform        text NOT NULL,
  -- 'youtube','instagram','tiktok','spotify','facebook','twitter','soundcloud',
  -- 'bandcamp','twitch','wordpress','rss','news','custom'
  handle          text,
  feed_url        text NOT NULL,
  label           text,
  artist_name     text,
  thumbnail       text,
  enabled         boolean NOT NULL DEFAULT true,
  last_check_at   timestamptz,
  last_seen_id    text,
  last_seen_at    timestamptz,
  fail_count      integer NOT NULL DEFAULT 0,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rss_sources_project ON public.project_rss_sources (project_id);
CREATE INDEX IF NOT EXISTS idx_rss_sources_owner   ON public.project_rss_sources (owner_id);
CREATE INDEX IF NOT EXISTS idx_rss_sources_enabled ON public.project_rss_sources (enabled) WHERE enabled = true;

ALTER TABLE public.project_rss_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rss_sources_owner_all" ON public.project_rss_sources;
CREATE POLICY "rss_sources_owner_all" ON public.project_rss_sources
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.rss_sources_touch_updated()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_rss_sources_updated_at ON public.project_rss_sources;
CREATE TRIGGER trg_rss_sources_updated_at
  BEFORE UPDATE ON public.project_rss_sources
  FOR EACH ROW EXECUTE FUNCTION public.rss_sources_touch_updated();

-- ────────────────────────────────────────────────────────────────────
-- TABLA: project_rss_items
-- Items detectados por el tracker. Cada uno tiene un status de pipeline.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_rss_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id      uuid NOT NULL REFERENCES public.project_rss_sources(id) ON DELETE CASCADE,
  project_id     uuid NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
  owner_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_id    text NOT NULL,
  title          text,
  url            text,
  thumbnail      text,
  description    text,
  author         text,
  published_at   timestamptz,
  status         text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','rejected','in_progress','edited','scheduled','published','archived')),
  notes          text,
  scheduled_for  timestamptz,
  blog_post_url  text,
  draft_content  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rss_items_source_external_unique UNIQUE (source_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_rss_items_project_status ON public.project_rss_items (project_id, status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_rss_items_owner_status   ON public.project_rss_items (owner_id, status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_rss_items_published      ON public.project_rss_items (published_at DESC);

ALTER TABLE public.project_rss_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rss_items_owner_all" ON public.project_rss_items;
CREATE POLICY "rss_items_owner_all" ON public.project_rss_items
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.rss_items_touch_updated()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_rss_items_updated_at ON public.project_rss_items;
CREATE TRIGGER trg_rss_items_updated_at
  BEFORE UPDATE ON public.project_rss_items
  FOR EACH ROW EXECUTE FUNCTION public.rss_items_touch_updated();
