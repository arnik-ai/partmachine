"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { deleteFile } from "@/features/files/api";
import { errorMessage } from "@/lib/api-client";
import { uploadFile } from "@/lib/upload";
import { faNumber } from "@/lib/utils";
import type { MySupplier } from "../types";
import { SupplierAvatar } from "./supplier-avatar";

const MAX_SIZE_MB = 2;
const EXTENSIONS = ["png", "jpg", "jpeg", "webp"];

/** عکس پروفایل شرکت: یک عکس؛ عکس تازه جای قبلی را می‌گیرد. فقط مدیر شرکت آن را عوض می‌کند. */
export function LogoUploader({ supplier }: { supplier: MySupplier }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logo = supplier.logo ?? null;
  const busy = progress !== null || removing;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["suppliers"] });

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!EXTENSIONS.includes(ext)) {
      setError("عکس باید JPG، PNG یا WEBP باشد.");
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`حجم عکس باید حداکثر ${faNumber(MAX_SIZE_MB)} مگابایت باشد.`);
      return;
    }
    setProgress(0);
    try {
      await uploadFile(file, "logo", setProgress).promise;
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "بارگذاری عکس انجام نشد. دوباره تلاش کنید."));
    } finally {
      setProgress(null);
    }
  }

  async function handleRemove() {
    if (!logo) return;
    setError(null);
    setRemoving(true);
    try {
      await deleteFile(logo.id);
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "حذف عکس انجام نشد."));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <SupplierAvatar name={supplier.companyName} logoUrl={logo?.url} size="lg" />
        {supplier.canEdit && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            aria-label={logo ? "تغییر عکس پروفایل" : "افزودن عکس پروفایل"}
            className="absolute -bottom-1 -start-1 grid h-8 w-8 place-items-center rounded-full bg-gold text-white shadow ring-2 ring-card transition-opacity disabled:opacity-50"
          >
            <Camera className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium">عکس پروفایل</span>
        <span className="text-xs text-muted-foreground">
          {progress !== null
            ? `در حال بارگذاری ${faNumber(Math.round(progress * 100))}٪`
            : `لوگو یا عکس شرکت (JPG، PNG یا WEBP تا ${faNumber(MAX_SIZE_MB)} مگابایت)؛ در فهرست قطعه‌سازان، پروفایل و پیشنهادهای شما دیده می‌شود.`}
        </span>
        {supplier.canEdit && logo && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy}
            className="w-fit text-xs text-destructive hover:underline disabled:opacity-50"
          >
            حذف عکس
          </button>
        )}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={EXTENSIONS.map((ext) => `.${ext}`).join(",")}
        className="hidden"
        aria-label="انتخاب عکس پروفایل"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
