/**
 * Nexus OS — Supabase singleton
 * Importar desde aquí en todos los módulos para evitar múltiples instancias GoTrueClient.
 */
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL     || '',
  import.meta.env.VITE_SUPABASE_ANON_KEY || ''
)
