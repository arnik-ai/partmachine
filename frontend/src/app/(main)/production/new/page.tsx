import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { NewOrderView } from "@/features/production/components/new-order-view";

export default function ProductionNewOrderPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <NewOrderView />
    </Suspense>
  );
}
