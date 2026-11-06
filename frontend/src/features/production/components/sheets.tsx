"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { faDigits } from "@/lib/jalali";
import { normalizeDigits } from "@/lib/money";
import { cn, faNumber } from "@/lib/utils";
import { setCalendar, useCalendar, useWorkers } from "../api";
import { CUSTOM_GADGET, GADGETS, stepTitle } from "../gadgets";
import { WEEK, unitLabel } from "../format";
import { MAX_HOURS_PER_DAY, clampAmount, isValidMobile, maxAmount, toggleOffDay } from "../rules";
import type { Step, StepPlan, Worker, WorkerTask } from "../types";
import { Chip, RADIO_ROW, Stepper, SUB, WARN_TEXT, LINK_BUTTON } from "./parts";

/**
 * پنجره‌ی پایین صفحه در گوشی و وسط صفحه در دسکتاپ. با نمایش باز و با حذف بسته می‌شود،
 * پس محتوایش هر بار از نو شروع می‌شود.
 */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  // بستن پیش از حذف از صفحه، تا تمرکز صفحه‌کلید به همان دکمه‌ای برگردد که پنجره را باز کرد
  useLayoutEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      // رویداد close دیرتر می‌رسد؛ اگر پنجره دوباره باز شده باشد (StrictMode) نباید بسته شود
      onClose={() => {
        if (!ref.current?.open) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="mx-0 mb-0 mt-auto max-h-[86dvh] w-full max-w-full overflow-auto rounded-t-3xl bg-card text-card-foreground shadow-xl backdrop:bg-black/40 sm:m-auto sm:w-[calc(100%-2rem)] sm:max-w-md sm:rounded-3xl"
    >
      <div className="grid gap-4 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[17px] font-bold">{title}</h2>
          <Button type="button" variant="ghost" size="icon" aria-label="بستن" onClick={onClose}>
            <X className="h-5 w-5" aria-hidden />
          </Button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

/** تمرکز را بعد از باز شدن پنجره روی این فیلد می‌گذارد */
function useFocusOnOpen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}

/** نام، مسئول و زمان یک فرایند؛ مشترک بین نوع کار، سفارش جدید و سفارش در حال اجرا */
export function StepFields({
  step,
  onPatch,
}: {
  step: Step;
  onPatch: (patch: Partial<Step>) => void;
}) {
  const workers = useWorkers();
  const nameRef = useFocusOnOpen<HTMLInputElement>();
  return (
    <>
      {step.gadget === CUSTOM_GADGET && (
        <div className="grid gap-1">
          <Label htmlFor="step-name">نام فرایند</Label>
          <Input
            id="step-name"
            ref={nameRef}
            maxLength={60}
            value={step.name}
            onChange={(event) => onPatch({ name: event.target.value })}
          />
        </div>
      )}
      <div className="grid gap-1">
        <Label htmlFor="step-assignee">مسئول</Label>
        <Select
          id="step-assignee"
          value={step.assigneeId ?? ""}
          onChange={(event) => onPatch({ assigneeId: event.target.value || null })}
        >
          <option value="">انتخاب کنید</option>
          {workers.map((worker) => (
            <option key={worker.id} value={worker.id}>
              {worker.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-1">
        <span className="text-sm font-medium">زمان این فرایند</span>
        <div className="flex flex-wrap items-center gap-2.5">
          <Stepper
            value={step.amount}
            unit={unitLabel(step)}
            min={1}
            max={maxAmount(step.unit)}
            onChange={(amount) => onPatch({ amount })}
          />
          <span role="group" aria-label="واحد زمان" className="inline-flex rounded-full bg-muted p-[3px]">
            {(
              [
                ["day", "روز"],
                ["hour", "ساعت"],
              ] as const
            ).map(([unit, label]) => (
              <button
                key={unit}
                type="button"
                aria-pressed={step.unit === unit}
                onClick={() => onPatch({ unit, amount: clampAmount(step.amount, unit) })}
                className="h-9 rounded-full px-[18px] text-sm text-muted-foreground aria-pressed:bg-card aria-pressed:font-semibold aria-pressed:text-primary-deep aria-pressed:shadow-sm"
              >
                {label}
              </button>
            ))}
          </span>
        </div>
      </div>
    </>
  );
}

/** ویرایش یک کارت پیش از شروع تولید */
export function EditStepSheet({
  step,
  onPatch,
  onRemove,
  onClose,
}: {
  step: Step;
  onPatch: (patch: Partial<Step>) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet title={stepTitle(step)} onClose={onClose}>
      <StepFields step={step} onPatch={onPatch} />
      <Button type="button" className="w-full" onClick={onClose}>
        تأیید
      </Button>
      <button type="button" className={cn(LINK_BUTTON, "text-destructive")} onClick={onRemove}>
        حذف این فرایند
      </button>
    </Sheet>
  );
}

const TILE =
  "flex min-h-[50px] items-center gap-2 rounded-xl border bg-card px-2.5 py-1.5 text-start text-[13.5px] leading-snug transition-colors hover:border-ring hover:bg-accent/40";

export function LibrarySheet({
  onAdd,
  onAddCustom,
  onClose,
}: {
  onAdd: (gadgetKey: string) => void;
  onAddCustom: () => void;
  onClose: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [added, setAdded] = useState<readonly string[]>([]);
  return (
    <Sheet title="افزودن فرایند" onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        {GADGETS.filter((gadget) => showAll || gadget.common).map((gadget) => {
          const Icon = gadget.icon;
          const isAdded = added.includes(gadget.key);
          return (
            <button
              key={gadget.key}
              type="button"
              className={cn(TILE, isAdded && "border-primary bg-secondary")}
              onClick={() => {
                onAdd(gadget.key);
                setAdded((list) => [...list, gadget.key]);
              }}
            >
              <Icon className="h-[18px] w-[18px] flex-none text-primary-deep" aria-hidden />
              <span>{gadget.name}</span>
              {isAdded && <Check className="ms-auto h-4 w-4 flex-none text-primary" aria-label="اضافه شد" />}
            </button>
          );
        })}
        <button type="button" className={cn(TILE, "border-dashed")} onClick={onAddCustom}>
          <Plus className="h-[18px] w-[18px] flex-none text-primary-deep" aria-hidden />
          <span>فرایند دلخواه</span>
        </button>
      </div>
      {!showAll && (
        <button type="button" className={LINK_BUTTON} onClick={() => setShowAll(true)}>
          نمایش همه‌ی فرایندها
        </button>
      )}
      <Button type="button" className="w-full" onClick={onClose}>
        تمام
      </Button>
    </Sheet>
  );
}

export function ReworkSheet({
  doneRows,
  onConfirm,
  onClose,
}: {
  doneRows: StepPlan[];
  onConfirm: (stepId: string, note: string) => void;
  onClose: () => void;
}) {
  const [target, setTarget] = useState(doneRows[doneRows.length - 1]?.step.id ?? "");
  const [note, setNote] = useState("");
  const [showError, setShowError] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  function submit() {
    const reason = note.trim();
    if (!reason) {
      setShowError(true);
      noteRef.current?.focus();
      return;
    }
    onConfirm(target, reason);
  }

  return (
    <Sheet title="برگشت به فرایند قبل" onClose={onClose}>
      <div role="radiogroup" aria-label="کدام فرایند؟" className="grid gap-2.5">
        {doneRows.map((row) => (
          <label key={row.step.id} className={RADIO_ROW}>
            <input
              type="radio"
              name="rework-target"
              checked={target === row.step.id}
              onChange={() => setTarget(row.step.id)}
            />
            <span>{stepTitle(row.step)}</span>
          </label>
        ))}
      </div>
      <div className="grid gap-1">
        <Label htmlFor="rework-note">چرا برمی‌گردد؟</Label>
        <Textarea
          id="rework-note"
          ref={noteRef}
          maxLength={200}
          value={note}
          placeholder="مثلاً قطر قطعه خارج از تلرانس است"
          onChange={(event) => setNote(event.target.value)}
          aria-invalid={showError && !note.trim()}
        />
      </div>
      {showError && !note.trim() && (
        <p role="alert" className="text-[13px] text-destructive">
          دلیل را بنویسید تا مسئول بداند چه چیزی باید درست شود.
        </p>
      )}
      <Button type="button" className="w-full" onClick={submit}>
        برگرداندن
      </Button>
    </Sheet>
  );
}

const ISSUE_REASONS = ["دستگاه خراب است", "مواد نرسیده است", "نقشه مشخص نیست", "مشکل دیگر"];

export function IssueSheet({
  onSend,
  onClose,
}: {
  onSend: (issue: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState(ISSUE_REASONS[0]);
  const [note, setNote] = useState("");
  return (
    <Sheet title="چه مشکلی هست؟" onClose={onClose}>
      <div role="radiogroup" aria-label="نوع مشکل" className="grid gap-2.5">
        {ISSUE_REASONS.map((item) => (
          <label key={item} className={RADIO_ROW}>
            <input
              type="radio"
              name="issue-reason"
              checked={reason === item}
              onChange={() => setReason(item)}
            />
            <span>{item}</span>
          </label>
        ))}
      </div>
      <div className="grid gap-1">
        <Label htmlFor="issue-note">توضیح (اختیاری)</Label>
        <Input
          id="issue-note"
          maxLength={200}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <Button
        type="button"
        className="w-full"
        onClick={() => onSend(note.trim() ? `${reason}: ${note.trim()}` : reason)}
      >
        خبر دادن به مدیرعامل
      </Button>
    </Sheet>
  );
}

export function JobTypeNameSheet({
  initialName = "",
  onSave,
  onClose,
}: {
  initialName?: string;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const inputRef = useFocusOnOpen<HTMLInputElement>();
  const isNew = !initialName;
  return (
    <Sheet title={isNew ? "نوع کار جدید" : "تغییر نام"} onClose={onClose}>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) onSave(name.trim());
        }}
      >
        <div className="grid gap-1">
          <Label htmlFor="job-type-name">نام نوع کار</Label>
          <Input
            id="job-type-name"
            ref={inputRef}
            maxLength={40}
            value={name}
            placeholder="مثلاً قالب‌سازی"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={!name.trim()}>
          {isNew ? "ساختن" : "تأیید"}
        </Button>
      </form>
    </Sheet>
  );
}

export function CalendarSheet({ onClose }: { onClose: () => void }) {
  const calendar = useCalendar();
  return (
    <Sheet title="روزهای کاری شرکت" onClose={onClose}>
      <p className={SUB}>روزهای خاموش در حساب زمان فرایندها شمرده نمی‌شوند. هر شرکت تقویم خودش را دارد.</p>
      <div className="flex flex-wrap gap-2">
        {WEEK.map(([day, name]) => (
          <Chip
            key={day}
            pressed={!calendar.offWeekdays.includes(day)}
            onClick={() => setCalendar(toggleOffDay(calendar, day))}
          >
            {name}
          </Chip>
        ))}
      </div>
      <div className="grid justify-items-start gap-1">
        <span className="text-sm font-medium">ساعت کار در روز</span>
        <Stepper
          value={calendar.hoursPerDay}
          unit="ساعت"
          min={1}
          max={MAX_HOURS_PER_DAY}
          onChange={(hoursPerDay) => setCalendar({ ...calendar, hoursPerDay })}
        />
      </div>
      <Button type="button" className="w-full" onClick={onClose}>
        تأیید
      </Button>
    </Sheet>
  );
}

export function WorkerSheet({
  onSave,
  onClose,
}: {
  onSave: (name: string, mobile: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const inputRef = useFocusOnOpen<HTMLInputElement>();
  const taken = useWorkers().some((worker) => worker.mobile === mobile);
  const ready = Boolean(name.trim()) && isValidMobile(mobile) && !taken;
  return (
    <Sheet title="افزودن کارگر" onClose={onClose}>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) onSave(name.trim(), mobile);
        }}
      >
        <div className="grid gap-1">
          <Label htmlFor="worker-name">نام و نام خانوادگی</Label>
          <Input
            id="worker-name"
            ref={inputRef}
            maxLength={60}
            value={name}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="worker-mobile">شماره موبایل</Label>
          <Input
            id="worker-mobile"
            inputMode="numeric"
            autoComplete="off"
            placeholder="۰۹۱۲۳۴۵۶۷۸۹"
            value={faDigits(mobile)}
            onChange={(event) =>
              setMobile(normalizeDigits(event.target.value).replace(/\D/g, "").slice(0, 11))
            }
          />
          {taken ? (
            <p role="alert" className="text-[13px] text-destructive">
              این شماره قبلاً ثبت شده است.
            </p>
          ) : (
            <p className={SUB}>با همین شماره و کد پیامکی وارد می‌شود.</p>
          )}
        </div>
        <Button type="submit" className="w-full" disabled={!ready}>
          ساختن حساب
        </Button>
      </form>
    </Sheet>
  );
}

export function WorkerTasksSheet({
  worker,
  now,
  later,
  onClose,
}: {
  worker: Worker;
  now: WorkerTask[];
  later: WorkerTask[];
  onClose: () => void;
}) {
  const item = ({ order, row: task }: WorkerTask) => (
    <li key={task.step.id}>
      {stepTitle(task.step)}، {order.title}
      {task.lateBy > 0 && (
        <span className={cn("font-semibold", WARN_TEXT)}>، {faNumber(task.lateBy)} روز دیر</span>
      )}
    </li>
  );
  return (
    <Sheet title={worker.name} onClose={onClose}>
      {now.length ? (
        <div className="grid gap-2.5">
          <h3 className="text-[13.5px] font-semibold text-muted-foreground">کار فعلی</h3>
          <ul className="grid gap-1.5 text-sm text-muted-foreground">{now.map(item)}</ul>
        </div>
      ) : (
        <p className={SUB}>الان کار فعالی ندارد.</p>
      )}
      {later.length > 0 && (
        <div className="grid gap-2.5">
          <h3 className="text-[13.5px] font-semibold text-muted-foreground">کارهای بعدی</h3>
          <ul className="grid gap-1.5 text-sm text-muted-foreground">{later.map(item)}</ul>
        </div>
      )}
    </Sheet>
  );
}
