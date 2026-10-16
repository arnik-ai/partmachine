import Link from "next/link";
import { TarashinoMark } from "@/components/brand/tarashino-mark";
import { BackButton } from "@/components/layout/back-button";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10">
      <BackButton fallback="/" className="absolute start-4 top-[calc(1rem+env(safe-area-inset-top))]" />
      <Link href="/" className="flex items-center gap-2 text-lg font-bold">
        <TarashinoMark className="h-8 w-8 text-primary" />
        تراشینو
      </Link>
      {children}
    </div>
  );
}
