"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { faDate, faNumber, faToman } from "@/lib/utils";
import { ORDERS_PAGE_SIZE, useOrders } from "../api";
import {
  ORDER_STATUS_LABELS,
  orderNumber,
  type OrderStatusGroup,
  type OrderSummary,
} from "../types";

const GROUPS: Array<{ value: OrderStatusGroup; label: string }> = [
  { value: "active", label: "در جریان" },
  { value: "completed", label: "تکمیل‌شده" },
  { value: "cancelled", label: "لغوشده" },
  { value: "all", label: "همه" },
];

/** سفارش‌های سازمان من (به‌عنوان کارفرما یا قطعه‌ساز) */
export function OrdersView() {
  const [group, setGroup] = useState<OrderStatusGroup>("active");
  const [page, setPage] = useState(0);
  const { data, isLoading, isError, error, refetch, isFetching } = useOrders(group, page);
  const pages = data ? Math.max(1, Math.ceil(data.total / ORDERS_PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">سفارش‌ها</h1>
        <p className="mt-1 text-sm text-white/65">
          هر سفارش پس از انتخاب برنده ساخته می‌شود و مراحل قرارداد، تولید، ارسال و تحویل از همین‌جا
          پیگیری می‌شود.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="وضعیت سفارش‌ها">
        {GROUPS.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={group === item.value}
            className={buttonVariants({
              variant: group === item.value ? "default" : "outline",
              size: "sm",
            })}
            onClick={() => {
              setGroup(item.value);
              setPage(0);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data || data.items.length === 0 ? (
        <p className="py-10 text-center text-white/70">
          {group === "active"
            ? "سفارش در جریانی ندارید. پس از انتخاب برنده‌ی یک درخواست، سفارش این‌جا نمایش داده می‌شود."
            : "سفارشی پیدا نشد."}
        </p>
      ) : (
        <div className="flex flex-col gap-3" style={{ opacity: isFetching ? 0.6 : 1 }}>
          {data.items.map((order) => (
            <OrderRow key={order.id} order={order} />
          ))}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                صفحه‌ی قبل
              </Button>
              <span className="text-sm text-white/75">
                صفحه‌ی {faNumber(page + 1)} از {faNumber(pages)}
              </span>
              <Button
                variant="outline"
                disabled={page + 1 >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                صفحه‌ی بعد
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OrderRow({ order }: { order: OrderSummary }) {
  const counterpart = order.mySide === "supplier" ? order.buyer.name : order.supplier.name;
  return (
    <Link href={`/orders/${order.id}`} className="block">
      <Card className="rounded-2xl transition-shadow hover:shadow-md">
        <CardContent className="flex flex-wrap items-start justify-between gap-3 p-5">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="flex items-center gap-2 font-semibold">
              <Package className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              {order.title}
            </span>
            <span className="text-xs text-muted-foreground">
              <span dir="ltr">{orderNumber(order.number)}</span> ·{" "}
              {order.mySide === "supplier" ? "کارفرما" : "قطعه‌ساز"}: {counterpart} ·{" "}
              {faNumber(order.quantity)} عدد · {faToman(order.amountRials)}
            </span>
            <span className="text-xs text-muted-foreground">
              تحویل تعهدشده: {faDate(order.deliveryDue)}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={order.status === "cancelled" ? "destructive" : "secondary"}>
              {ORDER_STATUS_LABELS[order.status]}
            </Badge>
            {order.isOverdue && (
              <Badge variant="destructive">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                دیرکرد
              </Badge>
            )}
            {order.nextActions.some((action) => action !== "cancel") && (
              <Badge variant="warning">نوبت شماست</Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
