import type { Metadata } from "next";
import { DEMO_MODE, SITE_URL } from "@/lib/config";
import { CAPABILITIES } from "@/lib/constants";
import { LANDING, type Lang } from "./content";

const SERVICE: Record<Lang, { name: string; type: string; howTo: string }> = {
  fa: {
    name: "سفارش ساخت قطعه‌ی صنعتی",
    type: "ساخت قطعه‌ی صنعتی سفارشی بر اساس نقشه",
    howTo: "سفارش ساخت قطعه در تراشینو",
  },
  en: {
    name: "Custom industrial parts manufacturing",
    type: "Custom part manufacturing from drawings",
    howTo: "How to order a custom part on Tarashino",
  },
};

const path = (lang: Lang) => (lang === "en" ? "/en" : "/");

/** عنوان، توضیح، نسخه‌ی زبان دیگر (hreflang) و پیش‌نمایش اشتراک صفحه‌ی اول */
export function landingMetadata(lang: Lang): Metadata {
  const { meta, brand } = LANDING[lang];
  return {
    metadataBase: new URL(SITE_URL),
    title: { absolute: meta.title },
    description: meta.description,
    alternates: {
      canonical: path(lang),
      languages: { "fa-IR": "/", en: "/en", "x-default": "/" },
    },
    openGraph: {
      type: "website",
      url: path(lang),
      siteName: brand.name,
      title: meta.ogTitle,
      description: meta.ogDescription,
      locale: lang === "en" ? "en_US" : "fa_IR",
      alternateLocale: [lang === "en" ? "fa_IR" : "en_US"],
    },
    twitter: { card: "summary", title: meta.ogTitle, description: meta.ogDescription },
    // نسخه‌ی نمایشی داده‌ی نمونه دارد و نباید در نتایج جستجو بیاید
    robots: DEMO_MODE ? { index: false, follow: false } : undefined,
  };
}

/** داده‌ی ساختاریافته (schema.org) برای موتورهای جستجو و پاسخ‌گوهای هوش مصنوعی */
export function landingJsonLd(lang: Lang): string {
  const c = LANDING[lang];
  const url = `${SITE_URL}${path(lang)}`;
  const org = `${SITE_URL}/#organization`;
  const site = `${SITE_URL}/#website`;
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": org,
        name: "تراشینو",
        alternateName: "Tarashino",
        url: `${SITE_URL}/`,
        logo: `${SITE_URL}/icons/icon-512.png`,
        slogan: c.brand.tag,
        knowsLanguage: ["fa", "en"],
        description: c.meta.description,
      },
      {
        "@type": "WebSite",
        "@id": site,
        url: `${SITE_URL}/`,
        name: c.brand.name,
        inLanguage: ["fa-IR", "en"],
        publisher: { "@id": org },
      },
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: c.meta.title,
        description: c.meta.description,
        inLanguage: lang === "en" ? "en" : "fa-IR",
        isPartOf: { "@id": site },
        about: { "@id": org },
      },
      {
        "@type": "Service",
        name: SERVICE[lang].name,
        serviceType: SERVICE[lang].type,
        provider: { "@id": org },
        areaServed: { "@type": "Country", name: "Iran" },
        hasOfferCatalog: {
          "@type": "OfferCatalog",
          name: c.services.eyebrow,
          itemListElement: CAPABILITIES.map((cap) => ({
            "@type": "Offer",
            itemOffered: { "@type": "Service", name: c.services.labels[cap.value] },
          })),
        },
      },
      {
        "@type": "HowTo",
        name: SERVICE[lang].howTo,
        step: c.how.steps.map((step, i) => ({
          "@type": "HowToStep",
          position: i + 1,
          name: step.title,
          text: step.text,
        })),
      },
      {
        "@type": "FAQPage",
        mainEntity: c.faq.items.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  };
  // «<» داخل تگ script نباید متن را ببندد
  return JSON.stringify(graph).replace(/</g, "\\u003c");
}
