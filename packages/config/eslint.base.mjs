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
    },
  },
);
