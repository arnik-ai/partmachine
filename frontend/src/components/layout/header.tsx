"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Factory, LogOut } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useAuthStore } from "@/features/auth/store";
import { roleLabel } from "@/lib/constants";

const NAV_LINKS = [
  { href: "/suppliers", label: "قطعه‌سازان" },
  { href: "/rfqs", label: "درخواست‌های من" },
] as const;

export function Header() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  // جلوگیری از mismatch هیدریشن (استور persist بعد از mount لود می‌شود)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-card/95 text-card-foreground backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <Factory className="h-6 w-6 text-primary" />
            پارت‌ماشین
          </Link>
          <nav className="hidden items-center gap-5 text-sm md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {mounted && user ? (
            <>
              <Link
                href="/dashboard"
                className="hidden text-sm sm:flex sm:flex-col sm:items-end"
              >
                <span className="font-medium">{user.fullName}</span>
                <span className="text-xs text-muted-foreground">
                  {roleLabel(user.role)}
                </span>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                aria-label="خروج"
                onClick={() => {
                  logout();
                  router.push("/");
                }}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className={buttonVariants({ variant: "ghost" })}
              >
                ورود
              </Link>
              <Link href="/register" className={buttonVariants()}>
                ثبت‌نام
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
