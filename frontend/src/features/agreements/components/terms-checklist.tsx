"use client";

import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Term } from "../terms";

/**
 * چک‌لیست قوانین — تا وقتی همه‌ی بندها تیک نخورد،
 * دکمه‌ی ادامه در فرم والد غیرفعال می‌ماند.
 */
export function TermsChecklist({
  terms,
  accepted,
  onChange,
  title,
  className,
}: {
  terms: Term[];
  accepted: Record<string, boolean>;
  onChange: (accepted: Record<string, boolean>) => void;
  title?: string;
  className?: string;
}) {
  const allChecked = terms.every((t) => accepted[t.id]);

  function toggle(id: string, checked: boolean) {
    onChange({ ...accepted, [id]: checked });
  }

  function toggleAll(checked: boolean) {
    onChange(
      Object.fromEntries(terms.map((t) => [t.id, checked])),
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-muted/40 p-4",
        className,
      )}
    >
      {title && <h4 className="text-sm font-semibold">{title}</h4>}

      <div className="flex flex-col gap-2.5">
        {terms.map((term) => (
          <label
            key={term.id}
            className="flex cursor-pointer items-start gap-2.5 text-sm leading-relaxed"
          >
            <input
              type="checkbox"
              checked={accepted[term.id] ?? false}
              onChange={(e) => toggle(term.id, e.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-primary"
            />
            <span>
              {term.critical && (
                <span className="ml-1 inline-flex translate-y-0.5 items-center gap-0.5 rounded bg-gold-soft px-1.5 py-0.5 text-[11px] font-bold text-gold">
                  <ShieldAlert className="h-3 w-3" />
                  مهم
                </span>
              )}{" "}
              {term.text}
            </span>
          </label>
        ))}
      </div>

      <label className="flex cursor-pointer items-center gap-2.5 border-t pt-3 text-sm font-medium">
        <input
          type="checkbox"
          checked={allChecked}
          onChange={(e) => toggleAll(e.target.checked)}
          className="h-4 w-4 cursor-pointer accent-primary"
        />
        همه‌ی موارد بالا را خواندم و می‌پذیرم
      </label>
    </div>
  );
}

export function allTermsAccepted(
  terms: Term[],
  accepted: Record<string, boolean>,
): boolean {
  return terms.every((t) => accepted[t.id]);
}
