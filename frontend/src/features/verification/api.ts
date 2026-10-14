"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { SubmitVerificationInput, Verification } from "./types";

export function getMyVerification(): Promise<Verification | null> {
  return apiFetch<Verification | null>("/suppliers/me/verification");
}

export function submitVerification(input: SubmitVerificationInput): Promise<Verification> {
  return apiFetch<Verification>("/suppliers/me/verification", { method: "POST", body: input });
}

export function useMyVerification(enabled = true) {
  return useQuery({
    queryKey: ["verification", "me"],
    queryFn: getMyVerification,
    enabled,
  });
}

export function useSubmitVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: submitVerification,
    onSuccess: (saved) => {
      queryClient.setQueryData(["verification", "me"], saved);
    },
  });
}
