/**
 * آیکون‌های اپ (PWA، آیفون و favicon) از لوگوی فعلی: کارخانه‌ی سفید روی سورمه‌ای با نوار طلایی.
 * اجرا (یک‌بار، پس از تغییر طرح):  node scripts/generate-icons.mjs
 * خروجی در public/icons و src/app (icon.png و apple-icon.png) نوشته و commit می‌شود.
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const NAVY = "#2c406f";
const NAVY_DEEP = "#19264d";
const GOLD = "#b98918";

// مسیرهای آیکون Factory از lucide (viewBox 0 0 24 24)
const FACTORY = [
  "M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z",
  "M17 18h1",
  "M12 18h1",
  "M7 18h1",
];

/** rounded: گوشه‌ی گرد با پس‌زمینه‌ی شفاف بیرون آن؛ وگرنه تمام‌قاب (maskable و آیفون) */
function svg(size, rounded) {
  const glyph = FACTORY.map((d) => `<path d="${d}"/>`).join("");
  const radius = rounded ? size * 0.22 : 0;
  // محتوای اصلی داخل «ناحیه‌ی امن» دایره‌ی ۸۰٪ می‌ماند تا برش اندروید چیزی را نبرد
  const scale = (size * 0.5) / 24;
  const offsetX = size * 0.25;
  const offsetY = size * 0.2;
  const bar = { w: size * 0.24, h: size * 0.04, y: size * 0.77 };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${NAVY}"/><stop offset="1" stop-color="${NAVY_DEEP}"/>
    </linearGradient></defs>
    <rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>
    <g transform="translate(${offsetX} ${offsetY}) scale(${scale})" fill="none" stroke="#fff"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>
    <rect x="${(size - bar.w) / 2}" y="${bar.y}" width="${bar.w}" height="${bar.h}"
          rx="${bar.h / 2}" fill="${GOLD}"/>
  </svg>`;
}

const OUTPUTS = [
  { file: "public/icons/icon-192.png", size: 192, rounded: true },
  { file: "public/icons/icon-512.png", size: 512, rounded: true },
  { file: "public/icons/icon-maskable-512.png", size: 512, rounded: false },
  // آیفون گوشه‌ها را خودش گرد می‌کند؛ پس‌زمینه‌ی شفاف در iOS سیاه دیده می‌شود
  { file: "src/app/apple-icon.png", size: 180, rounded: false },
  { file: "src/app/icon.png", size: 64, rounded: true },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, size, rounded } of OUTPUTS) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg(size, rounded)}</body></html>`,
  );
  const target = join(root, file);
  await mkdir(dirname(target), { recursive: true });
  await page.locator("svg").screenshot({ path: target, omitBackground: true });
  console.log(`${file} (${size}x${size})`);
}
await browser.close();
