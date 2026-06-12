"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ContractSignature {
  /** ISO datetime امضای کارفرما */
  buyerSignedAt?: string;
  /** ISO datetime امضای مجری */
  supplierSignedAt?: string;
}

interface SignatureState {
  /** وضعیت امضای هر قرارداد به تفکیک شناسه‌ی سفارش */
  signatures: Record<string, ContractSignature>;
  sign: (orderId: string, party: "buyer" | "supplier") => void;
}

/**
 * امضای قرارداد در حالت دمو (localStorage).
 * در نسخه‌ی نهایی، هر طرف از حساب خودش امضا می‌کند و رویداد
 * با هویت، تاریخ و نسخه‌ی متن قرارداد در audit log بک‌اند ثبت می‌شود.
 */
export const useSignatureStore = create<SignatureState>()(
  persist(
    (set) => ({
      signatures: {},
      sign: (orderId, party) =>
        set((state) => ({
          signatures: {
            ...state.signatures,
            [orderId]: {
              ...state.signatures[orderId],
              [party === "buyer" ? "buyerSignedAt" : "supplierSignedAt"]:
                new Date().toISOString(),
            },
          },
        })),
    }),
    { name: "partmachine-demo-signatures" },
  ),
);
