"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { OrderDetail, OrderPage, OrderStatusGroup } from "./types";

export const ORDERS_PAGE_SIZE = 20;

export function listOrders(group: OrderStatusGroup, page: number): Promise<OrderPage> {
  const params = new URLSearchParams({
    status: group,
    limit: String(ORDERS_PAGE_SIZE),
    offset: String(page * ORDERS_PAGE_SIZE),
  });
  return apiFetch<OrderPage>(`/orders?${params.toString()}`);
}

export function getOrder(id: string): Promise<OrderDetail> {
  return apiFetch<OrderDetail>(`/orders/${id}`);
}

export function cancelOrder(id: string, reason: string): Promise<OrderDetail> {
  return apiFetch<OrderDetail>(`/orders/${id}/cancel`, { method: "POST", body: { reason } });
}

export function shipOrder(
  id: string,
  input: { note: string; fileId?: string | null },
): Promise<OrderDetail> {
  return apiFetch<OrderDetail>(`/orders/${id}/ship`, { method: "POST", body: input });
}

/** ادامه‌ی سفارش: پس گرفتن درخواست لغو خود یا نپذیرفتن درخواست لغو طرف مقابل */
export function keepOrder(id: string, note: string): Promise<OrderDetail> {
  return apiFetch<OrderDetail>(`/orders/${id}/keep`, { method: "POST", body: { note } });
}

export function openDispute(
  id: string,
  input: { reason: string; fileId?: string | null },
): Promise<OrderDetail> {
  return apiFetch<OrderDetail>(`/orders/${id}/dispute`, { method: "POST", body: input });
}

export function confirmDelivery(id: string, note: string): Promise<OrderDetail> {
  return apiFetch<OrderDetail>(`/orders/${id}/confirm-delivery`, {
    method: "POST",
    body: { note },
  });
}

export function useOrders(group: OrderStatusGroup, page: number) {
  return useQuery({
    queryKey: ["orders", "list", group, page],
    queryFn: () => listOrders(group, page),
    placeholderData: keepPreviousData,
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: ["orders", "detail", id],
    queryFn: () => getOrder(id),
    enabled: Boolean(id),
  });
}

/** هر اقدام روی سفارش؛ پاسخ سرور (سفارش به‌روز) مستقیم جایگزین می‌شود */
export function useOrderAction(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (run: () => Promise<OrderDetail>) => run(),
    onSuccess: (order) => {
      queryClient.setQueryData(["orders", "detail", id], order);
      void queryClient.invalidateQueries({ queryKey: ["orders", "list"] });
      void queryClient.invalidateQueries({ queryKey: ["inspection", id] });
      void queryClient.invalidateQueries({ queryKey: ["rfqs"] });
      void queryClient.invalidateQueries({ queryKey: ["quotations"] });
    },
  });
}
