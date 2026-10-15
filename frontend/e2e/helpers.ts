import { createHmac } from "node:crypto";
import { expect, type Browser, type Page } from "@playwright/test";
import { isoToJalali } from "../src/lib/jalali";

/** ابزارهای مشترک آزمون‌های سرتاسری: ثبت‌نام و ورود از راه خود رابط کاربری. */

export const PASSWORD = "Passw0rd-long!";
export const stamp = `${Date.now()}`;

export const PDF = Buffer.from("%PDF-1.4\n% PartMachine e2e document\n");
export const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64),
]);

export function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toLocaleDateString("en-CA");
}

/** تاریخ (ISO میلادی) را در انتخابگر شمسی روز/ماه/سالِ فیلدی با این عنوان انتخاب می‌کند. */
export async function pickJalaliDate(page: Page, label: string, iso: string): Promise<void> {
  const date = isoToJalali(iso);
  if (!date) throw new Error(`invalid date: ${iso}`);
  const group = page.getByRole("group", { name: label, exact: true });
  await group.getByLabel("سال", { exact: true }).selectOption(String(date.jy));
  await group.getByLabel("ماه", { exact: true }).selectOption(String(date.jm));
  await group.getByLabel("روز", { exact: true }).selectOption(String(date.jd));
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${stamp}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export async function acceptTerms(page: Page): Promise<void> {
  const boxes = page.getByRole("checkbox");
  await expect(boxes.first()).toBeVisible();
  for (const box of await boxes.all()) await box.check();
}

export async function register(
  browser: Browser,
  role: "buyer" | "supplier" | "qc",
  fullName: string,
  company?: string,
  email: string = uniqueEmail(role),
): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/register");
  await page.getByLabel("نقش شما").selectOption(role);
  await page.getByLabel("نام و نام خانوادگی").fill(fullName);
  if (company) {
    await page.getByLabel(role === "qc" ? "نام آزمایشگاه" : "نام شرکت / کارگاه").fill(company);
  }
  await page.getByLabel("ایمیل").fill(email);
  await page.getByLabel("رمز عبور").fill(PASSWORD);
  await acceptTerms(page);
  await page.getByRole("button", { name: "ایجاد حساب" }).click();
  await page.waitForURL("**/dashboard");
  return page;
}

export async function login(browser: Browser, email: string, password: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("ایمیل").fill(email);
  await page.getByLabel("رمز عبور").fill(password);
  await page.getByRole("button", { name: "ورود" }).click();
  await page.waitForURL("**/dashboard");
  return page;
}

export async function createRfq(page: Page, title: string): Promise<string> {
  await page.goto("/rfqs/new");
  await page.getByLabel("عنوان درخواست").fill(title);
  await page.getByLabel("شرح فنی").fill("بوش برنجی طبق نقشه، تلرانس ۰٫۰۵ میلی‌متر");
  await page.getByLabel("تعداد").fill("200");
  await pickJalaliDate(page, "مهلت تحویل", inDays(30));
  await acceptTerms(page);
  await page.getByRole("button", { name: "انتشار درخواست" }).click();
  await expect(page.getByText("درخواست شما ثبت شد")).toBeVisible();
  return page.url().split("?")[0];
}

export async function quote(page: Page, toman: string, days: string): Promise<void> {
  await page.getByLabel("قیمت کل (تومان)").fill(toman);
  await page.getByLabel("زمان تحویل (روز)").fill(days);
  await page.getByRole("button", { name: "ثبت پیشنهاد" }).click();
  await expect(page.getByText("پیشنهاد شما ثبت شد.")).toBeVisible();
}

/** کارفرما پیشنهاد قطعه‌ساز را برنده می‌کند و به صفحه‌ی سفارش ساخته‌شده می‌رود. */
export async function awardWinner(buyer: Page, rfqUrl: string, company: string): Promise<string> {
  await buyer.goto(rfqUrl);
  await buyer.getByRole("button", { name: `انتخاب ${company} به‌عنوان برنده` }).click();
  await buyer
    .getByRole("dialog", { name: "انتخاب برنده" })
    .getByRole("button", { name: "بله، برنده را انتخاب کن" })
    .click();
  await buyer.getByRole("link", { name: "مشاهده‌ی سفارش" }).click();
  await buyer.waitForURL("**/orders/**");
  return buyer.url();
}

/** مدیر سازمان نسخه‌ی فعلی قرارداد سفارش را با رمز عبورش امضا می‌کند. */
export async function signContract(page: Page, orderUrl: string): Promise<void> {
  await page.goto(`${orderUrl}/contract`);
  await page.getByRole("button", { name: "امضای قرارداد" }).click();
  const dialog = page.getByRole("dialog", { name: "امضای قرارداد" });
  await dialog.getByLabel("متن این نسخه را خوانده‌ام و از طرف سازمانم می‌پذیرم.").check();
  await dialog.getByLabel("رمز عبور حساب شما").fill(PASSWORD);
  await dialog.getByRole("button", { name: "امضا می‌کنم" }).click();
  await expect(dialog).toBeHidden();
}

/**
 * ادمین حساب مدیر آزمایشگاه را تأیید می‌کند ⇒ آزمایشگاه در فهرست انتخاب کارفرماها قرار می‌گیرد.
 * پیش از کلیک صبر می‌کند تا جستجو فقط همین کاربر را نشان دهد (آزمایشگاه‌های تأییدشده‌ی دیگر هم
 * همان پیام راهنما را دارند).
 */
export async function verifyLab(admin: Page, email: string, ownerName: string): Promise<void> {
  await admin.goto("/admin/users");
  await admin.getByLabel("جستجوی کاربر").fill(email);
  await expect(admin.getByText("۱ کاربر", { exact: true })).toBeVisible();
  await admin.getByRole("button", { name: `تأیید حساب ${ownerName}` }).click();
  await expect(
    admin.getByText("این آزمایشگاه در فهرست انتخاب کارفرماها برای بازرسی کیفیت است."),
  ).toBeVisible();
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** کد ۶ رقمی اپ Authenticator (TOTP، RFC 6238) برای کلیدی که صفحه نشان داده است */
export function totp(secret: string, stepsAhead = 0): string {
  const bits = secret
    .replace(/\s+/g, "")
    .toUpperCase()
    .split("")
    .map((ch) => BASE32.indexOf(ch).toString(2).padStart(5, "0"))
    .join("");
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + stepsAhead));
  const hmac = createHmac("sha1", key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
