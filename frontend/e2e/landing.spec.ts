import { expect, test } from "@playwright/test";

/** صفحه‌ی اول دوزبانه: دکمه‌های ورود و ثبت‌نام به صفحه‌های خود پلتفرم می‌روند. */

test("the Persian home page leads to the login page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ساخت قطعات صنعتی");
  await expect(page.locator(".lp")).toHaveAttribute("dir", "rtl");
  await page.getByRole("link", { name: "ورود", exact: true }).first().click();
  await page.waitForURL("**/login");
  await expect(page.getByText("ورود به تراشینو")).toBeVisible();
});

test("the manufacturers button opens sign-up with that role selected", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "ثبت‌نام قطعه‌سازان" }).click();
  await page.waitForURL(/\/register\?role=supplier/);
  await expect(page.getByLabel("نقش شما")).toHaveValue("supplier");
});

test("the English home page is left-to-right and links to the platform", async ({ page }) => {
  await page.goto("/en");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Industrial parts");
  await expect(page.locator(".lp")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("link", { name: "نسخه‌ی فارسی" })).toHaveAttribute("href", /\/$/);
  await page.getByRole("link", { name: "Log in", exact: true }).first().click();
  await page.waitForURL("**/login");
});
