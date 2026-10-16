"use client";

import Link from "next/link";
import {
  Boxes,
  Cog,
  Factory,
  Flame,
  FlaskConical,
  Hammer,
  Layers,
  Shapes,
  Sparkles,
  Syringe,
  Thermometer,
  type LucideIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { BuyerRating } from "@/features/suppliers/components/buyer-rating";
import { SupplierAvatar } from "@/features/suppliers/components/supplier-avatar";
import { useSuppliers } from "@/features/suppliers/hooks";
import { CAPABILITIES } from "@/lib/constants";

const SERVICE_ICONS: Record<string, LucideIcon> = {
  cnc: Cog,
  injection_molding: Syringe,
  sheet_metal: Layers,
  casting: FlaskConical,
  welding: Flame,
  tooling: Boxes,
  plastic_manufacturing: Shapes,
  forging: Hammer,
  heat_treatment: Thermometer,
  surface_treatment: Sparkles,
};

const ROW = "-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none]";

/** ردیف قطعه‌سازان با عکس پروفایل و ستاره‌ی کارفرماها */
export function SupplierStrip() {
  const { data, isLoading } = useSuppliers({ limit: 8 });
  const items = data?.items ?? [];
  if (!isLoading && items.length === 0) return null;
  return (
    <section aria-labelledby="supplier-strip" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 id="supplier-strip" className="text-base font-bold">
          قطعه‌سازان
        </h2>
        <Link href="/suppliers" className="text-sm font-medium text-primary hover:underline">
          همه‌ی قطعه‌سازان
        </Link>
      </div>
      <div className={ROW}>
        {isLoading
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-36 shrink-0 rounded-3xl" />)
          : items.map((supplier) => (
              <Link
                key={supplier.id}
                href={`/suppliers/${supplier.id}`}
                className="flex w-36 shrink-0 snap-start flex-col items-center gap-1.5 rounded-3xl border bg-card p-3 text-center text-card-foreground shadow-soft transition-transform hover:-translate-y-0.5"
              >
                <SupplierAvatar name={supplier.companyName} logoUrl={supplier.logo?.url} />
                <span className="line-clamp-2 min-h-10 text-sm font-semibold leading-5">{supplier.companyName}</span>
                <span className="text-xs text-muted-foreground">{supplier.city}</span>
                <BuyerRating average={supplier.ratingAverage} count={supplier.ratingCount} />
              </Link>
            ))}
      </div>
    </section>
  );
}

/** خدمات تولید؛ هر کاشی فهرست قطعه‌سازان همان خدمت را باز می‌کند */
export function ServicesRow() {
  return (
    <section aria-labelledby="services-row" className="flex flex-col gap-3">
      <h2 id="services-row" className="text-base font-bold">
        خدمات تولید
      </h2>
      <div className={ROW}>
        {CAPABILITIES.map((capability) => {
          const Icon = SERVICE_ICONS[capability.value] ?? Factory;
          return (
            <Link
              key={capability.value}
              href={`/suppliers?capability=${capability.value}`}
              className="group flex w-20 shrink-0 snap-start flex-col items-center gap-2 text-center text-xs font-medium"
            >
              <span className="grid h-16 w-16 place-items-center rounded-[1.3rem] border bg-card shadow-soft transition-transform group-active:scale-95">
                <Icon className="h-7 w-7 fill-sky-100 text-sky-600" strokeWidth={1.7} aria-hidden />
              </span>
              <span className="leading-snug">{capability.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
