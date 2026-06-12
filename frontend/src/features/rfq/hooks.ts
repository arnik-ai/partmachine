"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRfq, listMyRfqs } from "./api";

export function useMyRfqs() {
  return useQuery({
    queryKey: ["rfqs", "mine"],
    queryFn: listMyRfqs,
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
