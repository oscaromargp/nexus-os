-- AFP · histórico mes a mes
-- Un snapshot por usuario por mes con el cierre de ese mes:
-- modo activo, plan cumplido (%), ahorro neto al colchón, total dispersado,
-- top 3 metas que avanzaron, brecha al final.

CREATE TABLE IF NOT EXISTS afp_month_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month           text NOT NULL,          -- 'YYYY-MM'
  mode            text NOT NULL,          -- survival/debt/build/accumulate/balance
  mode_label      text,
  monthly_income  numeric DEFAULT 0,
  monthly_fixed   numeric DEFAULT 0,
  monthly_sacred  numeric DEFAULT 0,
  cushion_start   numeric DEFAULT 0,
  cushion_end     numeric DEFAULT 0,
  cushion_target  numeric DEFAULT 0,
  commits_planned integer DEFAULT 0,      -- # de items que se le pidieron al usuario
  commits_executed integer DEFAULT 0,     -- # marcados como pagados
  commits_committed integer DEFAULT 0,    -- # apartados pero no pagados
  total_dispersed numeric DEFAULT 0,      -- $ realmente movido
  total_planned   numeric DEFAULT 0,      -- $ que el plan pedía dispersar
  compliance_pct  numeric DEFAULT 0,      -- dispersed/planned * 100
  goals_advanced  jsonb DEFAULT '[]'::jsonb,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, month)
);

ALTER TABLE afp_month_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "afp_snap_owner_all" ON afp_month_snapshots
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE INDEX IF NOT EXISTS idx_afp_snap_owner_month
  ON afp_month_snapshots (owner_id, month DESC);
