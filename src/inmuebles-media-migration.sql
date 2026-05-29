-- Nexus OS — Columna album_fotos_url en properties
-- Aplicar en Supabase SQL Editor

ALTER TABLE properties ADD COLUMN IF NOT EXISTS album_fotos_url text;
