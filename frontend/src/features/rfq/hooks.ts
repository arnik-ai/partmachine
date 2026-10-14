"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  acceptRfqNda,
  cancelRfq,
  createRfq,
  getRfq,
  listMyRfqs,
  listOpenRfqs,
  rescheduleRfq,
} from "./api";
import type { AcceptedAgreement } from "@/features/agreements/types";
import type { OpenRfqFilters } from "./types";

export function useMyRfqs(page = 0) {
  return useQuery({
    queryKey: ["rfqs", "mine", page],
    queryFn: () => listMyRfqs(page),
    placeholderData: keepPreviousData,
  });
}

export function useRfq(id: string) {
  return useQuery({
    queryKey: ["rfqs", "detail", id],
    queryFn: () => getRfq(id),
    enabled: Boolean(id),
  });
}

export function useCreateRfq() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createRfq,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rfqs"] });
    },
  });
}

export function useOpenRfqs(filters: OpenRfqFilters, page = 0) {
  return useQuery({
    queryKey: ["rfqs", "open", filters, page],
    queryFn: () => listOpenRfqs(filters, page),
    placeholderData: keepPreviousData,
  });
}

export function useCancelRfq(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason?: string) => cancelRfq(id, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["rfqs"] });
      void queryClient.invalidateQueries({ queryKey: ["quotations"] });
    },
  });
}

export function useRescheduleRfq(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { quotesDue: string; deadline?: string }) => rescheduleRfq(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["rfqs"] });
    },
  });
}

export function useAcceptRfqNda(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (acceptance: AcceptedAgreement) => acceptRfqNda(id, acceptance),
    onSuccess: (rfq) => {
      queryClient.setQueryData(["rfqs", "detail", id], rfq);
      void queryClient.invalidateQueries({ queryKey: ["rfqs", "open"] });
    },
  });
}

