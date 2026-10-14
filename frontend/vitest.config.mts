import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // هر فایل تست ماژول‌های تازه می‌گیرد (وضعیت نشست بین فایل‌ها نشت نمی‌کند)
    isolate: true,
    unstubGlobals: true,
    unstubEnvs: true,
  },
});
