"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AwardState {
  /** شناسه‌ی استعلام برنده به تفکیک RFQ */
  awardedQuotationId: Record<string, string>;
  award: (rfqId: string, quotationId: string) => void;
}

/**
 * انتخاب برنده در حالت دمو (localStorage).
 * در نسخه‌ی نهایی، انتخاب برنده سفارش را ایجاد و قرارداد را تولید می‌کند.
 */
export const useAwardStore = create<AwardState>()(
  persist(
    (set) => ({
      awardedQuotationId: {},
      award: (rfqId, quotationId) =>
        set((state) => ({
          awardedQuotationId: {
            ...state.awardedQuotationId,
            [rfqId]: quotationId,
          },
        })),
    }),
    { name: "partmachine-demo-awards" },
  ),
);
