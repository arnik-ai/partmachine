"use client";

import { useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, faNumber } from "@/lib/utils";
import type { RfqFile } from "../types";

const ACCEPTED = ".pdf,.step,.stp,.stl,.dwg,.dxf,.png,.jpg,.jpeg";
const MAX_SIZE_MB = 50;

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

  function addFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    const next: RfqFile[] = [...files];
    for (const file of Array.from(list)) {
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        setError(`«${file.name}» بزرگ‌تر از ${faNumber(MAX_SIZE_MB)} مگابایت است.`);
        continue;
      }
      if (!next.some((f) => f.name === file.name)) {
        next.push({ name: file.name, size: file.size, kind: fileKind(file.name) });
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
              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <span className="inline-flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span dir="ltr">{file.name}</span>
              </span>
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                {faNumber(Math.round(file.size / 1024))} KB
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() =>
                    onChange(files.filter((f) => f.name !== file.name))
                  }
                  aria-label={`حذف ${file.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
