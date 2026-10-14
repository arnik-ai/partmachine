import { expect, test } from "@playwright/test";
import { PASSWORD, login, register, uniqueEmail } from "./helpers";

/** حساب کاربری (گام 2f): تغییر رمز با خروج دستگاه‌های دیگر، و شروع بازیابی رمز. */

const NEW_PASSWORD = "Another-long-passw0rd";

test("changing the password signs out other devices but keeps this one", async ({ browser }) => {
  const email = uniqueEmail("account");
  const laptop = await register(browser, "buyer", "کاربر تغییر رمز", undefined, email);
  const phone = await login(browser, email, PASSWORD);

  await laptop.getByRole("link", { name: "حساب کاربری" }).click();
  await laptop.waitForURL("**/account");
  await laptop.getByLabel("رمز فعلی").fill(PASSWORD);
  await laptop.getByLabel("رمز جدید", { exact: true }).fill(NEW_PASSWORD);
  await laptop.getByLabel("تکرار رمز جدید").fill(NEW_PASSWORD);
  await laptop.getByRole("button", { name: "تغییر رمز" }).click();
  await expect(laptop.getByText("رمز عوض شد و دستگاه‌های دیگر از حساب خارج شدند.")).toBeVisible();

  // دستگاه دیگر بیرون رفته است؛ همین مرورگر پس از reload هم وارد می‌ماند
  await phone.goto("/rfqs");
  await phone.waitForURL(/\/login/);
  await laptop.goto("/rfqs");
  await laptop.reload();
  await expect(laptop.getByRole("heading", { name: "درخواست‌های استعلام قیمت من" })).toBeVisible();

  await login(browser, email, NEW_PASSWORD);
});

test("forgot password starts from the login page and asks for the emailed code", async ({
  browser,
}) => {
  const email = uniqueEmail("forgot");
  await register(browser, "buyer", "کاربر فراموشکار", undefined, email);

  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByRole("link", { name: "رمز را فراموش کرده‌اید؟" }).click();
  await page.waitForURL("**/forgot-password");
  await page.getByLabel("ایمیل").fill(email);
  await page.getByRole("button", { name: "ارسال کد بازیابی" }).click();
  await expect(
    page.getByText("اگر حسابی با این ایمیل وجود داشته باشد، کد بازیابی برایش فرستاده شد."),
  ).toBeVisible();
  await expect(page.getByLabel("کد بازیابی")).toBeVisible();

  // کد اشتباه با پیام روشن زیر همان فیلد رد می‌شود
  await page.getByLabel("کد بازیابی").fill("000000");
  await page.getByLabel("رمز جدید").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "ذخیره‌ی رمز تازه و ورود" }).click();
  await expect(page.getByText(/کد واردشده درست نیست|کد منقضی شده/)).toBeVisible();
});
