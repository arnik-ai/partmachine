import { expect, test } from "@playwright/test";
import { PDF, PNG, login, register, stamp, uniqueEmail } from "./helpers";

/**
 * پروفایل قطعه‌ساز، تأیید هویت و پنل ادمین (گام 2e) با مرورگر واقعی.
 * ادمین فقط با CLI ساخته می‌شود؛ پیش از اجرا:
 *   printf '%s' "$E2E_ADMIN_PASSWORD" | python -m app.create_admin --email "$E2E_ADMIN_EMAIL" --name "ادمین آزمون" --password-stdin
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";

test.describe("supplier verification and admin", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "E2E_ADMIN_EMAIL و E2E_ADMIN_PASSWORD تنظیم نشده‌اند (ادمین با python -m app.create_admin ساخته می‌شود)",
  );

  test("supplier completes the profile, admin approves the documents, buyers see the badge", async ({
    browser,
  }) => {
    const company = `صنایع تأییدشده ${stamp}`;
    const supplier = await register(browser, "supplier", "قطعه‌ساز مدارک", company);

    // داشبورد قدم بعدی را نشان می‌دهد
    await expect(supplier.getByText("پروفایل شرکت شما کامل نیست")).toBeVisible();
    await supplier.getByRole("link", { name: "تکمیل پروفایل" }).click();
    await supplier.waitForURL("**/profile");

    await supplier.getByLabel("شهر *").fill("اصفهان");
    await supplier.getByLabel("ماشین‌کاری CNC").check();
    await supplier.getByLabel("زمان معمول تحویل (روز) *").fill("۱۰");
    await supplier.getByLabel("وب‌سایت").fill("partmachine-e2e.ir");
    await supplier.getByRole("button", { name: "ذخیره‌ی پروفایل" }).click();
    await expect(
      supplier.getByText("پروفایل ذخیره شد و حالا در فهرست قطعه‌سازها نمایش داده می‌شود."),
    ).toBeVisible();

    await supplier.getByLabel("انتخاب عکس نمونه‌کار").setInputFiles({
      name: "sample.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    await expect(supplier.getByRole("img", { name: "نمونه‌کار ۱" })).toBeVisible();

    await supplier.getByLabel("انتخاب مدارک تأیید هویت").setInputFiles({
      name: "روزنامه-رسمی.pdf",
      mimeType: "application/pdf",
      buffer: PDF,
    });
    const send = supplier.getByRole("button", { name: "ارسال برای بررسی" });
    await expect(send).toBeEnabled();
    await send.click();
    await expect(supplier.getByText("مدارک شما در حال بررسی است.")).toBeVisible();

    // ادمین مدرک را می‌بیند و تأیید می‌کند
    const admin = await login(browser, ADMIN_EMAIL, ADMIN_PASSWORD);
    await admin.goto("/admin");
    const card = admin.getByRole("article", { name: company });
    await expect(card.getByRole("button", { name: "دانلود روزنامه-رسمی.pdf" })).toBeVisible();
    await card.getByRole("button", { name: "تأیید", exact: true }).click();
    await admin
      .getByRole("dialog", { name: "تأیید مدارک" })
      .getByRole("button", { name: "بله، تأیید کن" })
      .click();
    await expect(card).toHaveCount(0);

    await supplier.reload();
    await expect(supplier.getByText("شرکت شما تأییدشده است.")).toBeVisible();

    // هر بازدیدکننده‌ای فقط تأییدشده‌ها را فیلتر می‌کند و نشان و تصویر را می‌بیند
    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto("/suppliers");
    await visitor.getByLabel("فقط قطعه‌سازهای تأییدشده").check();
    await visitor.getByLabel("جستجو").fill(stamp);
    await visitor.getByRole("link", { name: new RegExp(company) }).click();
    await expect(visitor.getByText("تأییدشده", { exact: true })).toBeVisible();
    await expect(visitor.getByRole("img", { name: `نمونه‌کار ${company} — ۱` })).toBeVisible();
  });

  test("admin deactivates an account and the action appears in the audit log", async ({
    browser,
  }) => {
    const name = `کاربر مسدود ${stamp}`;
    const email = uniqueEmail("blocked");
    const buyer = await register(browser, "buyer", name, undefined, email);

    const admin = await login(browser, ADMIN_EMAIL, ADMIN_PASSWORD);
    await admin.goto("/admin/users");
    await admin.getByLabel("جستجوی کاربر").fill(email);
    await admin.getByRole("button", { name: `غیرفعال‌سازی ${name}` }).click();
    const dialog = admin.getByRole("dialog", { name: "غیرفعال‌سازی حساب" });
    await dialog.getByLabel("دلیل (اختیاری؛ در رویدادها ثبت می‌شود)").fill("آزمون سرتاسری");
    await dialog.getByRole("button", { name: "بله، غیرفعال کن" }).click();
    await expect(admin.getByRole("button", { name: `فعال‌سازی ${name}` })).toBeVisible();

    // دسترسی کاربر بلافاصله قطع می‌شود
    await buyer.goto("/rfqs");
    await buyer.waitForURL(/\/login/);

    await admin.goto("/admin/audit");
    await admin.getByLabel("نوع رویداد").selectOption("admin");
    await admin.getByRole("button", { name: "اعمال فیلتر" }).click();
    await expect(admin.getByText("غیرفعال‌سازی کاربر").first()).toBeVisible();
  });
});
