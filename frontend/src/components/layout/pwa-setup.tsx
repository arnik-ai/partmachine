"use client";

import { useEffect } from "react";
import { setupPwa } from "@/lib/pwa";

/** ثبت service worker و رویداد نصب، یک‌بار در ریشه‌ی برنامه */
export function PwaSetup() {
  useEffect(() => {
    setupPwa();
  }, []);
  return null;
}
