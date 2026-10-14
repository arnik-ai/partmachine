"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

/**
 * پنجره‌ی مودال روی عنصر بومی <dialog>: مرورگر تمرکز صفحه‌کلید و کلید Esc را خودش مدیریت می‌کند.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={title}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/50"
    >
      {open && (
        <div className="flex flex-col gap-4 p-6">
          <h2 className="text-lg font-bold">{title}</h2>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** تأیید یک اقدام مهم (انتخاب برنده، لغو، پس‌گرفتن) با توضیح پیامد آن */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  pending = false,
  destructive = false,
  error,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  pending?: boolean;
  destructive?: boolean;
  error?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {description && <div className="text-sm text-muted-foreground">{description}</div>}
      {children}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          انصراف
        </Button>
        <Button
          type="button"
          variant={destructive ? "destructive" : "default"}
          onClick={onConfirm}
          disabled={pending}
        >
          {pending ? "در حال انجام..." : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
