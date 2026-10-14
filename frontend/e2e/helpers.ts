import { expect, type Browser, type Page } from "@playwright/test";

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
  role: "buyer" | "supplier",
  fullName: string,
  company?: string,
  email: string = uniqueEmail(role),
): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/register");
  await page.getByLabel("نقش شما").selectOption(role);
  await page.getByLabel("نام و نام خانوادگی").fill(fullName);
  if (company) await page.getByLabel("نام شرکت / کارگاه").fill(company);
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
  await page.getByLabel("مهلت تحویل").fill(inDays(30));
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
