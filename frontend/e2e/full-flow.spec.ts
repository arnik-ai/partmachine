import { expect, test, type Page } from "@playwright/test";
import {
  PDF,
  awardWinner,
  createRfq,
  login,
  quote,
  register,
  signContract,
  stamp,
  uniqueEmail,
  verifyLab,
} from "./helpers";

/**
 * آزمون سرتاسری کل مسیر سفارش (فاز ۳، بخش ۶ طرح): انتخاب برنده ← قرارداد با پیش‌پرداخت و امضای
 * دو طرف ← پیش‌پرداخت ← تولید ← کنترل کیفیت ← ارسال ← تحویل ← تسویه ← تکمیل ← امتیاز.
 * ادمین فقط با CLI ساخته می‌شود (راهنما در verification.spec.ts).
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";

async function reportPayment(buyer: Page, button: string, reference: string): Promise<void> {
  await buyer.getByRole("button", { name: button }).click();
  const dialog = buyer.getByRole("dialog", { name: "اعلام پرداخت" });
  await dialog.getByLabel("شماره‌ی پیگیری یا حواله").fill(reference);
  await dialog.getByRole("button", { name: "ثبت اعلام پرداخت" }).click();
  await expect(dialog).toBeHidden();
}

async function confirmPayment(supplier: Page, button: string): Promise<void> {
  await supplier.getByRole("button", { name: button }).click();
  const dialog = supplier.getByRole("dialog", { name: "تأیید دریافت پرداخت" });
  await dialog.getByRole("button", { name: "بله، مبلغ را دریافت کردم" }).click();
  await expect(dialog).toBeHidden();
}

test.describe("full order flow", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "E2E_ADMIN_EMAIL و E2E_ADMIN_PASSWORD تنظیم نشده‌اند (ادمین با python -m app.create_admin ساخته می‌شود)",
  );

  test("award, contract, prepayment, production, QC, shipping, delivery, settlement, rating", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const labName = `آزمایشگاه مسیر کامل ${stamp}`;
    const labOwner = `مدیر آزمایشگاه مسیر کامل ${stamp}`;
    const labEmail = uniqueEmail("qc");
    const lab = await register(browser, "qc", labOwner, labName, labEmail);
    const admin = await login(browser, ADMIN_EMAIL, ADMIN_PASSWORD);
    await verifyLab(admin, labEmail, labOwner);

    // ۱. انتخاب برنده
    const title = `مسیر کامل ${stamp}`;
    const company = `کارگاه مسیر کامل ${stamp}`;
    const buyer = await register(browser, "buyer", "کارفرمای مسیر کامل");
    const rfqUrl = await createRfq(buyer, title);
    const supplier = await register(browser, "supplier", "قطعه‌ساز مسیر کامل", company);
    await supplier.goto(rfqUrl);
    await quote(supplier, "100000000", "15");
    const orderUrl = await awardWinner(buyer, rfqUrl, company);

    // کنترل کیفیت از همان ابتدا انتخاب می‌شود
    await buyer.getByRole("button", { name: "انتخاب آزمایشگاه" }).click();
    const choose = buyer.getByRole("dialog", { name: "انتخاب آزمایشگاه" });
    await choose.getByLabel(labName).check();
    await choose.getByRole("button", { name: "انتخاب این آزمایشگاه" }).click();
    await expect(buyer.getByText("در انتظار آمادگی قطعه‌ساز")).toBeVisible();

    // ۲. قرارداد با ۳۰٪ پیش‌پرداخت و امضای مدیر هر دو طرف
    await buyer.goto(`${orderUrl}/contract`);
    await buyer.getByLabel("شرایط پرداخت").selectOption("30");
    await buyer.getByRole("button", { name: "ذخیره‌ی شرایط" }).click();
    await expect(buyer.getByText("نسخه‌ی تازه‌ی قرارداد ذخیره شد.")).toBeVisible();
    await signContract(buyer, orderUrl);
    await signContract(supplier, orderUrl);

    // ۳. پیش‌پرداخت (بیرون از پلتفرم) اعلام و تأیید می‌شود ⇒ ۴. تولید
    await buyer.goto(orderUrl);
    await expect(buyer.getByText("در انتظار پیش‌پرداخت").first()).toBeVisible();
    await reportPayment(buyer, "اعلام پیش‌پرداخت", "300300");
    await supplier.goto(orderUrl);
    await confirmPayment(supplier, "تأیید دریافت پیش‌پرداخت");
    await expect(supplier.getByText("در حال تولید").first()).toBeVisible();

    // ۵. کنترل کیفیت: آمادگی قطعه‌ساز و قبولی آزمایشگاه
    await supplier.getByRole("button", { name: "اعلام آمادگی برای بازرسی" }).click();
    await supplier
      .getByRole("dialog", { name: "اعلام آمادگی برای بازرسی" })
      .getByRole("button", { name: "اعلام آمادگی" })
      .click();
    await lab.goto(orderUrl);
    await lab.getByRole("button", { name: "ثبت قبولی" }).click();
    const pass = lab.getByRole("dialog", { name: "ثبت قبولی بازرسی" });
    await pass.getByLabel("انتخاب گزارش بازرسی").setInputFiles({
      name: "qc-report.pdf",
      mimeType: "application/pdf",
      buffer: PDF,
    });
    await expect(pass.getByLabel("بارگذاری شد")).toBeVisible();
    await pass.getByRole("button", { name: "ثبت قبولی" }).click();
    await expect(lab.getByText("نتیجه‌ی قبول ثبت شد.")).toBeVisible();

    // ۶. ارسال و ۷. تحویل
    await supplier.reload();
    await supplier.getByRole("button", { name: "ثبت ارسال" }).click();
    await supplier
      .getByRole("dialog", { name: "ثبت ارسال" })
      .getByRole("button", { name: "ثبت ارسال" })
      .click();
    await expect(supplier.getByText("ارسال‌شده").first()).toBeVisible();
    await buyer.reload();
    await buyer.getByRole("button", { name: "تأیید تحویل" }).click();
    await buyer
      .getByRole("dialog", { name: "تأیید تحویل" })
      .getByRole("button", { name: "بله، کالا را تحویل گرفتم" })
      .click();
    await expect(buyer.getByText("تحویل‌شده").first()).toBeVisible();

    // ۸. تسویه‌ی پایانی ⇒ ۹. تکمیل
    await reportPayment(buyer, "اعلام تسویه‌ی پایانی", "700700");
    await supplier.reload();
    await confirmPayment(supplier, "تأیید دریافت تسویه‌ی پایانی");
    await expect(supplier.getByText("این سفارش با موفقیت تکمیل شده است.")).toBeVisible();

    // امتیاز کارفرما و تاریخچه‌ی کامل
    await buyer.reload();
    await buyer.getByRole("radio", { name: "۴ از ۵ — خیلی خوب" }).click();
    await buyer.getByRole("button", { name: "ثبت امتیاز" }).click();
    await expect(buyer.getByText("امتیاز شما ثبت شد. سپاس از بازخوردتان.")).toBeVisible();
    for (const step of [
      "امضای قرارداد",
      "تأیید دریافت پرداخت",
      "قبولی بازرسی",
      "ثبت ارسال",
      "تأیید تحویل",
      "امتیاز کارفرما",
    ]) {
      await expect(buyer.getByText(step, { exact: true }).first()).toBeVisible();
    }
  });
});
