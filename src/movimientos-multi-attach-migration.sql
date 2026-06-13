-- Movimientos · Soporte múltiples comprobantes
-- Mantiene comprobante_url (compat) y agrega array JSONB con todos los adjuntos
-- Estructura de cada item: { type: 'url'|'file', url: 'https://...', label?: '...' }

ALTER TABLE movimientos
  ADD COLUMN IF NOT EXISTS comprobantes jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN movimientos.comprobantes IS
  'Lista de comprobantes [{type,url,label}]. comprobante_url queda como espejo del primero para compat.';
