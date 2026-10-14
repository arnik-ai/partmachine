"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * روی سرور و هنگام hydration مقدار false و بعد از آن true برمی‌گرداند — برای نمایش
 * داده‌هایی که فقط در مرورگر وجود دارند (مثل localStorage) بدون mismatch هیدریشن.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
