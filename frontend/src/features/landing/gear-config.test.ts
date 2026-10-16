import { describe, expect, it } from "vitest";
import { MATERIALS } from "@/lib/constants";
import { CONFIG_MATERIALS, gearGeometry, gearWeightKg, rfqPrefill } from "./gear-config";

const steel = CONFIG_MATERIALS[0];
const pom = CONFIG_MATERIALS.find((m) => m.key === "pom")!;

describe("gear configurator", () => {
  it("builds seven outline points per tooth inside the tip circle", () => {
    const g = gearGeometry(120, 24);
    expect(g.outline).toHaveLength(24 * 7);
    for (const [x, y] of g.outline) expect(Math.hypot(x, y)).toBeLessThanOrEqual(g.ra + 1e-9);
    expect(g.m).toBeCloseTo(120 / 26, 6);
    expect(g.lightening).toHaveLength(6);
  });

  it("weighs a 120 mm, 24-tooth steel gear at about 2 kg", () => {
    const kg = gearWeightKg({ diameter: 120, teeth: 24, material: steel });
    expect(kg).toBeGreaterThan(1.5);
    expect(kg).toBeLessThan(3);
  });

  it("scales weight with density", () => {
    const st = gearWeightKg({ diameter: 120, teeth: 24, material: steel });
    expect(gearWeightKg({ diameter: 120, teeth: 24, material: pom }) / st).toBeCloseTo(1.41 / 7.85, 5);
  });

  it("only offers materials the RFQ form knows", () => {
    for (const m of CONFIG_MATERIALS) expect(MATERIALS).toContain(m.fa);
  });

  it("prefills the RFQ form", () => {
    const q = new URLSearchParams(rfqPrefill({ diameter: 100, teeth: 18, material: steel, quantity: 10 }));
    expect(q.get("title")).toContain("18 دندانه");
    expect(q.get("material")).toBe("فولاد St37");
    expect(q.get("quantity")).toBe("10");
  });
});
