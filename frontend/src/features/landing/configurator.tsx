"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CONFIG_MATERIALS,
  QUANTITY_OPTIONS,
  TEETH_OPTIONS,
  gearWeightKg,
  rfqPrefill,
  type GearConfig,
} from "./gear-config";

export type ConfiguratorCopy = {
  diameter: string;
  teeth: string;
  material: string;
  quantity: string;
  weight: string;
  kg: string;
  cta: string;
  drag: string;
};

type Scene = { set: (c: GearConfig) => void; stop: () => void };

/**
 * پیکربندی زنده‌ی چرخ‌دنده: قطر بیرونی، تعداد دندانه، جنس و تعداد. وزن قطعه همان لحظه محاسبه می‌شود؛
 * دکمه، فرم ثبت درخواست را با همین مشخصات پر می‌کند. نمای سه‌بعدی فقط اگر WebGL و حرکت مجاز باشد.
 */
export function Configurator({ copy, lang }: { copy: ConfiguratorCopy; lang: "fa" | "en" }) {
  const [diameter, setDiameter] = useState(120);
  const [teeth, setTeeth] = useState<number>(24);
  const [materialKey, setMaterialKey] = useState<string>(CONFIG_MATERIALS[0].key);
  const [quantity, setQuantity] = useState<number>(50);
  const [live3d, setLive3d] = useState(false);
  const material = CONFIG_MATERIALS.find((m) => m.key === materialKey) ?? CONFIG_MATERIALS[0];
  const config = useMemo<GearConfig>(() => ({ diameter, teeth, material, quantity }), [diameter, teeth, material, quantity]);
  const kg = gearWeightKg(config);
  const fmt = (n: number, digits = 0) => new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en-US", { maximumFractionDigits: digits }).format(n);

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const configRef = useRef(config);

  useEffect(() => {
    configRef.current = config;
    sceneRef.current?.set(config);
  }, [config]);

  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const device = navigator as Navigator & { deviceMemory?: number };
    const weak = (navigator.hardwareConcurrency || 8) <= 2 || (device.deviceMemory ?? 8) <= 2;
    if (reduce || weak) return;
    let cancelled = false;
    const host = stageRef.current;
    if (!host) return;
    // صحنه فقط وقتی ساخته می‌شود که به این بخش نزدیک شوید، تا بار صفحه و سه‌بعدی سرصفحه سبک بماند
    const near = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        near.disconnect();
        void import("./scene3d")
          .then(({ startConfigurator }) => {
            const canvas = canvasRef.current;
            if (cancelled || !canvas) return;
            const scene = startConfigurator({ canvas, host });
            scene.set(configRef.current);
            sceneRef.current = scene;
            setLive3d(true);
          })
          .catch(() => setLive3d(false));
      },
      { rootMargin: "300px 0px" },
    );
    near.observe(host);
    return () => {
      cancelled = true;
      near.disconnect();
      sceneRef.current?.stop();
      sceneRef.current = null;
    };
  }, []);

  const chip = (pressed: boolean) => ({ className: "cfg-chip", "aria-pressed": pressed, type: "button" as const });

  return (
    <div className="cfg-grid">
      <div className={live3d ? "cfg-stage is-3d" : "cfg-stage"} ref={stageRef}>
        <canvas ref={canvasRef} aria-hidden="true" />
        {live3d && <span className="cfg-hint">{copy.drag}</span>}
      </div>
      <div className="cfg-panel">
        <div className="cfg-row">
          <label htmlFor="cfg-diameter">
            {copy.diameter} <output htmlFor="cfg-diameter">{diameter} mm</output>
          </label>
          <input
            id="cfg-diameter"
            type="range"
            min={60}
            max={240}
            step={10}
            value={diameter}
            onChange={(e) => setDiameter(Number(e.target.value))}
          />
        </div>
        <div className="cfg-row" role="group" aria-label={copy.teeth}>
          <span className="cfg-label">{copy.teeth}</span>
          <div className="cfg-chips">
            {TEETH_OPTIONS.map((n) => (
              <button key={n} {...chip(teeth === n)} onClick={() => setTeeth(n)}>
                {fmt(n)}
              </button>
            ))}
          </div>
        </div>
        <div className="cfg-row" role="group" aria-label={copy.material}>
          <span className="cfg-label">{copy.material}</span>
          <div className="cfg-chips">
            {CONFIG_MATERIALS.map((m) => (
              <button key={m.key} {...chip(materialKey === m.key)} onClick={() => setMaterialKey(m.key)}>
                {m[lang]}
              </button>
            ))}
          </div>
        </div>
        <div className="cfg-row" role="group" aria-label={copy.quantity}>
          <span className="cfg-label">{copy.quantity}</span>
          <div className="cfg-chips">
            {QUANTITY_OPTIONS.map((q) => (
              <button key={q} {...chip(quantity === q)} onClick={() => setQuantity(q)}>
                {fmt(q)}
              </button>
            ))}
          </div>
        </div>
        <div className="cfg-facts" aria-live="polite">
          <div>
            <small>{copy.weight}</small>
            <b>
              {fmt(kg, 1)} {copy.kg}
            </b>
          </div>
        </div>
        <Link className="btn btn-primary" href={`/rfqs/new?${rfqPrefill(config)}`}>
          {copy.cta}
        </Link>
      </div>
    </div>
  );
}
