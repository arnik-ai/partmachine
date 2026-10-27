import type { QueryClient } from "@tanstack/react-query";
import type { StoreApi } from "zustand";
import type { User } from "./types";

/**
 * داده‌ی کش‌شده‌ی یک کاربر هرگز به کاربر بعدی نمی‌رسد: با خروج (دکمه‌ی خروج یا خروج اجباری، مثلاً وقتی
 * نشست در سرور بسته شده است) یا عوض شدن کاربر، کل کش پاک می‌شود. برای رایانه‌های مشترک مهم است.
 * تابع لغو اشتراک را برمی‌گرداند.
 */
export function clearCacheOnUserChange(
  store: Pick<StoreApi<{ user: User | null }>, "getState" | "subscribe">,
  queryClient: Pick<QueryClient, "clear">,
): () => void {
  let previous = store.getState().user?.id ?? null;
  return store.subscribe((state) => {
    const current = state.user?.id ?? null;
    if (current !== previous) {
      if (previous !== null) queryClient.clear();
      previous = current;
    }
  });
}
