/**
 * Shared ESLint 9 FLAT config base.
 *
 * Consumers extend this from their own eslint.config.mjs:
 *
 *   import base from "@pg/config/eslint.base";
 *
 *   export default [
 *     ...base,
 *     { ignores: ["dist/**", ".next/**"] },
 *     // ...local overrides
 *   ];
 *
 * Provides: typescript-eslint recommended rules + import ordering.
 * No design/style opinionation (added later per the design spec).
 */
import importPlugin from "eslint-plugin-import";
import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.recommended,
  importPlugin.flatConfigs.recommended,
  importPlugin.flatConfigs.typescript,
  {
    settings: {
      "import/resolver": {
        typescript: true,
        node: true,
      },
    },
    rules: {
      "import/order": [
        "warn",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
          ],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      // `import/namespace` statically re-derives a module's exported
      // member set from its `.d.ts` and flags unknown members. Against
      // deep/complex re-export chains (observed with
      // `@radix-ui/react-toast`'s `ToastPrimitive.ToastProviderProps` /
      // `ToastProps`) it produces false positives on members TypeScript
      // itself resolves correctly. `typescript-eslint`'s own guidance is
      // that type-aware correctness (including namespace member access)
      // is the TS compiler's job once a project is TS-checked — `tsc
      // --noEmit` is run separately and already covers this — so this
      // rule is both redundant and a known source of false positives
      // here; disabled repo-wide rather than suppressing it file-by-file.
      "import/namespace": "off",
      // Allow a conventional `_`-prefixed name to mark a required
      // parameter as intentionally unused (e.g. satisfying an interface
      // signature like `PipeTransform.transform(value, _metadata)`),
      // without requiring awkward re-shaping of those call sites.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
