-- ============================================================
-- NEXUS OS · Módulo Trámites — Migración SQL
-- Extiende el sistema de nodos con tipos específicos de tramites
-- ============================================================

-- Tabla de plantillas de cláusulas reutilizables
CREATE TABLE IF NOT EXISTS tramite_clausulas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo        text NOT NULL,  -- 'contrato', 'cartapoder', 'general'
  titulo      text NOT NULL,
  contenido   text NOT NULL,
  orden       int  NOT NULL DEFAULT 0,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tramite_clausulas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tram_claus_owner" ON tramite_clausulas
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Tabla de tramites generados
CREATE TABLE IF NOT EXISTS tramites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo         text NOT NULL CHECK (tipo IN ('prorroga','pagare','recibo','cartapoder','contrato','nota_venta')),
  folio        text NOT NULL,
  parte_a_id   uuid,           -- contacto parte A (beneficiario, receptor, otorgante, prestador)
  parte_a_name text,
  parte_b_id   uuid,           -- contacto parte B (deudor, entregante, apoderado, cliente)
  parte_b_name text,
  proyecto_id  uuid,           -- proyecto vinculado (para contratos)
  monto        numeric(18,2),
  moneda       text DEFAULT 'MXN',
  estado       text DEFAULT 'generado' CHECK (estado IN ('generado','firmado','cancelado')),
  doc_data     jsonb,          -- snapshot de los datos usados al generar
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tramites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tram_owner" ON tramites
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE INDEX IF NOT EXISTS idx_tramites_owner ON tramites (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tramites_tipo  ON tramites (owner_id, tipo);
