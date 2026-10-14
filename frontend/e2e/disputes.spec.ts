import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  awardWinner,
  createRfq,
  login,
  quote,
  register,
  signContract,
  stamp,
} from "./helpers";

/**
 * اختلاف و لغو توافقی پس از امضا (گام 3f، O11) با مرورگر واقعی.
 * ادمین فقط با CLI ساخته می‌شود (راهنما در verification.spec.ts).
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";

/** سفارشی که هر دو طرف قراردادش را امضا کرده‌اند (بدون پیش‌پرداخت ⇒ در حال تولید) */
async function signedOrder(
  browser: Browser,
  label: string,
): Promise<{ buyer: Page; supplier: Page; orderUrl: string; title: string }> {
  const title = `${label} ${stamp}`;
  const company = `کارگاه ${label} ${stamp}`;
  const buyer = await register(browser, "buyer", `کارفرمای ${label}`);
  const rfqUrl = await createRfq(buyer, title);
  const supplier = await register(browser, "supplier", `قطعه‌ساز ${label}`, company);
  await supplier.goto(rfqUrl);
  await quote(supplier, "70000000", "10");
  const orderUrl = await awardWinner(buyer, rfqUrl, company);
  await signContract(buyer, orderUrl);
  await signContract(supplier, orderUrl);
  return { buyer, supplier, orderUrl, title };
}

test("after signing, a cancellation needs both sides", async ({ browser }) => {
  const { buyer, supplier, orderUrl } = await signedOrder(browser, "لغو توافقی");

  await supplier.goto(orderUrl);
  await supplier.getByRole("button", { name: "درخواست لغو" }).click();
  const request = supplier.getByRole("dialog", { name: "درخواست لغو سفارش" });
  await request.getByLabel("دلیل لغو").fill("دستگاه اصلی خط تولید خراب شد");
  await request.getByRole("button", { name: "ثبت درخواست لغو" }).click();
  await expect(supplier.getByText("درخواست لغو شما منتظر پاسخ کارفرما است.")).toBeVisible();

  // کارفرما درخواست را می‌بیند و سفارش را ادامه می‌دهد
  await buyer.goto(orderUrl);
  await expect(buyer.getByText("قطعه‌ساز درخواست لغو این سفارش را داده است.")).toBeVisible();
  await buyer.getByRole("button", { name: "ادامه‌ی سفارش" }).click();
  await buyer
    .getByRole("dialog", { name: "ادامه‌ی سفارش" })
    .getByRole("button", { name: "سفارش ادامه یابد" })
    .click();
  await expect(buyer.getByText("قطعه‌ساز درخواست لغو این سفارش را داده است.")).toHaveCount(0);
  await expect(buyer.getByText("در حال تولید").first()).toBeVisible();
});

test.describe("disputes", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "E2E_ADMIN_EMAIL و E2E_ADMIN_PASSWORD تنظیم نشده‌اند (ادمین با python -m app.create_admin ساخته می‌شود)",
  );

  test("the buyer reports a problem and support completes the order with a reason", async ({
    browser,
  }) => {
    const { buyer, supplier, orderUrl, title } = await signedOrder(browser, "اختلاف");

    await supplier.goto(orderUrl);
    await supplier.getByRole("button", { name: "ثبت ارسال" }).click();
    await supplier
      .getByRole("dialog", { name: "ثبت ارسال" })
      .getByRole("button", { name: "ثبت ارسال" })
      .click();
    await expect(supplier.getByText("ارسال‌شده").first()).toBeVisible();

    await buyer.goto(orderUrl);
    await buyer.getByRole("button", { name: "اعلام مشکل" }).click();
    const report = buyer.getByRole("dialog", { name: "اعلام مشکل" });
    await report.getByLabel("شرح مشکل").fill("بیست عدد از قطعات ترک دارند");
    await report.getByRole("button", { name: "ثبت و ارسال برای پشتیبانی" }).click();
    await expect(buyer.getByText("تا تصمیم پشتیبانی پارت‌ماشین، سفارش متوقف است.")).toBeVisible();
    await expect(buyer.getByRole("button", { name: "تأیید تحویل" })).toHaveCount(0);

    const admin = await login(browser, ADMIN_EMAIL, ADMIN_PASSWORD);
    await admin.goto("/admin/disputes");
    const card = admin.getByRole("article").filter({ hasText: title });
    await expect(card.getByText("بیست عدد از قطعات ترک دارند")).toBeVisible();
    await card.getByRole("button", { name: "تکمیل سفارش" }).click();
    const decision = admin.getByRole("dialog");
    await decision
      .getByLabel("دلیل تصمیم (به هر دو طرف نمایش داده می‌شود)")
      .fill("قطعه‌ساز قطعات معیوب را جایگزین کرد");
    await decision.getByRole("button", { name: "سفارش تکمیل شود" }).click();
    await expect(admin.getByRole("article").filter({ hasText: title })).toHaveCount(0);

    await buyer.reload();
    await expect(buyer.getByText("این سفارش با موفقیت تکمیل شده است.")).toBeVisible();
    await expect(
      buyer.getByText("تکمیل سفارش: قطعه‌ساز قطعات معیوب را جایگزین کرد"),
    ).toBeVisible();
  });
});
