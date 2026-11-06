"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { GripVertical, Plus } from "lucide-react";
import { cn, faNumber } from "@/lib/utils";
import { newStep, useWorkerName } from "../api";
import { CUSTOM_GADGET, createStep, gadgetIcon, stepTitle } from "../gadgets";
import { durationText } from "../format";
import { moveItem, previewIndex } from "../rules";
import type { Step } from "../types";
import { EditStepSheet, LibrarySheet } from "./sheets";
import { LONG_TEXT, SUB, WARN_TEXT } from "./parts";

/** لمس از بدنه‌ی کارت: بعد از این مدت نگه داشتن کشیدن شروع می‌شود تا اسکرول صفحه خراب نشود */
const HOLD_MS = 240;
const HOLD_TOLERANCE_PX = 8;
const MOUSE_THRESHOLD_PX = 6;
const CARD_MIN_HEIGHT = "min-h-[138px]";

type Slot = { x: number; y: number; width: number; height: number };

type Press = {
  pointerId: number;
  card: HTMLElement;
  startX: number;
  startY: number;
  needsHold: boolean;
  active: boolean;
  items: HTMLElement[];
  slots: Slot[];
  from: number;
  to: number;
};

/**
 * کارت‌های فرایند با کشیدن و رها کردن.
 * موس: از هر جای کارت. لمس: از دستگیره فوری، از بقیه‌ی کارت با کمی نگه داشتن.
 * ترتیب در DOM حین کشیدن عوض نمی‌شود؛ کارت‌ها فقط با transform جابه‌جا دیده می‌شوند
 * و هنگام رها کردن ترتیب ثبت می‌شود.
 */
export function ProcessCards({
  steps,
  onOpen,
  onMove,
  onAdd,
}: {
  steps: Step[];
  onOpen: (stepId: string) => void;
  onMove: (from: number, to: number) => void;
  onAdd: () => void;
}) {
  const workerName = useWorkerName();
  const listRef = useRef<HTMLOListElement>(null);
  const pressRef = useRef<Press | null>(null);
  const justDragged = useRef(false);
  const [preview, setPreview] = useState<{ from: number; to: number } | null>(null);

  // این شنونده باید از پیش از لمس وجود داشته باشد و passive نباشد، وگرنه مرورگر صفحه را اسکرول می‌کند
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const block = (event: TouchEvent) => {
      if (pressRef.current?.active) event.preventDefault();
    };
    list.addEventListener("touchmove", block, { passive: false });
    return () => list.removeEventListener("touchmove", block);
  }, []);

  function beginDrag(press: Press) {
    const list = listRef.current;
    if (!list) return;
    press.items = Array.from(list.querySelectorAll<HTMLElement>("[data-card]"));
    press.from = press.to = press.items.indexOf(press.card);
    press.slots = press.items.map((item) => {
      const rect = item.getBoundingClientRect();
      return { x: rect.left, y: rect.top + window.scrollY, width: rect.width, height: rect.height };
    });
    press.active = true;
    press.card.style.zIndex = "5";
    press.card.style.transition = "none";
    press.card.style.transform = "scale(1.03)";
    document.body.classList.add("select-none");
    try {
      press.card.setPointerCapture(press.pointerId);
    } catch {
      // اشاره‌گر همان لحظه رها شده؛ pointerup خودش کار را تمام می‌کند
    }
    navigator.vibrate?.(10);
    setPreview({ from: press.from, to: press.to });
  }

  function dragTo(press: Press, event: PointerEvent, dx: number, dy: number) {
    if (event.clientY < 70) window.scrollBy(0, -12);
    else if (event.clientY > window.innerHeight - 90) window.scrollBy(0, 12);

    press.card.style.transform = `translate(${dx}px,${dy}px) scale(1.03)`;
    const pointerX = event.clientX;
    const pointerY = event.clientY + window.scrollY;
    let best = press.to;
    let bestDistance = Infinity;
    press.slots.forEach((slot, index) => {
      const distance =
        (slot.x + slot.width / 2 - pointerX) ** 2 + (slot.y + slot.height / 2 - pointerY) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    if (best === press.to) return;
    press.to = best;
    press.items.forEach((item, index) => {
      if (item === press.card) return;
      const target = press.slots[previewIndex(index, press.from, best)];
      const tx = target.x - press.slots[index].x;
      const ty = target.y - press.slots[index].y;
      item.style.transform = tx || ty ? `translate(${tx}px,${ty}px)` : "";
    });
    setPreview({ from: press.from, to: best });
  }

  function endDrag(press: Press, commit: boolean) {
    document.body.classList.remove("select-none");
    press.items.forEach((item) => {
      item.style.transition = "none";
      item.style.transform = "";
      item.style.zIndex = "";
    });
    justDragged.current = true;
    window.setTimeout(() => {
      justDragged.current = false;
    }, 0);
    flushSync(() => {
      setPreview(null);
      if (commit && press.from !== press.to) onMove(press.from, press.to);
    });
    // پیش از برگرداندن انیمیشن، مرورگر باید جای تازه را حساب کند تا کارت‌ها نپرند
    void listRef.current?.offsetHeight;
    press.items.forEach((item) => {
      item.style.transition = "";
    });
  }

  function handlePointerDown(event: React.PointerEvent<HTMLLIElement>) {
    if (event.button > 0 || pressRef.current) return;
    const press: Press = {
      pointerId: event.pointerId,
      card: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY + window.scrollY,
      needsHold: event.pointerType !== "mouse" && !(event.target as Element).closest("[data-grip]"),
      active: false,
      items: [],
      slots: [],
      from: 0,
      to: 0,
    };
    pressRef.current = press;

    const holdTimer = press.needsHold
      ? window.setTimeout(() => {
          if (pressRef.current === press && !press.active) beginDrag(press);
        }, HOLD_MS)
      : undefined;

    const stopListening = () => {
      window.clearTimeout(holdTimer);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerEnd);
      document.removeEventListener("pointercancel", onPointerEnd);
      pressRef.current = null;
    };

    function onPointerMove(moveEvent: PointerEvent) {
      if (moveEvent.pointerId !== press.pointerId) return;
      const dx = moveEvent.clientX - press.startX;
      const dy = moveEvent.clientY + window.scrollY - press.startY;
      if (!press.active) {
        const distance = Math.hypot(dx, dy);
        if (press.needsHold) {
          // انگشت قبل از پایان نگه داشتن حرکت کرد: کاربر می‌خواهد صفحه را اسکرول کند
          if (distance > HOLD_TOLERANCE_PX) stopListening();
          return;
        }
        if (distance < MOUSE_THRESHOLD_PX) return;
        beginDrag(press);
      }
      dragTo(press, moveEvent, dx, dy);
    }

    function onPointerEnd(endEvent: PointerEvent) {
      if (endEvent.pointerId !== press.pointerId) return;
      stopListening();
      if (press.active) endDrag(press, endEvent.type === "pointerup");
    }

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerEnd);
    document.addEventListener("pointercancel", onPointerEnd);
  }

  /** صفحه‌کلید: کلید جهت راست یعنی کارت قبلی، چون ترتیب از راست شروع می‌شود */
  function handleKeyDown(event: React.KeyboardEvent, index: number, stepId: string) {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const target = index + (event.key === "ArrowUp" || event.key === "ArrowRight" ? -1 : 1);
    if (target < 0 || target >= steps.length) return;
    flushSync(() => onMove(index, target));
    listRef.current?.querySelector<HTMLElement>(`[data-card="${stepId}"] button`)?.focus();
  }

  return (
    <ol ref={listRef} className="grid grid-cols-2 gap-2.5 min-[560px]:grid-cols-3">
      {steps.map((step, index) => {
        const Icon = gadgetIcon(step.gadget);
        const shown = preview ? previewIndex(index, preview.from, preview.to) : index;
        const dragging = preview?.from === index;
        const person = workerName(step.assigneeId);
        return (
          <li
            key={step.id}
            data-card={step.id}
            onPointerDown={handlePointerDown}
            onContextMenu={(event) => event.preventDefault()}
            className="relative grid min-w-0 select-none transition-transform duration-200 [-webkit-touch-callout:none] motion-reduce:transition-none"
          >
            <button
              type="button"
              onClick={() => {
                if (!justDragged.current) onOpen(step.id);
              }}
              onKeyDown={(event) => handleKeyDown(event, index, step.id)}
              aria-label={`${stepTitle(step)}، فرایند ${faNumber(index + 1)}. برای تعیین مسئول و زمان بزنید. برای جابه‌جایی بکشید یا از کلیدهای جهت استفاده کنید.`}
              className={cn(
                "group relative grid w-full touch-manipulation content-start justify-items-center gap-1 rounded-2xl border bg-card px-2.5 pb-3 pt-3.5 text-center shadow-soft hover:border-ring",
                CARD_MIN_HEIGHT,
                dragging ? "cursor-grabbing border-primary shadow-xl" : "cursor-grab",
              )}
            >
              <span className="absolute start-3 top-2.5 text-[13px] font-semibold text-muted-foreground">
                {faNumber(shown + 1)}
              </span>
              <span
                data-grip
                className="absolute end-1 top-1 grid h-9 w-9 touch-none place-items-center text-input group-hover:text-muted-foreground"
              >
                <GripVertical className="h-4 w-4" aria-hidden />
              </span>
              <span className="grid h-[46px] w-[46px] flex-none place-items-center rounded-[14px] bg-secondary text-primary-deep">
                <Icon className="h-[22px] w-[22px]" aria-hidden />
              </span>
              <span className={cn("font-semibold leading-snug", LONG_TEXT)}>{stepTitle(step)}</span>
              <span className={cn(SUB, LONG_TEXT)}>
                {person || <span className={cn("font-semibold", WARN_TEXT)}>مسئول انتخاب نشده</span>}
                <br />
                {durationText(step)}
              </span>
            </button>
          </li>
        );
      })}
      <li className="grid min-w-0">
        <button
          type="button"
          onClick={onAdd}
          className={cn(
            "grid w-full content-center justify-items-center gap-1.5 rounded-2xl border-[1.5px] border-dashed border-ring text-[14.5px] font-medium text-primary-deep hover:bg-secondary",
            CARD_MIN_HEIGHT,
          )}
        >
          <Plus className="h-6 w-6" aria-hidden />
          افزودن فرایند
        </button>
      </li>
    </ol>
  );
}

/** کارت‌ها همراه با پنجره‌های افزودن و ویرایش؛ هم در «نوع فرایند» و هم در سفارش جدید */
export function ProcessEditor({
  steps,
  onChange,
}: {
  steps: Step[];
  onChange: (steps: Step[]) => void;
}) {
  const [sheet, setSheet] = useState<{ kind: "library" } | { kind: "step"; id: string } | null>(null);
  const editing = sheet?.kind === "step" ? steps.find((step) => step.id === sheet.id) : undefined;
  const close = () => setSheet(null);

  return (
    <>
      <ProcessCards
        steps={steps}
        onOpen={(id) => setSheet({ kind: "step", id })}
        onMove={(from, to) => onChange(moveItem(steps, from, to))}
        onAdd={() => setSheet({ kind: "library" })}
      />
      {sheet?.kind === "library" && (
        <LibrarySheet
          onAdd={(key) => onChange([...steps, newStep(key)])}
          onAddCustom={() => {
            const custom = createStep(CUSTOM_GADGET);
            onChange([...steps, custom]);
            setSheet({ kind: "step", id: custom.id });
          }}
          onClose={close}
        />
      )}
      {editing && (
        <EditStepSheet
          step={editing}
          onPatch={(patch) =>
            onChange(steps.map((step) => (step.id === editing.id ? { ...step, ...patch } : step)))
          }
          onRemove={() => {
            onChange(steps.filter((step) => step.id !== editing.id));
            close();
          }}
          onClose={close}
        />
      )}
    </>
  );
}
