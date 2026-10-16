import { describe, expect, it } from "vitest";
import { initialOf, toneOf } from "./avatar";

describe("company avatar fallback", () => {
  it("uses the first letter of the name", () => {
    expect(initialOf("  صنایع دقیق‌تراش آریا")).toBe("ص");
    expect(initialOf("آبکاری کروم")).toBe("آ");
    expect(initialOf("")).toBe("؟");
  });

  it("keeps one colour per company", () => {
    const tone = toneOf("ریخته‌گری مدرن مشهد", 5);
    expect(tone).toBe(toneOf("ریخته‌گری مدرن مشهد", 5));
    expect(tone).toBeGreaterThanOrEqual(0);
    expect(tone).toBeLessThan(5);
  });
});
