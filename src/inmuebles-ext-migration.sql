-- Nexus OS — Amenidades y Servicios extendidos v2
-- Aplicar en Supabase SQL Editor

ALTER TABLE properties
  -- Amenidades nuevas (14)
  ADD COLUMN IF NOT EXISTS jacuzzi          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS gym              boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS elevador         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS salon_eventos    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS area_juegos      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS terraza          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS asador_bbq       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cine_privado     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cisterna         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS panel_solar      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS porton_electrico boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS lobby            boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS concierge        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cctv             boolean DEFAULT false,
  -- Servicios nuevos (5)
  ADD COLUMN IF NOT EXISTS gas_natural      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS gas_tanque       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS internet_fibra   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cable_tv         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS seguridad_24h    boolean DEFAULT false,
  -- Multimedia / media (si no existen aún)
  ADD COLUMN IF NOT EXISTS album_fotos_url  text,
  ADD COLUMN IF NOT EXISTS video_url        text,
  ADD COLUMN IF NOT EXISTS tour_url         text,
  ADD COLUMN IF NOT EXISTS drive_folder_url text;
