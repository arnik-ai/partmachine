import { beforeEach, describe, expect, it } from "vitest";
import { canGoBack, parentPath, recordVisit, resetVisits } from "./back";

describe("back button", () => {
  beforeEach(() => resetVisits());

  it("goes one level up when the page was opened directly", () => {
    expect(parentPath("/orders/abc/contract")).toBe("/orders/abc");
    expect(parentPath("/suppliers/abc")).toBe("/suppliers");
    expect(parentPath("/orders")).toBe("/dashboard");
    expect(parentPath("/rfqs/new")).toBe("/rfqs");
    expect(parentPath("/rfqs/open")).toBe("/dashboard");
    expect(parentPath("/dashboard")).toBe("/");
  });

  it("uses the history only after moving inside the site", () => {
    recordVisit("/dashboard");
    expect(canGoBack()).toBe(false);
    recordVisit("/orders");
    expect(canGoBack()).toBe(true);
    // برگشت به داشبورد: دیگر صفحه‌ی قبلی‌ای در سایت نیست
    recordVisit("/dashboard");
    expect(canGoBack()).toBe(false);
  });
});
