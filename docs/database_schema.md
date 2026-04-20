# Nexus OS — Database Schema (Supabase / PostgreSQL)

## Tabla: `nexus_nodos`

Esta tabla es el corazón de la arquitectura "Everything is a Node".
Cada entrada de texto del usuario (tarea, nota, transacción) se almacena
como un nodo unificado, diferenciado únicamente por `node_type` y `metadata`.

---

### SQL de creación

```sql
-- ============================================================
-- NEXUS OS — Schema v1.0
-- Ejecutar en: Supabase > SQL Editor
-- ============================================================

-- Extensión para UUIDs (ya habilitada en Supabase por defecto)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------
-- TABLA PRINCIPAL: nodes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nodes (
  id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id     UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content      TEXT          NOT NULL,
  type         TEXT          NOT NULL DEFAULT 'note'
                             CHECK (type IN ('note', 'task', 'income', 'expense', 'kanban', 'persona', 'proyecto')),
  metadata     JSONB         NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Índice para consultas por usuario (más usadas)
CREATE INDEX IF NOT EXISTS idx_nodes_owner_id
  ON public.nodes (owner_id);

-- Índice para filtrar por tipo de nodo
CREATE INDEX IF NOT EXISTS idx_nodes_type
  ON public.nodes (type);

-- Índice GIN para búsquedas dentro de metadata JSONB
CREATE INDEX IF NOT EXISTS idx_nodes_metadata
  ON public.nodes USING gin (metadata);

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS)
-- Cada usuario solo puede ver y modificar sus propios nodos
-- ------------------------------------------------------------
ALTER TABLE public.nodes ENABLE ROW LEVEL SECURITY;

-- Política: SELECT — solo nodos propios
CREATE POLICY "nodes_select_own"
  ON public.nodes
  FOR SELECT
  USING (auth.uid() = owner_id);

-- Política: INSERT — solo nodos propios
CREATE POLICY "nodes_insert_own"
  ON public.nodes
  FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- Política: UPDATE — solo nodos propios
CREATE POLICY "nodes_update_own"
  ON public.nodes
  FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Política: DELETE — solo nodos propios
CREATE POLICY "nodes_delete_own"
  ON public.nodes
  FOR DELETE
  USING (auth.uid() = owner_id);
```

---

### Ejemplos de registros

| raw_content           | node_type | metadata (JSONB)                                      |
|-----------------------|-----------|-------------------------------------------------------|
| `#tarea Revisar PR`   | `kanban`  | `{"status": "todo", "tags": ["#tarea"]}`              |
| `-$500 Renta oficina` | `expense` | `{"amount": 500, "currency": "USD", "label": "Renta"}`|
| `+$1500 Freelance`    | `income`  | `{"amount": 1500, "currency": "USD"}`                 |
| `Idea para producto`  | `note`    | `{"supertags": []}`                                   |

---

### Estructura de `metadata` por `node_type`

```json
// node_type = "kanban"
{
  "status": "todo | in_progress | done",
  "priority": "low | medium | high",
  "tags": ["#tarea", "#proyecto"],
  "due_date": "2026-04-20"
}

// node_type = "expense" | "income"
{
  "amount": 500.00,
  "currency": "USD",
  "label": "descripción del movimiento",
  "category": "servicios | compras | freelance"
}

// node_type = "note"
{
  "supertags": ["#idea", "#importante"],
  "linked_nodes": ["uuid-de-otro-nodo"]
}
```

---


---

## 🧹 Política de Retención de Datos

Para mantener el sistema optimizado y respetar la higiene de datos,Nexus OS implementa una política de limpieza automática para cuentas inactivas.

### Regla: Borrado tras 6 meses de inactividad
Si un usuario no ha iniciado sesión en los últimos 6 meses, su contenido (nodos) será eliminado de forma permanente.

#### SQL para Programar Limpieza (Supabase > SQL Editor)

```sql
-- 1. Crear la función de limpieza
CREATE OR REPLACE FUNCTION public.limpiar_nodos_inactivos()
RETURNS void AS $$
BEGIN
  DELETE FROM public.nodes
  WHERE owner_id IN (
    SELECT id FROM auth.users
    WHERE last_sign_in_at < NOW() - INTERVAL '6 months'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Programar la ejecución (requiere pg_cron habitado en Supabase)
--    Se ejecuta cada domingo a las 00:00
SELECT cron.schedule('limpieza-semanal-inactivos', '0 0 * * 0', 'SELECT public.limpiar_nodos_inactivos();');

-- Nota: Si no tienes pg_cron habilitado, puedes ejecutar
-- SELECT public.limpiar_nodos_inactivos();
-- manualmente de forma periódica.
```
