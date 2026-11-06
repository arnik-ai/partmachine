"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  CircleCheck,
  Plus,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn, faNumber } from "@/lib/utils";
import {
  clearIssue,
  newStep,
  reworkOrder,
  setOrderSteps,
  tickOrderStep,
  useOrderEntries,
  useToday,
  useWorkerName,
} from "../api";
import { durationText, planMessage, relativeDay, shortDate } from "../format";
import { CUSTOM_GADGET, createStep, stepTitle } from "../gadgets";
import { moveItem } from "../rules";
import type { OrderEntry, Step, StepPlan } from "../types";
import { BackLink, LINK_BUTTON, LONG_TEXT, Notice, STATUS_FILL, SUB, WARN_TEXT } from "./parts";
import { LibrarySheet, ReworkSheet, Sheet, StepFields } from "./sheets";

type OpenSheet =
  | { kind: "library" }
  | { kind: "rework" }
  | { kind: "step"; id: string }
  | null;

function TimelineRow({
  row,
  entry,
  isLast,
  onOpen,
}: {
  row: StepPlan;
  entry: OrderEntry;
  isLast: boolean;
  onOpen: () => void;
}) {
  const workerName = useWorkerName();
  const today = useToday();
  const { step, state, lateBy } = row;
  const person = workerName(step.assigneeId);
  const connector = !isLast && (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute -bottom-3 start-[31px] top-11 w-0.5",
        state === "done" ? "bg-primary" : "bg-border",
      )}
    />
  );
  const rowClass =
    "grid w-full grid-cols-[2rem_minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-3 text-start";

  if (state === "done") {
    return (
      <li className="relative">
        {connector}
        <div className={rowClass}>
          <span className="relative z-[1] grid h-8 w-8 place-items-center rounded-full bg-primary text-white">
            <Check className="h-4 w-4" aria-hidden />
          </span>
          <span className="grid min-w-0">
            <span className={cn("font-semibold", LONG_TEXT)}>{stepTitle(step)}</span>
            <span className={SUB}>
              {[person, step.doneOn && shortDate(step.doneOn)].filter(Boolean).join("، ")}
            </span>
          </span>
          {lateBy > 0 ? <Badge variant="destructive">{faNumber(lateBy)} روز دیرتر</Badge> : <span />}
          <span />
        </div>
      </li>
    );
  }

  const isCurrent = state === "current";
  const detail = !isCurrent
    ? durationText(step)
    : lateBy > 0
      ? `مهلت ${shortDate(row.dueOn)}`
      : `مهلت ${relativeDay(today, row.dueOn)}`;
  const markColor =
    entry.plan.status === "risk"
      ? "text-sky-950"
      : entry.plan.status === "late" || entry.plan.status === "ok"
        ? "text-white"
        : "";
  return (
    <li className="relative">
      {connector}
      <button
        type="button"
        onClick={onOpen}
        className={cn(rowClass, "transition-colors hover:bg-accent/40")}
      >
        <span
          className={cn(
            "relative z-[1] grid h-8 w-8 place-items-center rounded-full text-[13px] font-semibold",
            isCurrent ? cn(STATUS_FILL[entry.plan.status], markColor) : "bg-muted text-muted-foreground",
          )}
        >
          {faNumber(row.index + 1)}
        </span>
        <span className="grid min-w-0">
          <span className={cn(isCurrent ? "font-semibold" : "font-medium", LONG_TEXT)}>{stepTitle(step)}</span>
          <span className={SUB}>
            {person || "بدون مسئول"}، {detail}
          </span>
          {step.reworkNote && (
            <span className={cn("text-[13px]", WARN_TEXT)}>برگشت خورد: {step.reworkNote}</span>
          )}
          {step.issue && <span className={cn("text-[13px]", WARN_TEXT)}>مشکل: {step.issue}</span>}
        </span>
        {isCurrent && lateBy > 0 ? (
          <Badge variant="destructive">{faNumber(lateBy)} روز دیر</Badge>
        ) : (
          <span />
        )}
        <ChevronLeft className="h-[18px] w-[18px] text-input" aria-hidden />
      </button>
    </li>
  );
}

/** پنجره‌ی یک فرایند در سفارش در حال اجرا */
function OrderStepSheet({
  entry,
  row,
  onRework,
  onClose,
}: {
  entry: OrderEntry;
  row: StepPlan;
  onRework: () => void;
  onClose: () => void;
}) {
  const { order, plan } = entry;
  const steps = order.steps ?? [];
  const { step, index, state } = row;
  const firstMovable = (plan.current?.index ?? -1) + 1;

  const patch = (change: Partial<Step>) =>
    setOrderSteps(
      order.id,
      steps.map((item) => (item.id === step.id ? { ...item, ...change } : item)),
    );

  return (
    <Sheet title={stepTitle(step)} onClose={onClose}>
      <StepFields step={step} onPatch={patch} />
      {state === "current" ? (
        <>
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              tickOrderStep(order.id, step.id);
              onClose();
            }}
          >
            <Check className="h-4 w-4" aria-hidden />
            این فرایند انجام شد
          </Button>
          {index > 0 && (
            <button type="button" className={LINK_BUTTON} onClick={onRework}>
              برگشت به فرایند قبل
            </button>
          )}
          {step.issue && (
            <button
              type="button"
              className={LINK_BUTTON}
              onClick={() => {
                clearIssue(order.id, step.id);
                onClose();
              }}
            >
              مشکل برطرف شد
            </button>
          )}
        </>
      ) : (
        <>
          <Button type="button" className="w-full" onClick={onClose}>
            تأیید
          </Button>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              type="button"
              variant="ghost"
              disabled={index <= firstMovable}
              onClick={() => setOrderSteps(order.id, moveItem(steps, index, index - 1))}
            >
              <ChevronUp className="h-4 w-4" aria-hidden />
              بالاتر
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={index >= steps.length - 1}
              onClick={() => setOrderSteps(order.id, moveItem(steps, index, index + 1))}
            >
              <ChevronDown className="h-4 w-4" aria-hidden />
              پایین‌تر
            </Button>
          </div>
          <button
            type="button"
            className={cn(LINK_BUTTON, "text-destructive")}
            onClick={() => {
              setOrderSteps(
                order.id,
                steps.filter((item) => item.id !== step.id),
              );
              onClose();
            }}
          >
            حذف این فرایند
          </button>
        </>
      )}
    </Sheet>
  );
}

function OrderDetail({ entry }: { entry: OrderEntry }) {
  const { order, plan } = entry;
  const today = useToday();
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const close = () => setSheet(null);
  const steps = order.steps ?? [];
  const message = planMessage(plan);
  const openRow =
    sheet?.kind === "step" ? plan.rows.find((row) => row.step.id === sheet.id) : undefined;
  const doneRows = plan.rows.filter((row) => row.state === "done");

  return (
    <>
      <BackLink href="/production">تابلو</BackLink>
      <div>
        <h1 className={cn("text-xl font-bold", LONG_TEXT)}>{order.title}</h1>
        <p className={cn(SUB, LONG_TEXT)}>
          {order.customer}، {faNumber(order.quantity)} عدد، تحویل {shortDate(order.deliverOn)} (
          {relativeDay(today, order.deliverOn)})
        </p>
      </div>
      {message && (
        <Notice tone={plan.status === "late" ? "late" : "risk"} icon={TriangleAlert}>
          {message}
        </Notice>
      )}
      {plan.status === "done" && (
        <Notice tone="done" icon={CircleCheck}>
          همه‌ی فرایندها تمام شد و سفارش آماده‌ی ارسال است.
        </Notice>
      )}
      <Card className="overflow-hidden">
        <ol className="py-1">
          {plan.rows.map((row, position) => (
            <TimelineRow
              key={row.step.id}
              row={row}
              entry={entry}
              isLast={position === plan.rows.length - 1}
              onOpen={() => setSheet({ kind: "step", id: row.step.id })}
            />
          ))}
        </ol>
        {plan.status !== "done" && (
          <button
            type="button"
            onClick={() => setSheet({ kind: "library" })}
            className="flex w-full items-center gap-2 border-t px-4 py-3 text-start text-sm text-primary-deep transition-colors hover:bg-accent/40"
          >
            <Plus className="h-4 w-4" aria-hidden />
            افزودن فرایند
          </button>
        )}
      </Card>

      {sheet?.kind === "library" && (
        <LibrarySheet
          onAdd={(key) => setOrderSteps(order.id, [...steps, newStep(key)])}
          onAddCustom={() => {
            const custom = createStep(CUSTOM_GADGET);
            setOrderSteps(order.id, [...steps, custom]);
            setSheet({ kind: "step", id: custom.id });
          }}
          onClose={close}
        />
      )}
      {openRow && (
        <OrderStepSheet
          entry={entry}
          row={openRow}
          onRework={() => setSheet({ kind: "rework" })}
          onClose={close}
        />
      )}
      {sheet?.kind === "rework" && (
        <ReworkSheet
          doneRows={doneRows}
          onConfirm={(stepId, note) => {
            reworkOrder(order.id, stepId, note);
            close();
          }}
          onClose={close}
        />
      )}
    </>
  );
}

export function OrderView() {
  const id = useSearchParams().get("id");
  const entry = useOrderEntries().find((item) => item.order.id === id);

  if (!entry) {
    return (
      <>
        <BackLink href="/production">تابلو</BackLink>
        <p className="rounded-2xl border border-dashed border-input p-6 text-center text-sm text-muted-foreground">
          این سفارش پیدا نشد.
        </p>
      </>
    );
  }
  if (entry.plan.status === "waiting") {
    return (
      <>
        <BackLink href="/production">تابلو</BackLink>
        <h1 className="text-xl font-bold">{entry.order.title}</h1>
        <p className={SUB}>هنوز برنامه‌ی ساخت ندارد.</p>
        <Link
          href={`/production/new?order=${entry.order.id}`}
          className={cn(buttonVariants(), "justify-self-start")}
        >
          برنامه‌ریزی این سفارش
        </Link>
      </>
    );
  }
  return <OrderDetail entry={entry} />;
}
