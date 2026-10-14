export type ContractStatus = "draft" | "partially_signed" | "signed";

export interface ContractArticle {
  number: number;
  title: string;
  paragraphs: string[];
}

export interface ContractTerms {
  deliveryDue: string;
  prepaymentPercent: number;
  /** جریمه‌ی روزانه به صدم درصد: ۵۰ یعنی ۰٫۵٪ */
  penaltyPerDayBp: number;
  penaltyCapPercent: number;
}

export interface ContractSignature {
  side: "buyer" | "supplier";
  signerName: string;
  organizationName: string;
  signedAt: string;
}

export interface ContractVersionSummary {
  number: number;
  createdAt: string;
  createdByName?: string | null;
  changeNote: string;
  contentSha256: string;
  signatures: ContractSignature[];
}

export interface Contract {
  orderId: string;
  orderNumber: number;
  status: ContractStatus;
  version: number;
  terms: ContractTerms;
  articles: ContractArticle[];
  contentSha256: string;
  templateVersion: string;
  createdAt: string;
  signedAt?: string | null;
  signatures: ContractSignature[];
  history: ContractVersionSummary[];
  mySide: "buyer" | "supplier" | "admin";
  /** سفارش هنوز در مرحله‌ی قرارداد است (نه امضاشده، نه لغوشده) */
  isOpen: boolean;
  canEdit: boolean;
  canSign: boolean;
  canRequestChange: boolean;
  draftNotice: string;
}

export interface UpdateContractInput extends ContractTerms {
  changeNote: string;
}

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft: "در انتظار امضا",
  partially_signed: "امضای یک طرف ثبت شده",
  signed: "امضاشده و نافذ",
};
