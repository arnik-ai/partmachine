"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useSuppliers } from "../hooks";
import type { SupplierFilters } from "../types";
import { SupplierCard } from "./supplier-card";
import { SupplierFiltersBar } from "./supplier-filters";

export function SuppliersList() {
  const [filters, setFilters] = useState<SupplierFilters>({});
  const { data: suppliers, isLoading } = useSuppliers(filters);

  return (
    <div className="flex flex-col gap-6">
      <SupplierFiltersBar filters={filters} onChange={setFilters} />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : suppliers && suppliers.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {suppliers.map((supplier) => (
            <SupplierCard key={supplier.id} supplier={supplier} />
          ))}
        </div>
      ) : (
        <p className="py-12 text-center text-muted-foreground">
          تأمین‌کننده‌ای با این فیلترها پیدا نشد.
        </p>
      )}
    </div>
  );
}
