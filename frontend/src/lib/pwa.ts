"use client";

import { BASE_PATH } from "./config";

/**
 * PWA: ثبت service worker و نگه داشتن رویداد «نصب اپ» مرورگر (Chrome و Edge در اندروید و ویندوز)
 * تا دکمه‌ی «نصب اپ» هر وقت کاربر خواست آن را نشان دهد. iOS این رویداد را ندارد؛ آن‌جا راهنمای
 * «Add to Home Screen» نمایش داده می‌شود.
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

/** یک‌بار در ریشه‌ی برنامه صدا زده می‌شود */
export function setupPwa(): void {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installed = true;
    notify();
  });
  if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
    navigator.serviceWorker
      .register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` })
      .catch(() => {
        // نبود service worker فقط حالت آفلاین را از کار می‌اندازد؛ سایت بی‌نقص کار می‌کند
      });
  }
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function canPromptInstall(): boolean {
  return deferredPrompt !== null;
}

export async function promptInstall(): Promise<boolean> {
  const event = deferredPrompt;
  if (!event) return false;
  deferredPrompt = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  notify();
  return outcome === "accepted";
}

/** اپ همین حالا به‌صورت نصب‌شده (تمام‌صفحه) باز است؟ */
export function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return installed || iosStandalone || window.matchMedia("(display-mode: standalone)").matches;
}

/** آیفون یا آیپد (iPadOS خودش را مک معرفی می‌کند) */
export function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}
