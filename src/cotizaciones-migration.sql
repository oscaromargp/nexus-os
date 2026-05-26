-- ═══════════════════════════════════════════════════════════════════════════════
-- Nexus OS — Cotizaciones y Ventas Migration
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Extensiones ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── updated_at trigger helper ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLA: cot_catalogo — Catálogo de productos y servicios
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS cot_catalogo (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre      TEXT        NOT NULL,
  descripcion TEXT,
  foto_url    TEXT,
  precio      NUMERIC(14,4) NOT NULL DEFAULT 0,
  moneda      TEXT        NOT NULL DEFAULT 'MXN' CHECK (moneda IN ('MXN','USD','USDT','BTC')),
  categoria   TEXT,
  tags        TEXT,         -- separado por comas
  activo      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_cot_catalogo_updated_at
  BEFORE UPDATE ON cot_catalogo
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLA: cotizaciones — Cabecera de presupuestos y notas de venta
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS cotizaciones (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo              TEXT        NOT NULL CHECK (tipo IN ('cot_presupuesto','cot_nota')),
  folio             TEXT        NOT NULL,
  titulo            TEXT,

  -- Fechas
  fecha             DATE        NOT NULL DEFAULT CURRENT_DATE,
  fecha_validez     DATE,

  -- Emisor (campos denormalizados para PDF offline)
  emisor_nombre     TEXT,
  emisor_rfc        TEXT,
  emisor_direccion  TEXT,
  emisor_tel        TEXT,

  -- Cliente
  cliente_id        TEXT,       -- ID de nodo contacto (nullable)
  cliente_nombre    TEXT,
  cliente_rfc       TEXT,
  cliente_direccion TEXT,
  cliente_tel       TEXT,
  cliente_email     TEXT,

  -- Proyecto vinculado
  proyecto_id       TEXT,
  proyecto_nombre   TEXT,

  -- Financiero
  moneda            TEXT        NOT NULL DEFAULT 'MXN' CHECK (moneda IN ('MXN','USD','USDT','BTC')),
  tipo_cambio       NUMERIC(16,8) DEFAULT 1,
  subtotal          NUMERIC(14,4) NOT NULL DEFAULT 0,
  descuento_total   NUMERIC(14,4) NOT NULL DEFAULT 0,
  iva               NUMERIC(14,4) NOT NULL DEFAULT 0,
  total             NUMERIC(14,4) NOT NULL DEFAULT 0,
  con_iva           BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Pago
  metodo_pago       TEXT,       -- 'transferencia'|'spei'|'efectivo'|'cripto'|'otro'
  banco_pago        TEXT,
  clabe_pago        TEXT,

  -- Estado
  estado            TEXT        NOT NULL DEFAULT 'borrador'
                    CHECK (estado IN ('borrador','enviado','aprobado','cancelado','pagado')),
  notas             TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cotizaciones_owner     ON cotizaciones(owner_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_tipo      ON cotizaciones(tipo);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_estado    ON cotizaciones(estado);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_cliente   ON cotizaciones(cliente_id);

CREATE TRIGGER trg_cotizaciones_updated_at
  BEFORE UPDATE ON cotizaciones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLA: cotizacion_items — Líneas de detalle por cotización
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS cotizacion_items (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id   UUID        NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
  catalogo_id     UUID        REFERENCES cot_catalogo(id) ON DELETE SET NULL,
  descripcion     TEXT        NOT NULL,
  cantidad        NUMERIC(12,4) NOT NULL DEFAULT 1,
  precio          NUMERIC(14,4) NOT NULL DEFAULT 0,
  descuento       NUMERIC(5,2)  NOT NULL DEFAULT 0,  -- porcentaje 0-100
  subtotal        NUMERIC(14,4) NOT NULL DEFAULT 0,
  orden           INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cot_items_cotizacion ON cotizacion_items(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_cot_items_catalogo   ON cotizacion_items(catalogo_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLA: cotizacion_pagos — Registro de pagos recibidos por nota de venta
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS cotizacion_pagos (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id   UUID        NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
  fecha           DATE        NOT NULL DEFAULT CURRENT_DATE,
  monto           NUMERIC(14,4) NOT NULL,
  moneda          TEXT        NOT NULL DEFAULT 'MXN',
  notas           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cot_pagos_cotizacion ON cotizacion_pagos(cotizacion_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════════

-- cot_catalogo
ALTER TABLE cot_catalogo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cot_catalogo_owner_select" ON cot_catalogo
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "cot_catalogo_owner_insert" ON cot_catalogo
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "cot_catalogo_owner_update" ON cot_catalogo
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "cot_catalogo_owner_delete" ON cot_catalogo
  FOR DELETE USING (auth.uid() = owner_id);

-- cotizaciones
ALTER TABLE cotizaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cotizaciones_owner_select" ON cotizaciones
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "cotizaciones_owner_insert" ON cotizaciones
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "cotizaciones_owner_update" ON cotizaciones
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "cotizaciones_owner_delete" ON cotizaciones
  FOR DELETE USING (auth.uid() = owner_id);

-- cotizacion_items (acceso via owner de cotización)
ALTER TABLE cotizacion_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cot_items_owner_select" ON cotizacion_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM cotizaciones c WHERE c.id = cotizacion_id AND c.owner_id = auth.uid())
  );
CREATE POLICY "cot_items_owner_insert" ON cotizacion_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM cotizaciones c WHERE c.id = cotizacion_id AND c.owner_id = auth.uid())
  );
CREATE POLICY "cot_items_owner_update" ON cotizacion_items
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM cotizaciones c WHERE c.id = cotizacion_id AND c.owner_id = auth.uid())
  );
CREATE POLICY "cot_items_owner_delete" ON cotizacion_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM cotizaciones c WHERE c.id = cotizacion_id AND c.owner_id = auth.uid())
  );

-- cotizacion_pagos
ALTER TABLE cotizacion_pagos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cot_pagos_owner_select" ON cotizacion_pagos
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM cotizaciones c WHERE c.id = cotizacion_id AND c.owner_id = auth.uid())
  );
CREATE POLICY "cot_pagos_owner_insert" ON cotizacion_pagos
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM cotizaciones c WHERE c.id = cotizacion_id AND c.owner_id = auth.uid())
  );
CREATE POLICY "cot_pagos_owner_delete" ON cotizacion_pagos
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM cotizaciones c WHERE c.id = cotizacion_id AND c.owner_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- STORAGE BUCKET: cot-imagenes
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cot-imagenes',
  'cot-imagenes',
  TRUE,
  5242880,  -- 5 MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS
CREATE POLICY "cot_imagenes_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'cot-imagenes' AND auth.role() = 'authenticated'
  );
CREATE POLICY "cot_imagenes_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'cot-imagenes');
CREATE POLICY "cot_imagenes_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'cot-imagenes' AND auth.uid()::text = (storage.foldername(name))[1]
  );
