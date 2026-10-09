import type { Config } from 'tailwindcss';
import pgUiPreset from '@pg/ui/tailwind.preset';

/**
 * This app's Tailwind config only supplies `content` globs and defers all
 * design tokens (colors, spacing, radius, shadow, fonts) to the shared
 * `@pg/ui` preset — see packages/ui/tailwind.preset.ts. No arbitrary values
 * (`[...]`) should be needed; everything is a token-backed utility already.
 *
 * The `@pg/ui` component source is included in `content` so Tailwind's
 * class scanner sees classes used inside shared components (otherwise they
 * would be purged, since @pg/ui ships TS source, not pre-built CSS).
 */
const config: Config = {
  presets: [pgUiPreset],
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
};

export default config;
