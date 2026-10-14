import { describe, expect, it } from "vitest";
import { daysUntil, plusDays } from "./dates";
import { normalizeDigits, parseToman, rialsToToman, tomanToRials } from "./money";

describe("toman input", () => {
  it.each([
    ["185000000", 185_000_000],
    ["۱۸۵٬۰۰۰٬۰۰۰", 185_000_000],
    ["١٢٣ ٤٥٦", 123_456],
    ["1,250,000", 1_250_000],
  ])("parses %s", (input, expected) => {
    expect(parseToman(input)).toBe(expected);
  });

  it.each(["", "12a", "-5", "1.5", "۱۲تومان"])("rejects %s", (input) => {
    expect(parseToman(input)).toBeNull();
  });

  it("converts between toman and rials", () => {
    expect(tomanToRials(185_000_000)).toBe(1_850_000_000);
    expect(rialsToToman(1_850_000_005)).toBe(185_000_000);
    expect(normalizeDigits("۰۹ ٣")).toBe("093");
  });
});

describe("dates", () => {
  it("counts days between plain dates", () => {
    expect(daysUntil("2026-10-20", "2026-10-14")).toBe(6);
    expect(daysUntil("2026-10-14", "2026-10-14")).toBe(0);
    expect(daysUntil("2026-10-10", "2026-10-14")).toBe(-4);
  });

  it("adds days across month boundaries", () => {
    expect(plusDays(7, "2026-10-14")).toBe("2026-10-21");
    expect(plusDays(3, "2026-10-30")).toBe("2026-11-02");
  });
});
