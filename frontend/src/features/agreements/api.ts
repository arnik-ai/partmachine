"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch, withDemoFallback } from "@/lib/api-client";
import {
  AGENT_TERMS,
  BUYER_ORDER_TERMS,
  BUYER_SIGNUP_TERMS,
  QC_TERMS,
  SUPPLIER_TERMS,
  type Term,
} from "./terms";
import type { AcceptedAgreement, Agreement } from "./types";

/** فقط نسخه‌ی نمایشی (بدون سرور): همان متن‌های محلی */
const DEMO_AGREEMENTS: Record<string, { title: string; items: Term[] }> = {
  buyer_signup: { title: "قوانین پلتفرم", items: BUYER_SIGNUP_TERMS },
  supplier_signup: { title: "تعهدات قطعه‌ساز (شامل عدم افشا)", items: SUPPLIER_TERMS },
  agent_signup: { title: "تعهدات مأمور خرید", items: AGENT_TERMS },
  qc_signup: { title: "تعهدات آزمایشگاه کنترل کیفیت", items: QC_TERMS },
  buyer_order: { title: "قوانین و تعهدات کارفرما", items: BUYER_ORDER_TERMS },
  rfq_nda: {
    title: "تعهد عدم افشای اطلاعات این درخواست",
    items: SUPPLIER_TERMS.filter((t) => t.id === "supplier-nda"),
  },
};

export function signupAgreementKey(role: string): string {
  return `${role}_signup`;
}

export async function getAgreement(key: string): Promise<Agreement> {
  return withDemoFallback(
    () => apiFetch<Agreement>(`/agreements/${key}`, { auth: false }),
    () => ({ key, version: "demo", ...DEMO_AGREEMENTS[key] }),
  );
}

export function useAgreement(key: string) {
  return useQuery({
    queryKey: ["agreements", key],
    queryFn: () => getAgreement(key),
    staleTime: 10 * 60 * 1000,
  });
}

export function acceptanceOf(agreement: Agreement | undefined): AcceptedAgreement[] {
  return agreement ? [{ key: agreement.key, version: agreement.version }] : [];
}
