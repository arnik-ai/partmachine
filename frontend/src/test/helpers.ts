import { vi } from "vitest";

/** localStorage ساده در حافظه برای اجرای تست‌ها در Node */
export class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
  /** همه‌ی مقادیر ذخیره‌شده، برای بررسی اینکه توکنی ذخیره نشده باشد */
  dump(): string {
    return JSON.stringify(Object.fromEntries(this.data));
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** fetch ساختگی که پاسخ‌ها را به ترتیب برمی‌گرداند و درخواست‌ها را ثبت می‌کند */
export function mockFetch(...responses: Array<Response | Error>) {
  const queue = [...responses];
  const fn = vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(
    async () => {
      const next = queue.shift();
      if (!next) throw new Error("unexpected fetch call");
      if (next instanceof Error) throw next;
      return next;
    },
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

export function headerOf(init: RequestInit | undefined, name: string): string | undefined {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}
