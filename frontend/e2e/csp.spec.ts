import { expect, test, type Page } from "@playwright/test";
import { register, uniqueEmail } from "./helpers";

/**
 * Content-Security-Policy (فاز ۴، گام 4e): هر صفحه CSP با nonce تازه دارد، همه‌ی اسکریپت‌های Next همان
 * nonce را دارند، صفحه‌ها هیچ خطای CSP نمی‌دهند و کدی که در HTML تزریق شود اجرا نمی‌شود.
 */

declare global {
  interface Window {
    __cspViolations?: string[];
    __injected?: boolean;
  }
}

async function watchViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.__cspViolations?.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
}

async function violations(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__cspViolations ?? []);
}

function nonceOf(csp: string): string {
  const match = csp.match(/'nonce-([^']+)'/);
  expect(match, csp).not.toBeNull();
  return match![1];
}

test("every page has a fresh nonce and no CSP errors", async ({ page }) => {
  await watchViolations(page);
  const seen = new Set<string>();
  for (const path of ["/", "/login", "/register"]) {
    const response = await page.goto(path);
    const csp = response!.headers()["content-security-policy"] ?? "";
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    seen.add(nonceOf(csp));
    await page.waitForLoadState("networkidle");

    // هر تگ script در HTML سرور همان nonce را دارد
    const html = await (await page.request.get(path)).text();
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag, tag).toMatch(/\snonce="[^"]+"/);
  }
  expect(seen.size).toBe(3);
  expect(await violations(page)).toEqual([]);
});

test("signed-in pages work under the policy and injected handlers do not run", async ({
  browser,
}) => {
  const page = await register(browser, "buyer", "کارفرمای CSP", undefined, uniqueEmail("buyer"));
  await watchViolations(page);
  for (const path of ["/dashboard", "/rfqs/new", "/notifications", "/account"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  expect(await violations(page)).toEqual([]);

  // نمونه‌ی رایج XSS: ویژگی onclick که مهاجم در HTML جا داده است
  await page.evaluate(() => {
    const button = document.createElement("button");
    button.id = "injected";
    button.textContent = "x";
    button.setAttribute("onclick", "window.__injected = true");
    document.body.appendChild(button);
  });
  await page.locator("#injected").click();
  expect(await page.evaluate(() => window.__injected === true)).toBe(false);
  await expect.poll(async () => (await violations(page)).length).toBeGreaterThan(0);
});
