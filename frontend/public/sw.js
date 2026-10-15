/*
 * service worker پارت‌ماشین — عمداً محدود (برنامه‌ی فاز ۴، گام 4a).
 *
 * - صفحه‌ها هرگز کش نمی‌شوند: همیشه از شبکه؛ فقط اگر شبکه نبود، صفحه‌ی «اتصال برقرار نیست».
 * - فقط فایل‌های ظاهری تغییرناپذیر (/_next/static/…، با نام هش‌دار) کش می‌شوند.
 * - درخواست‌های API (دامنه‌ی جدا)، دانلود فایل‌ها و هر چیز دیگری دست نمی‌خورد؛ پس هیچ داده‌ی
 *   خصوصی کاربر روی دستگاه ذخیره نمی‌شود.
 */
const VERSION = "pm-v1";
const STATIC_CACHE = `${VERSION}-static`;
const MAX_STATIC_ENTRIES = 300;
const SCOPE = self.registration.scope;
const OFFLINE_URL = new URL("offline.html", SCOPE).href;
const PRECACHE = [OFFLINE_URL, new URL("icons/icon-192.png", SCOPE).href];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function isImmutableAsset(url) {
  return url.origin === self.location.origin && url.pathname.includes("/_next/static/");
}

async function trim(cache) {
  const keys = await cache.keys();
  const extra = keys.length - MAX_STATIC_ENTRIES;
  for (let i = 0; i < extra; i++) await cache.delete(keys[i]);
}

async function staticAsset(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
    await trim(cache);
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // API، فونت و هر مبدأ دیگری: بدون دخالت
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) ?? Response.error()),
    );
    return;
  }
  if (isImmutableAsset(url)) event.respondWith(staticAsset(request));
});
