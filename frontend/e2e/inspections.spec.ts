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
} from "./helpers";

/**
 * کنترل کیفیت اختیاری (گام 3d) با مرورگر واقعی: ادمین آزمایشگاه را تأیید می‌کند، کارفرما آن را
 * برای سفارش انتخاب می‌کند، آزمایشگاه بار اول رد و بار دوم قبول می‌کند و فقط پس از قبولی ارسال
 * ممکن است. آزمایشگاه مبلغ، پرداخت‌ها و قرارداد را نمی‌بیند.
 * ادمین فقط با CLI ساخته می‌شود (راهنما در verification.spec.ts).
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";

async function markReady(supplier: Page): Promise<void> {
  await supplier.getByRole("button", { name: /آماده‌ی بازرسی|آمادگی برای بازرسی/ }).click();
  await supplier
    .getByRole("dialog", { name: "اعلام آمادگی برای بازرسی" })
    .getByRole("button", { name: "اعلام آمادگی" })
    .click();
}

async function recordResult(lab: Page, passed: boolean, report: string, reason = ""): Promise<void> {
  await lab.getByRole("button", { name: passed ? "ثبت قبولی" : "ثبت رد" }).click();
  const dialog = lab.getByRole("dialog", { name: passed ? "ثبت قبولی بازرسی" : "ثبت رد بازرسی" });
  if (reason) await dialog.getByLabel("دلیل رد").fill(reason);
  await dialog.getByLabel("انتخاب گزارش بازرسی").setInputFiles({
    name: report,
    mimeType: "application/pdf",
    buffer: PDF,
  });
  await expect(dialog.getByLabel("بارگذاری شد")).toBeVisible();
  await dialog.getByRole("button", { name: passed ? "ثبت قبولی" : "ثبت رد" }).click();
  await expect(dialog).toBeHidden();
}

test.describe("quality inspection", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "E2E_ADMIN_EMAIL و E2E_ADMIN_PASSWORD تنظیم نشده‌اند (ادمین با python -m app.create_admin ساخته می‌شود)",
  );

  test("the chosen lab rejects, then passes, and only then the supplier can ship", async ({
    browser,
  }) => {
    const labName = `آزمایشگاه آزمون ${stamp}`;
    const labOwner = `مدیر آزمایشگاه ${stamp}`;
    const labEmail = uniqueEmail("qc");
    const lab = await register(browser, "qc", labOwner, labName, labEmail);

    // ادمین حساب مدیر آزمایشگاه را تأیید می‌کند ⇒ آزمایشگاه در فهرست انتخاب کارفرماها
    const admin = await login(browser, ADMIN_EMAIL, ADMIN_PASSWORD);
    await admin.goto("/admin/users");
    await admin.getByLabel("جستجوی کاربر").fill(labEmail);
    await admin.getByRole("button", { name: `تأیید حساب ${labOwner}` }).click();
    await expect(
      admin.getByText("این آزمایشگاه در فهرست انتخاب کارفرماها برای بازرسی کیفیت است."),
    ).toBeVisible();

    const title = `بازرسی آزمون ${stamp}`;
    const company = `کارگاه بازرسی ${stamp}`;
    const buyer = await register(browser, "buyer", "کارفرمای بازرسی");
    const rfqUrl = await createRfq(buyer, title);
    const supplier = await register(browser, "supplier", "قطعه‌ساز بازرسی", company);
    await supplier.goto(rfqUrl);
    await quote(supplier, "80000000", "10");
    const orderUrl = await awardWinner(buyer, rfqUrl, company);

    // کارفرما پیش از امضای قرارداد آزمایشگاه را انتخاب می‌کند
    await buyer.getByRole("button", { name: "انتخاب آزمایشگاه" }).click();
    const choose = buyer.getByRole("dialog", { name: "انتخاب آزمایشگاه" });
    await choose.getByLabel(labName).check();
    await choose.getByRole("button", { name: "انتخاب این آزمایشگاه" }).click();
    await expect(buyer.getByText("در انتظار آمادگی قطعه‌ساز")).toBeVisible();

    await signContract(buyer, orderUrl);
    await signContract(supplier, orderUrl);

    // ارسال تا قبولی بازرسی بسته است؛ قطعه‌ساز آمادگی را اعلام می‌کند
    await supplier.goto(orderUrl);
    await expect(supplier.getByText("پیش از ارسال، بازرسی کیفیت لازم است.")).toBeVisible();
    await expect(supplier.getByRole("button", { name: "ثبت ارسال" })).toHaveCount(0);
    await markReady(supplier);
    await expect(supplier.getByText("در حال بازرسی").first()).toBeVisible();

    // آزمایشگاه فقط همین سفارش را می‌بیند، بدون مبلغ، پرداخت‌ها و قرارداد
    await lab.goto("/orders");
    await lab.getByRole("link", { name: new RegExp(title) }).click();
    await lab.waitForURL("**/orders/**");
    await expect(lab.getByRole("heading", { name: title })).toBeVisible();
    await expect(lab.getByText("پول از پارت‌ماشین عبور نمی‌کند")).toHaveCount(0);
    await expect(lab.getByRole("link", { name: /قرارداد/ })).toHaveCount(0);
    await recordResult(lab, false, "report-1.pdf", "قطر داخلی خارج از تلرانس");
    await expect(lab.getByText("نتیجه‌ی رد ثبت شد.", { exact: false })).toBeVisible();

    // قطعه‌ساز دلیل رد را می‌بیند، اصلاح می‌کند و دوباره اعلام آمادگی می‌کند
    await supplier.reload();
    await expect(supplier.getByText("قطر داخلی خارج از تلرانس").first()).toBeVisible();
    await expect(supplier.getByRole("button", { name: "ثبت ارسال" })).toHaveCount(0);
    await markReady(supplier);
    await expect(supplier.getByText("دور ۲")).toBeVisible();

    await lab.reload();
    await recordResult(lab, true, "report-2.pdf");
    await expect(lab.getByText("نتیجه‌ی قبول ثبت شد.")).toBeVisible();

    // پس از قبولی، قطعه‌ساز ارسال را ثبت می‌کند
    await supplier.reload();
    await expect(supplier.getByText("بازرسی قبول شد؛ حالا می‌توانید ارسال را ثبت کنید.")).toBeVisible();
    await supplier.getByRole("button", { name: "ثبت ارسال" }).click();
    await supplier
      .getByRole("dialog", { name: "ثبت ارسال" })
      .getByRole("button", { name: "ثبت ارسال" })
      .click();
    await expect(supplier.getByText("ارسال‌شده").first()).toBeVisible();

    // کارفرما کل مسیر بازرسی را در تاریخچه می‌بیند و گزارش را دانلود می‌کند
    await buyer.goto(orderUrl);
    await expect(buyer.getByText("رد بازرسی")).toBeVisible();
    await expect(buyer.getByText("قبولی بازرسی")).toBeVisible();
    await expect(buyer.getByRole("button", { name: "دانلود report-2.pdf" }).first()).toBeVisible();
  });
});
