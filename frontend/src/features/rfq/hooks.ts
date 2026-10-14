"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createRfq, getRfq, listMyRfqs } from "./api";

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
