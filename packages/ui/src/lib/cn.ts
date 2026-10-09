/**
 * Minimal class-name merge helper. Filters falsy values and joins the rest
 * with a space — enough for hand-rolled variant maps without pulling in
 * clsx/tailwind-merge (YAGNI: this package's class lists never collide on
 * conflicting Tailwind utilities, so de-duplication isn't needed).
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
