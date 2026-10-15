import { expect, test, type Browser, type Page } from "@playwright/test";
import { PASSWORD, register, totp, uniqueEmail } from "./helpers";

/**
 * ورود دومرحله‌ای (فاز ۴، گام 4e): روشن کردن با QR و کد اپ، نمایش یک‌باره‌ی کدهای پشتیبان، و از آن به
 * بعد ورود فقط با کد اپ یا یک کد پشتیبان. برای حساب عادی اختیاری است؛ اجبار برای ادمین در تست‌های
 * بک‌اند آزموده می‌شود.
 */

async function signInUntilCode(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("ایمیل").fill(email);
  await page.getByLabel("رمز عبور").fill(PASSWORD);
  await page.getByRole("button", { name: "ورود" }).click();
  await expect(page.getByText("کد ۶ رقمی اپ Authenticator")).toBeVisible();
  return page;
}

test("after turning on two-factor sign-in, the app code or a recovery code is needed", async ({
  browser,
}) => {
  const email = uniqueEmail("buyer");
  const page = await register(browser, "buyer", "کارفرمای دومرحله‌ای", undefined, email);
  await page.goto("/account");
  await page.getByRole("button", { name: "روشن کردن ورود دومرحله‌ای" }).click();
  await expect(page.getByRole("img", { name: "QR ورود دومرحله‌ای" })).toBeVisible();
  const secret = (await page.getByTestId("two-factor-secret").textContent()) ?? "";
  await page.getByLabel("کد ۶ رقمی اپ").fill(totp(secret));
  await page.getByLabel("رمز عبور حساب").fill(PASSWORD);
  await page.getByRole("button", { name: "تأیید و روشن کردن" }).click();

  const codes = page.getByTestId("recovery-code");
  await expect(codes).toHaveCount(10);
  const recovery = ((await codes.first().textContent()) ?? "").trim();
  await page.getByRole("button", { name: "ذخیره کردم" }).click();
  await expect(page.getByText("ورود دومرحله‌ای روشن است.")).toBeVisible();

  // ورود تازه: پس از رمز، کد اپ (هر کد یک بار پذیرفته می‌شود، پس کد گام بعد)
  const second = await signInUntilCode(browser, email);
  await second.getByLabel("کد ورود").fill(totp(secret, 1));
  await second.getByRole("button", { name: "تأیید و ورود" }).click();
  await second.waitForURL("**/dashboard");

  // بدون گوشی: یک کد پشتیبان
  const third = await signInUntilCode(browser, email);
  await third.getByRole("button", { name: "به گوشی دسترسی ندارم" }).click();
  await third.getByLabel("کد پشتیبان").fill(recovery);
  await third.getByRole("button", { name: "تأیید و ورود" }).click();
  await third.waitForURL("**/dashboard");

  // کد پشتیبان مصرف‌شده دیگر کار نمی‌کند
  const fourth = await signInUntilCode(browser, email);
  await fourth.getByRole("button", { name: "به گوشی دسترسی ندارم" }).click();
  await fourth.getByLabel("کد پشتیبان").fill(recovery);
  await fourth.getByRole("button", { name: "تأیید و ورود" }).click();
  await expect(fourth.getByText("کد درست نیست")).toBeVisible();
});
