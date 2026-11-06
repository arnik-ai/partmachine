"use client";

import { useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn, faNumber } from "@/lib/utils";
import {
  clearIssue,
  reportIssue,
  showToast,
  tickOrderStep,
  useOrderEntries,
  useSignedInWorker,
  useToday,
} from "../api";
import { dueText, durationText, firstName, shortDate } from "../format";
import { stepTitle } from "../gadgets";
import { tasksOf } from "../rules";
import { LINK_BUTTON, LONG_TEXT, SUB, WARN_TEXT } from "./parts";
import { IssueSheet } from "./sheets";

/** بعد از تیک، کار بعدی زیر انگشت می‌آید؛ ضربه‌ی دوم یک دابل‌تپ نباید آن را هم تیک بزند */
const DOUBLE_TAP_GUARD_MS = 600;

function useMyTasks() {
  const worker = useSignedInWorker();
  const entries = useOrderEntries();
  return useMemo(() => tasksOf(worker?.id ?? "", entries), [worker, entries]);
}

/** پنل کارگر: فقط کارهای خودش، بدون مبلغ و مشتری؛ با یک ضربه «انجام شد» */
export function MyTasksView() {
  const worker = useSignedInWorker();
  const today = useToday();
  const { now, later } = useMyTasks();
  const [issueFor, setIssueFor] = useState<{ orderId: string; stepId: string } | null>(null);
  const lastTick = useRef(-Infinity);

  function tick(at: number, orderId: string, stepId: string) {
    if (at - lastTick.current < DOUBLE_TAP_GUARD_MS) return;
    lastTick.current = at;
    tickOrderStep(orderId, stepId);
  }

  const summary =
    now.length === 0
      ? "الان کاری ندارید."
      : now.length === 1
        ? "یک کار دارید."
        : `${faNumber(now.length)} کار دارید.`;

  return (
    <>
      <div>
        <h1 className="text-xl font-bold">سلام {firstName(worker?.name ?? "")}</h1>
        <p className={SUB}>{summary}</p>
      </div>
      {now.map(({ order, row }) => (
        <Card key={row.step.id} className="grid gap-3.5 p-[18px]">
          <div className="flex items-start justify-between gap-3">
            <div className="grid min-w-0">
              <span className={cn("text-[15.5px] font-semibold leading-normal", LONG_TEXT)}>
                {stepTitle(row.step)}
              </span>
              <span className={cn(SUB, LONG_TEXT)}>
                {order.title}، {faNumber(order.quantity)} عدد، {durationText(row.step)}
              </span>
              {row.step.reworkNote && (
                <span className={cn("text-[13px]", WARN_TEXT)}>برگشت خورد: {row.step.reworkNote}</span>
              )}
              {row.step.issue && (
                <span className={cn("text-[13px]", WARN_TEXT)}>مشکل گزارش شد: {row.step.issue}</span>
              )}
            </div>
            <Badge variant={row.lateBy > 0 ? "destructive" : "secondary"} className="flex-none">
              {dueText(row, today)}
            </Badge>
          </div>
          <Button
            type="button"
            size="lg"
            className="h-[50px] w-full"
            onClick={(event) => tick(event.timeStamp, order.id, row.step.id)}
          >
            <Check className="h-5 w-5" aria-hidden />
            انجام شد
          </Button>
          <div className="flex flex-wrap gap-x-[18px] gap-y-1.5">
            <button
              type="button"
              className={LINK_BUTTON}
              onClick={() => showToast("بعد از اتصال به سرور، نقشه‌ی همین کار این‌جا باز می‌شود.")}
            >
              دیدن نقشه
            </button>
            {row.step.issue ? (
              <button
                type="button"
                className={LINK_BUTTON}
                onClick={() => clearIssue(order.id, row.step.id)}
              >
                مشکل برطرف شد
              </button>
            ) : (
              <button
                type="button"
                className={LINK_BUTTON}
                onClick={() => setIssueFor({ orderId: order.id, stepId: row.step.id })}
              >
                مشکلی هست؟
              </button>
            )}
          </div>
        </Card>
      ))}
      {later.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-[13.5px] font-semibold text-muted-foreground">کارهای بعدی</h2>
          <ul className="grid gap-1.5 text-sm text-muted-foreground">
            {later.map(({ order, row }) => (
              <li key={row.step.id}>
                {stepTitle(row.step)}، {order.title}
              </li>
            ))}
          </ul>
        </section>
      )}

      {issueFor && (
        <IssueSheet
          onSend={(issue) => {
            reportIssue(issueFor.orderId, issueFor.stepId, issue);
            setIssueFor(null);
          }}
          onClose={() => setIssueFor(null)}
        />
      )}
    </>
  );
}

export function MyDoneView() {
  const { done } = useMyTasks();
  return (
    <>
      <h1 className="text-xl font-bold">انجام‌شده</h1>
      {done.length ? (
        <Card className="divide-y overflow-hidden">
          {done.map(({ order, row }) => (
            <div key={row.step.id} className="flex items-start justify-between gap-3 px-4 py-3.5">
              <div className="grid min-w-0">
                <span className={cn("text-[15.5px] font-semibold leading-normal", LONG_TEXT)}>
                  {stepTitle(row.step)}
                </span>
                <span className={cn(SUB, LONG_TEXT)}>
                  {[order.title, row.step.doneOn && shortDate(row.step.doneOn)].filter(Boolean).join("، ")}
                </span>
              </div>
              {row.lateBy > 0 ? (
                <Badge variant="destructive" className="flex-none">
                  {faNumber(row.lateBy)} روز دیرتر
                </Badge>
              ) : (
                <Badge variant="success" className="flex-none">
                  به‌موقع
                </Badge>
              )}
            </div>
          ))}
        </Card>
      ) : (
        <p className="rounded-2xl border border-dashed border-input p-6 text-center text-sm text-muted-foreground">
          هنوز کاری انجام نداده‌اید.
        </p>
      )}
    </>
  );
}
