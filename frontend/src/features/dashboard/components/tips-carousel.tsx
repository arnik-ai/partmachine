"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { faNumber } from "@/lib/utils";

type Tip = { title: string; text: string; cta: string; href: string };

const TIPS: Record<string, Tip[]> = {
  buyer: [
    { title: "قطعه‌ات را به سفارش بساز", text: "یک درخواست ثبت کن و از چند قطعه‌ساز قیمت بگیر.", cta: "ثبت درخواست", href: "/rfqs/new" },
    { title: "نشان «تأییدشده» یعنی مدارک بررسی شده", text: "کنار هر قطعه‌ساز ببین مدارکش بررسی شده یا نه.", cta: "دیدن قطعه‌سازان", href: "/suppliers?verified=true" },
    { title: "قرارداد و پیگیری در یک پرونده", text: "امضا، پرداخت‌ها و ارسال، همه در صفحه‌ی سفارش.", cta: "دیدن سفارش‌ها", href: "/orders" },
  ],
  supplier: [
    { title: "پروفایل کامل، مشتری بیشتر", text: "عکس پروفایل، نمونه‌کار و خدماتت را کامل کن تا کارفرماها پیدایت کنند.", cta: "رفتن به پروفایل", href: "/profile" },
    { title: "درخواست‌های تازه‌ی بازار", text: "درخواست‌های باز کارفرماها را ببین و قیمت بده.", cta: "دیدن درخواست‌ها", href: "/rfqs/open" },
    { title: "ستاره‌ی کارفرماها", text: "هر سفارش تمام‌شده می‌تواند ستاره بگیرد؛ تحویل به‌موقع یعنی ستاره‌ی بیشتر.", cta: "دیدن سفارش‌ها", href: "/orders" },
  ],
};

const BACKGROUNDS = [
  "bg-[linear-gradient(240deg,#075985,#0284c7_58%,#7dd3fc)]",
  "bg-[linear-gradient(240deg,#0f2333,#1f4d6d_55%,#38bdf8)]",
  "bg-[linear-gradient(240deg,#075985,#0ea5e9_60%,#7dd3fc)]",
];

/** بنر راهنمای چرخان، مثل اپ‌های موبایل؛ با کشیدن یا نقطه‌ها عوض می‌شود */
export function TipsCarousel({ role }: { role: string }) {
  const tips = TIPS[role === "agent" ? "buyer" : role] ?? [];
  const track = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);

  const go = (index: number) => {
    const el = track.current?.children[index] as HTMLElement | undefined;
    if (!el || !track.current) return;
    track.current.scrollTo({ left: el.offsetLeft - track.current.offsetLeft, behavior: "smooth" });
  };

  useEffect(() => {
    const el = track.current;
    if (!el || tips.length < 2) return;
    const onScroll = () => setCurrent(Math.round(Math.abs(el.scrollLeft) / Math.max(1, el.clientWidth)));
    el.addEventListener("scroll", onScroll, { passive: true });
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let held = false;
    const hold = () => {
      held = true;
    };
    el.addEventListener("pointerdown", hold);
    const timer = reduce
      ? undefined
      : window.setInterval(() => {
          if (held || document.hidden) return;
          const next = (Math.round(Math.abs(el.scrollLeft) / Math.max(1, el.clientWidth)) + 1) % tips.length;
          const child = el.children[next] as HTMLElement | undefined;
          if (child) el.scrollTo({ left: child.offsetLeft - el.offsetLeft, behavior: "smooth" });
        }, 5000);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("pointerdown", hold);
      if (timer) window.clearInterval(timer);
    };
  }, [tips.length]);

  if (tips.length === 0) return null;
  return (
    <section aria-label="راهنما" className="flex flex-col gap-2">
      <div ref={track} className="flex snap-x snap-mandatory gap-3 overflow-x-auto rounded-3xl [scrollbar-width:none]">
        {tips.map((tip, i) => (
          <div
            key={tip.title}
            className={`relative flex min-h-36 w-full shrink-0 snap-center flex-col items-start justify-center gap-1.5 overflow-hidden rounded-3xl p-5 pe-[38%] text-white ${BACKGROUNDS[i % BACKGROUNDS.length]}`}
          >
            <h2 className="text-lg font-bold leading-snug">{tip.title}</h2>
            <p className="text-xs leading-relaxed text-white/85">{tip.text}</p>
            <Link href={tip.href} className="mt-1 rounded-xl bg-gold px-3 py-1 text-xs font-bold text-slate-950">
              {tip.cta}
            </Link>
            <span aria-hidden className="absolute -bottom-10 -end-6 h-36 w-36 rounded-full border-[14px] border-white/25" />
            <span aria-hidden className="absolute -end-2 top-4 h-14 w-14 rounded-full border-[8px] border-gold/70" />
          </div>
        ))}
      </div>
      {tips.length > 1 && (
        <div className="flex justify-center gap-1.5">
          {tips.map((tip, i) => (
            <button
              key={tip.title}
              type="button"
              onClick={() => go(i)}
              aria-label={`راهنمای ${faNumber(i + 1)}`}
              aria-current={i === current}
              className={`h-1.5 rounded-full transition-all ${i === current ? "w-5 bg-primary" : "w-1.5 bg-border"}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
