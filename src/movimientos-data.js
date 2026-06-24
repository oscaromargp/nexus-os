// Nexus OS — Datos estáticos del módulo Movimientos.
//
// Primera rebanada de la extracción de Movimientos fuera de app.js: constantes
// puras (sin lógica ni dependencias) para empezar a aligerar app.js sin riesgo.
// La lógica (mvSaveMov, modales, render) se irá moviendo en rebanadas siguientes.

// Mapeo de cripto → libro de Bitso (para precio en MXN)
export const MV_BITSO_BOOKS = {
  USDT: 'usdt_mxn', BTC: 'btc_mxn', ETH: 'eth_mxn',
  XRP:  'xrp_mxn',  SOL: 'sol_mxn', LTC: 'ltc_mxn',
}

// Monedas que aplican comisión por defecto (entradas)
export const MV_CRYPTO_SET = new Set(['USDT', 'BTC', 'ETH', 'XRP', 'SOL', 'LTC', 'USD'])

// Bancos mexicanos + entidades especiales (para autocompletar en el form)
export const MX_BANKS = [
  'BBVA', 'Banorte', 'Santander', 'Banamex (Citibanamex)', 'HSBC', 'Scotiabank', 'Inbursa',
  'Banregio', 'BanBajío', 'Afirme', 'Multiva', 'Monexcb', 'Actinver', 'Bansí', 'Invex',
  'Ixe', 'Compartamos', 'Inmobiliario Mexicano', 'The Royal Bank of Scotland', 'ABC Capital',
  'Autofin', 'Azteca', 'Bancoppel', 'Bafin', 'Bajío', 'Bansí', 'CI Banco', 'Consubanco',
  'Famsa', 'Hipotecaria Federal', 'Icbc', 'Inmobiliario Mexicano', 'J.P. Morgan', 'Mifel',
  'Sabadell', 'Ve por Más', 'Ve-Por-Mas', 'Bbase', 'Bancrea', 'Bank of America', 'Barclays',
  'CIBanco', 'Deutsche', 'Fondverde', 'GBM', 'HSBC', 'Impersa', 'InterBanco', 'Nafinsa',
  'Nu (Nubank)', 'N26', 'Hey Banco', 'Spin by OXXO', 'Klar', 'Albo', 'Cuenca',
  // Entidades para operaciones especiales
  'STP (Tamsa)', 'Bancalizo', 'SPEI directo', 'Tether/TRX', 'Tether/ERC20', 'Tether/BEP20',
  'Efectivo', 'OXXO Pay', 'Mercado Pago', 'PayPal', 'Otro',
]
