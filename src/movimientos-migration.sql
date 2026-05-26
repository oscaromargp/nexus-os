-- ═══════════════════════════════════════════════════════════════════════════
-- NEXUS OS · Módulo Movimientos — Migración SQL para Supabase
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Tabla: orquestadores ──────────────────────────────────────────────────
-- Cada usuario puede tener múltiples orquestadores (ej. "Bacocho", "Personal")
CREATE TABLE IF NOT EXISTS orquestadores (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre           text         NOT NULL,
  descripcion      text,
  moneda_principal text         NOT NULL DEFAULT 'MXN'
                                CHECK (moneda_principal IN ('MXN','USD','USDT')),
  created_at       timestamptz  NOT NULL DEFAULT now()
);

-- RLS: cada usuario solo ve sus propios orquestadores
ALTER TABLE orquestadores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orq_owner_all" ON orquestadores
  FOR ALL USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- ── 2. Tabla: movimientos ────────────────────────────────────────────────────
-- Registro individual de entradas y salidas por orquestador
CREATE TABLE IF NOT EXISTS movimientos (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  orquestador_id  uuid          NOT NULL REFERENCES orquestadores(id) ON DELETE CASCADE,
  tipo            text          NOT NULL CHECK (tipo IN ('entrada','salida')),
  fecha           date          NOT NULL DEFAULT CURRENT_DATE,
  ordenante       text,
  beneficiario    text,
  banco           text,
  clabe           text,
  cantidad        numeric(18,4) NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
  moneda          text          NOT NULL DEFAULT 'MXN'
                                CHECK (moneda IN ('MXN','USD','USDT')),
  tc              numeric(10,4) NOT NULL DEFAULT 1 CHECK (tc > 0),
  monto_mxn       numeric(18,2) NOT NULL DEFAULT 0,
  comprobante_url text,
  notas           text,
  estado          text          NOT NULL DEFAULT 'hecho'
                                CHECK (estado IN ('hecho','pendiente','cancelado')),
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);

-- RLS: cada usuario solo ve sus propios movimientos
ALTER TABLE movimientos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mov_owner_all" ON movimientos
  FOR ALL USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_movimientos_orq   ON movimientos (orquestador_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_movimientos_owner ON movimientos (owner_id);

-- ── 3. Trigger: actualiza updated_at automáticamente ────────────────────────
CREATE OR REPLACE FUNCTION nexus_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS movimientos_set_updated_at ON movimientos;
CREATE TRIGGER movimientos_set_updated_at
  BEFORE UPDATE ON movimientos
  FOR EACH ROW EXECUTE FUNCTION nexus_set_updated_at();

-- ── 4. Storage bucket: comprobantes ─────────────────────────────────────────
-- Crea el bucket (si no existe) — también puedes hacerlo desde el dashboard
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comprobantes',
  'comprobantes',
  false,
  5242880,  -- 5 MB
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Política: el usuario solo puede subir/leer/borrar sus propios archivos
-- Los archivos se guardan como <user_id>/<mov_id>.<ext>
CREATE POLICY "comp_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'comprobantes'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "comp_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'comprobantes'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "comp_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'comprobantes'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- ✅ Migración completa — verifica con:
--    SELECT * FROM orquestadores LIMIT 5;
--    SELECT * FROM movimientos   LIMIT 5;
-- ═══════════════════════════════════════════════════════════════════════════
