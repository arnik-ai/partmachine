import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { RegisterForm } from "@/features/auth/components/register-form";

export const metadata: Metadata = {
  title: "ثبت‌نام",
};

export default function RegisterPage() {
  return (
    // لینک دعوت (?invite=) در مرورگر خوانده می‌شود
    <Suspense fallback={<Skeleton className="h-96 w-full max-w-md" />}>
      <RegisterForm />
    </Suspense>
  );
}
