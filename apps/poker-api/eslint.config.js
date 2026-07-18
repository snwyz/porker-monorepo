import baseConfig from "../../eslint.config.mjs";

export default [
  ...baseConfig,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          parserOpts: {
            plugins: ["typescript", "decorators-legacy"],
          },
        },
      },
    },
    rules: {
      "no-unused-vars": "off",
    },
  },
];
