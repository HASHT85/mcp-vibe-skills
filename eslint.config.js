// @ts-check
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import prettierPlugin from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";

export default [
    {
        // Ignore compiled output and dependencies
        ignores: ["dist/**", "node_modules/**", "dashboard/**"],
    },
    {
        files: ["src/**/*.ts"],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                project: "./tsconfig.json",
                ecmaVersion: 2022,
                sourceType: "module",
            },
        },
        plugins: {
            "@typescript-eslint": tsPlugin,
            prettier: prettierPlugin,
        },
        rules: {
            // ─── Prettier (format via npm run format:check, not eslint) ───
            "prettier/prettier": "off",

            // ─── TypeScript (sécurité) ───
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
            "@typescript-eslint/explicit-function-return-type": "off",
            "@typescript-eslint/no-floating-promises": "error",

            // ─── JS général ───
            "no-console": "off",
            "prefer-const": "warn",
            "no-var": "error",
            "eqeqeq": ["error", "always"],
            "no-empty": "warn",
            "no-useless-escape": "warn",
        },
    },
    prettierConfig,
];
