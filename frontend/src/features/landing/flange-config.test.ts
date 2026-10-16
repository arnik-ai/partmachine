import { describe, expect, it } from "vitest";
import { MATERIALS } from "@/lib/constants";
import { CONFIG_MATERIALS, flangeEstimate, flangeWeightKg, rfqPrefill } from "./flange-config";

const steel = CONFIG_MATERIALS[0];
const aluminum = CONFIG_MATERIALS.find((m) => m.key === "al6061")!;

describe("flange configurator", () => {
  it("weighs a 240 mm steel flange with six holes at about 8 kg", () => {
    expect(flangeWeightKg({ diameter: 240, holes: 6, material: steel })).toBeCloseTo(8.1, 0);
  });

  it("scales weight with density and drops it with more holes", () => {
    const st = flangeWeightKg({ diameter: 240, holes: 6, material: steel });
    const al = flangeWeightKg({ diameter: 240, holes: 6, material: aluminum });
    expect(al / st).toBeCloseTo(2.7 / 7.85, 5);
    expect(flangeWeightKg({ diameter: 240, holes: 12, material: steel })).toBeLessThan(st);
  });

  it("estimates a positive range with the platform formula", () => {
    const e = flangeEstimate({ diameter: 240, holes: 6, material: steel, quantity: 50 });
    expect(e.lowToman).toBeGreaterThan(0);
    expect(e.highToman).toBeGreaterThan(e.lowToman);
  });

  it("only offers materials the RFQ form knows", () => {
    for (const m of CONFIG_MATERIALS) expect(MATERIALS).toContain(m.fa);
  });

  it("prefills the RFQ form", () => {
    const q = new URLSearchParams(rfqPrefill({ diameter: 200, holes: 8, material: steel, quantity: 10 }));
    expect(q.get("material")).toBe("فولاد St37");
    expect(q.get("quantity")).toBe("10");
    expect(q.get("title")).toContain("Ø200");
  });
});
