"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AuthBootstrap } from "@/features/auth/components/auth-bootstrap";
import { clearCacheOnUserChange } from "@/features/auth/cache-guard";
import { useAuthStore } from "@/features/auth/store";
import { ApiError } from "@/lib/api-client";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            // خطاهای قطعی (دسترسی، پیدا نشدن، اعتبارسنجی) تکرار نمی‌شوند
            retry: (count, error) =>
              !(error instanceof ApiError && error.status < 500) && count < 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  useEffect(() => clearCacheOnUserChange(useAuthStore, queryClient), [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthBootstrap />
      {children}
    </QueryClientProvider>
  );
}
