"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CAPABILITIES, CITIES } from "@/lib/constants";
import type { SupplierFilters } from "../types";

export function SupplierFiltersBar({
  filters,
  onChange,
}: {
  filters: SupplierFilters;
  onChange: (filters: SupplierFilters) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_220px_180px]">
      <div className="relative">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="جستجوی نام یا توضیحات تأمین‌کننده..."
          className="pr-9"
          value={filters.q ?? ""}
          onChange={(e) => onChange({ ...filters, q: e.target.value })}
        />
      </div>
      <Select
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
  );
}
