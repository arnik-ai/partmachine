"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  awardQuotation,
  listMyQuotations,
  listQuotations,
  submitQuotation,
  updateQuotation,
  withdrawQuotation,
} from "./api";
import type { QuotationInput } from "./types";

export function useQuotations(rfqId: string, enabled = true) {
  return useQuery({
    queryKey: ["quotations", "rfq", rfqId],
    queryFn: () => listQuotations(rfqId),
    enabled: enabled && Boolean(rfqId),
  });
}

export function useMyQuotations(page = 0) {
  return useQuery({
    queryKey: ["quotations", "mine", page],
    queryFn: () => listMyQuotations(page),
    placeholderData: keepPreviousData,
  });
}

/** پس از هر تغییر، RFQها و پیشنهادها دوباره از سرور خوانده می‌شوند */
function useRefreshAfterChange() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["quotations"] });
    void queryClient.invalidateQueries({ queryKey: ["rfqs"] });
  };
}

export function useSubmitQuotation(rfqId: string) {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: (input: QuotationInput) => submitQuotation(rfqId, input),
    onSuccess: refresh,
  });
}

export function useUpdateQuotation() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: QuotationInput }) =>
      updateQuotation(id, input),
    onSuccess: refresh,
  });
}

export function useWithdrawQuotation() {
  const refresh = useRefreshAfterChange();
  return useMutation({ mutationFn: withdrawQuotation, onSuccess: refresh });
}

export function useAwardQuotation() {
  const refresh = useRefreshAfterChange();
  return useMutation({ mutationFn: awardQuotation, onSuccess: refresh });
}
