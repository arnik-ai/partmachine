import { expect, test, type Page } from "@playwright/test";
import {
  PASSWORD,
  awardWinner,
  createRfq,
  quote,
  register,
  stamp,
  uniqueEmail,
} from "./helpers";

/**
 * نمایش درست روی همه‌ی دستگاه‌ها (فاز ۴، گام 4a): صفحه‌های اصلی روی اندروید، آیفون (WebKit)،
 * آیپد و دسکتاپ نباید اسکرول افقی داشته باشند. داده با حساب‌های تازه ساخته می‌شود و هر صفحه با
 * همان دستگاهِ پروژه‌ی Playwright بررسی می‌شود. اگر صفحه‌ای از قاب بیرون بزند، عنصرهای مقصر
 * گزارش می‌شوند.
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";

async function expectFits(page: Page, label: string): Promise<void> {
  // فونت و داده باید رسیده باشند تا اندازه‌ها نهایی باشند
  await page.waitForLoadState("networkidle");
  const result = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const scroll = document.documentElement.scrollWidth;
    const offenders: string[] = [];
    if (scroll > width + 1) {
      for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
        const box = el.getBoundingClientRect();
        if (box.width === 0) continue;
        if (box.right > width + 1 || box.left < -1) {
          const cls = typeof el.className === "string" ? el.className.slice(0, 70) : "";
          const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
          offenders.push(
            `${el.tagName.toLowerCase()}.${cls} [${Math.round(box.left)}..${Math.round(box.right)}] «${text}»`,
          );
        }
      }
    }
    return { width, scroll, offenders: offenders.slice(-6) };
  });
  expect
    .soft(result.scroll, `${label}: صفحه ${result.scroll}px است ولی قاب ${result.width}px\n${result.offenders.join("\n")}`)
    .toBeLessThanOrEqual(result.width + 1);
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("ایمیل").fill(email);
  await page.getByLabel("رمز عبور").fill(password);
  await page.getByRole("button", { name: "ورود" }).click();
  await page.waitForURL("**/dashboard");
}

async function signOut(page: Page): Promise<void> {
  await page.getByRole("button", { name: "خروج" }).click();
  await page.waitForURL((url) => url.pathname.endsWith("/") || url.pathname === "");
}

test("key pages fit the screen on this device", async ({ page, browser }, testInfo) => {
  test.setTimeout(300_000);
  const device = testInfo.project.name;

  // داده: یک درخواست با پیشنهاد و سفارش، ساخته‌شده در دسکتاپ
  const title = `نمایش ${device} ${stamp}`;
  const company = `کارگاه نمایش ${device} ${stamp}`;
  const buyerEmail = uniqueEmail("buyer");
  const supplierEmail = uniqueEmail("supplier");
  const buyer = await register(browser, "buyer", "کارفرمای نمایش", undefined, buyerEmail);
  const rfqUrl = new URL(await createRfq(buyer, title)).pathname;
  const supplier = await register(browser, "supplier", "قطعه‌ساز نمایش", company, supplierEmail);
  await supplier.goto(rfqUrl);
  await quote(supplier, "45000000", "9");
  const orderPath = new URL(await awardWinner(buyer, rfqUrl, company)).pathname;
  await buyer.context().close();
  await supplier.context().close();

  for (const path of ["/", "/login", "/register", "/suppliers"]) {
    await page.goto(path);
    await expectFits(page, `${device} ${path}`);
  }

  await signIn(page, buyerEmail, PASSWORD);
  for (const path of [
    "/dashboard",
    "/rfqs",
    "/rfqs/new",
    rfqUrl,
    "/orders",
    orderPath,
    `${orderPath}/contract`,
    "/notifications",
    "/organization",
    "/account",
  ]) {
    await page.goto(path);
    await expectFits(page, `${device} کارفرما ${path}`);
  }
  await signOut(page);

  await signIn(page, supplierEmail, PASSWORD);
  for (const path of ["/rfqs/open", "/quotations", "/profile", orderPath]) {
    await page.goto(path);
    await expectFits(page, `${device} قطعه‌ساز ${path}`);
  }
  await signOut(page);

  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    for (const path of ["/admin", "/admin/users", "/admin/disputes", "/admin/audit"]) {
      await page.goto(path);
      await expectFits(page, `${device} ادمین ${path}`);
    }
  }
});
