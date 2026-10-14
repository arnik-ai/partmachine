import { expect, test } from "@playwright/test";
import { createRfq, quote, register, stamp } from "./helpers";

/**
 * اعلان داخل سایت و داشبورد واقعی (گام 3e): پیشنهاد تازه زنگوله‌ی کارفرما را روشن می‌کند،
 * داشبورد عدد واقعی را نشان می‌دهد و زدن اعلان آن را خوانده‌شده می‌کند و به صفحه‌اش می‌برد.
 */
test("a new quote rings the buyer's bell and the dashboard shows real numbers", async ({
  browser,
}) => {
  const title = `اعلان آزمون ${stamp}`;
  const company = `کارگاه اعلان ${stamp}`;
  const buyer = await register(browser, "buyer", "کارفرمای اعلان");
  const rfqUrl = await createRfq(buyer, title);

  await buyer.goto("/dashboard");
  await expect(buyer.getByRole("link", { name: "درخواست‌های باز من: ۱" })).toBeVisible();
  await expect(buyer.getByRole("link", { name: "اعلان‌ها", exact: true })).toBeVisible();

  const supplier = await register(browser, "supplier", "قطعه‌ساز اعلان", company);
  await supplier.goto(rfqUrl);
  await quote(supplier, "50000000", "10");
  // قطعه‌ساز برای کار خودش اعلان نمی‌گیرد
  await expect(supplier.getByRole("link", { name: "اعلان‌ها", exact: true })).toBeVisible();

  await buyer.reload();
  const bell = buyer.getByRole("link", { name: "اعلان‌ها — ۱ خوانده‌نشده" });
  await expect(bell).toBeVisible();
  await expect(
    buyer.getByRole("link", { name: "پیشنهادهای دریافتی روی درخواست‌های باز: ۱" }),
  ).toBeVisible();
  await expect(buyer.getByRole("link", { name: `پیشنهاد تازه برای «${title}»` })).toBeVisible();

  await bell.click();
  await buyer.waitForURL("**/notifications");
  await expect(buyer.getByText(`${company} پیشنهاد قیمت ثبت کرد.`)).toBeVisible();
  await buyer.getByRole("button", { name: new RegExp(`پیشنهاد تازه برای «${title}»`) }).click();
  await buyer.waitForURL("**/rfqs/**");
  await expect(buyer.getByRole("link", { name: "اعلان‌ها", exact: true })).toBeVisible();
});
