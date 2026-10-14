"use client";

import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgreement } from "../api";
import { TermsChecklist } from "./terms-checklist";

/**
 * متن نسخه‌دار یک توافق را از سرور می‌گیرد و چک‌لیست آن را نشان می‌دهد.
 * فرم والد با همان `useAgreement(key)` (از cache) نسخه را برای ارسال برمی‌دارد.
 */
export function AgreementChecklist({
  agreementKey,
  accepted,
  onChange,
  className,
}: {
  agreementKey: string;
  accepted: Record<string, boolean>;
  onChange: (accepted: Record<string, boolean>) => void;
  className?: string;
}) {
  const { data, isLoading, isError, error, refetch } = useAgreement(agreementKey);

  if (isLoading) return <Skeleton className="h-28" />;
  if (isError || !data) {
    return (
      <ErrorState
        error={error}
        onRetry={() => refetch()}
        title="متن قوانین بارگذاری نشد"
      />
    );
  }
  return (
    <TermsChecklist
      title={data.title}
      terms={data.items}
      accepted={accepted}
      onChange={onChange}
      className={className}
    />
  );
}
