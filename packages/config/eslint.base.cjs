/**
 * Shared ESLint base config (legacy .eslintrc-compatible format).
 *
 * Consumers extend this from their own .eslintrc.cjs:
 *   module.exports = { extends: ["@pg/config/eslint.base.cjs"] };
 *
 * Provides: typescript-eslint recommended rules + import ordering.
 * Design-token / stylistic rules are intentionally left out (added later).
 */
module.exports = {
  root: false,
  env: {
    es2022: true,
    node: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    sourceType: "module",
    ecmaVersion: 2022,
  },
  plugins: ["@typescript-eslint", "import"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/recommended",
    "plugin:import/typescript",
  ],
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
};
