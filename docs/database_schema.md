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
-- TABLA PRINCIPAL: nexus_nodos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nexus_nodos (
  id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_content  TEXT          NOT NULL,
  node_type    TEXT          NOT NULL DEFAULT 'note'
                             CHECK (node_type IN ('note', 'task', 'income', 'expense', 'kanban')),
  metadata     JSONB         NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Índice para consultas por usuario (más usadas)
CREATE INDEX IF NOT EXISTS idx_nexus_nodos_user_id
  ON public.nexus_nodos (user_id);

-- Índice para filtrar por tipo de nodo
CREATE INDEX IF NOT EXISTS idx_nexus_nodos_node_type
  ON public.nexus_nodos (node_type);

-- Índice GIN para búsquedas dentro de metadata JSONB
CREATE INDEX IF NOT EXISTS idx_nexus_nodos_metadata
  ON public.nexus_nodos USING gin (metadata);

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS)
-- Cada usuario solo puede ver y modificar sus propios nodos
-- ------------------------------------------------------------
ALTER TABLE public.nexus_nodos ENABLE ROW LEVEL SECURITY;

-- Política: SELECT — solo nodos propios
CREATE POLICY "nexus_select_own"
  ON public.nexus_nodos
  FOR SELECT
  USING (auth.uid() = user_id);

-- Política: INSERT — solo nodos propios
CREATE POLICY "nexus_insert_own"
  ON public.nexus_nodos
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Política: UPDATE — solo nodos propios
CREATE POLICY "nexus_update_own"
  ON public.nexus_nodos
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Política: DELETE — solo nodos propios
CREATE POLICY "nexus_delete_own"
  ON public.nexus_nodos
  FOR DELETE
  USING (auth.uid() = user_id);
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

### Variables de entorno requeridas en `.env`

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key-publica
```

> **Nota**: Obtén estos valores en tu proyecto Supabase → Settings → API.
