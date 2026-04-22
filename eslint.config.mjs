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
  EventSource: "readonly",
  fetch: "readonly",
  globalThis: "readonly",
  history: "readonly",
  location: "readonly",
  navigator: "readonly",
  performance: "readonly",
  PopStateEvent: "readonly",
  process: "readonly",
  setTimeout: "readonly",
  TextDecoder: "readonly",
  TextEncoder: "readonly",
  WebSocket: "readonly",
  window: "readonly",
};

export default [
  {
    ignores: ["dist/**", "node_modules/**", "output/**"],
  },
  {
    files: ["**/*.{js,mjs,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
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
