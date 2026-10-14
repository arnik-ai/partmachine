"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AcceptedAgreement } from "@/features/agreements/types";
import { apiFetch } from "@/lib/api-client";
import type { Inspection, InspectionResultInput, QcLabList } from "./types";

const path = (orderId: string) => `/orders/${orderId}/inspection`;

export function getInspection(orderId: string): Promise<Inspection> {
  return apiFetch<Inspection>(path(orderId));
}

export function listQcLabs(): Promise<QcLabList> {
  return apiFetch<QcLabList>("/qc-labs");
}

export function chooseLab(orderId: string, labOrganizationId: string): Promise<Inspection> {
  return apiFetch<Inspection>(path(orderId), { method: "PUT", body: { labOrganizationId } });
}

export function removeInspection(orderId: string): Promise<Inspection> {
  return apiFetch<Inspection>(path(orderId), { method: "DELETE" });
}

export function markReady(orderId: string, note: string): Promise<Inspection> {
  return apiFetch<Inspection>(`${path(orderId)}/ready`, { method: "POST", body: { note } });
}

export function acceptInspectionNda(
  orderId: string,
  agreement: AcceptedAgreement,
): Promise<Inspection> {
  return apiFetch<Inspection>(`${path(orderId)}/nda`, { method: "POST", body: agreement });
}

export function recordResult(orderId: string, input: InspectionResultInput): Promise<Inspection> {
  return apiFetch<Inspection>(`${path(orderId)}/result`, { method: "POST", body: input });
}

export function useInspection(orderId: string, enabled = true) {
  return useQuery({
    queryKey: ["inspection", orderId],
    queryFn: () => getInspection(orderId),
    enabled: Boolean(orderId) && enabled,
  });
}

export function useQcLabs(enabled: boolean) {
  return useQuery({ queryKey: ["qc-labs"], queryFn: listQcLabs, enabled });
}

/** هر اقدام بازرسی؛ بخش بازرسی جایگزین می‌شود و سفارش (وضعیت و تاریخچه) دوباره خوانده می‌شود */
export function useInspectionAction(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (run: () => Promise<Inspection>) => run(),
    onSuccess: (inspection) => {
      queryClient.setQueryData(["inspection", orderId], inspection);
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}
