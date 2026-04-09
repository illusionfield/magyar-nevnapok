/**
 * eslint.config.mjs
 * Minimális, repo-szintű lintkonfiguráció a plain JavaScript + ESM projekthez.
 */

const kozosGlobalisok = {
  AbortController: "readonly",
  AbortSignal: "readonly",
  Blob: "readonly",
  Buffer: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  document: "readonly",
  fetch: "readonly",
  globalThis: "readonly",
  navigator: "readonly",
  performance: "readonly",
  process: "readonly",
  setTimeout: "readonly",
  TextDecoder: "readonly",
  TextEncoder: "readonly",
  window: "readonly",
};

export default [
  {
    ignores: ["node_modules/**", "output/**"],
  },
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: kozosGlobalisok,
    },
    rules: {
      "no-constant-binary-expression": "error",
      "no-unreachable": "error",
      "no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "no-var": "error",
      "prefer-const": "error",
    },
  },
];
