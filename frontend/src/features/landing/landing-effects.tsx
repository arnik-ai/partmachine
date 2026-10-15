"use client";

import { useEffect } from "react";

type Point = { x: number; y: number };

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const DIGITS = "0123456789";
const NS = "http://www.w3.org/2000/svg";

/**
 * حرکت‌های صفحه‌ی اول، روی همان HTML که سرور ساخته است: سرصفحه‌ی شیشه‌ای و خط پیشرفت، آشکار شدن
 * بخش‌ها، صحنه‌ی چسبان «فرایند سفارش»، مته‌ی T که سوراخ‌ها را می‌زند، میدان نقطه‌ای، خط‌کش پانویس و
 * نور زیر نشانگر. با «کاهش حرکت» سیستم، فقط حالت نهایی نمایش داده می‌شود. هنگام ترک صفحه همه‌چیز جمع می‌شود.
 */
export function LandingEffects() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".lp");
    if (!root) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = matchMedia("(pointer: fine)").matches;
    const cleanups: (() => void)[] = [];
    let disposed = false;
    const on = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement | Window,
      type: K,
      handler: (event: HTMLElementEventMap[K]) => void,
      options?: AddEventListenerOptions,
    ) => {
      target.addEventListener(type, handler as EventListener, options);
      cleanups.push(() => target.removeEventListener(type, handler as EventListener, options));
    };
    // تایمرهای فعال؛ حلقه‌ی مته بی‌پایان است، پس هر تایمر پس از اجرا از فهرست بیرون می‌رود
    const timers = new Set<number>();
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };
    cleanups.push(() => timers.forEach((id) => window.clearTimeout(id)));
    const wait = (ms: number) => new Promise<void>((resolve) => later(resolve, ms));
    const $ = <T extends Element = HTMLElement>(selector: string) => root.querySelector<T>(selector);
    const $$ = <T extends Element = HTMLElement>(selector: string) => [...root.querySelectorAll<T>(selector)];

    // ---- سرصفحه: شیشه‌ای پس از اسکرول و خط پیشرفت
    const header = $("#siteHeader");
    const progress = $("#progress");
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - innerHeight;
        header?.classList.toggle("is-scrolled", scrollY > 12);
        if (progress) progress.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
        ticking = false;
      });
    };
    on(window, "scroll", onScroll, { passive: true });
    onScroll();

    // ---- رمزگشایی عددها، مثل نمایشگر دستگاه
    const scramble = (el: Element, final: string) => {
      if (reduce) {
        el.textContent = final;
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        if (disposed) return;
        const p = Math.min(1, (now - start) / 750);
        let out = "";
        for (let i = 0; i < final.length; i++) {
          const ch = final[i];
          out += DIGITS.includes(ch) && i / final.length > p ? DIGITS[Math.floor(Math.random() * 10)] : ch;
        }
        el.textContent = out;
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = final;
      };
      requestAnimationFrame(step);
    };

    // ---- آشکار شدن هنگام اسکرول؛ فقط چیزهایی که پایین‌تر از نمای اول‌اند پنهان شروع می‌کنند
    const reveals = $$("[data-reveal]");
    const lives = $$("[data-live]");
    if (!reduce && "IntersectionObserver" in window) {
      const fold = innerHeight * 0.92;
      reveals.forEach((el) => {
        if (el.getBoundingClientRect().top > fold) el.classList.add("pre-reveal");
      });
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const el = entry.target as HTMLElement;
            io.unobserve(el);
            if (el.hasAttribute("data-live")) later(() => el.classList.add("is-live"), 250);
            if (!el.classList.contains("pre-reveal")) return;
            const group = [...(el.parentElement?.children ?? [])].filter((c) => c.hasAttribute("data-reveal"));
            const delay = Math.max(0, group.indexOf(el)) * 90;
            el.animate(
              [
                { opacity: 0, transform: "translateY(22px)", filter: "blur(6px)" },
                { opacity: 1, transform: "none", filter: "blur(0px)" },
              ],
              { duration: 800, delay, easing: "cubic-bezier(.22,1,.36,1)", fill: "backwards" },
            );
            el.querySelectorAll(".w").forEach((word, i) =>
              word.animate(
                [
                  { opacity: 0, transform: "translateY(.4em)", filter: "blur(8px)" },
                  { opacity: 1, transform: "none", filter: "blur(0px)" },
                ],
                { duration: 700, delay: delay + 120 + i * 55, easing: "cubic-bezier(.22,1,.36,1)", fill: "backwards" },
              ),
            );
            el.classList.remove("pre-reveal");
          });
        },
        { rootMargin: "0px 0px -8% 0px" },
      );
      new Set([...reveals, ...lives]).forEach((el) => io.observe(el));
      cleanups.push(() => io.disconnect());
    } else {
      lives.forEach((el) => el.classList.add("is-live"));
    }

    // ---- کد ورود دومرحله‌ای که هر چند ثانیه عوض می‌شود
    const otp = $<SVGTextElement>("[data-otp]");
    if (otp && !reduce) {
      const id = window.setInterval(() => {
        const code = String(Math.floor(Math.random() * 1e6)).padStart(6, "0");
        scramble(otp, `${code.slice(0, 3)} ${code.slice(3)}`);
      }, 4000);
      cleanups.push(() => window.clearInterval(id));
    }

    // ---- نور زیر نشانگر، دکمه‌های مغناطیسی و کج شدن ملایم نقشه
    if (finePointer && !reduce) {
      $$(".spot").forEach((el) => {
        on(el, "pointermove", (e) => {
          const r = el.getBoundingClientRect();
          el.style.setProperty("--mx", `${e.clientX - r.left}px`);
          el.style.setProperty("--my", `${e.clientY - r.top}px`);
        });
      });
      $$(".magnet").forEach((el) => {
        on(el, "pointermove", (e) => {
          const r = el.getBoundingClientRect();
          const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
          const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
          el.style.transform = `translate(${dx * 8}px,${dy * 6 - 2}px)`;
        });
        on(el, "pointerleave", () => {
          el.style.transform = "";
        });
      });
      const visual = $(".visual");
      const hero = $(".hero");
      if (visual && hero) {
        visual.style.transition = "transform .6s cubic-bezier(.22,1,.36,1)";
        on(hero, "pointermove", (e) => {
          const r = hero.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width - 0.5;
          const y = (e.clientY - r.top) / r.height - 0.5;
          visual.style.transform = `perspective(1100px) rotateY(${x * -6}deg) rotateX(${y * 4}deg)`;
        });
        on(hero, "pointerleave", () => {
          visual.style.transform = "";
        });
      }
    }

    // ---- فرایند سفارش: هر قدم که به وسط صفحه برسد، صحنه همان بخش محصول را نشان می‌دهد
    const stage = $("#stage");
    const steps = $$(".step");
    const fillbar = $("#fillbar");
    const typeTarget = $("#typeTarget");
    const typeText = typeTarget?.dataset.typeText ?? "";
    let typing = 0;
    const typeIn = () => {
      if (reduce || !typeTarget) return;
      const id = ++typing;
      typeTarget.textContent = "";
      [...typeText].forEach((ch, i) =>
        later(() => {
          if (id === typing) typeTarget.textContent += ch;
        }, 300 + i * 70),
      );
    };
    const activate = (n: number) => {
      if (!stage || stage.dataset.active === String(n)) return;
      stage.dataset.active = String(n);
      steps.forEach((s) => s.classList.toggle("active", s.dataset.step === String(n)));
      const target = steps[n - 1];
      if (fillbar && target) fillbar.style.height = `${Math.max(0, target.offsetTop - steps[0].offsetTop)}px`;
      if (n === 1) typeIn();
    };
    if (stage && "IntersectionObserver" in window) {
      const once = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) {
            once.disconnect();
            typeIn();
          }
        },
        { threshold: 0.4 },
      );
      once.observe(stage);
      const sio = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) activate(Number((entry.target as HTMLElement).dataset.step));
          });
        },
        { rootMargin: "-48% 0px -48% 0px" },
      );
      steps.forEach((s) => sio.observe(s));
      cleanups.push(() => {
        once.disconnect();
        sio.disconnect();
      });
    }

    // ---- میدان نقطه‌ای که آرام موج برمی‌دارد و زیر نشانگر بالا می‌آید؛ فقط وقتی دیده می‌شود
    $$<HTMLCanvasElement>("[data-lattice]").forEach((canvas) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const host = canvas.closest<HTMLElement>("[data-pointer]");
      let w = 0;
      let h = 0;
      let visible = false;
      let raf = 0;
      let last = 0;
      let px = -1;
      if (host && finePointer) {
        on(host, "pointermove", (e) => {
          const r = canvas.getBoundingClientRect();
          px = (e.clientX - r.left) / r.width;
        });
        on(host, "pointerleave", () => {
          px = -1;
        });
      }
      const draw = (t: number) => {
        ctx.clearRect(0, 0, w, h);
        const rows = 14;
        const cols = Math.max(18, Math.round(w / 34));
        const time = reduce ? 0 : t / 1000;
        for (let r = 0; r < rows; r++) {
          const depth = r / (rows - 1);
          const z = 0.18 + depth * 0.82;
          const y0 = h * (0.08 + Math.pow(depth, 1.35) * 0.9);
          const spread = 0.55 + z * 0.75;
          for (let col = 0; col <= cols; col++) {
            const u = col / cols - 0.5;
            const x = w / 2 + u * w * spread;
            let wave = Math.sin(u * 7 + time * 0.9 + depth * 3.2) * Math.cos(depth * 4 - time * 0.6);
            if (px >= 0) wave += Math.max(0, 1 - Math.abs(x / w - px) * 6) * 1.2 * z;
            const y = y0 - wave * 7 * z;
            const crest = Math.max(0, wave);
            const alpha = Math.min(1, (0.12 + z * 0.55) * (0.55 + crest * 0.6));
            ctx.fillStyle =
              crest > 1.05
                ? `rgba(245, 166, 35, ${alpha})`
                : crest > 0.72
                  ? `rgba(230, 230, 236, ${alpha})`
                  : `rgba(167, 139, 250, ${alpha})`;
            ctx.beginPath();
            ctx.arc(x, y, 0.6 + z * 1.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        const fade = ctx.createLinearGradient(0, 0, w, 0);
        fade.addColorStop(0, "rgba(13,12,18,1)");
        fade.addColorStop(0.18, "rgba(13,12,18,0)");
        fade.addColorStop(0.82, "rgba(13,12,18,0)");
        fade.addColorStop(1, "rgba(13,12,18,1)");
        ctx.fillStyle = fade;
        ctx.fillRect(0, 0, w, h);
      };
      const resize = () => {
        const dpr = Math.min(devicePixelRatio || 1, 2);
        w = canvas.clientWidth;
        h = canvas.clientHeight;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw(performance.now());
      };
      const loop = (t: number) => {
        if (!visible || disposed) return;
        if (t - last > 33) {
          draw(t);
          last = t;
        }
        raf = requestAnimationFrame(loop);
      };
      const ro = new ResizeObserver(resize);
      ro.observe(canvas);
      cleanups.push(() => {
        ro.disconnect();
        cancelAnimationFrame(raf);
      });
      if (reduce) return;
      const vo = new IntersectionObserver(([entry]) => {
        visible = Boolean(entry?.isIntersecting);
        cancelAnimationFrame(raf);
        if (visible) raf = requestAnimationFrame(loop);
      });
      vo.observe(canvas);
      cleanups.push(() => vo.disconnect());
    });

    // ---- اعداد خط‌کش پانویس (هر ۸۰ پیکسل یک سانتی‌متر نمایشی)
    const ruler = $("#ruler");
    if (ruler) {
      const label = () => {
        ruler.querySelectorAll(".num").forEach((n) => n.remove());
        const count = Math.floor(ruler.clientWidth / 80);
        for (let i = 0; i <= count; i++) {
          const num = document.createElement("span");
          num.className = "num";
          num.textContent = String(i * 10);
          num.style.left = `${i * 80 + 4}px`;
          ruler.appendChild(num);
        }
      };
      const ro = new ResizeObserver(label);
      ro.observe(ruler);
      cleanups.push(() => ro.disconnect());
    }

    // ---- مته‌ی T: سوراخ‌ها را یکی‌یکی می‌زند، بعد اندازه‌ها روی نقشه می‌نشینند
    const drill = $<SVGGElement>("#drill");
    const scene = $<SVGSVGElement>("#scene");
    const holes = $$<SVGEllipseElement>("#holes .hole");
    const sparks = $<SVGGElement>("#sparks");
    const dims = $<SVGGElement>("#dims");
    const scan = $<SVGRectElement>("#scan");
    if (drill && scene && sparks && dims && scan) {
      const PARK: Point = { x: 432, y: 156 };
      let pos: Point = { ...PARK };
      let sceneVisible = true;
      const setPos = (p: Point) => {
        pos = p;
        drill.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(.8)`);
      };
      // تا صحنه دیده نشود حرکت نمی‌کند (در پس‌زمینه پردازنده مصرف نمی‌شود)
      const whenVisible = () =>
        new Promise<void>((resolve) => {
          const check = () => (sceneVisible || disposed ? resolve() : later(check, 300));
          check();
        });
      const moveTo = async (target: Point, ms: number) => {
        await whenVisible();
        const from = { ...pos };
        const start = performance.now();
        await new Promise<void>((resolve) => {
          const frame = (now: number) => {
            if (disposed) return resolve();
            const p = Math.min(1, (now - start) / ms);
            const k = ease(p);
            setPos({ x: from.x + (target.x - from.x) * k, y: from.y + (target.y - from.y) * k });
            if (p < 1) requestAnimationFrame(frame);
            else resolve();
          };
          requestAnimationFrame(frame);
        });
      };
      const burst = (x: number, y: number) => {
        for (let i = 0; i < 14; i++) {
          const c = document.createElementNS(NS, "circle");
          c.setAttribute("cx", String(x));
          c.setAttribute("cy", String(y));
          c.setAttribute("r", (Math.random() * 1.4 + 0.8).toFixed(2));
          c.setAttribute("fill", Math.random() > 0.35 ? "#f5a623" : "#fff3d6");
          c.setAttribute("class", "spark");
          sparks.appendChild(c);
          const a = Math.random() * Math.PI;
          const d = 16 + Math.random() * 34;
          const dx = Math.cos(a) * d * (Math.random() > 0.5 ? 1 : -1);
          const dy = -Math.abs(Math.sin(a)) * d * 0.9;
          c.animate(
            [
              { transform: "translate(0,0)", opacity: 1 },
              { transform: `translate(${dx}px,${dy + 18}px)`, opacity: 0 },
            ],
            { duration: 520 + Math.random() * 380, easing: "cubic-bezier(.2,.7,.4,1)" },
          ).finished.then(
            () => c.remove(),
            () => c.remove(),
          );
        }
      };
      const decoded = () => dims.querySelectorAll<SVGTextElement>("[data-decode]");
      const finalFrame = () => {
        holes.forEach((hole) => hole.classList.add("drilled"));
        dims.classList.add("on");
        decoded().forEach((t) => {
          t.textContent = t.dataset.decode ?? "";
        });
      };
      const cycle = async () => {
        holes.forEach((hole) => hole.classList.remove("drilled"));
        dims.classList.remove("on");
        await wait(1700);
        for (const hole of holes) {
          if (disposed) return;
          const x = Number(hole.getAttribute("cx"));
          const y = Number(hole.getAttribute("cy"));
          await moveTo({ x, y: y - 34 }, 620);
          scene.classList.add("drilling");
          await moveTo({ x, y: y - 3 }, 300);
          burst(x, y);
          hole.classList.add("drilled");
          await wait(200);
          scene.classList.remove("drilling");
          await moveTo({ x, y: y - 34 }, 260);
        }
        await moveTo(PARK, 800);
        if (disposed) return;
        dims.classList.add("on");
        decoded().forEach((t) => scramble(t, t.dataset.decode ?? ""));
        scan.classList.remove("on");
        void scan.getBoundingClientRect();
        scan.classList.add("on");
        await wait(4200);
      };
      if (reduce) {
        finalFrame();
      } else {
        const vo = new IntersectionObserver(([entry]) => {
          sceneVisible = Boolean(entry?.isIntersecting);
        });
        vo.observe(scene);
        cleanups.push(() => vo.disconnect());
        const run = async () => {
          while (!disposed) await cycle();
        };
        if (document.readyState === "complete") void run();
        else on(window, "load", () => void run(), { once: true });
      }
    }

    return () => {
      disposed = true;
      typing++;
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return null;
}
