"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useOrderEntries, useWorkerName } from "../api";
import { shortDate } from "../format";
import { stepTitle } from "../gadgets";
import { groupBoard } from "../rules";
import type { OrderEntry } from "../types";
import { AttentionBadge, LONG_TEXT, Segments, SUB } from "./parts";

function OrderRow({ entry }: { entry: OrderEntry }) {
  const { order, plan } = entry;
  const workerName = useWorkerName();
  const waiting = plan.status === "waiting";
  const summary = waiting
    ? "از سایت رسیده است؛ برای برنامه‌ریزی بزنید"
    : plan.current
      ? [stepTitle(plan.current.step), workerName(plan.current.step.assigneeId)].filter(Boolean).join("، ")
      : "همه‌ی فرایندها تمام شد";
  return (
    <Link
      href={waiting ? `/production/new?order=${order.id}` : `/production/order?id=${order.id}`}
      className="grid gap-2.5 px-4 py-3.5 transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      <span className="flex justify-between gap-3">
        <span className="grid min-w-0">
          <span className={cn("text-[15.5px] font-semibold leading-normal", LONG_TEXT)}>{order.title}</span>
          <span className={cn(SUB, LONG_TEXT)}>{summary}</span>
        </span>
        <span className="grid flex-none justify-items-end gap-0.5 self-start">
          <AttentionBadge plan={plan} />
          <span className={SUB}>تحویل {shortDate(order.deliverOn)}</span>
        </span>
      </span>
      {!waiting && <Segments plan={plan} />}
    </Link>
  );
}

function Group({ title, entries }: { title: string; entries: OrderEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <section className="grid gap-2">
      <h2 className="text-[13.5px] font-semibold text-muted-foreground">{title}</h2>
      <Card className="divide-y overflow-hidden">
        {entries.map((entry) => (
          <OrderRow key={entry.order.id} entry={entry} />
        ))}
      </Card>
    </section>
  );
}

/** تابلوی مدیرعامل: هر سفارش الان کجاست و کدام‌ها نیاز به توجه دارند */
export function BoardView() {
  const entries = useOrderEntries();
  const groups = useMemo(() => groupBoard(entries), [entries]);
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">تابلو</h1>
        <Link href="/production/new" className={buttonVariants()}>
          <Plus className="h-4 w-4" aria-hidden />
          سفارش جدید
        </Link>
      </div>
      {entries.length === 0 && (
        <p className="rounded-2xl border border-dashed border-input p-6 text-center text-sm text-muted-foreground">
          هنوز سفارشی نیست. با «سفارش جدید» شروع کنید.
        </p>
      )}
      <Group title="نیاز به توجه" entries={groups.attention} />
      <Group title="طبق برنامه" entries={groups.onTrack} />
      <Group title="آماده‌ی ارسال" entries={groups.finished} />
    </>
  );
}
