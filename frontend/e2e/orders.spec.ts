import { expect, test } from "@playwright/test";
import { createRfq, quote, register, stamp } from "./helpers";

/** سفارش (گام 3a): ساخت خودکار پس از انتخاب برنده، دید مشترک دو طرف، لغو با دلیل پیش از قرارداد. */

test("the winning order is shared by both sides and can be cancelled before the contract", async ({
  browser,
}) => {
  const title = `سفارش آزمون ${stamp}`;
  const company = `کارگاه سفارش ${stamp}`;
  const buyer = await register(browser, "buyer", "کارفرمای سفارش");
  const rfqUrl = await createRfq(buyer, title);

  const supplier = await register(browser, "supplier", "قطعه‌ساز سفارش", company);
  await supplier.goto(rfqUrl);
  await quote(supplier, "95000000", "15");

  await buyer.goto(rfqUrl);
  await buyer.getByRole("button", { name: `انتخاب ${company} به‌عنوان برنده` }).click();
  await buyer
    .getByRole("dialog", { name: "انتخاب برنده" })
    .getByRole("button", { name: "بله، برنده را انتخاب کن" })
    .click();
  await buyer.getByRole("link", { name: "مشاهده‌ی سفارش" }).click();
  await buyer.waitForURL("**/orders/**");
  const orderUrl = buyer.url();
  await expect(buyer.getByRole("heading", { name: title })).toBeVisible();
  await expect(buyer.getByText("قدم بعدی تنظیم و امضای قرارداد")).toBeVisible();

  // قطعه‌ساز برنده سفارش را در فهرست خودش می‌بیند و آن را با دلیل لغو می‌کند
  await supplier.goto("/orders");
  await supplier.getByRole("link", { name: new RegExp(title) }).click();
  await supplier.waitForURL("**/orders/**");
  await supplier.getByRole("button", { name: "لغو سفارش" }).click();
  const dialog = supplier.getByRole("dialog", { name: "لغو سفارش" });
  await dialog.getByLabel("دلیل لغو").fill("ظرفیت تولید این ماه پر شد");
  await dialog.getByRole("button", { name: "بله، سفارش لغو شود" }).click();
  await expect(supplier.getByText("این سفارش لغو شده است. دلیل: ظرفیت تولید این ماه پر شد")).toBeVisible();

  // کارفرما همان را می‌بیند؛ سازمان سوم سفارش را اصلاً نمی‌بیند
  await buyer.reload();
  await expect(buyer.getByText("این سفارش لغو شده است. دلیل: ظرفیت تولید این ماه پر شد")).toBeVisible();
  await expect(buyer.getByText("قطعه‌ساز — قطعه‌ساز سفارش")).toBeVisible();

  const outsider = await register(browser, "buyer", "کاربر بیگانه");
  await outsider.goto(orderUrl);
  await expect(outsider.getByText("سفارش موردنظر پیدا نشد")).toBeVisible();
});
