import { describe, expect, it } from "vitest";
import { SCORE_WEIGHTS, bestValues, rankQuotations } from "./ranking";
import type { Quotation } from "./types";

function quote(id: string, price: number, lead: number, score: number): Quotation {
  return {
    id,
    rfqId: "r1",
    supplierId: `s-${id}`,
    supplierName: id,
    supplierCity: "تهران",
    supplierScore: score,
    verified: false,
    totalPriceRials: price,
    leadTimeDays: lead,
    validUntil: "2026-12-01",
    submittedAt: "2026-10-14T10:00:00Z",
  };
}

describe("composite score", () => {
  it("weights sum to 100%", () => {
    const total = SCORE_WEIGHTS.price + SCORE_WEIGHTS.leadTime + SCORE_WEIGHTS.trust;
    expect(total).toBeCloseTo(1);
  });

  it("gives 100 to a quote that is best on every criterion", () => {
    const ranked = rankQuotations([quote("a", 100, 10, 90), quote("b", 200, 20, 45)]);
    expect(ranked[0]).toMatchObject({ composite: 100 });
    expect(ranked[0].quote.id).toBe("a");
    // b: ۵۰٪ قیمت ⇒ ۲۰، ۵۰٪ زمان ⇒ ۱۲٫۵، ۵۰٪ اعتماد ⇒ ۱۷٫۵
    expect(ranked[1].composite).toBe(50);
  });

  it("does not produce NaN when every trust score is zero", () => {
    const ranked = rankQuotations([quote("a", 100, 10, 0), quote("b", 120, 8, 0)]);
    expect(ranked.every((r) => Number.isFinite(r.composite))).toBe(true);
  });

  it("finds the best value of each column", () => {
    expect(bestValues([quote("a", 300, 5, 70), quote("b", 100, 9, 80)])).toEqual({
      price: 100,
      leadTime: 5,
      score: 80,
    });
  });
});
