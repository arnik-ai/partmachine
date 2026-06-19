"use client";

import { useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, faNumber } from "@/lib/utils";
import type { RfqFile } from "../types";

const ACCEPTED = ".pdf,.step,.stp,.stl,.dwg,.dxf,.png,.jpg,.jpeg";
const MAX_SIZE_MB = 50;

const FILE_KIND_LABEL: Record<string, string> = {
  pdf: "سند PDF",
  cad: "مدل سه‌بعدی CAD",
  drawing: "نقشه‌ی فنی",
  image: "تصویر",
};

function fileKind(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (["step", "stp", "stl"].includes(ext)) return "cad";
  if (["dwg", "dxf"].includes(ext)) return "drawing";
  return "image";
}

export function RfqFileUpload({
  files,
  onChange,
}: {
  files: RfqFile[];
  onChange: (files: RfqFile[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** پیش‌نمایش تصویر را به‌صورت data URL می‌خواند (فقط برای فایل‌های تصویری) */
  function readPreview(file: File): Promise<string | undefined> {
    if (!file.type.startsWith("image/")) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(file);
    });
  }

  async function addFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    const next: RfqFile[] = [...files];
    for (const file of Array.from(list)) {
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        setError(`«${file.name}» بزرگ‌تر از ${faNumber(MAX_SIZE_MB)} مگابایت است.`);
        continue;
      }
      if (!next.some((f) => f.name === file.name)) {
        const previewUrl = await readPreview(file);
        next.push({
          name: file.name,
          size: file.size,
          kind: fileKind(file.name),
          previewUrl,
        });
      }
    }
    onChange(next);
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
        <p className="text-sm">
          فایل نقشه، CAD یا PDF را اینجا رها کنید یا کلیک کنید
        </p>
        <p className="text-xs text-muted-foreground" dir="ltr">
          PDF · STEP · STL · DWG · DXF · JPG/PNG — حداکثر {MAX_SIZE_MB}MB
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {files.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {files.map((file) => (
            <li
              key={file.name}
              className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <span className="inline-flex min-w-0 items-center gap-2.5">
                {file.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={file.previewUrl}
                    alt={file.name}
                    className="h-10 w-10 shrink-0 rounded-md border object-cover"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </span>
                )}
                <span className="flex min-w-0 flex-col">
                  <span className="truncate" dir="ltr">
                    {file.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {FILE_KIND_LABEL[file.kind] ?? "فایل"} ·{" "}
                    {faNumber(Math.round(file.size / 1024))} KB
                  </span>
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() =>
                  onChange(files.filter((f) => f.name !== file.name))
                }
                aria-label={`حذف ${file.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
