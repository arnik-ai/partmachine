import type { Order } from "./types";

/** سفارش‌های نمایشی — در افزایش بعدی از API خوانده می‌شود */
export const MOCK_ORDERS: Order[] = [
  {
    id: "ord-3001",
    title: "۵۰۰ عدد فلنج استیل ۳۰۴",
    supplierName: "صنایع دقیق‌تراش آریا",
    quantity: 500,
    amountRials: 1_850_000_000,
    stage: "qc_inspection",
    stageDates: {
      placed: "2026-05-20",
      escrow_funded: "2026-05-21",
      in_production: "2026-05-23",
      qc_inspection: "2026-06-10",
    },
    expectedDelivery: "2026-06-25",
  },
  {
    id: "ord-3002",
    title: "قالب تزریق + ۱۰هزار قطعه ABS",
    supplierName: "قالب‌سازان پیشرو اصفهان",
    quantity: 10000,
    amountRials: 6_400_000_000,
    stage: "in_production",
    stageDates: {
      placed: "2026-06-01",
      escrow_funded: "2026-06-02",
      in_production: "2026-06-05",
    },
    expectedDelivery: "2026-08-10",
  },
  {
    id: "ord-3003",
    title: "۲۰۰ عدد براکت ورق فولادی",
    supplierName: "ورق‌کاران صنعت تبریز",
    quantity: 200,
    amountRials: 320_000_000,
    stage: "released",
    stageDates: {
      placed: "2026-04-02",
      escrow_funded: "2026-04-03",
      in_production: "2026-04-05",
      qc_inspection: "2026-04-18",
      shipping: "2026-04-20",
      delivered: "2026-04-24",
      released: "2026-04-25",
    },
    expectedDelivery: "2026-04-25",
  },
];
