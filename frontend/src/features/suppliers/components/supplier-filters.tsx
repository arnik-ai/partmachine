"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CAPABILITIES, CITIES } from "@/lib/constants";
import type { SupplierFilters } from "../types";

/** جستجو با کمی تأخیر ارسال می‌شود تا با هر حرف یک درخواست به سرور نرود */
const SEARCH_DELAY_MS = 350;

export function SupplierFiltersBar({
  filters,
  onChange,
}: {
  filters: SupplierFilters;
  onChange: (filters: SupplierFilters) => void;
}) {
  const [query, setQuery] = useState(filters.q ?? "");

  useEffect(() => {
    if (query === (filters.q ?? "")) return;
    const timer = setTimeout(
      () => onChange({ ...filters, q: query || undefined }),
      SEARCH_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [query, filters, onChange]);

  return (
    <div className="flex flex-col gap-3">
    <div className="grid gap-3 sm:grid-cols-[1fr_220px_180px]">
      <div className="relative">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="جستجوی نام یا توضیحات قطعه‌ساز..."
          className="pr-9"
          aria-label="جستجو"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <Select
        aria-label="نوع خدمت"
        value={filters.capability ?? ""}
        onChange={(e) =>
          onChange({ ...filters, capability: e.target.value || undefined })
        }
      >
        <option value="">همه‌ی خدمات</option>
        {CAPABILITIES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </Select>
      <Select
        aria-label="شهر"
        value={filters.city ?? ""}
        onChange={(e) =>
          onChange({ ...filters, city: e.target.value || undefined })
        }
      >
        <option value="">همه‌ی شهرها</option>
        {CITIES.map((city) => (
          <option key={city} value={city}>
            {city}
          </option>
        ))}
      </Select>
    </div>
    <label className="flex cursor-pointer items-center gap-2 self-start text-sm text-white/85">
      <input
        type="checkbox"
        className="h-4 w-4 accent-primary"
        checked={filters.verified ?? false}
        onChange={(e) => onChange({ ...filters, verified: e.target.checked || undefined })}
      />
      فقط قطعه‌سازهای تأییدشده
    </label>
    </div>
  );
}
