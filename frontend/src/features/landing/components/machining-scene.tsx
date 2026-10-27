"use client";

import { useEffect, useRef } from "react";

type Kind = "lathe" | "laser";
type Spark = { x: number; y: number; px: number; py: number; vx: number; vy: number; life: number; max: number };
type Scene = { cycle: number; still: number; draw: (w: number, h: number, t: number, dt: number) => void };

/**
 * صحنه‌های تولید روی بوم: تراش CNC (میله می‌چرخد، ابزار با نوک طلایی پله‌ها را می‌تراشد و جرقه می‌پاشد) و برش
 * لیزر لوگوی T از ورق. فقط وقتی دیده می‌شوند حرکت می‌کنند؛ با «کاهش حرکت» تصویر ثابت قطعه‌ی آماده.
 */
export function MachiningScene({ kind, label, caption }: { kind: Kind; label: string; caption: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const font = getComputedStyle(canvas).fontFamily;
    const scene = kind === "lathe" ? lathe(ctx, caption, font) : laser(ctx, caption, font);
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    let clock = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduce) scene.draw(w, h, scene.still, 0);
    };
    const loop = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      clock = (clock + dt) % scene.cycle;
      scene.draw(w, h, clock, dt);
      raf = requestAnimationFrame(loop);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    let io: IntersectionObserver | undefined;
    if (!reduce) {
      io = new IntersectionObserver(([entry]) => {
        cancelAnimationFrame(raf);
        last = 0;
        if (entry?.isIntersecting) raf = requestAnimationFrame(loop);
      });
      io.observe(canvas);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io?.disconnect();
    };
  }, [kind, caption]);

  return <canvas ref={ref} className="scene-canvas" data-kind={kind} role="img" aria-label={label} />;
}

function sparks(ctx: CanvasRenderingContext2D, gravity: number) {
  const list: Spark[] = [];
  return {
    emit(x: number, y: number, n: number, spread: (i: number) => [number, number]) {
      for (let i = 0; i < n; i++) {
        const [vx, vy] = spread(i);
        list.push({ x, y, px: x, py: y, vx, vy, life: 0, max: 0.3 + Math.random() * 0.65 });
      }
    },
    draw(dt: number) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = list.length - 1; i >= 0; i--) {
        const s = list[i]!;
        s.life += dt;
        if (s.life > s.max) {
          list.splice(i, 1);
          continue;
        }
        s.px = s.x;
        s.py = s.y;
        s.vy += gravity * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const k = s.life / s.max;
        ctx.strokeStyle = `rgba(255, ${Math.round(225 - 145 * k)}, ${Math.round(130 - 115 * k)}, ${1 - k})`;
        ctx.lineWidth = 1.6 * (1 - k) + 0.35;
        ctx.beginPath();
        ctx.moveTo(s.px, s.py);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}

function grid(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.strokeStyle = "rgba(167, 139, 250, .07)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < w; x += 28) ctx.rect(x, -1, 0, h + 2);
  for (let y = 0; y < h; y += 28) ctx.rect(-1, y, w + 2, 0);
  ctx.stroke();
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, inner: string, outer: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** درخشش گذرا روی شکلی که مسیرش را path می‌کشد */
function shine(ctx: CanvasRenderingContext2D, path: () => void, x: number, top: number, height: number) {
  ctx.save();
  path();
  ctx.clip();
  const g = ctx.createLinearGradient(x - 70, 0, x + 70, 0);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.5, "rgba(255,248,225,.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - 70, top, 140, height);
  ctx.restore();
}

// نیم‌رخ قطعه‌ی تراشیده: [شروع، پایان، شعاع شروع، شعاع پایان] به نسبت طول و شعاع میله‌ی خام
const PROFILE = [
  [0, 0.04, 0.55, 0.7], [0.04, 0.26, 0.7, 0.7], [0.26, 0.29, 0.7, 0.86], [0.29, 0.47, 0.86, 0.86],
  [0.47, 0.5, 0.86, 0.58], [0.5, 0.56, 0.58, 0.58], [0.56, 0.59, 0.58, 0.86], [0.59, 0.8, 0.86, 0.86],
  [0.8, 0.83, 0.86, 1], [0.83, 1, 1, 1],
] as const;
const DIMS = [[0.04, 0.26, "Ø28 h7"], [0.29, 0.47, "Ø34"], [0.5, 0.56, "Ø23"], [0.59, 0.8, "Ø34 ±0.02"]] as const;

function lathe(ctx: CanvasRenderingContext2D, caption: string, font: string): Scene {
  const T_IN = 0.8;
  const T_CUT = 5.2;
  const T_OUT = 1.2;
  const cycle = T_IN + T_CUT + T_OUT + 2;
  const fx = sparks(ctx, 900);
  let spin = 0;

  const steel = (cy: number, r: number, cut: boolean) => {
    const g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
    const stops = cut
      ? ["#2b2a35", "#9c9aa8", "#f4f3f8", "#c9c8d3", "#5d5b69", "#1b1a22"]
      : ["#1f1e27", "#5b5966", "#8b8996", "#5b5966", "#3d3b47", "#141319"];
    [0, 0.22, 0.36, 0.5, 0.78, 1].forEach((at, i) => g.addColorStop(at, stops[i]!));
    return g;
  };

  return {
    cycle,
    still: T_IN + T_CUT + T_OUT + 0.6,
    draw(w, h, t, dt) {
      const cy = h * 0.52;
      const R = h * 0.17;
      const x0 = w * 0.1;
      const x1 = w * 0.78;
      const L = x1 - x0;
      const segs = PROFILE.map(([a, b, ra, rb]) => ({ xa: x0 + a * L, xb: x0 + b * L, ra: ra * R, rb: rb * R }));
      const radiusAt = (x: number) => {
        for (const s of segs) if (x >= s.xa && x <= s.xb) return s.ra + (s.rb - s.ra) * ((x - s.xa) / (s.xb - s.xa));
        return R;
      };
      ctx.clearRect(0, 0, w, h);
      grid(ctx, w, h);

      const p = Math.min(Math.max((t - T_IN) / T_CUT, 0), 1);
      const tx = x0 + (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2) * L;
      const cutting = t > T_IN && t < T_IN + T_CUT;
      const r = (x: number) => (x < tx ? radiusAt(x) : R);
      const outline = (rad: (x: number) => number) => {
        ctx.beginPath();
        for (let x = x0; x <= x1; x += 4) ctx.lineTo(x, cy - rad(x));
        for (let x = x1; x >= x0; x -= 4) ctx.lineTo(x, cy + rad(x));
        ctx.closePath();
      };

      // مرغک
      ctx.fillStyle = "#18161f";
      ctx.fillRect(x0 - w * 0.1, cy - R * 0.75, w * 0.035, R * 1.5);
      ctx.fillStyle = "#24222d";
      ctx.beginPath();
      ctx.moveTo(x0 - w * 0.07, cy - R * 0.55);
      ctx.lineTo(x0 - 4, cy - 3);
      ctx.lineTo(x0 - 4, cy + 3);
      ctx.lineTo(x0 - w * 0.07, cy + R * 0.55);
      ctx.fill();

      // قطعه: تراشیده (براق) تا ابزار، خام بعد از آن؛ هم‌پوشانی کوچک تا درز بین پله‌ها دیده نشود
      for (const s of segs) {
        if (s.xa >= tx) break;
        const xb = Math.min(s.xb, tx);
        const rb = s.ra + (s.rb - s.ra) * ((xb - s.xa) / (s.xb - s.xa));
        ctx.beginPath();
        ctx.moveTo(s.xa - 0.6, cy - s.ra);
        ctx.lineTo(xb + 0.6, cy - rb);
        ctx.lineTo(xb + 0.6, cy + rb);
        ctx.lineTo(s.xa - 0.6, cy + s.ra);
        ctx.fillStyle = steel(cy, Math.max(s.ra, rb), true);
        ctx.fill();
      }
      if (tx < x1) {
        ctx.fillStyle = steel(cy, R, false);
        ctx.fillRect(tx, cy - R, x1 - tx, 2 * R);
      }

      // حس چرخش: رگه‌های مورب که روی قطعه می‌لغزند
      spin += dt * (cutting ? 9 : 4);
      ctx.save();
      outline(r);
      ctx.clip();
      ctx.strokeStyle = "rgba(255, 255, 255, .06)";
      ctx.lineWidth = 2;
      const off = (spin * 40) % 22;
      ctx.beginPath();
      for (let y = cy - R - 88; y < cy + R + 22; y += 22) {
        ctx.moveTo(x0, y + off);
        ctx.lineTo(x1, y + off + 34);
      }
      ctx.stroke();
      ctx.restore();

      // سه‌نظام با فک‌های طلایی
      const cw = w * 0.09;
      const cg = ctx.createLinearGradient(0, cy - R * 1.9, 0, cy + R * 1.9);
      ["#15131c", "#3a3746", "#56536a", "#34313f", "#110f17"].forEach((c, i) => cg.addColorStop([0, 0.35, 0.5, 0.65, 1][i]!, c));
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.roundRect(x1, cy - R * 1.9, cw, R * 3.8, 10);
      ctx.fill();
      ctx.strokeStyle = "rgba(167, 139, 250, .45)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      for (let k = 0; k < 3; k++) {
        const ph = spin * 1.2 + (k * Math.PI * 2) / 3;
        ctx.fillStyle = `rgba(212, 175, 55, ${0.25 + 0.5 * Math.max(0, Math.cos(ph))})`;
        ctx.fillRect(x1 - 10, cy + Math.sin(ph) * R * 1.35 - 7, 16, 14);
      }
      ctx.fillStyle = "#1b1922";
      ctx.fillRect(x1 + cw, cy - R * 2.3, w * 0.12, R * 4.6);

      // ابزار: نگهدارنده‌ی تیره و نوک طلایی که نیم‌رخ را دنبال می‌کند
      let toolX = tx;
      let toolY: number;
      if (t < T_IN) {
        toolX = x0;
        toolY = cy + R + (1 - t / T_IN) * h * 0.25;
      } else if (cutting) toolY = cy + radiusAt(tx);
      else {
        toolX = x1 - 6;
        toolY = cy + R + Math.min((t - T_IN - T_CUT) / T_OUT, 1) * h * 0.28;
      }
      ctx.save();
      ctx.translate(toolX, toolY);
      ctx.fillStyle = "#26232f";
      ctx.strokeStyle = "rgba(167, 139, 250, .35)";
      ctx.beginPath();
      ctx.roundRect(-16, 18, 46, h, 6);
      ctx.fill();
      ctx.stroke();
      const tip = ctx.createLinearGradient(-14, 0, 22, 26);
      tip.addColorStop(0, "#fff1b8");
      tip.addColorStop(0.45, "#d4af37");
      tip.addColorStop(1, "#8a6a14");
      ctx.fillStyle = tip;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(24, 20);
      ctx.lineTo(-10, 22);
      ctx.fill();
      ctx.restore();

      if (cutting) {
        fx.emit(toolX, toolY, 5, () => {
          const a = Math.PI * 0.08 + Math.random() * Math.PI * 0.55;
          const v = 160 + Math.random() * 360;
          return [Math.cos(a) * v * (Math.random() < 0.2 ? -0.6 : 1), Math.sin(a) * v - 120 * Math.random()];
        });
        glow(ctx, toolX, toolY, 38, "rgba(255, 214, 120, .75)", "rgba(255, 140, 40, 0)");
      }
      fx.draw(dt);

      // پس از تراش: برق روی قطعه و اندازه‌های نقشه
      const after = t - T_IN - T_CUT;
      if (after > 0) {
        shine(ctx, () => outline(radiusAt), x0 + Math.min(after / 0.9, 1) * (L + 160) - 80, cy - R - 2, 2 * R + 4);
        ctx.globalAlpha = Math.min(Math.max((after - 0.6) / 0.6, 0), 1) * (t > cycle - 0.5 ? (cycle - t) / 0.5 : 1);
        ctx.strokeStyle = "rgba(196, 181, 253, .9)";
        ctx.fillStyle = "#c4b5fd";
        ctx.lineWidth = 1;
        ctx.font = `600 ${Math.max(11, h * 0.042)}px ${font}`;
        ctx.textAlign = "center";
        const y = cy - R - h * 0.09;
        for (const [a, b, text] of DIMS) {
          const xa = x0 + a * L;
          const xb = x0 + b * L;
          ctx.beginPath();
          ctx.moveTo(xa, y);
          ctx.lineTo(xb, y);
          ctx.moveTo(xa, y - 5);
          ctx.lineTo(xa, y + 5);
          ctx.moveTo(xb, y - 5);
          ctx.lineTo(xb, y + 5);
          ctx.stroke();
          ctx.fillText(text, (xa + xb) / 2, y - 8);
        }
        ctx.fillStyle = "#d4af37";
        ctx.textAlign = "end";
        ctx.fillText(caption, x1 - 4, cy + R + h * 0.16);
        ctx.globalAlpha = 1;
      }
    },
  };
}

// شکل T تراشینو (نوار بالای مورب و ساقه) به نسبت ارتفاع ورق؛ مسیر بسته‌ی برش
const T_SHAPE = [[-0.62, -0.42], [0.62, -0.42], [0.5, -0.2], [0.14, -0.2], [0.14, 0.46], [-0.14, 0.46], [-0.14, -0.2], [-0.5, -0.2]] as const;

function laser(ctx: CanvasRenderingContext2D, caption: string, font: string): Scene {
  const T_CUT = 6.5;
  const T_LIFT = 1.4;
  const cycle = T_CUT + T_LIFT + 1.8;
  const fx = sparks(ctx, 500);

  return {
    cycle,
    still: T_CUT + T_LIFT + 0.4,
    draw(w, h, t, dt) {
      const ph = h * 0.72;
      const pw = Math.min(w * 0.62, ph * 2.4);
      const px = (w - pw) / 2;
      const py = (h - ph) / 2;
      const s = ph * 0.82;
      const cx = w / 2;
      const cy = h / 2 + ph * 0.02;
      const pts = [...T_SHAPE, T_SHAPE[0]].map(([x, y]) => [cx + x * s, cy + y * s] as const);
      const lens = [0];
      for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
      const total = lens[lens.length - 1]!;
      const at = (d: number): readonly [number, number] => {
        for (let i = 1; i < pts.length; i++) {
          if (d <= lens[i]!) {
            const k = (d - lens[i - 1]!) / (lens[i]! - lens[i - 1]!);
            return [pts[i - 1]![0] + (pts[i]![0] - pts[i - 1]![0]) * k, pts[i - 1]![1] + (pts[i]![1] - pts[i - 1]![1]) * k];
          }
        }
        return pts[pts.length - 1]!;
      };
      const shape = (dy: number) => {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y + dy) : ctx.moveTo(x, y + dy)));
        ctx.closePath();
      };
      ctx.clearRect(0, 0, w, h);
      grid(ctx, w, h);

      // ورق فولادی برس‌خورده
      const plate = ctx.createLinearGradient(px, py, px + pw, py + ph);
      plate.addColorStop(0, "#2c2a35");
      plate.addColorStop(0.5, "#3b3946");
      plate.addColorStop(1, "#24222c");
      ctx.fillStyle = plate;
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 14);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = "rgba(255,255,255,.035)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = py; y < py + ph; y += 3) {
        ctx.moveTo(px, y);
        ctx.lineTo(px + pw, y);
      }
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = "rgba(212, 175, 55, .35)";
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 14);
      ctx.stroke();

      const d = Math.min(t / T_CUT, 1) * total;
      const lift = Math.min(Math.max((t - T_CUT) / T_LIFT, 0), 1);
      const liftE = 1 - (1 - lift) ** 3;
      if (lift > 0) {
        shape(0);
        ctx.fillStyle = `rgba(8, 7, 12, ${0.85 * liftE})`;
        ctx.fill();
      }

      // شیار برش: داغ و نارنجی نزدیک سر لیزر، سرد و تیره دورتر
      ctx.lineCap = "round";
      const N = 140;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * d;
        const b = ((i + 1) / N) * d;
        const heat = Math.max(0, 1 - (d - b) / (total * 0.18)) * (1 - lift);
        const [x1, y1] = at(a);
        const [x2, y2] = at(b);
        ctx.strokeStyle = heat > 0.02 ? `rgba(255, ${Math.round(110 + 120 * heat)}, ${Math.round(40 + 80 * heat)}, ${0.35 + 0.65 * heat})` : "rgba(10, 9, 14, .95)";
        ctx.lineWidth = 2 + 2.5 * heat;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // قطعه‌ی بریده‌شده بالا می‌آید و برق می‌زند
      if (lift > 0) {
        const oy = -liftE * ph * 0.06;
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,.6)";
        ctx.shadowBlur = 24 * liftE;
        ctx.shadowOffsetY = 14 * liftE;
        shape(oy);
        const st = ctx.createLinearGradient(0, py, 0, py + ph);
        st.addColorStop(0, "#d9d8e2");
        st.addColorStop(0.5, "#8d8b99");
        st.addColorStop(1, "#5b5968");
        ctx.fillStyle = st;
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = `rgba(212, 175, 55, ${0.9 * liftE})`;
        ctx.lineWidth = 2;
        shape(oy);
        ctx.stroke();
        shine(ctx, () => shape(oy), px + ((t - T_CUT) / (T_LIFT + 0.6)) * (pw + 200) - 100, py - 40, ph + 80);
        ctx.globalAlpha = Math.min(Math.max((t - T_CUT - 0.8) / 0.6, 0), 1) * (t > cycle - 0.5 ? (cycle - t) / 0.5 : 1);
        ctx.fillStyle = "#d4af37";
        ctx.textAlign = "center";
        ctx.font = `600 ${Math.max(12, h * 0.045)}px ${font}`;
        ctx.fillText(caption, w / 2, py + ph + h * 0.09);
        ctx.globalAlpha = 1;
      }

      // دروازه‌ی دستگاه: ریل افقی که با سر لیزر جابه‌جا می‌شود
      const [hx, hy] = t < T_CUT ? at(d) : [px + pw + 40, py - 30];
      ctx.fillStyle = "rgba(30, 27, 41, .92)";
      ctx.strokeStyle = "rgba(167, 139, 250, .35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(px - 30, hy - 9, pw + 60, 18, 6);
      ctx.fill();
      ctx.stroke();
      const head = ctx.createLinearGradient(hx, hy - 20, hx, hy + 20);
      head.addColorStop(0, "#4a4757");
      head.addColorStop(1, "#1d1b25");
      ctx.fillStyle = head;
      ctx.strokeStyle = "rgba(212, 175, 55, .6)";
      ctx.beginPath();
      ctx.roundRect(hx - 20, hy - 20, 40, 40, 9);
      ctx.fill();
      ctx.stroke();

      if (t < T_CUT) {
        fx.emit(hx, hy, 6, () => {
          const a = Math.random() * Math.PI * 2;
          const v = 60 + Math.random() * 260;
          return [Math.cos(a) * v, Math.sin(a) * v * 0.6 - 40];
        });
        glow(ctx, hx, hy, 46, "rgba(255, 255, 255, .95)", "rgba(139, 92, 246, 0)");
      }
      fx.draw(dt);
    },
  };
}
