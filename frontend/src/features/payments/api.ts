"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { Payments, ReportPaymentInput } from "./types";

export function getPayments(orderId: string): Promise<Payments> {
  return apiFetch<Payments>(`/orders/${orderId}/payments`);
}

export function reportPayment(
  orderId: string,
  paymentId: string,
  input: ReportPaymentInput,
): Promise<Payments> {
  return apiFetch<Payments>(`/orders/${orderId}/payments/${paymentId}/report`, {
    method: "POST",
    body: input,
  });
}

export function confirmPayment(orderId: string, paymentId: string): Promise<Payments> {
  return apiFetch<Payments>(`/orders/${orderId}/payments/${paymentId}/confirm`, {
    method: "POST",
  });
}

export function rejectPayment(orderId: string, paymentId: string, reason: string): Promise<Payments> {
  return apiFetch<Payments>(`/orders/${orderId}/payments/${paymentId}/reject`, {
    method: "POST",
    body: { reason },
  });
}

export function usePayments(orderId: string, enabled = true) {
  return useQuery({
    queryKey: ["payments", orderId],
    queryFn: () => getPayments(orderId),
    enabled: Boolean(orderId) && enabled,
  });
}

/** هر اقدام پرداخت؛ اقساط تازه جایگزین می‌شوند و سفارش (وضعیت و تاریخچه) دوباره خوانده می‌شود */
export function usePaymentAction(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (run: () => Promise<Payments>) => run(),
    onSuccess: (payments) => {
      queryClient.setQueryData(["payments", orderId], payments);
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      // تأیید پیش‌پرداخت تولید را شروع می‌کند و «اعلام آمادگی برای بازرسی» را باز می‌کند
      void queryClient.invalidateQueries({ queryKey: ["inspection", orderId] });
    },
  });
}
