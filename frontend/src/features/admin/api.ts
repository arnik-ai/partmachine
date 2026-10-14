"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type {
  AdminUser,
  AdminUserFilters,
  AdminUserPage,
  AdminVerification,
  AdminVerificationPage,
  AuditEventPage,
  AuditFilters,
  VerificationFilter,
} from "./types";

export const ADMIN_PAGE_SIZE = 20;
export const AUDIT_PAGE_SIZE = 50;

function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  return search.toString();
}

export function listVerifications(status: VerificationFilter, page: number) {
  return apiFetch<AdminVerificationPage>(
    `/admin/verifications?${query({ status, limit: ADMIN_PAGE_SIZE, offset: page * ADMIN_PAGE_SIZE })}`,
  );
}

export type VerificationDecision = "approve" | "reject" | "revoke";

export function decideVerification(id: string, decision: VerificationDecision, reason: string) {
  return apiFetch<AdminVerification>(`/admin/verifications/${id}/${decision}`, {
    method: "POST",
    body: { reason },
  });
}

export function listUsers(filters: AdminUserFilters, page: number) {
  return apiFetch<AdminUserPage>(
    `/admin/users?${query({ ...filters, limit: ADMIN_PAGE_SIZE, offset: page * ADMIN_PAGE_SIZE })}`,
  );
}

export type UserAction = "activate" | "deactivate" | "verify" | "unverify";

export function changeUser(id: string, action: UserAction, reason = "") {
  return apiFetch<AdminUser>(`/admin/users/${id}/${action}`, {
    method: "POST",
    body: { reason },
  });
}

export function listAuditEvents(filters: AuditFilters, page: number) {
  return apiFetch<AuditEventPage>(
    `/admin/audit-events?${query({ ...filters, limit: AUDIT_PAGE_SIZE, offset: page * AUDIT_PAGE_SIZE })}`,
  );
}

export function useVerifications(status: VerificationFilter, page: number) {
  return useQuery({
    queryKey: ["admin", "verifications", status, page],
    queryFn: () => listVerifications(status, page),
    placeholderData: keepPreviousData,
  });
}

export function useDecideVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; decision: VerificationDecision; reason: string }) =>
      decideVerification(args.id, args.decision, args.reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
  });
}

export function useAdminUsers(filters: AdminUserFilters, page: number) {
  return useQuery({
    queryKey: ["admin", "users", filters, page],
    queryFn: () => listUsers(filters, page),
    placeholderData: keepPreviousData,
  });
}

export function useChangeUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; action: UserAction; reason?: string }) =>
      changeUser(args.id, args.action, args.reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
  });
}

export function useAuditEvents(filters: AuditFilters, page: number) {
  return useQuery({
    queryKey: ["admin", "audit", filters, page],
    queryFn: () => listAuditEvents(filters, page),
    placeholderData: keepPreviousData,
  });
}
