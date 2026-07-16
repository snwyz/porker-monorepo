import babelParser from "@babel/eslint-parser";
import js from "@eslint/js";

export default [
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.turbo/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          parserOpts: {
            plugins: ["typescript"],
          },
        },
      },
    },
    rules: {
      "no-undef": "off",
    },
  },
];
