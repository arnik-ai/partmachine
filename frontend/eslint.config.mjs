import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // خروجی موقت آزمون مرورگر
    "test-results/**",
    "playwright-report/**",
    // تولیدشده از OpenAPI بک‌اند — دستی ویرایش نمی‌شود
    "src/lib/api/schema.ts",
  ]),
]);

export default eslintConfig;
