import { describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import { clearCacheOnUserChange } from "./cache-guard";
import type { User } from "./types";

function user(id: string): User {
  return {
    id,
    email: `${id}@example.com`,
    fullName: "کاربر",
    role: "buyer",
    organizationId: "o1",
    companyName: "صنایع نمونه",
    verified: false,
  };
}

describe("clearCacheOnUserChange", () => {
  it("clears the cache when the user signs out (also when forced) or changes", () => {
    const store = create<{ user: User | null }>()(() => ({ user: null }));
    const queryClient = { clear: vi.fn() };
    const stop = clearCacheOnUserChange(store, queryClient);

    store.setState({ user: user("a") });
    expect(queryClient.clear).not.toHaveBeenCalled();

    // همان کاربر، داده‌ی تازه (مثلاً refresh): کش می‌ماند
    store.setState({ user: { ...user("a"), fullName: "نام تازه" } });
    expect(queryClient.clear).not.toHaveBeenCalled();

    // خروج اجباری (نشست در سرور بسته شد)
    store.setState({ user: null });
    expect(queryClient.clear).toHaveBeenCalledTimes(1);

    // نفر بعدی در همان مرورگر وارد می‌شود، و بعد کاربر دیگری جایش را می‌گیرد
    store.setState({ user: user("b") });
    store.setState({ user: user("c") });
    expect(queryClient.clear).toHaveBeenCalledTimes(2);

    stop();
    store.setState({ user: null });
    expect(queryClient.clear).toHaveBeenCalledTimes(2);
  });
});
