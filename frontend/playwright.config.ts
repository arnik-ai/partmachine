import { defineConfig, devices } from "@playwright/test";

/**
 * آزمون سرتاسری مرورگر روی سرورهای در حال اجرا (فرانت و API) — راه‌اندازی در docs/DEVELOPMENT.md.
 *
 *   E2E_BASE_URL=http://localhost:3100 npm run test:e2e
 *
 * پروژه‌های iphone و ipad موتور WebKit (همان Safari) لازم دارند: npx playwright install webkit
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
  projects: [
    // همه‌ی آزمون‌ها روی کروم دسکتاپ (همان موتور Edge در ویندوز)
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // نمایش روی دستگاه‌های دیگر (فاز ۴، گام 4a): فقط آزمون نمایش
    { name: "android", use: { ...devices["Pixel 7"] }, testMatch: /responsive\.spec\.ts/ },
    { name: "iphone", use: { ...devices["iPhone 13"] }, testMatch: /responsive\.spec\.ts/ },
    { name: "ipad", use: { ...devices["iPad (gen 7)"] }, testMatch: /responsive\.spec\.ts/ },
    {
      name: "ipad-landscape",
      use: { ...devices["iPad (gen 7) landscape"] },
      testMatch: /responsive\.spec\.ts/,
    },
  ],
});
