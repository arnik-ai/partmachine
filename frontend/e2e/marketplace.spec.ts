import { expect, test } from "@playwright/test";
import {
  PASSWORD,
  acceptTerms,
  createRfq,
  inDays,
  quote,
  register,
  stamp,
  uniqueEmail,
} from "./helpers";

/**
 * چرخه‌ی اصلی بازار با مرورگر واقعی: ثبت RFQ ← فید قطعه‌سازها ← پیشنهاد (تومان) ←
 * ویرایش ← مقایسه و انتخاب برنده ← دیدن نتیجه؛ و لغو درخواست.
 */

test("buyer posts an RFQ, suppliers quote and the buyer picks a winner", async ({ browser }) => {
  const title = `آزمون سرتاسری ${stamp}`;
  const firstCompany = `کارگاه اول ${stamp}`;
  const secondCompany = `کارگاه دوم ${stamp}`;

  const buyer = await register(browser, "buyer", "کارفرمای آزمون");
  const rfqUrl = await createRfq(buyer, title);
  await expect(buyer.getByText("هنوز پیشنهادی نرسیده است")).toBeVisible();

  // قطعه‌ساز اول درخواست را در فید پیدا می‌کند و با ارقام فارسی قیمت می‌دهد
  const first = await register(browser, "supplier", "قطعه‌ساز اول", firstCompany);
  await first.goto("/rfqs/open");
  await first.getByLabel("جستجو").fill(stamp);
  await first.getByRole("link", { name: new RegExp(title) }).click();
  await first.getByLabel("قیمت کل (تومان)").fill("۱۸۵۰۰۰۰۰۰");
  await expect(first.getByText("۱۸۵٬۰۰۰٬۰۰۰ تومان")).toBeVisible();
  await quote(first, "۱۸۵۰۰۰۰۰۰", "14");

  // تا پایان مهلت می‌تواند پیشنهادش را ویرایش کند
  await first.getByRole("button", { name: "ویرایش پیشنهاد" }).click();
  await first.getByLabel("قیمت کل (تومان)").fill("175000000");
  await first.getByRole("button", { name: "ذخیره‌ی تغییرات" }).click();
  await expect(first.getByText("۱۷۵٬۰۰۰٬۰۰۰ تومان")).toBeVisible();

  const second = await register(browser, "supplier", "قطعه‌ساز دوم", secondCompany);
  await second.goto(rfqUrl);
  await quote(second, "160000000", "20");

  // کارفرما مقایسه می‌کند؛ هیچ‌کدام تأییدشده نیستند
  await buyer.goto(rfqUrl);
  await expect(buyer.getByText("پیشنهادهای دریافتی (۲)")).toBeVisible();
  await buyer.getByLabel("فقط قطعه‌سازهای تأییدشده").check();
  await expect(buyer.getByText("پیشنهادی از قطعه‌ساز تأییدشده وجود ندارد.")).toBeVisible();
  await buyer.getByLabel("فقط قطعه‌سازهای تأییدشده").uncheck();

  await buyer.getByRole("button", { name: `انتخاب ${firstCompany} به‌عنوان برنده` }).click();
  const dialog = buyer.getByRole("dialog", { name: "انتخاب برنده" });
  await expect(dialog).toContainText("قابل تغییر نیست");
  await dialog.getByRole("button", { name: "بله، برنده را انتخاب کن" }).click();
  await expect(buyer.getByText("برنده‌ی انتخاب‌شده ✓")).toBeVisible();
  await expect(buyer.getByText("برنده انتخاب شد و سفارش ساخته شد.")).toBeVisible();
  await buyer.getByRole("link", { name: "مشاهده‌ی سفارش" }).click();
  await buyer.waitForURL("**/orders/**");
  await expect(buyer.getByRole("heading", { name: title })).toBeVisible();
  await expect(buyer.getByText("در انتظار قرارداد").first()).toBeVisible();

  // هر قطعه‌ساز نتیجه‌ی خودش را می‌بیند
  await first.goto("/quotations");
  await expect(first.getByText("برنده شدید")).toBeVisible();
  await second.goto("/quotations");
  await expect(second.getByText("انتخاب نشد")).toBeVisible();
});

test("buyer can cancel an RFQ with a reason", async ({ browser }) => {
  const buyer = await register(browser, "buyer", "کارفرمای لغو");
  await createRfq(buyer, `درخواست لغوشدنی ${stamp}`);

  await buyer.getByRole("button", { name: "لغو درخواست" }).click();
  const dialog = buyer.getByRole("dialog", { name: "لغو درخواست" });
  await dialog.getByLabel("دلیل (اختیاری؛ فقط برای سازمان شما)").fill("پروژه منتفی شد");
  await dialog.getByRole("button", { name: "بله، لغو کن" }).click();
  await expect(buyer.getByText("لغو شده", { exact: true })).toBeVisible();
  await expect(buyer.getByText("دلیل لغو: پروژه منتفی شد")).toBeVisible();
  await expect(buyer.getByRole("button", { name: "لغو درخواست" })).toHaveCount(0);
});

test("session stays private and survives a reload", async ({ browser }) => {
  const page = await register(browser, "buyer", "کارفرمای نشست");

  // توکن دسترسی فقط در حافظه است و refresh token در کوکی HttpOnly
  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  expect(stored).not.toMatch(/eyJ/);
  expect(await page.evaluate(() => document.cookie)).not.toContain("pm_refresh");
  const cookie = (await page.context().cookies()).find((c) => c.name === "pm_refresh");
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/api/v1/auth" });

  await page.goto("/rfqs");
  await page.reload();
  await expect(page.getByRole("heading", { name: "درخواست‌های استعلام قیمت من" })).toBeVisible();

  await page.getByRole("button", { name: "خروج" }).click();
  await page.waitForURL((url) => url.pathname === "/" || url.pathname.endsWith("/partmachine/"));
  await page.goto("/rfqs");
  await page.waitForURL(/\/login\?next=/);
});

test("owner invites a colleague who joins and can later be removed", async ({ browser }) => {
  const owner = await register(browser, "buyer", "مدیر سازمان آزمون");
  const title = `درخواست سازمانی ${stamp}`;
  await createRfq(owner, title);

  await owner.goto("/organization");
  await owner.getByRole("button", { name: "ساخت لینک دعوت" }).click();
  const link = await owner.getByLabel("لینک دعوت (فقط همین حالا نمایش داده می‌شود)").inputValue();

  const member = await (await browser.newContext()).newPage();
  await member.goto(link);
  await expect(member.getByText("شما را به سازمان")).toBeVisible();
  await member.getByLabel("نام و نام خانوادگی").fill("همکار دعوت‌شده");
  await member.getByLabel("ایمیل").fill(uniqueEmail("member"));
  await member.getByLabel("رمز عبور").fill(PASSWORD);
  await acceptTerms(member);
  await member.getByRole("button", { name: "ایجاد حساب" }).click();
  await member.waitForURL("**/dashboard");
  await member.goto("/rfqs");
  await expect(member.getByText(title)).toBeVisible();

  await owner.goto("/organization");
  await owner.getByRole("button", { name: "حذف همکار دعوت‌شده از سازمان" }).click();
  await owner.getByRole("dialog", { name: "حذف عضو" }).getByRole("button", { name: "بله، حذف کن" }).click();
  await expect(owner.getByText("همکار دعوت‌شده")).toHaveCount(0);

  // دسترسی عضو حذف‌شده بلافاصله قطع می‌شود
  await member.goto("/rfqs");
  await member.waitForURL(/\/login/);
});

test("drawings stay private until the supplier accepts the NDA", async ({ browser }) => {
  const fileName = "نقشه-فلنج.pdf";
  const buyer = await register(browser, "buyer", "کارفرمای فایل");
  await buyer.goto("/rfqs/new");
  await buyer.getByLabel("عنوان درخواست").fill(`درخواست با نقشه ${stamp}`);
  await buyer.getByLabel("شرح فنی").fill("طبق نقشه‌ی پیوست");
  await buyer.getByLabel("تعداد").fill("50");
  await buyer.getByLabel("مهلت تحویل").fill(inDays(30));
  await buyer.getByLabel("انتخاب فایل‌های فنی").setInputFiles({
    name: fileName,
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% PartMachine e2e drawing\n"),
  });
  await acceptTerms(buyer);
  // دکمه تا پایان بارگذاری فایل غیرفعال می‌ماند
  await expect(buyer.getByRole("button", { name: "انتشار درخواست" })).toBeEnabled();
  await buyer.getByRole("button", { name: "انتشار درخواست" }).click();
  await expect(buyer.getByText("درخواست شما ثبت شد")).toBeVisible();
  const rfqUrl = buyer.url().split("?")[0];
  await expect(buyer.getByRole("button", { name: `دانلود ${fileName}` })).toBeVisible();

  const supplier = await register(browser, "supplier", "قطعه‌ساز فایل", `کارگاه فایل ${stamp}`);
  await supplier.goto(rfqUrl);
  await expect(supplier.getByText("۱ فایل فنی محرمانه")).toBeVisible();
  await expect(supplier.getByRole("button", { name: `دانلود ${fileName}` })).toHaveCount(0);
  await acceptTerms(supplier);
  await supplier.getByRole("button", { name: "می‌پذیرم و فایل‌ها را نشان بده" }).click();

  const downloadStarted = supplier.waitForEvent("download");
  await supplier.getByRole("button", { name: `دانلود ${fileName}` }).click();
  const download = await downloadStarted;
  expect(download.suggestedFilename()).toBe(fileName);
});

