import { expect, test } from "@playwright/test";
import { register, uniqueEmail } from "./helpers";

/**
 * PWA (فاز ۴، گام 4a): manifest و آیکون‌ها، ثبت service worker، صفحه‌ی آفلاین، و مهم‌تر از همه:
 * هیچ صفحه، پاسخ API یا فایل خصوصی روی دستگاه کش نمی‌شود.
 */

test("the app is installable and works offline without caching private data", async ({
  browser,
}) => {
  const page = await register(browser, "buyer", "کارفرمای PWA", undefined, uniqueEmail("buyer"));

  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  const body = await manifest.json();
  expect(body.short_name).toBe("پارت‌ماشین");
  expect(body.display).toBe("standalone");
  expect(body.dir).toBe("rtl");
  for (const icon of body.icons as Array<{ src: string }>) {
    expect((await page.request.get(`/${icon.src}`)).ok(), icon.src).toBe(true);
  }
  expect((await page.request.get("/apple-icon.png")).ok()).toBe(true);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);

  // service worker ثبت و فعال می‌شود و صفحه را کنترل می‌کند
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(new URL(scope).pathname).toBe("/");
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  // چند صفحه‌ی خصوصی دیده می‌شود؛ بعد محتوای کش بررسی می‌شود
  for (const path of ["/dashboard", "/orders", "/notifications", "/account"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) urls.push(new URL(request.url).pathname);
    }
    return urls;
  });
  expect(cached.length).toBeGreaterThan(0);
  const allowed = (path: string) =>
    path.startsWith("/_next/static/") || path === "/offline.html" || path.startsWith("/icons/");
  expect(cached.filter((path) => !allowed(path))).toEqual([]);

  // بدون اینترنت: صفحه‌ی «اتصال برقرار نیست» به‌جای خطای مرورگر
  await page.context().setOffline(true);
  await page.goto("/orders").catch(() => undefined);
  await expect(page.getByRole("heading", { name: "اتصال اینترنت برقرار نیست" })).toBeVisible();
  await page.context().setOffline(false);
  await page.getByRole("button", { name: "تلاش دوباره" }).click();
  await expect(page.getByRole("heading", { name: "اتصال اینترنت برقرار نیست" })).toHaveCount(0);
});
