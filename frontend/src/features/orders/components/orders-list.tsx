"use client";

import { useState } from "react";
import { ChevronDown, Factory, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn, faNumber, faToman, faDate } from "@/lib/utils";
import { MOCK_ORDERS } from "../mock";
import { ORDER_STAGES, stageIndex, type Order } from "../types";
import { OrderProgressBar, OrderTimeline } from "./order-timeline";

function OrderCard({ order }: { order: Order }) {
  const [open, setOpen] = useState(order.stage !== "released");
  const current = ORDER_STAGES[stageIndex(order.stage)];
  const finished = order.stage === "released";

  return (
    <Card className="rounded-2xl">
      <CardContent className="flex flex-col gap-4 p-5">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex w-full flex-wrap items-start justify-between gap-3 text-right"
        >
          <div className="flex flex-col gap-1">
            <h3 className="flex items-center gap-2 font-semibold">
              <Package className="h-4 w-4 text-primary" />
              {order.title}
            </h3>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Factory className="h-3.5 w-3.5" />
              {order.supplierName} · {faNumber(order.quantity)} عدد ·{" "}
              {faToman(order.amountRials)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={finished ? "success" : "warning"}>
              {current.label}
            </Badge>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </div>
        </button>

        <OrderProgressBar order={order} />

        {open && (
          <div className="border-t pt-4">
            <OrderTimeline order={order} />
            <p className="text-xs text-muted-foreground">
              تحویل پیش‌بینی‌شده: {faDate(order.expectedDelivery)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function OrdersList() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">سفارش‌های من</h1>
        <p className="mt-1 text-sm text-white/65">
          مرحله‌ی فعلی هر سفارش را به‌صورت زنده ببینید — از پرداخت امانی تا
          آزادسازی وجه.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {MOCK_ORDERS.map((order) => (
          <OrderCard key={order.id} order={order} />
        ))}
      </div>
    </div>
  );
}
