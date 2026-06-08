// Nexus OS — Design tokens centralizados
// Punto único de verdad para colores, espacios, tipografía, radius.
// Importa este módulo en lugar de hardcodear valores.
//
// Ejemplo:
//   import { T, css } from './tokens.js'
//   `<div style="${css.card}">...`
//   `background: ${T.colors.cyan[400]};`

// ─── Paleta ───────────────────────────────────────────────────────────────────
export const T = {
  colors: {
    cyan:   { 50: '#ecfeff', 100: '#cffafe', 200: '#a5f3fc', 300: '#67e8f9', 400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490', 800: '#155e75' },
    purple: { 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9' },
    green:  { 300: '#86efac', 400: '#4ade80', 500: '#22c55e', 600: '#16a34a' },
    red:    { 400: '#f87171', 500: '#ef4444', 600: '#dc2626' },
    yellow: { 300: '#fde047', 400: '#facc15', 500: '#eab308' },
    orange: { 400: '#fb923c', 500: '#f97316' },
    slate:  { 50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a' },
    // Fondos primarios de Nexus
    bg: {
      deep:    '#0a0e1f',
      base:    '#0d0f1f',
      panel:   '#0e1422',
      raised:  '#1a2540',
      overlay: 'rgba(0,0,0,0.78)',
    },
    text: {
      primary:   '#e8f0f9',
      secondary: '#cbd5e1',
      muted:     '#94a3b8',
      dim:       '#64748b',
      faint:     '#475569',
    },
    border: {
      subtle:  'rgba(255,255,255,0.05)',
      base:    'rgba(255,255,255,0.08)',
      raised:  'rgba(255,255,255,0.12)',
      accent:  'rgba(34,211,238,0.3)',
      strong:  'rgba(34,211,238,0.5)',
    },
    // Helpers con transparencia
    cyanAlpha:   (a = 0.1) => `rgba(34,211,238,${a})`,
    purpleAlpha: (a = 0.1) => `rgba(167,139,250,${a})`,
    greenAlpha:  (a = 0.1) => `rgba(74,222,128,${a})`,
    redAlpha:    (a = 0.1) => `rgba(239,68,68,${a})`,
    yellowAlpha: (a = 0.1) => `rgba(250,204,21,${a})`,
    whiteAlpha:  (a = 0.06) => `rgba(255,255,255,${a})`,
    blackAlpha:  (a = 0.5) => `rgba(0,0,0,${a})`,
  },

  // ─── Espaciado (4px base) ───────────────────────────────────────────────────
  space: {
    px:   '1px',
    0.5:  '2px',
    1:    '4px',
    1.5:  '6px',
    2:    '8px',
    2.5:  '10px',
    3:    '12px',
    4:    '16px',
    5:    '20px',
    6:    '24px',
    7:    '28px',
    8:    '32px',
    10:   '40px',
    12:   '48px',
    16:   '64px',
  },

  // ─── Tipografía ─────────────────────────────────────────────────────────────
  font: {
    size: {
      xs:   '10px',
      sm:   '11px',
      base: '12px',
      md:   '13px',
      lg:   '14px',
      xl:   '15px',
      '2xl':'18px',
      '3xl':'22px',
      '4xl':'28px',
      mono: '11px',
    },
    weight: { normal: 400, medium: 500, semibold: 600, bold: 700, extra: 800 },
    family: {
      sans:  "'Plus Jakarta Sans','Inter',sans-serif",
      ui:    "'Inter',sans-serif",
      mono:  "'JetBrains Mono',monospace",
    },
    lineHeight: { tight: 1.2, snug: 1.4, normal: 1.5, relaxed: 1.65, loose: 1.85 },
  },

  // ─── Radius ─────────────────────────────────────────────────────────────────
  radius: {
    sm:   '6px',
    base: '8px',
    md:   '10px',
    lg:   '12px',
    xl:   '14px',
    '2xl':'18px',
    full: '999px',
  },

  // ─── Sombras ────────────────────────────────────────────────────────────────
  shadow: {
    sm:  '0 1px 3px rgba(0,0,0,0.3)',
    md:  '0 4px 14px rgba(0,0,0,0.35)',
    lg:  '0 12px 32px rgba(0,0,0,0.4)',
    xl:  '0 24px 80px rgba(0,0,0,0.6)',
    cyan:'0 8px 24px rgba(34,211,238,0.25)',
  },

  // ─── Transiciones ───────────────────────────────────────────────────────────
  transition: {
    fast:   'all 0.15s ease',
    base:   'all 0.2s ease',
    slow:   'all 0.32s cubic-bezier(0.4,0,0.2,1)',
  },

  // ─── Breakpoints ────────────────────────────────────────────────────────────
  bp: { mobile: 768, tablet: 1024, desktop: 1280 },
}

// ─── Composiciones rápidas — estilos comunes ya pre-armados ──────────────────
export const css = {
  // Botón primary cyan
  btnPrimary: `padding:${T.space[2.5]} ${T.space[4]};background:linear-gradient(135deg,${T.colors.cyan[400]},${T.colors.cyan[600]});color:${T.colors.bg.deep};font-weight:${T.font.weight.bold};border:none;border-radius:${T.radius.md};cursor:pointer;font-size:${T.font.size.md};`,

  // Botón secondary (transparent border)
  btnSecondary: `padding:${T.space[2.5]} ${T.space[4]};background:${T.colors.whiteAlpha(0.05)};border:1px solid ${T.colors.border.base};color:${T.colors.text.muted};border-radius:${T.radius.md};cursor:pointer;font-size:${T.font.size.md};`,

  // Botón danger
  btnDanger: `padding:${T.space[2.5]} ${T.space[4]};background:${T.colors.redAlpha(0.1)};border:1px solid ${T.colors.redAlpha(0.35)};color:${T.colors.red[400]};border-radius:${T.radius.md};cursor:pointer;font-size:${T.font.size.md};font-weight:${T.font.weight.bold};`,

  // Card base (settings-card style)
  card: `background:${T.colors.whiteAlpha(0.03)};border:1px solid ${T.colors.border.base};border-radius:${T.radius.lg};padding:${T.space[4]};`,

  // Card destacada (con accent cyan suave)
  cardAccent: `background:${T.colors.cyanAlpha(0.04)};border:1px solid ${T.colors.cyanAlpha(0.15)};border-radius:${T.radius.lg};padding:${T.space[4]};`,

  // Input
  input: `width:100%;padding:${T.space[2.5]} ${T.space[3]};background:${T.colors.whiteAlpha(0.06)};border:1px solid ${T.colors.border.raised};border-radius:${T.radius.base};color:${T.colors.text.primary};font-size:${T.font.size.md};`,

  // Label
  label: `font-size:${T.font.size.sm};color:${T.colors.text.muted};display:block;margin-bottom:${T.space[1.5]};`,

  // Section title
  sectionTitle: `font-size:${T.font.size.xs};font-weight:${T.font.weight.bold};color:${T.colors.cyan[400]};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:${T.space[3]};`,

  // Pill / chip
  chip: `display:inline-flex;align-items:center;gap:${T.space[1]};padding:${T.space[1]} ${T.space[2.5]};background:${T.colors.cyanAlpha(0.08)};border:1px solid ${T.colors.cyanAlpha(0.25)};color:${T.colors.cyan[300]};border-radius:${T.radius.full};font-size:${T.font.size.sm};font-weight:${T.font.weight.semibold};`,
}

// Export por compatibilidad con código antiguo
export default T
