// Repo-root ESLint flat config (Task 28, Priority 3).
//
// No individual package/app previously had ANY eslint wiring (no
// `eslint.config.*`, no package-level `lint` script), despite the shared
// flat base at `@pg/config/eslint.base` existing since early in the
// project. `turbo run lint` was a silent no-op (0 tasks executed, exit 0)
// — a CI step that looked like a real gate but checked nothing.
//
// Rather than rolling out a `lint` script + local `eslint.config.mjs` to
// every one of the 8 workspace packages/apps (meaningful but out of scope
// for this task — Task 28 is the CI/e2e pipeline, not an eslint rollout),
// this single root config extends the shared base and lints the entire
// repo's TS/TSX source in one pass via the root `lint` script
// (`eslint .`), wired into turbo as the root-scoped `//#lint` task in
// `turbo.json` so `pnpm turbo run lint` (used by CI) runs it.
//
// NOT type-aware (the shared base's `tseslint.configs.recommended` does
// not set `parserOptions.project`), so this adds no cross-package tsconfig
// project-reference complexity — acceptable for a first lint pass; a
// type-aware config can be layered in later without touching this file's
// shape.
//
// Left unlinted (explicitly, not accidentally): build output (`dist/**`,
// `.next/**`), dependency trees (`node_modules/**`), Prisma's generated
// client, and config/doc scaffolding that isn't TS/TSX source.
import base from '@pg/config/eslint.base';

export default [
  ...base,
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      'apps/api/generated/**',
      '.superpowers/**',
      // Next.js-generated boilerplate ("This file should not be edited" —
      // see its own header comment); not meaningful to lint.
      '**/next-env.d.ts',
    ],
  },
];
