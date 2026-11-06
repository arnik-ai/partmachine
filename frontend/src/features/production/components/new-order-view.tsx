"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { faDigits } from "@/lib/jalali";
import { normalizeDigits } from "@/lib/money";
import { cn, faNumber } from "@/lib/utils";
import { startOrder, useCalendar, useJobTypes, useOrderEntries, useToday } from "../api";
import { shortDate } from "../format";
import { cloneSteps } from "../gadgets";
import { MAX_DAYS, addDays, daysBetween, forecastFromToday } from "../rules";
import type { ProductionOrder, Step } from "../types";
import { BackLink, Chip, LONG_TEXT, Notice, Stepper, SUB } from "./parts";
import { ProcessEditor } from "./process-cards";

type Draft = {
  step: 1 | 2;
  title: string;
  customer: string;
  /** ارقام لاتین */
  quantity: string;
  deliverDays: number;
  /** نوع کار انتخاب‌شده؛ رشته‌ی خالی یعنی «شروع از خالی»، null یعنی هنوز انتخاب نشده */
  typeId: string | null;
  steps: Step[];
};

const BAR =
  "sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] flex items-center justify-between gap-3 rounded-2xl border bg-card/95 px-3.5 py-3 shadow-soft backdrop-blur lg:bottom-3";

/** چرا هنوز نمی‌شود تولید را شروع کرد؛ اگر مانعی نیست null */
function startProblem(draft: Draft): string | null {
  if (draft.typeId === null) return "نوع کار را انتخاب کنید.";
  if (draft.steps.length === 0) return "فرایندی اضافه کنید.";
  if (draft.steps.some((step) => !step.name.trim())) return "نام فرایند دلخواه را بنویسید.";
  if (draft.steps.some((step) => !step.assigneeId)) return "مسئول همه‌ی فرایندها را انتخاب کنید.";
  return null;
}

function NewOrderForm({ order }: { order: ProductionOrder | null }) {
  const router = useRouter();
  const today = useToday();
  const calendar = useCalendar();
  const jobTypes = useJobTypes();
  const [draft, setDraft] = useState<Draft>(() =>
    order
      ? {
          step: 2,
          title: order.title,
          customer: order.customer,
          quantity: String(order.quantity),
          deliverDays: daysBetween(today, order.deliverOn),
          typeId: null,
          steps: [],
        }
      : { step: 1, title: "", customer: "", quantity: "100", deliverDays: 10, typeId: null, steps: [] },
  );
  const patch = (change: Partial<Draft>) => setDraft((current) => ({ ...current, ...change }));

  const deliverOn = addDays(today, draft.deliverDays);
  const quantity = Number(draft.quantity);

  if (draft.step === 1) {
    const ready = Boolean(draft.title.trim() && draft.customer.trim()) && quantity > 0;
    return (
      <>
        <BackLink href="/production">تابلو</BackLink>
        <h1 className="text-xl font-bold">سفارش جدید</h1>
        <form
          className="grid gap-[22px]"
          onSubmit={(event) => {
            event.preventDefault();
            if (ready) patch({ step: 2 });
          }}
        >
          <div className="grid gap-1">
            <Label htmlFor="order-title">نام قطعه</Label>
            <Input
              id="order-title"
              maxLength={100}
              placeholder="مثلاً فلنج اتصال لوله"
              value={draft.title}
              onChange={(event) => patch({ title: event.target.value })}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="order-customer">مشتری</Label>
            <Input
              id="order-customer"
              maxLength={100}
              value={draft.customer}
              onChange={(event) => patch({ customer: event.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label htmlFor="order-quantity">تعداد</Label>
              <Input
                id="order-quantity"
                inputMode="numeric"
                value={faDigits(draft.quantity)}
                onChange={(event) =>
                  patch({ quantity: normalizeDigits(event.target.value).replace(/\D/g, "").slice(0, 7) })
                }
              />
            </div>
            <div className="grid gap-1">
              <span className="text-sm font-medium">چند روز تا موعد تحویل</span>
              <span className="flex flex-wrap items-center gap-2.5">
                <Stepper
                  value={draft.deliverDays}
                  unit="روز"
                  min={1}
                  max={MAX_DAYS}
                  onChange={(deliverDays) => patch({ deliverDays })}
                />
                <span className={SUB}>{shortDate(deliverOn)}</span>
              </span>
            </div>
          </div>
          <div className={BAR}>
            <span className={SUB}>قدم ۱ از ۲</span>
            <Button type="submit" disabled={!ready}>
              بعدی
            </Button>
          </div>
        </form>
      </>
    );
  }

  const problem = startProblem(draft);
  const forecast = draft.steps.length
    ? forecastFromToday(draft.steps, today, deliverOn, calendar)
    : null;

  return (
    <>
      {order ? (
        <BackLink href="/production">تابلو</BackLink>
      ) : (
        <button
          type="button"
          onClick={() => patch({ step: 1 })}
          className="inline-flex items-center gap-1.5 justify-self-start text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="h-4 w-4" aria-hidden />
          قدم قبل
        </button>
      )}
      <div>
        <h1 className="text-xl font-bold">فرایندهای ساخت</h1>
        <p className={cn(SUB, LONG_TEXT)}>
          {draft.title}، {faNumber(quantity)} عدد، تحویل {shortDate(deliverOn)}
        </p>
      </div>
      <div className="grid gap-2.5">
        <h2 className="text-[13.5px] font-semibold text-muted-foreground">این سفارش چه نوع کاری است؟</h2>
        <div className="flex flex-wrap gap-2">
          {jobTypes.map((type) => (
            <Chip
              key={type.id}
              pressed={draft.typeId === type.id}
              onClick={() => patch({ typeId: type.id, steps: cloneSteps(type.steps) })}
            >
              {type.name}
            </Chip>
          ))}
          <Chip pressed={draft.typeId === ""} onClick={() => patch({ typeId: "", steps: [] })}>
            شروع از خالی
          </Chip>
        </div>
      </div>
      {draft.typeId !== null && (
        <div className="grid min-w-0 gap-2.5">
          <p className={SUB}>زمان ساخت هر قطعه فرق دارد: روی هر کارت بزنید و زمان را برای همین قطعه تعیین کنید.</p>
          <ProcessEditor steps={draft.steps} onChange={(steps) => patch({ steps })} />
          {forecast && forecast.overBy > 0 && (
            <Notice tone="risk" icon={TriangleAlert}>
              این برنامه {faNumber(forecast.overBy)} روز کاری از موعد تحویل بیشتر است.
            </Notice>
          )}
        </div>
      )}
      <div className={BAR}>
        <span className={cn(SUB, "min-w-0")}>
          {problem ??
            (forecast &&
              `پایان کار ${shortDate(forecast.finishOn)}، موعد تحویل ${shortDate(deliverOn)}`)}
        </span>
        <Button
          type="button"
          disabled={problem !== null}
          onClick={() => {
            const id = startOrder({
              orderId: order?.id ?? null,
              title: draft.title.trim(),
              customer: draft.customer.trim(),
              quantity,
              deliverOn,
              steps: draft.steps,
            });
            router.push(`/production/order?id=${id}`);
          }}
        >
          شروع تولید
        </Button>
      </div>
    </>
  );
}

export function NewOrderView() {
  const orderId = useSearchParams().get("order");
  const entries = useOrderEntries();
  const order = entries.find((entry) => entry.order.id === orderId)?.order ?? null;
  return <NewOrderForm key={orderId ?? "new"} order={order} />;
}
