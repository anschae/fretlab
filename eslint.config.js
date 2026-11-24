import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist/", "dev-dist/", "node_modules/", "coverage/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // AudioWorklet global scope
    files: ["src/audio/**/*.worklet.ts"],
    languageOptions: {
      globals: { sampleRate: "readonly", currentFrame: "readonly", currentTime: "readonly", registerProcessor: "readonly", AudioWorkletProcessor: "readonly" },
    },
  },
);
