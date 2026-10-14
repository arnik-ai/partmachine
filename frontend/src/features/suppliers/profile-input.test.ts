import { describe, expect, it } from "vitest";
import { initialState, mapRowErrors, newKey, toInput, type FormState } from "./profile-input";
import type { MySupplier } from "./types";

const SUPPLIER: MySupplier = {
  id: "s1",
  companyName: "تراشکاری نمونه",
  description: "",
  city: "تهران",
  address: null,
  phone: null,
  website: null,
  foundedYear: 1385,
  employeeCount: null,
  capabilities: ["cnc"],
  machines: [{ name: "تراش CNC", model: "Doosan", count: 2 }],
  certifications: [],
  productionCapacityPerMonth: null,
  leadTimeDays: 14,
  completedJobs: 0,
  onTimeDeliveryRate: 0.9,
  responseTimeHours: 6,
  verified: false,
  score: { trust: 80, risk: 20, reliability: 80, quality: 80, components: [] },
  listed: true,
  canEdit: true,
};

function form(overrides: Partial<FormState> = {}): FormState {
  return { ...initialState(SUPPLIER), ...overrides };
}

describe("supplier profile form", () => {
  it("round-trips the saved profile", () => {
    const { input, errors } = toInput(form());
    expect(errors).toEqual({});
    expect(input).toMatchObject({
      companyName: "تراشکاری نمونه",
      foundedYear: 1385,
      employeeCount: null,
      leadTimeDays: 14,
      machines: [{ name: "تراش CNC", model: "Doosan", count: 2 }],
    });
  });

  it("accepts Persian digits and reports non-numbers per field", () => {
    const { input, errors } = toInput(form({ employeeCount: "۲۵", foundedYear: "سال ۸۵" }));
    expect(input.employeeCount).toBe(25);
    expect(errors).toEqual({ foundedYear: "فقط عدد وارد کنید." });
  });

  it("requires the essentials before calling the server", () => {
    const { errors } = toInput(form({ companyName: " ", city: "", capabilities: [], leadTimeDays: "" }));
    expect(Object.keys(errors).sort()).toEqual(["capabilities", "city", "companyName", "leadTimeDays"]);
  });

  it("drops empty rows and maps server row errors back to the right row", () => {
    const empty = { key: newKey(), name: " ", model: "", count: "1" };
    const real = { key: newKey(), name: "فرز", model: "", count: "" };
    const result = toInput(form({ machines: [empty, real] }));
    expect(result.input.machines).toEqual([{ name: "فرز", model: "", count: 1 }]);
    const wrongCount = toInput(form({ machines: [{ ...real, count: "دو" }] }));
    expect(wrongCount.errors).toEqual({ [`${real.key}.count`]: "فقط عدد وارد کنید." });

    const mapped = mapRowErrors(
      { "machines.0.name": "نام کوتاه است", phone: "شماره معتبر نیست" },
      result.machineKeys,
      result.certificationKeys,
    );
    expect(mapped).toEqual({ [`${real.key}.name`]: "نام کوتاه است", phone: "شماره معتبر نیست" });
  });
});
