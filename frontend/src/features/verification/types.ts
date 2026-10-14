export type VerificationStatus = "pending" | "approved" | "rejected" | "revoked";

export interface VerificationFile {
  id: string;
  name: string;
  size: number;
  kind: "pdf" | "cad" | "drawing" | "image";
}

/** آخرین درخواست تأیید هویت، همان‌طور که خود قطعه‌ساز می‌بیند */
export interface Verification {
  id: string;
  status: VerificationStatus;
  note: string;
  createdAt: string;
  decidedAt?: string | null;
  /** دلیل رد یا توضیح کارشناس هنگام تأیید */
  decisionReason?: string | null;
  revokedAt?: string | null;
  revokeReason?: string | null;
  files: VerificationFile[];
}

export interface SubmitVerificationInput {
  fileIds: string[];
  note: string;
}

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  pending: "در حال بررسی",
  approved: "تأییدشده",
  rejected: "رد شده",
  revoked: "تأیید لغو شده",
};
