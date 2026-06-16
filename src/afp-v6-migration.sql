-- AFP v6 · Wishlist + XP + Streaks + Wish Trophies
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Lista de deseos del usuario
CREATE TABLE IF NOT EXISTS afp_wishlist (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  price         numeric NOT NULL DEFAULT 0,      -- precio real MXN
  xp_cost       integer NOT NULL DEFAULT 0,      -- costo en XP para desbloquear
  category      text,                            -- 'gadget'|'viaje'|'cena'|'ropa'|'otro'
  emoji         text DEFAULT '🎁',
  notes         text,
  fund_balance  numeric NOT NULL DEFAULT 0,      -- progreso de plata acumulada para este deseo
  is_unlocked   boolean NOT NULL DEFAULT false,
  unlocked_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE afp_wishlist ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "afp_wishlist_owner_all" ON afp_wishlist
    FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_afp_wishlist_owner
  ON afp_wishlist (owner_id, is_unlocked, created_at DESC);

-- 2. Log de eventos XP — para auditoría y cálculo de niveles
CREATE TABLE IF NOT EXISTS afp_xp_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action      text NOT NULL,            -- 'pay_on_time'|'save_forced'|'streak_4w'|'plan_100'|'no_touch_cold_30d'|'register_expense'|'honest_no_money'|'pay_late'|'unlock_wish'
  xp_delta    integer NOT NULL,         -- siempre positivo (no castigamos)
  ref_kind    text,                     -- 'movimiento'|'weekplan_item'|'wish'|null
  ref_id      text,                     -- id de la referencia si aplica
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE afp_xp_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "afp_xp_log_owner_all" ON afp_xp_log
    FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_afp_xp_log_owner_date
  ON afp_xp_log (owner_id, created_at DESC);

-- Evita doble registro del mismo evento (idempotencia por (action, ref_kind, ref_id))
CREATE UNIQUE INDEX IF NOT EXISTS uniq_afp_xp_action_ref
  ON afp_xp_log (owner_id, action, ref_kind, ref_id)
  WHERE ref_id IS NOT NULL;

-- 3. Notas sobre config
-- La configuración nueva vive en auth.users.user_metadata.afp:
--   savings_pct          number   (default 10)
--   savings_floor        number   (default 0)         — piso "lo que sea mayor"
--   liquid_split_pct     number   (default 60)        — % del ahorro al líquido
--   liquid_cap           number   (default 5000)      — techo respaldo líquido
--   wishlist_fund_pct    number   (default 5)         — % del ahorro al bote de deseos
--   primary_orq_id       uuid     (ya existía)        — cuenta principal AFP
--   liquid_orq_id        uuid     (nuevo)             — cuenta del respaldo líquido
--   cold_wallet_label    text     (nuevo)             — nombre/id del cold wallet
