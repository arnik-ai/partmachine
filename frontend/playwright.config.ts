import { defineConfig, devices } from "@playwright/test";

/**
 * آزمون سرتاسری مرورگر روی سرورهای در حال اجرا (فرانت و API) — راه‌اندازی در docs/DEVELOPMENT.md.
 *
 *   E2E_BASE_URL=http://localhost:3100 npm run test:e2e
 *
 * تست‌ها حساب و داده‌ی تازه با نام یکتا می‌سازند، پس روی پایگاه توسعه هم قابل اجرا هستند.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    locale: "fa-IR",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
