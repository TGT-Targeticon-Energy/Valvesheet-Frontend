import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Ignore build output and Claude Code's per-session worktree copies
  // (.claude/worktrees/<id>/ holds disposable working trees that pull
  // in mismatched ESLint plugin versions and otherwise blow up the
  // lint run with environmental errors that aren't real code issues).
  { ignores: ["dist", ".claude/**", "node_modules"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // `@typescript-eslint/no-unused-expressions` (inherited from
      // tseslint.configs.recommended) crashes with the installed
      // ESLint 9.39 + typescript-eslint 8.14 combination:
      //   "Cannot read properties of undefined (reading 'allowShortCircuit')"
      // Until the plugin is upgraded to a version compatible with
      // ESLint 9.30+, disabling this single rule lets the rest of
      // the lint suite actually run and surface real code issues.
      "@typescript-eslint/no-unused-expressions": "off",
    },
  },
);
