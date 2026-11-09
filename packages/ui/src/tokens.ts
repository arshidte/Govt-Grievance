/**
 * Design tokens — single source of truth for @pg/ui.
 *
 * Consumed by:
 *  - tailwind.preset.ts (exposes these under theme.extend for both apps)
 *  - src/styles/globals.css (surfaced as CSS custom properties)
 *  - T20/T21 components (status/priority lookups by exact camelCase key)
 */

/** Civic deep-blue brand scale. */
export const primary = {
  50: '#eef3fb',
  100: '#d6e3f5',
  200: '#aec7ea',
  300: '#80a6dc',
  400: '#5484cc',
  500: '#3568b8',
  600: '#24509c',
  700: '#1c3f7e',
  800: '#17315f',
  900: '#102142',
} as const;

/** Neutral gray scale. */
export const neutral = {
  50: '#f8f9fa',
  100: '#eef0f2',
  200: '#dde1e6',
  300: '#c3c9d1',
  400: '#9aa3ae',
  500: '#717b87',
  600: '#545d68',
  700: '#3d434d',
  800: '#272b32',
  900: '#15171b',
} as const;

/**
 * Canonical grievance statuses (exact camelCase keys — must match
 * @pg/i18n enumLabels.ts STATUS_KEY values, e.g. 'status.underReview').
 * One distinct, WCAG-legible hue per status. Color is never the sole
 * signal (badges also carry text/icon); these are the backing colors.
 */
export const status = {
  submitted: '#3568b8', // primary-500 — new/neutral-informational
  acknowledged: '#0f766e', // teal-700 — seen, not yet started
  underReview: '#7c3aed', // violet-600 — active evaluation
  assigned: '#0369a1', // sky-700 — handed to an officer
  inProgress: '#b45309', // amber-700 — actively being worked
  waitingForInformation: '#a16207', // yellow-700 — blocked on citizen input
  escalated: '#b91c1c', // red-700 — needs urgent attention
  resolved: '#15803d', // green-700 — fixed, pending closure confirmation
  closed: '#4b5563', // gray-600 — terminal, neutral
  reopened: '#c2410c', // orange-700 — regression, needs re-attention
} as const;

/**
 * Canonical priority levels (exact camelCase keys — must match
 * @pg/i18n enumLabels.ts Priority type, lower-cased).
 */
export const priority = {
  low: '#15803d', // green-700
  medium: '#a16207', // yellow-700
  high: '#c2410c', // orange-700
  urgent: '#b91c1c', // red-700
} as const;

/**
 * Semantic surface aliases (revamp P2a). These are NOT a new palette — each
 * maps to an existing `neutral`/`white` value so the design spec's vocabulary
 * (canvas / surface / border) has a token home without hardcoding. Additive
 * and backward-compatible: nothing references these by key yet, and no
 * existing key was renamed/removed. Surfaced in the preset as `colors.surface`
 * (e.g. `bg-surface-canvas`, `border-surface-border`).
 */
export const surface = {
  /** Page background (calm neutral canvas). */
  canvas: neutral[50],
  /** Card/panel background. */
  panel: '#ffffff',
  /** Default border / divider hairline. */
  border: neutral[200],
} as const;

/** Spacing scale (rem-based, 4px grid). */
export const spacing = {
  0: '0px',
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
  20: '5rem',
  24: '6rem',
} as const;

/** Border-radius scale. */
export const radius = {
  none: '0px',
  sm: '0.125rem',
  md: '0.375rem',
  lg: '0.5rem',
  xl: '0.75rem',
  full: '9999px',
} as const;

/** Box-shadow scale. */
export const shadow = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
} as const;

/**
 * Breakpoints — exact values per brief. Also exposed as Tailwind `screens`
 * in tailwind.preset.ts so apps never need arbitrary values.
 */
export const breakpoint = {
  xs: '320px',
  sm: '375px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1440px',
} as const;

export const STATUS_KEYS = [
  'submitted',
  'acknowledged',
  'underReview',
  'assigned',
  'inProgress',
  'waitingForInformation',
  'escalated',
  'resolved',
  'closed',
  'reopened',
] as const;

export const PRIORITY_KEYS = ['low', 'medium', 'high', 'urgent'] as const;

export type StatusKey = (typeof STATUS_KEYS)[number];
export type PriorityKey = (typeof PRIORITY_KEYS)[number];

export const tokens = {
  primary,
  neutral,
  status,
  priority,
  surface,
  spacing,
  radius,
  shadow,
  breakpoint,
} as const;

export default tokens;
