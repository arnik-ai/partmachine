"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { Contract, UpdateContractInput } from "./types";

export function getContract(orderId: string): Promise<Contract> {
  return apiFetch<Contract>(`/orders/${orderId}/contract`);
}

export function updateContract(orderId: string, input: UpdateContractInput): Promise<Contract> {
  return apiFetch<Contract>(`/orders/${orderId}/contract`, { method: "PUT", body: input });
}

export function signContract(orderId: string, version: number, password: string): Promise<Contract> {
  return apiFetch<Contract>(`/orders/${orderId}/contract/sign`, {
    method: "POST",
    body: { version, password },
  });
}

export function requestContractChange(orderId: string, note: string): Promise<Contract> {
  return apiFetch<Contract>(`/orders/${orderId}/contract/change-request`, {
    method: "POST",
    body: { note },
  });
}

export function useContract(orderId: string) {
  return useQuery({
    queryKey: ["contracts", orderId],
    queryFn: () => getContract(orderId),
    enabled: Boolean(orderId),
  });
}

/** هر اقدام روی قرارداد؛ قرارداد تازه جایگزین می‌شود و سفارش (وضعیت و تاریخچه) دوباره خوانده می‌شود */
export function useContractAction(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (run: () => Promise<Contract>) => run(),
    onSuccess: (contract) => {
      queryClient.setQueryData(["contracts", orderId], contract);
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}
