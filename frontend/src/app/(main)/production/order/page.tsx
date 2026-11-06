import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderView } from "@/features/production/components/order-view";

/** شناسه با ?id= می‌آید چون نسخه‌ی نمایشی استاتیک است و مسیر پویا ندارد */
export default function ProductionOrderPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <OrderView />
    </Suspense>
  );
}
