"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Select } from "@/components/ui/select";
import { daysUntil, localToday } from "@/lib/dates";
import {
  JALALI_MONTHS,
  faDigits,
  formatJalali,
  isoToJalali,
  jalaliMonthLength,
  jalaliToIso,
  type JalaliDate,
} from "@/lib/jalali";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";

type Part = "jd" | "jm" | "jy";
type Parts = Record<Part, number | null>;

const EMPTY: Parts = { jy: null, jm: null, jd: null };

const MISSING: Record<Part, string> = {
  jd: "روز را انتخاب کنید.",
  jm: "ماه را انتخاب کنید.",
  jy: "سال را انتخاب کنید.",
};

const partsOf = (iso: string): Parts => isoToJalali(iso) ?? EMPTY;

const complete = ({ jy, jm, jd }: Parts): JalaliDate | null =>
  jy !== null && jm !== null && jd !== null ? { jy, jm, jd } : null;

// برای مقایسه‌ی تاریخ‌های شمسی به ترتیب سال، ماه، روز
const order = (jy: number, jm: number, jd: number) => jy * 10_000 + jm * 100 + jd;

const range = (from: number, to: number) =>
  Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

function relative(iso: string): string | null {
  const days = daysUntil(iso);
  if (days === 0) return "امروز";
  if (days === 1) return "فردا";
  if (days === -1) return "دیروز";
  if (Math.abs(days) > 120) return null;
  return days > 0 ? `${faDigits(days)} روز دیگر` : `${faDigits(-days)} روز پیش`;
}

/**
 * انتخاب تاریخ با تقویم شمسی در سه فهرست روز، ماه و سال (روی گوشی همان چرخ انتخاب خود
 * سیستم). مقدار ورودی و خروجی همان تاریخ میلادی ISO (YYYY-MM-DD) است که API می‌خواهد؛
 * تاریخ ناقص ⇒ "". min و max مثل input تاریخ مرورگر کار می‌کنند: گزینه‌های بیرون بازه
 * غیرفعال‌اند و فرم با تاریخ ناقص یا بیرون بازه ارسال نمی‌شود (پیام فارسی روی همان فهرست).
 */
export function JalaliDateInput({
  id,
  label,
  hideLabel = false,
  value,
  onChange,
  min,
  max,
  required = false,
  disabled = false,
  name,
  summary = true,
  yearsBack = 3,
  yearsAhead = 5,
  className,
}: {
  id?: string;
  /** عنوان گروه؛ با hideLabel فقط برای صفحه‌خوان */
  label: string;
  hideLabel?: boolean;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  /** برای فرم‌هایی که با FormData خوانده می‌شوند */
  name?: string;
  /** نمایش روز هفته و فاصله تا امروز زیر فهرست‌ها */
  summary?: boolean;
  /** بازه‌ی سال‌ها وقتی min یا max داده نشده است */
  yearsBack?: number;
  yearsAhead?: number;
  className?: string;
}) {
  const autoId = useId();
  const baseId = id ?? autoId;
  // فهرست سال‌ها به امروزِ مرورگر بستگی دارد: پیش از hydration فقط مقدار فعلی نمایش داده
  // می‌شود و فهرست‌ها غیرفعال‌اند تا HTML سرور و مرورگر یکی بماند.
  const hydrated = useHydrated();
  const [draft, setDraft] = useState<Parts>(() => partsOf(value));
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    // مقدار از بیرون عوض شد (مثلاً باز شدن دوباره‌ی فرم)
    setSeen(value);
    setDraft(partsOf(value));
  }

  const dayRef = useRef<HTMLSelectElement>(null);
  const monthRef = useRef<HTMLSelectElement>(null);
  const yearRef = useRef<HTMLSelectElement>(null);

  const lo = min ? isoToJalali(min) : null;
  const hi = max ? isoToJalali(max) : null;
  const loOrder = lo ? order(lo.jy, lo.jm, lo.jd) : -Infinity;
  const hiOrder = hi ? order(hi.jy, hi.jm, hi.jd) : Infinity;
  const date = complete(draft);
  const iso = date ? jalaliToIso(date) : "";

  let problem: { part: Part; message: string } | null = null;
  const missing = (["jd", "jm", "jy"] as const).find((part) => draft[part] === null);
  if (missing && (required || draft.jd !== null || draft.jm !== null || draft.jy !== null)) {
    problem = { part: missing, message: MISSING[missing] };
  } else if (iso && min && iso < min) {
    problem = { part: "jd", message: `تاریخ باید از ${formatJalali(min)} به بعد باشد.` };
  } else if (iso && max && iso > max) {
    problem = { part: "jd", message: `تاریخ نباید بعد از ${formatJalali(max)} باشد.` };
  }

  const problemPart = problem?.part;
  const problemMessage = problem?.message ?? "";
  useEffect(() => {
    const selects = { jd: dayRef.current, jm: monthRef.current, jy: yearRef.current };
    for (const part of ["jd", "jm", "jy"] as const) {
      selects[part]?.setCustomValidity(part === problemPart ? problemMessage : "");
    }
  }, [problemPart, problemMessage]);

  function update(part: Part, raw: string) {
    const next: Parts = { ...draft, [part]: raw ? Number(raw) : null };
    if (next.jd !== null && next.jm !== null) {
      const longest = next.jy !== null ? jalaliMonthLength(next.jy, next.jm) : next.jm <= 6 ? 31 : 30;
      next.jd = Math.min(next.jd, longest);
    }
    const done = complete(next);
    const nextIso = done ? jalaliToIso(done) : "";
    setDraft(next);
    setSeen(nextIso);
    if (nextIso !== value) onChange(nextIso);
  }

  let years: number[];
  let months: number[];
  let days: number[];
  if (hydrated) {
    const thisYear = isoToJalali(localToday())?.jy ?? 1405;
    years = range(lo?.jy ?? thisYear - yearsBack, hi?.jy ?? thisYear + yearsAhead);
    if (draft.jy !== null && !years.includes(draft.jy)) {
      years = [...years, draft.jy].sort((a, b) => a - b);
    }
    months = range(1, 12);
    const longest =
      draft.jm === null
        ? 31
        : draft.jy !== null
          ? jalaliMonthLength(draft.jy, draft.jm)
          : draft.jm <= 6
            ? 31
            : 30;
    days = range(1, longest);
  } else {
    years = draft.jy !== null ? [draft.jy] : [];
    months = draft.jm !== null ? [draft.jm] : [];
    days = draft.jd !== null ? [draft.jd] : [];
  }

  const monthOff = (jm: number) =>
    hydrated &&
    draft.jy !== null &&
    (order(draft.jy, jm, 31) < loOrder || order(draft.jy, jm, 1) > hiOrder);
  const dayOff = (jd: number) =>
    hydrated &&
    draft.jy !== null &&
    draft.jm !== null &&
    (order(draft.jy, draft.jm, jd) < loOrder || order(draft.jy, draft.jm, jd) > hiOrder);

  const outOfRange = problem !== null && problem.part === "jd" && !missing;
  const when = iso ? relative(iso) : null;
  const hint =
    hydrated && iso && (summary || outOfRange)
      ? outOfRange
        ? problemMessage
        : [formatJalali(iso, { weekday: true }), when].filter(Boolean).join(" · ")
      : null;
  const hintId = `${baseId}-hint`;
  const selectClass = "pl-8 pr-2.5";

  return (
    <fieldset
      id={id}
      disabled={disabled || !hydrated}
      aria-describedby={hint ? hintId : undefined}
      className={cn("min-w-0", className)}
    >
      <legend className={cn("mb-2 text-sm font-medium leading-none", hideLabel && "sr-only")}>
        {label}
      </legend>
      <div className="grid grid-cols-[minmax(0,3.5fr)_minmax(0,6fr)_minmax(0,4.5fr)] gap-2">
        <Select
          ref={dayRef}
          id={`${baseId}-day`}
          aria-label="روز"
          aria-required={required || undefined}
          className={selectClass}
          value={draft.jd ?? ""}
          onChange={(e) => update("jd", e.target.value)}
        >
          <option value="">روز</option>
          {days.map((jd) => (
            <option key={jd} value={jd} disabled={dayOff(jd)}>
              {faDigits(jd)}
            </option>
          ))}
        </Select>
        <Select
          ref={monthRef}
          id={`${baseId}-month`}
          aria-label="ماه"
          aria-required={required || undefined}
          className={selectClass}
          value={draft.jm ?? ""}
          onChange={(e) => update("jm", e.target.value)}
        >
          <option value="">ماه</option>
          {months.map((jm) => (
            <option key={jm} value={jm} disabled={monthOff(jm)}>
              {JALALI_MONTHS[jm - 1]}
            </option>
          ))}
        </Select>
        <Select
          ref={yearRef}
          id={`${baseId}-year`}
          aria-label="سال"
          aria-required={required || undefined}
          className={selectClass}
          value={draft.jy ?? ""}
          onChange={(e) => update("jy", e.target.value)}
        >
          <option value="">سال</option>
          {years.map((jy) => (
            <option key={jy} value={jy}>
              {faDigits(jy)}
            </option>
          ))}
        </Select>
      </div>
      {name && <input type="hidden" name={name} value={iso} />}
      {hint && (
        <p
          id={hintId}
          className={cn("mt-1.5 text-xs", outOfRange ? "text-destructive" : "text-muted-foreground")}
        >
          {hint}
        </p>
      )}
    </fieldset>
  );
}
