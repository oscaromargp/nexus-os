-- ══════════════════════════════════════════════════════════════════════════════
-- Nexus OS — Performance Indexes Migration
-- Generado por auditoría de agentes (DB Optimizer + Security Engineer)
-- Aplicar en Supabase Dashboard → SQL Editor
--
-- IMPACTO: Reduce tiempo de renderAll() y costo de queries en producción.
-- SAFE: Todos los índices usan IF NOT EXISTS — idempotente.
-- ══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA: nodes (principal — afecta cada renderizado de la app)
-- ─────────────────────────────────────────────────────────────────────────────

-- P0: Índice compuesto más importante — filtra por usuario + tipo en cada vista
CREATE INDEX IF NOT EXISTS idx_nodes_owner_type
  ON nodes (owner_id, type);

-- P0: Ordenamiento por fecha de creación (carga inicial loadNodes)
CREATE INDEX IF NOT EXISTS idx_nodes_owner_created
  ON nodes (owner_id, created_at DESC);

-- P1: Filtros financieros por fecha (finance-engine, heatmap, eventos)
CREATE INDEX IF NOT EXISTS idx_nodes_metadata_date
  ON nodes ((metadata->>'date'));

-- P1: Filtros por cuenta en Bio-Finanzas (calcBalance, getTransactions)
CREATE INDEX IF NOT EXISTS idx_nodes_metadata_account
  ON nodes ((metadata->>'account_id'))
  WHERE type IN ('income', 'expense', 'loan');

-- P1: Búsquedas de cotizaciones/tareas por proyecto
CREATE INDEX IF NOT EXISTS idx_nodes_metadata_project_tag
  ON nodes ((metadata->>'project_tag'))
  WHERE type IN ('cotizacion', 'kanban', 'milestone', 'bill');

-- P1: Módulo de contactos
CREATE INDEX IF NOT EXISTS idx_nodes_type_contact
  ON nodes (type, owner_id)
  WHERE type IN ('contact', 'persona');

-- ─────────────────────────────────────────────────────────────────────────────
-- COLUMNAS GENERADAS: Permiten indexar campos JSONB sin cambiar la app
-- Estrategia: GENERATED ALWAYS AS STORED — índices eficientes sin cambiar writes
-- ─────────────────────────────────────────────────────────────────────────────

-- Columna de fecha tipada (para queries de rango en finanzas)
ALTER TABLE nodes
  ADD COLUMN IF NOT EXISTS node_date DATE
    GENERATED ALWAYS AS ((metadata->>'date')::date) STORED;

-- Columna de monto tipada (para sumas precisas sin coerción de tipo)
ALTER TABLE nodes
  ADD COLUMN IF NOT EXISTS node_amount NUMERIC(14,4)
    GENERATED ALWAYS AS (
      CASE WHEN metadata->>'amount' ~ '^[0-9]+(\.[0-9]+)?$'
           THEN (metadata->>'amount')::numeric
           ELSE NULL END
    ) STORED;

-- Columna de status tipada (para filtros Kanban)
ALTER TABLE nodes
  ADD COLUMN IF NOT EXISTS node_status TEXT
    GENERATED ALWAYS AS (metadata->>'status') STORED;

-- Índices sobre las columnas generadas
CREATE INDEX IF NOT EXISTS idx_nodes_date_range
  ON nodes (owner_id, node_date)
  WHERE node_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nodes_amount
  ON nodes (owner_id, node_amount)
  WHERE type IN ('income', 'expense') AND node_amount IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nodes_kanban_status
  ON nodes (owner_id, node_status)
  WHERE type = 'kanban';

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA: cot_catalogo
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_cot_catalogo_owner
  ON cot_catalogo (owner_id);

CREATE INDEX IF NOT EXISTS idx_cot_catalogo_activo
  ON cot_catalogo (owner_id, activo)
  WHERE activo = TRUE;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA: cotizaciones
-- ─────────────────────────────────────────────────────────────────────────────

-- Índice compuesto faltante (listar por dueño + fecha)
CREATE INDEX IF NOT EXISTS idx_cotizaciones_owner_fecha
  ON cotizaciones (owner_id, fecha DESC);

-- Reemplazar índice suelto de tipo por compuesto con owner
CREATE INDEX IF NOT EXISTS idx_cotizaciones_owner_tipo
  ON cotizaciones (owner_id, tipo);

-- Constraint de folio único por usuario
ALTER TABLE cotizaciones
  ADD CONSTRAINT IF NOT EXISTS uq_cotizaciones_owner_folio
  UNIQUE (owner_id, folio);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA: tramites
-- ─────────────────────────────────────────────────────────────────────────────

-- Constraint de folio único por usuario (previene duplicados)
ALTER TABLE tramites
  ADD CONSTRAINT IF NOT EXISTS uq_tramites_owner_folio
  UNIQUE (owner_id, folio);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA: tramite_clausulas (sin ningún índice actualmente)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tramclaus_owner_tipo
  ON tramite_clausulas (owner_id, tipo);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA: property_documents
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_propdocs_property
  ON property_documents (property_id);

CREATE INDEX IF NOT EXISTS idx_propdocs_user
  ON property_documents (user_id);

-- Hacer NOT NULL la columna property_id (actualmente nullable — bug de schema)
-- NOTA: Ejecutar solo si no hay registros con property_id NULL en producción
-- ALTER TABLE property_documents ALTER COLUMN property_id SET NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLA: movimientos
-- ─────────────────────────────────────────────────────────────────────────────

-- Índice compuesto para _mvFiltered() (tipo + moneda + estado + fecha)
CREATE INDEX IF NOT EXISTS idx_movimientos_owner_tipo_fecha
  ON movimientos (owner_id, tipo, fecha DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCIÓN COMPARTIDA: set_updated_at — unifica las 3 versiones duplicadas
-- ─────────────────────────────────────────────────────────────────────────────

-- Función única compartida (reemplaza nexus_set_updated_at, set_updated_at, _set_updated_at)
CREATE OR REPLACE FUNCTION shared_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- NOTA: Para migrar los triggers existentes a esta función, ejecutar:
-- DROP TRIGGER IF EXISTS ... ON <tabla>;
-- CREATE TRIGGER set_updated_at BEFORE UPDATE ON <tabla>
--   FOR EACH ROW EXECUTE FUNCTION shared_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN: Listar índices creados para confirmar
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT schemaname, tablename, indexname FROM pg_indexes
-- WHERE indexname LIKE 'idx_nodes_%' OR indexname LIKE 'idx_cot_%'
--   OR indexname LIKE 'idx_tramite%' OR indexname LIKE 'idx_propdoc%'
--   OR indexname LIKE 'idx_movim%'
-- ORDER BY tablename, indexname;
