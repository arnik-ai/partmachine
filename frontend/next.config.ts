import type { NextConfig } from "next";

// در CI گیت‌هاب با NEXT_OUTPUT=export خروجی استاتیک برای GitHub Pages ساخته می‌شود
const isStaticExport = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: isStaticExport ? "export" : "standalone",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  images: isStaticExport ? { unoptimized: true } : undefined,
};

export default nextConfig;
