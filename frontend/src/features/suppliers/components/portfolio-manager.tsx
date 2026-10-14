"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteFile } from "@/features/files/api";
import { errorMessage } from "@/lib/api-client";
import { uploadFile } from "@/lib/upload";
import { faNumber } from "@/lib/utils";
import { portfolioImageSrc } from "../api";
import type { MySupplier } from "../types";

const MAX_IMAGES = 12;
const MAX_SIZE_MB = 5;
const EXTENSIONS = ["png", "jpg", "jpeg", "webp"];

/** گالری نمونه‌کار: هر تصویر بلافاصله بارگذاری و در پروفایل عمومی نمایش داده می‌شود. */
export function PortfolioManager({ supplier }: { supplier: MySupplier }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const images = supplier.portfolio ?? [];
  const [uploading, setUploading] = useState<{ name: string; progress: number } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const full = images.length >= MAX_IMAGES;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["suppliers"] });

  async function handleFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    let room = MAX_IMAGES - images.length;
    for (const file of Array.from(list)) {
      if (room <= 0) {
        setError(`حداکثر ${faNumber(MAX_IMAGES)} تصویر می‌توانید داشته باشید.`);
        break;
      }
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!EXTENSIONS.includes(ext)) {
        setError(`«${file.name}» تصویر JPG، PNG یا WEBP نیست.`);
        continue;
      }
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        setError(`«${file.name}» بزرگ‌تر از ${faNumber(MAX_SIZE_MB)} مگابایت است.`);
        continue;
      }
      setUploading({ name: file.name, progress: 0 });
      try {
        await uploadFile(file, "portfolio_image", (progress) =>
          setUploading({ name: file.name, progress }),
        ).promise;
        room -= 1;
        await refresh();
      } catch (err) {
        setError(errorMessage(err, "بارگذاری تصویر انجام نشد. دوباره تلاش کنید."));
        break;
      }
    }
    setUploading(null);
  }

  async function handleRemove(id: string) {
    setError(null);
    setRemoving(id);
    try {
      await deleteFile(id);
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "حذف تصویر انجام نشد."));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>۲. گالری نمونه‌کار (اختیاری)</CardTitle>
        <CardDescription>
          عکس قطعه‌هایی که ساخته‌اید یا کارگاهتان را اضافه کنید؛ کارفرماها آن‌ها را در پروفایل عمومی
          شما می‌بینند. تا {faNumber(MAX_IMAGES)} تصویر، هر کدام حداکثر {faNumber(MAX_SIZE_MB)}{" "}
          مگابایت.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {supplier.canEdit && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={full || uploading !== null}
              className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-input text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ImagePlus className="h-6 w-6" aria-hidden />
              <span className="px-2 text-center text-xs font-medium">
                {uploading
                  ? `در حال بارگذاری ${faNumber(Math.round(uploading.progress * 100))}٪`
                  : full
                    ? "گالری پر است"
                    : "افزودن عکس"}
              </span>
            </button>
          )}
          {images.map((image, index) => (
            <div key={image.id} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={portfolioImageSrc(image.url)}
                alt={`نمونه‌کار ${faNumber(index + 1)}`}
                loading="lazy"
                className="aspect-square w-full rounded-xl border object-cover"
              />
              {supplier.canEdit && (
                <button
                  type="button"
                  onClick={() => handleRemove(image.id)}
                  disabled={removing !== null}
                  aria-label={`حذف تصویر ${faNumber(index + 1)}`}
                  className="absolute left-1.5 top-1.5 rounded-full bg-black/60 p-1.5 text-white transition-opacity hover:bg-destructive disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </div>
          ))}
        </div>
        {images.length === 0 && !supplier.canEdit && (
          <p className="text-sm text-muted-foreground">هنوز تصویری اضافه نشده است.</p>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={EXTENSIONS.map((ext) => `.${ext}`).join(",")}
          className="hidden"
          aria-label="انتخاب عکس نمونه‌کار"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
