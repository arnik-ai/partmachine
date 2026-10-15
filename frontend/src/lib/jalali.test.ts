import { describe, expect, it } from "vitest";
import {
  formatJalali,
  isLeapJalaliYear,
  isoToJalali,
  jalaliMonthLength,
  jalaliToIso,
} from "./jalali";
import { faDate, faDateTime } from "./utils";

describe("jalali calendar", () => {
  it.each([
    ["2024-03-20", { jy: 1403, jm: 1, jd: 1 }],
    ["2025-03-20", { jy: 1403, jm: 12, jd: 30 }],
    ["2025-03-21", { jy: 1404, jm: 1, jd: 1 }],
    ["2026-03-21", { jy: 1405, jm: 1, jd: 1 }],
    ["2026-10-15", { jy: 1405, jm: 7, jd: 23 }],
  ])("converts %s", (iso, expected) => {
    expect(isoToJalali(iso)).toEqual(expected);
    expect(jalaliToIso(expected)).toBe(iso);
  });

  it("knows leap years and month lengths", () => {
    expect([1399, 1403, 1408].map(isLeapJalaliYear)).toEqual([true, true, true]);
    expect([1400, 1404, 1405].map(isLeapJalaliYear)).toEqual([false, false, false]);
    expect(jalaliMonthLength(1405, 6)).toBe(31);
    expect(jalaliMonthLength(1405, 7)).toBe(30);
    expect(jalaliMonthLength(1403, 12)).toBe(30);
    expect(jalaliMonthLength(1404, 12)).toBe(29);
  });

  it.each(["", "2026-1-5", "2026-02-30", "2026-13-01", "2026-10-15T10:00:00Z"])(
    "rejects %s",
    (iso) => {
      expect(isoToJalali(iso)).toBeNull();
    },
  );

  it("matches the browser's Persian calendar for every day of 2020-2030", () => {
    const persian = new Intl.DateTimeFormat("en-u-ca-persian-nu-latn", {
      timeZone: "UTC",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
    for (let t = Date.UTC(2020, 0, 1); t <= Date.UTC(2030, 11, 31); t += 86_400_000) {
      const iso = new Date(t).toISOString().slice(0, 10);
      const parts = Object.fromEntries(
        persian.formatToParts(new Date(t)).map((part) => [part.type, part.value]),
      );
      const expected = { jy: Number(parts.year), jm: Number(parts.month), jd: Number(parts.day) };
      const date = isoToJalali(iso);
      expect(date, iso).toEqual(expected);
      expect(jalaliToIso(expected), iso).toBe(iso);
    }
  });

  it("formats in Persian", () => {
    expect(formatJalali("2026-10-15")).toBe("۲۳ مهر ۱۴۰۵");
    expect(formatJalali("2026-10-15", { weekday: true })).toBe("پنجشنبه ۲۳ مهر ۱۴۰۵");
    expect(formatJalali("bad")).toBe("bad");
  });
});

describe("faDate", () => {
  it("shows a plain date as the same calendar day everywhere", () => {
    expect(faDate("2026-10-15")).toBe("۲۳ مهر ۱۴۰۵");
  });

  it("shows instants in Tehran time", () => {
    // ۲۱:۰۰ UTC = ۰۰:۳۰ بامداد روز بعد در تهران
    expect(faDate("2026-10-15T21:00:00Z")).toBe("۲۴ مهر ۱۴۰۵");
    const text = faDateTime("2026-10-15T21:00:00Z");
    expect(text).toContain("۲۴ مهر ۱۴۰۵");
    expect(text).toContain("۰۰:۳۰");
  });
});
