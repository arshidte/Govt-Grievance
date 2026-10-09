/**
 * Font setup for @pg/ui.
 *
 * IMPORTANT (framework-agnostic split): @pg/ui must not import `next/font`
 * or any Next.js API — this package is consumed by multiple apps and
 * possibly non-Next contexts. Instead we export plain CSS variable names
 * and font-family stacks (strings only). Consuming apps:
 *
 *  - Use `next/font/google` themselves (in the app, not here) to load
 *    Inter and Noto Sans Malayalam, and assign the loaded font's
 *    `.variable` to the SAME CSS variable names exported below
 *    (FONT_VARS.sans / FONT_VARS.malayalam) on <html>/<body>.
 *  - The Tailwind preset's `theme.fontFamily` references these CSS
 *    variables (via `var(--font-sans)` etc.), so `font-sans` /
 *    `font-malayalam` utilities work in both apps without any
 *    app-specific Tailwind config.
 *  - `src/styles/globals.css` also declares fallback values for these
 *    variables so plain CSS (and Storybook/non-Next contexts) still
 *    render with a sane stack if an app hasn't wired next/font yet.
 */

/** CSS custom property names used for font-family variables. */
export const FONT_VARS = {
  sans: '--font-sans',
  malayalam: '--font-malayalam',
} as const;

/** Human-readable font family names (for next/font `variable`/display wiring). */
export const FONT_FAMILIES = {
  sans: 'Inter',
  malayalam: 'Noto Sans Malayalam',
} as const;

/**
 * Full fallback stacks, keyed the same way. Used both as the CSS default
 * (`globals.css`) and as the value Tailwind falls back to if an app never
 * sets the CSS variable.
 */
export const FONT_STACKS = {
  sans: `var(${FONT_VARS.sans}), ${FONT_FAMILIES.sans}, "Noto Sans Malayalam", ui-sans-serif, system-ui, -apple-system, sans-serif`,
  malayalam: `var(${FONT_VARS.malayalam}), "${FONT_FAMILIES.malayalam}", ${FONT_FAMILIES.sans}, ui-sans-serif, system-ui, sans-serif`,
} as const;

export const fonts = {
  vars: FONT_VARS,
  families: FONT_FAMILIES,
  stacks: FONT_STACKS,
} as const;

export default fonts;
