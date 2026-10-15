import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";

export const dynamic = "force-static";

/** صفحه‌ی اول به دو زبان؛ هر نسخه نسخه‌ی دیگر را معرفی می‌کند */
export default function sitemap(): MetadataRoute.Sitemap {
  const languages = { "fa-IR": `${SITE_URL}/`, en: `${SITE_URL}/en` };
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1, alternates: { languages } },
    { url: `${SITE_URL}/en`, changeFrequency: "weekly", priority: 0.8, alternates: { languages } },
  ];
}
