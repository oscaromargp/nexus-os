-- Nexus OS — Documentos Inmobiliarios
-- Aplicar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS property_documents (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid        REFERENCES properties(id) ON DELETE CASCADE,
  user_id     uuid        REFERENCES auth.users(id),
  template_id text        NOT NULL,
  template_name text,
  data        jsonb       DEFAULT '{}',
  status      text        DEFAULT 'borrador',   -- borrador | firmado | archivado
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE property_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prop_docs_owner" ON property_documents
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION _set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS prop_docs_updated_at ON property_documents;
CREATE TRIGGER prop_docs_updated_at
  BEFORE UPDATE ON property_documents
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();
