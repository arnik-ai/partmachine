import Link from "next/link";
import { TarashinoMark } from "@/components/brand/tarashino-mark";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10">
      <Link href="/" className="flex items-center gap-2 text-lg font-bold">
        <TarashinoMark className="h-8 w-8 text-white" />
        تراشینو
      </Link>
      {children}
    </div>
  );
}
