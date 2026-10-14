"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileText, RotateCcw, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteFile } from "@/features/files/api";
import { errorMessage } from "@/lib/api-client";
import { DEMO_MODE } from "@/lib/config";
import { UploadAborted, uploadFile, type FilePurpose, type UploadedFile } from "@/lib/upload";
import { cn, faNumber } from "@/lib/utils";

type FileKind = UploadedFile["kind"];

const FILE_KIND_LABEL: Record<FileKind, string> = {
  pdf: "سند PDF",
  cad: "مدل سه‌بعدی CAD",
  drawing: "نقشه‌ی فنی",
  image: "تصویر",
};

function fileKind(name: string): FileKind {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (["step", "stp", "stl"].includes(ext)) return "cad";
  if (["dwg", "dxf"].includes(ext)) return "drawing";
  return "image";
}

export function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${faNumber(Math.round((bytes / 1024 / 1024) * 10) / 10)} مگابایت`
    : `${faNumber(Math.max(1, Math.round(bytes / 1024)))} کیلوبایت`;
}

interface UploadItem {
  key: string;
  name: string;
  size: number;
  kind: FileKind;
  previewUrl?: string;
  status: "uploading" | "done" | "error";
  progress: number;
  error?: string;
  fileId?: string;
}

export interface UploadState {
  fileIds: string[];
  busy: boolean;
  failed: boolean;
}

export interface FileUploaderProps {
  purpose: FilePurpose;
  /** پسوندهای مجاز، بدون نقطه */
  extensions: readonly string[];
  maxSizeMb: number;
  maxFiles?: number;
  /** متن داخل کادر رها کردن فایل */
  prompt: string;
  /** نوع‌ها و سقف حجم، کوتاه */
  formatsHint: string;
  /** برچسب دسترسی‌پذیر دکمه‌ی انتخاب فایل */
  inputLabel: string;
  /** باید پایدار باشد (مثلاً setter یک useState) */
  onChange: (state: UploadState) => void;
}

/**
 * انتخاب و بارگذاری فایل با نوار پیشرفت. هر فایل بلافاصله بارگذاری می‌شود و فرم فقط شناسه‌ها را
 * می‌فرستد؛ فایل ناموفق «تلاش دوباره» دارد و فایل حذف‌شده از سرور هم پاک می‌شود.
 */
export function FileUploader({
  purpose,
  extensions,
  maxSizeMb,
  maxFiles,
  prompt,
  formatsHint,
  inputLabel,
  onChange,
}: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const sources = useRef(new Map<string, File>());
  const aborts = useRef(new Map<string, () => void>());
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onChange({
      fileIds: items.flatMap((i) => (i.status === "done" && i.fileId ? [i.fileId] : [])),
      busy: items.some((i) => i.status === "uploading"),
      failed: items.some((i) => i.status === "error"),
    });
  }, [items, onChange]);

  function update(key: string, patch: Partial<UploadItem>) {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function start(key: string) {
    const file = sources.current.get(key);
    if (!file) return;
    update(key, { status: "uploading", progress: 0, error: undefined });
    if (DEMO_MODE) {
      // نسخه‌ی نمایشی: بدون سرور، فقط نمایش
      update(key, { status: "done", progress: 1, fileId: `demo-${key}` });
      return;
    }
    const handle = uploadFile(file, purpose, (progress) => update(key, { progress }));
    aborts.current.set(key, handle.abort);
    handle.promise
      .then((uploaded) => update(key, { status: "done", progress: 1, fileId: uploaded.id }))
      .catch((err: unknown) => {
        if (err instanceof UploadAborted) return;
        update(key, {
          status: "error",
          error: errorMessage(err, "بارگذاری انجام نشد. دوباره تلاش کنید."),
        });
      })
      .finally(() => aborts.current.delete(key));
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    const added: UploadItem[] = [];
    for (const file of Array.from(list)) {
      if (maxFiles !== undefined && items.length + added.length >= maxFiles) {
        setError(`حداکثر ${faNumber(maxFiles)} فایل می‌توانید اضافه کنید.`);
        break;
      }
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!extensions.includes(ext)) {
        setError(`نوع فایل «${file.name}» پذیرفته نمی‌شود.`);
        continue;
      }
      if (file.size > maxSizeMb * 1024 * 1024) {
        setError(`«${file.name}» بزرگ‌تر از ${faNumber(maxSizeMb)} مگابایت است.`);
        continue;
      }
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      if (sources.current.has(key)) continue;
      sources.current.set(key, file);
      added.push({
        key,
        name: file.name,
        size: file.size,
        kind: fileKind(file.name),
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
        status: "uploading",
        progress: 0,
      });
    }
    if (added.length === 0) return;
    setItems((prev) => [...prev, ...added]);
    for (const item of added) start(item.key);
  }

  function remove(item: UploadItem) {
    aborts.current.get(item.key)?.();
    if (item.status === "done" && item.fileId && !DEMO_MODE) {
      // فایل بارگذاری‌شده ولی پیوست‌نشده را از سرور هم پاک کن (خطا مهم نیست)
      void deleteFile(item.fileId).catch(() => undefined);
    }
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    sources.current.delete(item.key);
    setItems((prev) => prev.filter((i) => i.key !== item.key));
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
          dragOver ? "border-primary bg-accent" : "border-input hover:bg-muted/50",
        )}
      >
        <Upload className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm">{prompt}</p>
        <p className="text-xs text-muted-foreground" dir="ltr">
          {formatsHint}
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple={maxFiles !== 1}
          accept={extensions.map((ext) => `.${ext}`).join(",")}
          className="hidden"
          aria-label={inputLabel}
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => (
            <li key={item.key} className="flex flex-col gap-1.5 rounded-md border px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex min-w-0 items-center gap-2.5">
                  {item.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.previewUrl}
                      alt={item.name}
                      className="h-10 w-10 shrink-0 rounded-md border object-cover"
                    />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </span>
                  )}
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate" dir="ltr">
                      {item.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {FILE_KIND_LABEL[item.kind]} · {sizeLabel(item.size)}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {item.status === "done" && (
                    <CheckCircle2 className="h-4 w-4 text-success" aria-label="بارگذاری شد" />
                  )}
                  {item.status === "error" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => start(item.key)}
                      aria-label={`بارگذاری دوباره‌ی ${item.name}`}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => remove(item)}
                    aria-label={`حذف ${item.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </div>
              {item.status === "uploading" && (
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label={`بارگذاری ${item.name}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(item.progress * 100)}
                >
                  <div
                    className="h-full bg-primary transition-[width]"
                    style={{ width: `${Math.round(item.progress * 100)}%` }}
                  />
                </div>
              )}
              {item.status === "error" && (
                <p className="flex items-center gap-1.5 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {item.error}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
