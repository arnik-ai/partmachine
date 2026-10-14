import { apiFetch, withDemoFallback } from "@/lib/api-client";
import type { AcceptedAgreement } from "@/features/agreements/types";
import type { CreateRfqInput, OpenRfqFilters, Rfq, RfqPage } from "./types";

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
    quotesDue: "2026-08-01",
    status: "quoting",
    files: [
      { id: "demo-file-1", name: "flange-drawing.pdf", size: 845_000, kind: "pdf" },
      { id: "demo-file-2", name: "flange-model.step", size: 2_400_000, kind: "cad" },
    ],
    quotationsCount: 4,
    fileCount: 2,
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
    quotesDue: "2026-09-15",
    status: "published",
    files: [{ id: "demo-file-3", name: "body-model.stl", size: 5_100_000, kind: "cad" }],
    quotationsCount: 1,
    fileCount: 1,
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
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify([rfq, ...readDemoRfqs()]));
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
  const payload = input;
  return withDemoFallback(
    () => apiFetch<Rfq>("/rfqs", { method: "POST", body: payload }),
    () => {
      const { acceptedAgreements: _accepted, fileIds: _files, ...demo } = payload;
      void _accepted;
      void _files;
      const rfq: Rfq = {
        ...demo,
        files: [],
        id: `rfq-demo-${readDemoRfqs().length + 1}`,
        quotesDue: payload.quotesDue ?? payload.deadline,
        status: "published",
        fileCount: 0,
        quotationsCount: 0,
        createdAt: new Date().toISOString(),
        isOwner: true,
      };
      writeDemoRfq(rfq);
      return rfq;
    },
  );
}

/** فید قطعه‌سازها: RFQهایی که هنوز پیشنهاد می‌پذیرند (فقط خلاصه) */
export async function listOpenRfqs(filters: OpenRfqFilters = {}, page = 0): Promise<RfqPage> {
  const limit = RFQS_PAGE_SIZE;
  const offset = page * limit;
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (filters.q) params.set("q", filters.q);
  if (filters.capability) params.set("capability", filters.capability);
  if (filters.city) params.set("city", filters.city);
  if (filters.sort) params.set("sort", filters.sort);
  return withDemoFallback(
    () => apiFetch<RfqPage>(`/rfqs/open?${params.toString()}`),
    () => {
      const open = SEED_RFQS.filter((r) => r.status === "published" || r.status === "quoting");
      return { items: open.slice(offset, offset + limit), total: open.length, limit, offset };
    },
  );
}

export function cancelRfq(id: string, reason?: string): Promise<Rfq> {
  return apiFetch<Rfq>(`/rfqs/${id}/cancel`, {
    method: "POST",
    body: { reason: reason || undefined },
  });
}

export function rescheduleRfq(
  id: string,
  input: { quotesDue: string; deadline?: string },
): Promise<Rfq> {
  return apiFetch<Rfq>(`/rfqs/${id}/reschedule`, { method: "POST", body: input });
}

/** قطعه‌ساز NDA همین RFQ را از طرف سازمانش می‌پذیرد؛ پس از آن فایل‌ها نمایش داده می‌شوند */
export function acceptRfqNda(id: string, acceptance: AcceptedAgreement): Promise<Rfq> {
  return apiFetch<Rfq>(`/rfqs/${id}/nda`, { method: "POST", body: acceptance });
}

