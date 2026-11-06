import { expect, test } from "@playwright/test";

/**
 * پیگیری تولید فعلاً فقط فرانت با داده‌ی نمونه است (PRODUCTION_ENABLED = DEMO_MODE):
 * تا بک‌اند ساخته نشده، سایت واقعی نباید آن را نشان بدهد و داده‌ی ساختگی نباید دیده شود.
 */
test("ماژول پیگیری تولید در سایت واقعی خاموش است", async ({ page }) => {
  for (const path of [
    "/production",
    "/production/processes",
    "/production/people",
    "/production/new",
    "/production/order?id=flange",
    "/production/tasks",
    "/production/done",
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(page.getByText("فلنج اتصال لوله"), path).toHaveCount(0);
    await expect(page.getByText("کارگاه نمونه‌سازان"), path).toHaveCount(0);
  }

  await page.goto("/suppliers");
  await expect(page.getByRole("link", { name: "پیگیری تولید" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "تولید", exact: true })).toHaveCount(0);
});
