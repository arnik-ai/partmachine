"use client";

import { useEffect, useRef } from "react";
import { CITIES, IRAN_OUTLINE, ROUTES } from "./iran-map";

type Copy = { caption: string };

/**
 * نقشه‌ی شبکه: مرز ایران و مسیر نمونه‌ی سفارش‌ها (درخواست ← ساخت) با کمان‌های نورانی.
 * Canvas دوبعدی؛ فقط وقتی دیده می‌شود می‌چرخد. با «کاهش حرکت» مسیرها بی‌حرکت نمایش داده می‌شوند.
 */
export function NetworkMap({ copy, lang }: { copy: Copy; lang: "fa" | "en" }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!stage || !canvas || !ctx) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0;
    let H = 0;
    let proj = (lat: number, lon: number): [number, number] => [lon, lat];
    const resize = () => {
      const r = stage.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      W = r.width;
      H = r.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // تصویر هم‌مساحت ساده: طول جغرافیایی با کسینوس عرض میانه فشرده می‌شود
      const k = Math.cos((32 * Math.PI) / 180);
      const [lon0, lon1, lat0, lat1] = [44, 63.4, 25, 39.8];
      const s = Math.min((W * 0.9) / ((lon1 - lon0) * k), (H * 0.82) / (lat1 - lat0));
      const ox = (W - (lon1 - lon0) * k * s) / 2;
      const oy = (H - (lat1 - lat0) * s) / 2 - 12;
      proj = (lat, lon) => [ox + (lon - lon0) * k * s, oy + (lat1 - lat) * s];
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(stage);

    const arc = (a: string, b: string, t: number, color: string) => {
      const [x1, y1] = proj(CITIES[a].lat, CITIES[a].lon);
      const [x2, y2] = proj(CITIES[b].lat, CITIES[b].lon);
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2 - Math.hypot(x2 - x1, y2 - y1) * 0.35;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      let px = x1;
      let py = y1;
      const steps = Math.round(40 * Math.min(1, Math.max(0, t)));
      for (let i = 1; i <= steps; i++) {
        const u = i / 40;
        px = (1 - u) ** 2 * x1 + 2 * (1 - u) * u * mx + u * u * x2;
        py = (1 - u) ** 2 * y1 + 2 * (1 - u) * u * my + u * u * y2;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      if (t > 0 && t < 1) {
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    let route = 0;
    let rt = 0;
    let raf = 0;
    let last = 0;
    let visible = false;
    const draw = (now: number) => {
      raf = 0;
      if (!visible) return;
      const dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;
      ctx.clearRect(0, 0, W, H);
      ctx.beginPath();
      IRAN_OUTLINE.forEach(([lon, lat], i) => {
        const [x, y] = proj(lat, lon);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = "rgba(139, 92, 246, .07)";
      ctx.fill();
      ctx.strokeStyle = "rgba(196, 181, 253, .55)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      const [a, b] = ROUTES[route];
      for (const [key, city] of Object.entries(CITIES)) {
        const [x, y] = proj(city.lat, city.lon);
        const active = key === a || key === b;
        ctx.fillStyle = active ? "#f5a623" : "rgba(220, 215, 240, .7)";
        ctx.beginPath();
        ctx.arc(x, y, active ? 4.5 : 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = "12px Vazirmatn, Tahoma, sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = active ? "#fff" : "rgba(203, 198, 216, .75)";
        ctx.fillText(city[lang], x, y - 9);
      }
      rt = reduce ? 1.6 : rt + dt;
      arc(a, b, rt / 1.4, "#c4b5fd");
      if (captionRef.current) {
        captionRef.current.textContent = copy.caption
          .replace("{a}", CITIES[a][lang])
          .replace("{b}", CITIES[b][lang]);
      }
      if (!reduce && rt > 3.6) {
        rt = 0;
        route = (route + 1) % ROUTES.length;
      }
      raf = requestAnimationFrame(draw);
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      last = 0;
      if (visible && !raf) raf = requestAnimationFrame(draw);
    });
    io.observe(stage);
    return () => {
      io.disconnect();
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [copy.caption, lang]);

  return (
    <div className="net-stage" ref={stageRef}>
      <canvas ref={canvasRef} aria-hidden="true" />
      <p className="net-caption" ref={captionRef} aria-live="off" />
    </div>
  );
}
