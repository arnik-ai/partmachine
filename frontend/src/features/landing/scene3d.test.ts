import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { D, buildAssembly, buildDrill, buildFlange, buildMaterials, createSparks } from "./scene3d";

const bounds = (obj: THREE.Object3D) => {
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj);
};

const finite = (obj: THREE.Object3D) => {
  let bad = 0;
  obj.traverse((o) => {
    const geometry = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    for (const name of ["position", "normal"]) {
      const attr = geometry?.getAttribute(name);
      if (attr) for (const v of attr.array) if (!Number.isFinite(v)) bad++;
    }
  });
  return bad;
};

describe("3D landing geometry", () => {
  const mats = buildMaterials();

  it("builds a weld-neck flange with six closed bolt holes", () => {
    const flange = buildFlange(mats, { plugs: true });
    const box = bounds(flange.group);
    expect(box.max.x).toBeCloseTo(D.R + D.bevel, 2);
    expect(box.max.y).toBeCloseTo(D.t + D.hubH - 0.002, 2);
    expect(flange.holes).toHaveLength(6);
    expect(flange.plugs).toHaveLength(6);
    expect(flange.holes[0].x).toBeCloseTo(Math.cos(Math.PI / 6) * D.boltR, 5);
    expect(finite(flange.group)).toBe(0);
  });

  it("puts the drill tip at its origin", () => {
    const drill = buildDrill(mats);
    const box = bounds(drill.group);
    expect(box.min.y).toBeCloseTo(0, 3);
    expect(box.max.y).toBeGreaterThan(0.8);
    expect(finite(drill.group)).toBe(0);
  });

  it("explodes the flange joint along its axis without parts overlapping", () => {
    const asm = buildAssembly(mats);
    expect(bounds(asm.root).max.x).toBeCloseTo(asm.halfLength(0), 1);
    asm.apply(1);
    expect(bounds(asm.root).max.x).toBeCloseTo(asm.halfLength(1), 1);
    const span = (key: string) => {
      const item = asm.items.find((it) => it.key === key);
      if (!item) throw new Error(key);
      return bounds(item.holder);
    };
    // پیچ‌ها کاملاً از فلنج اول بیرون آمده‌اند و مهره‌ها پشت فلنج دوم‌اند
    expect(span("bolts").max.x).toBeLessThan(span("flangeA").min.x + D.hubH);
    expect(span("nuts").min.x).toBeGreaterThan(span("flangeB").min.x);
    expect(finite(asm.root)).toBe(0);
  });

  it("moves and cools sparks until they stop", () => {
    const sparks = createSparks(null, 16);
    sparks.emit(new THREE.Vector3(0, D.t, 0), 8);
    for (let i = 0; i < 240; i++) sparks.update(1 / 60, () => 0);
    const colors = sparks.points.geometry.getAttribute("color").array;
    expect(Math.max(...colors)).toBe(0);
  });
});
