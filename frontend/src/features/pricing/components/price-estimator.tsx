"use client";

import { useMemo } from "react";
import { Calculator, Sparkles } from "lucide-react";
import { faToman, faNumber } from "@/lib/utils";
import type { CapabilityValue } from "@/lib/constants";
import { COMPLEXITY_LEVELS, type ComplexityValue } from "../data";
import { estimatePrice } from "../engine";
import { Select } from "@/components/ui/select";

/**
 * برآورد قیمت زنده — کنار فرم RFQ.
 * با تغییر خدمت/متریال/تعداد/پیچیدگی، بازه‌ی منطقی را به‌روز می‌کند.
 */
export function PriceEstimator({
  capability,
  material,
  quantity,
  complexity,
  onComplexityChange,
}: {
  capability: CapabilityValue;
  material: string;
  quantity: number;
  complexity: ComplexityValue;
  onComplexityChange: (value: ComplexityValue) => void;
}) {
  const estimate = useMemo(
    () =>
      quantity > 0
        ? estimatePrice({ capability, material, quantity, complexity })
        : null,
    [capability, material, quantity, complexity],
  );

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-gold/40 bg-gold-soft/30 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-gold" />
        <h4 className="text-sm font-bold">برآورد قیمت هوشمند</h4>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-muted-foreground">
          پیچیدگی قطعه (روی زمان کار اثر دارد)
        </label>
        <Select
          value={complexity}
          onChange={(e) =>
            onComplexityChange(e.target.value as ComplexityValue)
          }
        >
          {COMPLEXITY_LEVELS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </div>

      {estimate ? (
        <>
          <div className="rounded-lg bg-card p-3 text-center">
            <div className="text-xs text-muted-foreground">
              بازه‌ی قیمت منطقی کل سفارش
            </div>
            <div className="mt-1 text-lg font-bold text-foreground">
              {faToman(estimate.rangeLowRials)} تا{" "}
              {faToman(estimate.rangeHighRials)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              هر قطعه حدوداً {faToman(estimate.unitPriceRials)} ·{" "}
              {faNumber(estimate.totalHours)} ساعت کار
            </div>
          </div>

          {/* تفکیک اجزا */}
          <div className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Calculator className="h-3.5 w-3.5" />
              تفکیک هزینه (مبنای محاسبه)
            </span>
            {estimate.components.map((c) => (
              <div
                key={c.key}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span>
                  {c.label}
                  <span className="text-muted-foreground"> — {c.detail}</span>
                </span>
                <span className="shrink-0 font-medium">
                  {faToman(c.amountRials)}
                </span>
              </div>
            ))}
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            این برآورد بر اساس روش استاندارد محاسبه‌ی هزینه (مواد + نرخ ساعتی
            ماشین × زمان + سربار + سود) محاسبه شده و راهنماست؛ قیمت نهایی در
            استعلام قطعه‌سازان مشخص می‌شود.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          تعداد را وارد کنید تا برآورد محاسبه شود.
        </p>
      )}
    </div>
  );
}
