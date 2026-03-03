const js = require("@eslint/js");
const tsParser = require("@typescript-eslint/parser");
const globals = require("globals");

module.exports = [
  {
    ignores: [
      "**/node_modules/**",
      "extension/dist/**",
      "extension/out/**",
      "server/data/**",
      "gotify_data/**",
      "backup/**",
      "packages/protocol/protocol-runtime.js",
      "packages/protocol/protocol-runtime.cjs",
      "packages/protocol/socket-events.js",
      "packages/protocol/socket-events.cjs",
      "packages/protocol/host-webview.js",
      "packages/protocol/socket-events.d.ts",
      "packages/protocol/host-webview.d.ts",
    ],
  },
  {
    ...js.configs.recommended,
    files: ["**/*.js"],
  },
  {
    files: ["server/src/**/*.js", "server/scripts/**/*.js"],
    ignores: ["server/src/public/js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-console": "off",
      "no-unused-vars": "off",
      "no-redeclare": "off",
    },
  },
  {
    files: ["server/src/public/js/**/*.js"],
    languageOptions: {
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2022,
        Vue: "readonly",
        io: "readonly",
        VueRouter: "readonly",
        ElementPlus: "readonly",
      },
    },
    rules: {
      "no-console": "off",
      "no-unused-vars": "off",
      "no-redeclare": "off",
      "no-empty": "off",
    },
  },
  {
    files: ["packages/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    rules: {
      "no-console": "off",
      "no-unused-vars": "off",
      "no-redeclare": "off",
    },
  },
  {
    files: ["extension/src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: false,
      },
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
    },
  },
];
