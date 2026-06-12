"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGalleryStore } from "../gallery-store";

const MAX_IMAGES = 12;
const MAX_DIMENSION = 1000;

/** کوچک‌سازی تصویر با canvas تا حجم localStorage منطقی بماند */
async function resizeToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(
    1,
    MAX_DIMENSION / Math.max(bitmap.width, bitmap.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas context unavailable");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}

/**
 * گالری محصولات قطعه‌ساز — مانند دیوار:
 * افزودن چند عکس، حذف هر عکس، پیش‌نمایش شبکه‌ای.
 */
export function ProductGallery({ className }: { className?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { images, addImage, removeImage } = useGalleryStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    setBusy(true);
    try {
      for (const file of Array.from(list)) {
        if (images.length >= MAX_IMAGES) {
          setError(`حداکثر ${MAX_IMAGES} عکس می‌توانید بارگذاری کنید.`);
          break;
        }
        if (!file.type.startsWith("image/")) continue;
        const dataUrl = await resizeToDataUrl(file);
        addImage({
          id: crypto.randomUUID(),
          dataUrl,
          title: file.name.replace(/\.[^.]+$/, ""),
        });
      }
    } catch {
      setError("خطا در پردازش تصویر. فرمت فایل را بررسی کنید.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {/* دکمه‌ی افزودن عکس */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy || images.length >= MAX_IMAGES}
          className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-input text-muted-foreground transition-colors hover:border-gold hover:bg-gold-soft/40 hover:text-gold disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ImagePlus className="h-6 w-6" />
          <span className="text-xs font-medium">
            {busy ? "در حال افزودن..." : "افزودن عکس"}
          </span>
        </button>

        {images.map((image) => (
          <div
            key={image.id}
            className="group relative aspect-square overflow-hidden rounded-xl border bg-muted"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.dataUrl}
              alt={image.title ?? "محصول"}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
            <button
              type="button"
              onClick={() => removeImage(image.id)}
              aria-label="حذف عکس"
              className="absolute left-2 top-2 rounded-full bg-black/55 p-1.5 text-white opacity-0 transition-opacity hover:bg-destructive group-hover:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            {image.title && (
              <div className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-4 text-xs text-white">
                {image.title}
              </div>
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        عکس‌ها به‌صورت خودکار فشرده می‌شوند · حداکثر {MAX_IMAGES} عکس · در نسخه‌ی
        نهایی روی فضای ابری امن ذخیره می‌شود.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
