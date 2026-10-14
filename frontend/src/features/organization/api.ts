"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { Invite, InviteCreated, InviteInfo, Organization } from "./types";

export function getOrganization(): Promise<Organization> {
  return apiFetch<Organization>("/organization");
}

export function listInvites(): Promise<Invite[]> {
  return apiFetch<Invite[]>("/organization/invites");
}

export function createInvite(): Promise<InviteCreated> {
  return apiFetch<InviteCreated>("/organization/invites", { method: "POST" });
}

export function revokeInvite(id: string): Promise<void> {
  return apiFetch<void>(`/organization/invites/${id}`, { method: "DELETE" });
}

export function removeMember(id: string): Promise<void> {
  return apiFetch<void>(`/organization/members/${id}`, { method: "DELETE" });
}

export function getInviteInfo(token: string): Promise<InviteInfo> {
  return apiFetch<InviteInfo>(`/invites/${encodeURIComponent(token)}`, { auth: false });
}

/** لینکی که مدیر برای همکارش می‌فرستد */
export function inviteLink(token: string): string {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${window.location.origin}${basePath}/register?invite=${encodeURIComponent(token)}`;
}

export function useOrganization() {
  return useQuery({ queryKey: ["organization"], queryFn: getOrganization });
}

export function useInvites(enabled: boolean) {
  return useQuery({ queryKey: ["organization", "invites"], queryFn: listInvites, enabled });
}

export function useInviteInfo(token: string | null) {
  return useQuery({
    queryKey: ["invite", token],
    queryFn: () => getInviteInfo(token as string),
    enabled: Boolean(token),
    retry: false,
  });
}

function useOrganizationMutation<TArg, TResult>(fn: (arg: TArg) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["organization"] });
    },
  });
}

export function useCreateInvite() {
  return useOrganizationMutation(() => createInvite());
}

export function useRevokeInvite() {
  return useOrganizationMutation(revokeInvite);
}

export function useRemoveMember() {
  return useOrganizationMutation(removeMember);
}
