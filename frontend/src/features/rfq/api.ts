import { apiFetch, withDemoFallback } from "@/lib/api-client";
import type { CreateRfqInput, Rfq, RfqPage } from "./types";

const DEMO_STORAGE_KEY = "partmachine-demo-rfqs";

/** فقط نسخه‌ی نمایشی: RFQهای نمونه + RFQهای ساخته‌شده در همان مرورگر (localStorage) */
const SEED_RFQS: Rfq[] = [
  {
    id: "rfq-2001",
    title: "ساخت ۵۰۰ عدد فلنج استیل ۳۰۴",
    description:
      "فلنج طبق نقشه‌ی پیوست، قطر خارجی ۱۲۰ میلی‌متر، سوراخ‌کاری ۸ عدد M10. تلرانس‌ها مطابق نقشه.",
    capability: "cnc",
    material: "استیل 304",
    quantity: 500,
    deliveryCity: "تهران",
    deadline: "2026-08-01",
    status: "quoting",
    files: [
      { name: "flange-drawing.pdf", size: 845_000, kind: "pdf" },
      { name: "flange-model.step", size: 2_400_000, kind: "cad" },
    ],
    quotationsCount: 4,
    createdAt: "2026-06-01T09:30:00Z",
  },
  {
    id: "rfq-2002",
    title: "قالب تزریق بدنه‌ی محصول خانگی + تولید ۱۰هزار عدد",
    description:
      "ساخت قالب دو حفره‌ای از جنس 1.2738 و تولید سری اول ۱۰٬۰۰۰ عدد با ABS.",
    capability: "injection_molding",
    material: "ABS",
    quantity: 10000,
    deliveryCity: "اصفهان",
    deadline: "2026-09-15",
    status: "published",
    files: [{ name: "body-model.stl", size: 5_100_000, kind: "cad" }],
    quotationsCount: 1,
    createdAt: "2026-06-08T14:00:00Z",
  },
];

function readDemoRfqs(): Rfq[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeDemoRfq(rfq: Rfq) {
  // پیش‌نمایش تصاویر حجیم است و در دمو هم ذخیره نمی‌شود
  const files = rfq.files.map(({ name, size, kind }) => ({ name, size, kind }));
  localStorage.setItem(
    DEMO_STORAGE_KEY,
    JSON.stringify([{ ...rfq, files }, ...readDemoRfqs()]),
  );
}

function allDemoRfqs(): Rfq[] {
  return [...readDemoRfqs(), ...SEED_RFQS];
}

export const RFQS_PAGE_SIZE = 10;

export async function listMyRfqs(page = 0): Promise<RfqPage> {
  const limit = RFQS_PAGE_SIZE;
  const offset = page * limit;
  return withDemoFallback(
    () => apiFetch<RfqPage>(`/rfqs/mine?limit=${limit}&offset=${offset}`),
    () => {
      const all = allDemoRfqs();
      return { items: all.slice(offset, offset + limit), total: all.length, limit, offset };
    },
  );
}

export async function getRfq(id: string): Promise<Rfq | null> {
  return withDemoFallback(
    () => apiFetch<Rfq>(`/rfqs/${id}`),
    () => allDemoRfqs().find((r) => r.id === id) ?? null,
  );
}

export async function createRfq(input: CreateRfqInput): Promise<Rfq> {
  // فقط متادیتای فایل به سرور می‌رود؛ پیش‌نمایش تصویر در مرورگر می‌ماند
  const payload = {
    ...input,
    files: input.files.map(({ name, size, kind }) => ({ name, size, kind })),
  };
  return withDemoFallback(
    () => apiFetch<Rfq>("/rfqs", { method: "POST", body: payload }),
    () => {
      const rfq: Rfq = {
        ...payload,
        id: `rfq-demo-${readDemoRfqs().length + 1}`,
        status: "published",
        quotationsCount: 0,
        createdAt: new Date().toISOString(),
        isOwner: true,
      };
      writeDemoRfq(rfq);
      return rfq;
    },
  );
}
