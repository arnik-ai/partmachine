"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buildDemoSession, isBackendDown, login } from "../api";
import { useAuthStore } from "../store";

export function LoginForm() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [error, setError] = useState<string | null>(null);
  const [demoNotice, setDemoNotice] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    try {
      const { user, tokens } = await login({ email, password });
      setSession(user, tokens);
      router.push("/dashboard");
    } catch (err) {
      if (isBackendDown(err)) {
        // بک‌اند هنوز بالا نیست — ورود با سشن دمو
        setDemoNotice(true);
        const demo = buildDemoSession({
          email,
          fullName: "کاربر دمو",
          role: "buyer",
        });
        setSession(demo.user, demo.tokens, true);
        router.push("/dashboard");
      } else {
        setError(err instanceof Error ? err.message : "خطا در ورود");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">ورود به پارت‌ماشین</CardTitle>
        <CardDescription>به بازار صنعتی قطعه‌سازی خوش آمدید</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">ایمیل</Label>
            <Input
              id="email"
              name="email"
              type="email"
              dir="ltr"
              required
              placeholder="you@company.com"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">رمز عبور</Label>
            <Input id="password" name="password" type="password" dir="ltr" required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {demoNotice && (
            <p className="text-sm text-warning">
              بک‌اند در دسترس نیست — ورود در حالت دمو انجام شد.
            </p>
          )}
          <Button type="submit" disabled={loading}>
            {loading ? "در حال ورود..." : "ورود"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            حساب ندارید؟{" "}
            <Link href="/register" className="text-primary hover:underline">
              ثبت‌نام کنید
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
