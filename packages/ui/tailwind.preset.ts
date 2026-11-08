import type { Config } from 'tailwindcss';
import { breakpoint, neutral, priority, primary, radius, shadow, spacing, status, surface } from './src/tokens';
import { FONT_STACKS } from './src/fonts';

/**
 * Shared Tailwind preset for @pg/ui. Consuming apps add this to their own
 * `presets: [require('@pg/ui/tailwind.preset')]` (or TS import) so that
 * every design token is available as a Tailwind utility — no arbitrary
 * values (`[...]`) should be needed downstream.
 */
const preset: Partial<Config> = {
  theme: {
    screens: breakpoint,
    extend: {
      colors: {
        primary,
        neutral,
        status,
        priority,
        // Semantic surface aliases (revamp P2a) — map to existing neutrals/
        // white so the design spec's canvas/surface/border vocabulary is
        // token-backed. Additive; does not shadow any existing utility.
        surface,
      },
      spacing,
      borderRadius: radius,
      boxShadow: shadow,
      fontFamily: {
        sans: FONT_STACKS.sans.split(', '),
        malayalam: FONT_STACKS.malayalam.split(', '),
      },
    },
  },
};

export default preset;
