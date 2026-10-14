"use client";

import { useEffect } from "react";
import { restoreSession } from "../api";

/** یک‌بار هنگام باز شدن سایت، نشست قبلی کاربر را بی‌صدا بازیابی می‌کند. */
export function AuthBootstrap() {
  useEffect(() => {
    void restoreSession();
  }, []);
  return null;
}
