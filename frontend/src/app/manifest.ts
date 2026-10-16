import type { MetadataRoute } from "next";

// در build نمایشی (خروجی استاتیک) هم یک فایل ثابت ساخته می‌شود
export const dynamic = "force-static";

/**
 * manifest اپ (PWA): نصب روی اندروید، ویندوز و آیفون.
 * آدرس‌ها نسبی‌اند تا زیر مسیر پایه‌ی نسخه‌ی نمایشی (/partmachine) هم درست کار کنند.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "تراشینو — سفارش ساخت قطعات صنعتی",
    short_name: "تراشینو",
    description:
      "ثبت درخواست ساخت قطعه، دریافت پیشنهاد قیمت، قرارداد و پیگیری سفارش با قطعه‌سازان.",
    lang: "fa",
    dir: "rtl",
    start_url: "./dashboard",
    scope: "./",
    display: "standalone",
    background_color: "#212d48",
    theme_color: "#212d48",
    categories: ["business", "productivity"],
    icons: [
      { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
