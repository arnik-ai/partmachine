import Link from "next/link";
import { Factory } from "lucide-react";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10">
      <Link href="/" className="flex items-center gap-2 text-lg font-bold">
        <Factory className="h-6 w-6 text-primary" />
        پارت‌ماشین
      </Link>
      {children}
    </div>
  );
}
