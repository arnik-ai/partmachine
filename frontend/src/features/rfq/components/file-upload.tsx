"use client";

import { FileUploader, type UploadState } from "@/features/files/components/file-uploader";

export type { UploadState };

const EXTENSIONS = ["pdf", "step", "stp", "stl", "dwg", "dxf", "png", "jpg", "jpeg"] as const;
const MAX_SIZE_MB = 50;

/**
 * فایل‌های فنی RFQ (نقشه، CAD، PDF). `onChange` باید پایدار باشد (مثلاً setter یک useState).
 */
export function RfqFileUpload({ onChange }: { onChange: (state: UploadState) => void }) {
  return (
    <FileUploader
      purpose="rfq_attachment"
      extensions={EXTENSIONS}
      maxSizeMb={MAX_SIZE_MB}
      maxFiles={10}
      prompt="فایل نقشه، CAD یا PDF را اینجا رها کنید یا کلیک کنید"
      formatsHint={`PDF · STEP · STL · DWG · DXF · JPG/PNG — max ${MAX_SIZE_MB}MB`}
      inputLabel="انتخاب فایل‌های فنی"
      onChange={onChange}
    />
  );
}
