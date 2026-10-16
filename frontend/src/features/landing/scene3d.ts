/*
 * صحنه‌های سه‌بعدی صفحه‌ی اول (WebGL با three.js):
 *  - سرصفحه: فلنج گلودار روی میز گردان که مته‌ی T لوگو شش سوراخش را می‌زند؛ با کشیدن می‌چرخد.
 *  - خدمات تولید: اتصال فلنجی که با اسکرول از هم باز می‌شود؛ هر جزء برچسب فرایند تولیدش را دارد.
 * این ماژول فقط پس از بار کامل صفحه و با import پویا بار می‌شود (landing-effects) و اگر WebGL نباشد
 * یا دستگاه کند باشد، همان نقشه‌ی SVG می‌ماند.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { flangeDims, type FlangeConfig } from "./flange-config";

/** ابعاد فلنج (واحد صحنه ≈ دسی‌متر) */
export const D = {
  R: 1.2,
  t: 0.22,
  bore: 0.36,
  boltR: 0.9,
  holeR: 0.085,
  hubBase: 0.62,
  hubTop: 0.46,
  hubH: 0.62,
  bevel: 0.014,
} as const;

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};

export function buildMaterials() {
  const steel = new THREE.MeshPhysicalMaterial({ color: 0xc9c7d3, metalness: 1, roughness: 0.28, clearcoat: 0.2, clearcoatRoughness: 0.35 });
  const cast = new THREE.MeshPhysicalMaterial({ color: 0x9d98ab, metalness: 0.95, roughness: 0.56 });
  const doubleSided = (m: THREE.MeshPhysicalMaterial) => {
    const copy = m.clone();
    copy.side = THREE.DoubleSide;
    return copy;
  };
  return {
    steel,
    steelDS: doubleSided(steel),
    cast,
    castDS: doubleSided(cast),
    rubber: new THREE.MeshStandardMaterial({ color: 0x2c2638, roughness: 0.88, metalness: 0 }),
    forged: new THREE.MeshPhysicalMaterial({ color: 0x625d71, metalness: 1, roughness: 0.36 }),
    // رنگ‌های بازپخت فولاد (آبی، بنفش، طلایی) برای مهره‌های عملیات حرارتی‌شده
    heat: new THREE.MeshPhysicalMaterial({
      color: 0xb3a8cf,
      metalness: 1,
      roughness: 0.28,
      iridescence: 1,
      iridescenceIOR: 1.8,
      iridescenceThicknessRange: [260, 620],
    }),
    weld: new THREE.MeshStandardMaterial({ color: 0x857c94, metalness: 0.85, roughness: 0.6 }),
    pipe: new THREE.MeshPhysicalMaterial({ color: 0xb9b6c5, metalness: 1, roughness: 0.38, side: THREE.DoubleSide }),
    holder: new THREE.MeshPhysicalMaterial({ color: 0xecebf2, metalness: 0.3, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2 }),
    amber: new THREE.MeshStandardMaterial({ color: 0xf5a623, emissive: 0xf5a623, emissiveIntensity: 0.6, roughness: 0.35, metalness: 0.1 }),
    bit: new THREE.MeshPhysicalMaterial({ color: 0xe2e1ea, metalness: 1, roughness: 0.18 }),
  };
}

type Materials = ReturnType<typeof buildMaterials>;
type Ring = THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;

/** فلنج گلودار با محور Y: رویه‌ی تماس در y=0 و گلو به سمت +Y. سوراخ‌ها می‌توانند بسته شروع کنند (plugs). */
export function buildFlange(mats: Materials, { plugs = false, body = "steel" as "steel" | "cast" } = {}) {
  const { R, t, bore, boltR, holeR, hubBase, hubTop, hubH, bevel } = D;
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  shape.absarc(0, 0, R, 0, Math.PI * 2, false);
  const boreHole = new THREE.Path();
  boreHole.absarc(0, 0, bore, 0, Math.PI * 2, true);
  shape.holes.push(boreHole);
  const holes: THREE.Vector3[] = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    const x = Math.cos(a) * boltR;
    const y = Math.sin(a) * boltR;
    const hole = new THREE.Path();
    hole.absarc(x, y, holeR, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    // پس از rotateX(-90°) محور y شکل به -z می‌رود
    holes.push(new THREE.Vector3(x, t, -y));
  }
  const diskGeo = new THREE.ExtrudeGeometry(shape, {
    depth: t - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 64,
  });
  diskGeo.rotateX(-Math.PI / 2);
  diskGeo.translate(0, bevel, 0);
  const disk = new THREE.Mesh(diskGeo, mats[body]);
  disk.castShadow = true;
  disk.receiveShadow = true;
  group.add(disk);

  const profile = [
    [hubBase, 0],
    [hubBase - 0.015, 0.05],
    [hubTop, hubH - 0.1],
    [hubTop, hubH],
    [bore + 0.025, hubH],
    [bore, hubH - 0.025],
    [bore, 0],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const hubGeo = new THREE.LatheGeometry(profile, 96);
  hubGeo.translate(0, t - 0.002, 0);
  const hub = new THREE.Mesh(hubGeo, body === "steel" ? mats.steelDS : mats.castDS);
  hub.castShadow = true;
  hub.receiveShadow = true;
  group.add(hub);

  const plugMeshes: THREE.Mesh[] = [];
  const rings: Ring[] = [];
  if (plugs) {
    const plugGeo = new THREE.CylinderGeometry(holeR + 0.003, holeR + 0.003, t - 0.006, 28);
    const ringGeo = new THREE.TorusGeometry(holeR + 0.004, 0.01, 8, 40);
    ringGeo.rotateX(Math.PI / 2);
    for (const h of holes) {
      const plug = new THREE.Mesh(plugGeo, mats[body]);
      plug.position.set(h.x, (t - 0.006) / 2, h.z);
      plug.receiveShadow = true;
      group.add(plug);
      plugMeshes.push(plug);
      const ring: Ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      ring.position.set(h.x, t + 0.003, h.z);
      group.add(ring);
      rings.push(ring);
    }
  }
  return { group, holes, plugs: plugMeshes, rings, body: [disk, hub] };
}

/** مته‌ی T لوگو: نوار بالا (نگه‌دارنده)، متوازی‌الاضلاع کهربایی و ساقه‌ی شیاردار. مبدأ = نوک مته. */
export function buildDrill(mats: Materials) {
  const s = 0.006;
  const H = 24 * s;
  const L = 0.7;
  const r = 0.078;
  const tipH = 0.09;
  const X = (v: number) => (v - 77) * s;
  const group = new THREE.Group();
  const plate = (pts: [number, number][], mat: THREE.Material) => {
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2 });
    geo.translate(0, 0, -0.06);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = L;
    mesh.castShadow = true;
    return mesh;
  };
  // همان مختصات SVG لوگو (y پایین‌رو) به y بالارو
  group.add(plate([[X(26), 0], [X(104), 0], [X(118), H], [X(40), H]], mats.holder));
  group.add(plate([[X(112), 0], [X(144), 0], [X(158), H], [X(126), H]], mats.amber));

  const bodyLen = L - tipH;
  const bodyGeo = new THREE.CylinderGeometry(r, r, bodyLen, 48, 36);
  const pos = bodyGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (Math.hypot(x, z) < 1e-6) continue;
    // دو شیار مارپیچ: نیم‌رخ دولوب که در طول ساقه می‌چرخد
    const k = (y + bodyLen / 2) / bodyLen;
    const phi = Math.atan2(z, x) - k * Math.PI * 3.2;
    const f = 0.45 + 0.55 * Math.pow(Math.abs(Math.cos(phi)), 0.6);
    pos.setXYZ(i, x * f, y, z * f);
  }
  bodyGeo.computeVertexNormals();
  const bodyMesh = new THREE.Mesh(bodyGeo, mats.bit);
  bodyMesh.position.y = tipH + bodyLen / 2;
  bodyMesh.castShadow = true;
  const tipGeo = new THREE.ConeGeometry(r * 0.98, tipH, 48);
  tipGeo.rotateX(Math.PI);
  const tip = new THREE.Mesh(tipGeo, mats.bit);
  tip.position.y = tipH / 2;
  tip.castShadow = true;
  const bit = new THREE.Group();
  bit.add(bodyMesh, tip);
  group.add(bit);
  const light = new THREE.PointLight(0xffa040, 0, 2.2, 2);
  light.position.y = 0.05;
  group.add(light);
  return { group, bit, light };
}

/** جرقه‌ها: ذره‌های افزایشی که از سفید-زرد به نارنجی و قرمز سرد می‌شوند */
export function createSparks(texture: THREE.Texture | null, count = 280) {
  const position = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  const velocity = new Float32Array(count * 3);
  const life = new Float32Array(count);
  const decay = new Float32Array(count);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(color, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.04,
    map: texture,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  let next = 0;
  const emit = (origin: THREE.Vector3, n: number) => {
    for (let k = 0; k < n; k++) {
      const i = next++ % count;
      const a = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 1.7;
      position.set([origin.x, origin.y, origin.z], i * 3);
      velocity.set([Math.cos(a) * speed, 0.6 + Math.random() * 1.8, Math.sin(a) * speed], i * 3);
      life[i] = 1;
      decay[i] = 0.9 + Math.random() * 1.1;
    }
  };
  /** floorAt(x, z) ارتفاع سطحی است که جرقه رویش می‌جهد */
  const update = (dt: number, floorAt: (x: number, z: number) => number) => {
    for (let i = 0; i < count; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt * decay[i];
      const j = i * 3;
      velocity[j + 1] -= 6.2 * dt;
      position[j] += velocity[j] * dt;
      position[j + 1] += velocity[j + 1] * dt;
      position[j + 2] += velocity[j + 2] * dt;
      const floor = floorAt(position[j], position[j + 2]);
      if (position[j + 1] < floor) {
        position[j + 1] = floor;
        velocity[j + 1] *= -0.32;
        velocity[j] *= 0.55;
        velocity[j + 2] *= 0.55;
      }
      const l = Math.max(0, life[i]);
      color[j] = Math.min(1, l * 1.6);
      color[j + 1] = Math.min(1, l * l * 1.25);
      color[j + 2] = Math.min(1, l * l * l * 0.9);
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };
  return { points, emit, update };
}

export type PartKey = "flangeA" | "flangeB" | "gasket" | "pipe" | "pipeB" | "bolts" | "nuts";
type AssemblyItem = { key: PartKey; holder: THREE.Group; baseX: number; shift: number; anchor: THREE.Vector3 | null };

/** اتصال فلنجی با محور X: دو فلنج، واشر، شش پیچ و مهره، دو لوله و جوش. apply(e) نمای انفجاری است. */
export function buildAssembly(mats: Materials) {
  const { R, t, hubH, boltR } = D;
  const gap = 0.015;
  const root = new THREE.Group();
  const items: AssemblyItem[] = [];
  const add = (key: PartKey, obj: THREE.Object3D, baseX: number, shift: number, anchor: THREE.Vector3 | null) => {
    const holder = new THREE.Group();
    holder.add(obj);
    holder.position.x = baseX;
    root.add(holder);
    items.push({ key, holder, baseX, shift, anchor });
  };

  const flangeA = buildFlange(mats, { body: "steel" });
  flangeA.group.rotation.z = Math.PI / 2; // گلو به سمت -X
  add("flangeA", flangeA.group, -gap, -0.95, new THREE.Vector3(-t / 2, R + 0.12, 0));
  const flangeB = buildFlange(mats, { body: "cast" });
  flangeB.group.rotation.z = -Math.PI / 2; // گلو به سمت +X
  add("flangeB", flangeB.group, gap, 0.95, new THREE.Vector3(t / 2, R + 0.12, 0));

  const ring = new THREE.Shape();
  ring.absarc(0, 0, 0.68, 0, Math.PI * 2, false);
  const inner = new THREE.Path();
  inner.absarc(0, 0, D.bore + 0.02, 0, Math.PI * 2, true);
  ring.holes.push(inner);
  const gasketGeo = new THREE.ExtrudeGeometry(ring, { depth: gap * 2, bevelEnabled: false, curveSegments: 64 });
  gasketGeo.rotateY(Math.PI / 2);
  gasketGeo.translate(-gap, 0, 0);
  add("gasket", new THREE.Mesh(gasketGeo, mats.rubber), 0, 0, new THREE.Vector3(0, 0.8, 0));

  const pipeLen = 1.3;
  const pipeProfile = [
    [0.46, 0],
    [0.46, pipeLen],
    [0.38, pipeLen],
    [0.38, 0],
    [0.46, 0],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const neckEnd = gap + t + hubH;
  const pipe = (dir: 1 | -1) => {
    const geo = new THREE.LatheGeometry(pipeProfile, 80);
    geo.rotateZ((-dir * Math.PI) / 2); // +Y به جهت dir روی محور X
    const group = new THREE.Group();
    group.add(new THREE.Mesh(geo, mats.pipe));
    const beadGeo = new THREE.TorusGeometry(0.47, 0.028, 12, 80);
    beadGeo.rotateY(Math.PI / 2);
    group.add(new THREE.Mesh(beadGeo, mats.weld));
    return group;
  };
  add("pipe", pipe(-1), -neckEnd, -1.7, new THREE.Vector3(-pipeLen / 2, 0.62, 0));
  add("pipeB", pipe(1), neckEnd, 1.7, null);

  const headH = 0.075;
  const nutH = 0.085;
  const shankLen = 2 * (gap + t) + nutH + 0.06;
  const bolts = new THREE.Group();
  const nuts = new THREE.Group();
  const headGeo = new THREE.CylinderGeometry(0.115, 0.115, headH, 6);
  headGeo.rotateZ(Math.PI / 2);
  const shankGeo = new THREE.CylinderGeometry(0.066, 0.066, shankLen, 24, 64);
  const sp = shankGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i);
    const y = sp.getY(i);
    const z = sp.getZ(i);
    const k = (y + shankLen / 2) / shankLen;
    if (k < 0.35 || Math.hypot(x, z) < 1e-6) continue;
    // رزوه: موج شعاعی کوچک روی بخش انتهایی ساقه
    const f = 1 + 0.07 * Math.sin(y * Math.PI * 2 * 36);
    sp.setXYZ(i, x * f, y, z * f);
  }
  shankGeo.computeVertexNormals();
  shankGeo.rotateZ(-Math.PI / 2); // +Y به +X
  const nutGeo = new THREE.CylinderGeometry(0.115, 0.115, nutH, 6);
  nutGeo.rotateZ(Math.PI / 2);
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    const y = Math.cos(a) * boltR;
    const z = -Math.sin(a) * boltR;
    const head = new THREE.Mesh(headGeo, mats.forged);
    head.position.set(-headH / 2, y, z);
    const shank = new THREE.Mesh(shankGeo, mats.forged);
    shank.position.set(shankLen / 2, y, z);
    bolts.add(head, shank);
    const nut = new THREE.Mesh(nutGeo, mats.heat);
    nut.position.set(nutH / 2, y, z);
    nuts.add(nut);
  }
  add("bolts", bolts, -(gap + t), -1.8, new THREE.Vector3(shankLen / 2 - 0.1, 1.08, 0));
  add("nuts", nuts, gap + t, 1.7, new THREE.Vector3(nutH / 2, 1.08, 0));

  const apply = (e: number) => {
    for (const it of items) it.holder.position.x = it.baseX + it.shift * e;
  };
  apply(0);
  return { root, items, apply, halfLength: (e: number) => neckEnd + pipeLen + 1.7 * e };
}

// ---------------------------------------------------------------------------------------------
// صحنه‌ها (نیازمند مرورگر)

function sparkTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d");
  if (!g) return null;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRenderer(canvas: HTMLCanvasElement, shadows: boolean) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.9;
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2.6, 5.2, 3.2);
  if (shadows) {
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -2.8, right: 2.8, top: 2.8, bottom: -2.8, near: 1, far: 14 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
  }
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9b6dff, 3.2);
  rim.position.set(-4, 2.4, -3.5);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xd9d2ff, 0x16131f, 0.6));
  const dispose = () => {
    env.dispose();
    pmrem.dispose();
    renderer.dispose();
  };
  return { renderer, scene, dispose };
}

type Tween = { t: number; d: number; fn: (k: number) => void; done: () => void };

/** حلقه‌ی رندر فقط وقتی بوم دیده می‌شود؛ tweenها با همین حلقه جلو می‌روند تا در پس‌زمینه نپرند */
function createLoop(host: HTMLElement, frame: (dt: number) => void) {
  let raf = 0;
  let last = 0;
  let visible = false;
  const tweens = new Set<Tween>();
  const tick = (now: number) => {
    raf = 0;
    if (!visible) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    for (const tw of tweens) {
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.d);
      tw.fn(k);
      if (k >= 1) {
        tweens.delete(tw);
        tw.done();
      }
    }
    frame(dt);
    raf = requestAnimationFrame(tick);
  };
  const io = new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting);
    last = 0;
    if (visible && !raf) raf = requestAnimationFrame(tick);
  });
  io.observe(host);
  return {
    tween: (ms: number, fn: (k: number) => void) => new Promise<void>((done) => tweens.add({ t: 0, d: ms / 1000, fn, done })),
    stop: () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      tweens.clear();
    },
  };
}

export type Scene3D = { stop: () => void };

/**
 * سرصفحه: فلنج روی میز گردان، مته سوراخ‌ها را می‌زند، بازرسی لیزری، نمایش اندازه‌ها و رفتن قطعه روی
 * نوار تولید. dims: سه برچسب اندازه که روی نقطه‌های قطعه می‌نشینند. onSlow اگر دستگاه کند بود صدا می‌شود.
 */
export function startHero(opts: {
  canvas: HTMLCanvasElement;
  host: HTMLElement;
  dims: HTMLElement[];
  hint: HTMLElement | null;
  onSlow?: () => void;
}): Scene3D {
  const { canvas, host, dims, hint, onSlow } = opts;
  const { renderer, scene, dispose } = makeRenderer(canvas, true);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  const target = new THREE.Vector3(0, 0.2, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3(1, 0, 0);
  const toward = new THREE.Vector3(0, 0, 1);
  const mats = buildMaterials();
  const { t } = D;

  const shadowMat = new THREE.ShadowMaterial({ opacity: 0 });
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.receiveShadow = true;
  scene.add(shadowPlane);
  const grid = new THREE.PolarGridHelper(1.85, 12, 4, 96, 0x8b5cf6, 0x4c3f73);
  const gridMaterial = grid.material as THREE.Material;
  gridMaterial.transparent = true;
  gridMaterial.opacity = 0.3;
  gridMaterial.depthWrite = false;
  grid.position.y = 0.002;
  scene.add(grid);

  const slide = new THREE.Group();
  const tilt = new THREE.Group();
  const spin = new THREE.Group();
  slide.add(tilt);
  tilt.add(spin);
  scene.add(slide);
  const part = buildFlange(mats, { plugs: true });
  spin.add(part.group);
  // خطوط نقشه‌ی فنی همان قطعه؛ صحنه با همین نقشه از نمای بالا شروع می‌شود
  const blueprint = new THREE.LineBasicMaterial({ color: 0x9fb6ff, transparent: true, opacity: 0 });
  const lines = new THREE.Group();
  for (const mesh of part.body) lines.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), blueprint));
  spin.add(lines);

  const drill = buildDrill(mats);
  scene.add(drill.group);
  const sparks = createSparks(sparkTexture());
  scene.add(sparks.points);

  const laserMat = new THREE.MeshBasicMaterial({ color: 0xc4b5fd, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const haloMat = laserMat.clone();
  const laser = new THREE.Group();
  laser.add(new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.006, 0.006), laserMat));
  laser.add(new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.04, 0.04), haloMat));
  scene.add(laser);

  const park = new THREE.Vector3();
  let elev = 28;
  let dist = 6;
  const place = () => {
    const el = THREE.MathUtils.degToRad(elev);
    const az = THREE.MathUtils.degToRad(-32);
    camera.position.set(
      target.x + dist * Math.cos(el) * Math.sin(az),
      target.y + dist * Math.sin(el),
      target.z + dist * Math.cos(el) * Math.cos(az),
    );
    camera.lookAt(target);
  };
  const frame = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    dist = Math.max(1.7 / tanV, 2.05 / (tanV * camera.aspect));
    place();
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    right.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
    toward.crossVectors(right, up).normalize();
    park.copy(right).multiplyScalar(1.32).addScaledVector(up, 1.05);
    laser.rotation.y = -Math.atan2(right.z, right.x);
  };
  frame();
  drill.group.position.copy(park);
  drill.group.visible = false;
  const ro = new ResizeObserver(frame);
  ro.observe(host);

  // کشیدن برای چرخاندن (افقی)؛ اسکرول عمودی روی گوشی آزاد می‌ماند (touch-action: pan-y)
  let yaw = 0;
  let vyaw = 0;
  let pitch = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const onDown = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture?.(e.pointerId);
    hint?.classList.add("gone");
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    vyaw = dx * 0.01;
    yaw += vyaw;
    pitch = Math.max(-0.35, Math.min(0.35, pitch + dy * 0.004));
  };
  const onUp = () => {
    dragging = false;
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  const tmp = new THREE.Vector3();
  const center = new THREE.Vector3();
  const holeWorld = (hole: THREE.Vector3, lift: number, out: THREE.Vector3) => {
    out.copy(hole);
    part.group.localToWorld(out);
    return out.addScaledVector(up, lift);
  };
  const dimAnchors = () => {
    const c = new THREE.Vector3().setFromMatrixPosition(slide.matrixWorld);
    return [
      c.clone().addScaledVector(right, -(D.R + 0.02)).addScaledVector(up, t),
      c.clone().addScaledVector(right, D.boltR).addScaledVector(up, t),
      c.clone().addScaledVector(up, t + D.hubH),
    ];
  };

  let drillSpin = 2;
  let drilling: THREE.Vector3 | null = null;
  let frames = 0;
  let slowFrames = 0;
  let stopped = false;
  const loop = createLoop(host, (dt) => {
    if (!dragging) {
      vyaw *= 0.94;
      yaw += vyaw + dt * 0.16;
      pitch *= 0.96;
    }
    spin.rotation.y = yaw;
    tilt.quaternion.setFromAxisAngle(right, pitch);
    drill.bit.rotation.y += drillSpin * dt;
    if (drilling) {
      sparks.emit(holeWorld(drilling, 0.01, tmp), 5);
      drill.light.intensity = 1.6 + Math.random() * 0.8;
    } else {
      drill.light.intensity *= 0.85;
    }
    for (const ring of part.rings) {
      if (ring.material.opacity > 0) ring.material.opacity = Math.max(0, ring.material.opacity - dt * 0.6);
    }
    center.setFromMatrixPosition(slide.matrixWorld);
    sparks.update(dt, (x, z) => (Math.hypot(x - center.x, z - center.z) < D.R ? t : 0));
    renderer.render(scene, camera);
    const anchors = dimAnchors();
    dims.forEach((el, i) => {
      const p = anchors[i].project(camera);
      el.style.transform = `translate(${((p.x + 1) / 2) * host.clientWidth}px, ${((1 - p.y) / 2) * host.clientHeight}px)`;
    });
    // دستگاه کند: اگر میانگین فریم‌ها پس از گرم شدن زیر ۲۲ فریم در ثانیه بود، به نقشه‌ی ساده برمی‌گردیم
    frames++;
    // فقط کندی مداوم: اگر بیش از دو سوم فریم‌های ۹۰ تا ۲۷۰ کندتر از ۲۰ فریم در ثانیه بود.
    // افت لحظه‌ای (مثلاً هنگام ساخته شدن صحنه‌ی دیگری) نباید سه‌بعدی را خاموش کند.
    if (frames > 90 && frames <= 270 && dt > 0.05) slowFrames++;
    if (frames === 270 && slowFrames > 120) onSlow?.();
  });
  const wait = (ms: number) => loop.tween(ms, () => {});
  const moveDrill = (ms: number, to: () => THREE.Vector3) => {
    const from = drill.group.position.clone();
    return loop.tween(ms, (k) => drill.group.position.lerpVectors(from, to(), ease(k)));
  };
  const showDims = (on: boolean) =>
    dims.forEach((el, i) => window.setTimeout(() => el.classList.toggle("on", on), on ? i * 160 : 0));

  const cycle = async () => {
    for (let i = 0; i < 6 && !stopped; i++) {
      const hole = part.holes[i];
      await moveDrill(560, () => holeWorld(hole, 0.32, new THREE.Vector3()));
      drillSpin = 34;
      await moveDrill(240, () => holeWorld(hole, 0, new THREE.Vector3()));
      drilling = hole;
      const plug = part.plugs[i];
      const y0 = plug.position.y;
      await loop.tween(520, (k) => {
        drill.group.position.copy(holeWorld(hole, -0.06 * k, tmp));
        plug.position.y = y0 - (t - 0.006) * k;
      });
      plug.visible = false;
      part.rings[i].material.opacity = 1;
      drilling = null;
      await moveDrill(220, () => holeWorld(hole, 0.32, new THREE.Vector3()));
    }
    drillSpin = 2;
    await moveDrill(900, () => park);
    if (stopped) return;
    laserMat.opacity = 0.95;
    haloMat.opacity = 0.22;
    await loop.tween(1400, (k) => {
      const c = new THREE.Vector3().setFromMatrixPosition(slide.matrixWorld);
      laser.position.copy(c).addScaledVector(toward, -1.4 + 2.8 * k).addScaledVector(up, t + 0.012);
      laserMat.opacity = 0.95 * Math.sin(Math.PI * k);
      haloMat.opacity = 0.22 * Math.sin(Math.PI * k);
    });
    laserMat.opacity = 0;
    haloMat.opacity = 0;
    showDims(true);
    await wait(3600);
    showDims(false);
    await wait(500);
    // نوار تولید: قطعه‌ی آماده می‌رود و همان قطعه با سوراخ‌های بسته، خام برمی‌گردد
    await loop.tween(900, (k) => slide.position.copy(right).multiplyScalar(4.6 * k * k));
    part.plugs.forEach((plug) => {
      plug.position.y = (t - 0.006) / 2;
      plug.visible = true;
    });
    part.rings.forEach((ring) => {
      ring.material.opacity = 0;
    });
    await loop.tween(1000, (k) => slide.position.copy(right).multiplyScalar(-4.6 * (1 - ease(k))));
  };
  const steels = [mats.steel, mats.steelDS];
  const setIntro = (m: number) => {
    spin.scale.y = 0.02 + 0.98 * smooth(0.12, 0.75, m);
    const solid = smooth(0.4, 0.9, m);
    for (const mat of steels) {
      mat.opacity = solid;
      mat.transparent = solid < 0.999;
      mat.depthWrite = solid > 0.98;
    }
    blueprint.opacity = 1 - 0.85 * smooth(0.6, 1, m);
    shadowMat.opacity = 0.4 * smooth(0.5, 1, m);
    elev = 88 - 60 * smooth(0.05, 0.8, m);
    place();
  };
  void (async () => {
    setIntro(0);
    blueprint.opacity = 0;
    // نقشه‌ی سه‌بعدی جای نقشه‌ی SVG را می‌گیرد، کمی می‌ماند و بعد بلند می‌شود
    await loop.tween(500, (k) => {
      blueprint.opacity = k;
    });
    await wait(700);
    await loop.tween(2800, setIntro);
    setIntro(1);
    lines.visible = false;
    drill.group.visible = true;
    const above = park.clone().addScaledVector(up, 1.4);
    await loop.tween(700, (k) => drill.group.position.lerpVectors(above, park, ease(k)));
    await wait(300);
    while (!stopped) await cycle();
  })();

  return {
    stop: () => {
      stopped = true;
      loop.stop();
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      dispose();
    },
  };
}

/**
 * نمای انفجاری: progress() عددی بین ۰ و ۱ از اسکرول می‌دهد. labels: برچسب هر جزء (data-part و
 * data-at = آستانه‌ی نمایش). روی صفحه‌ی باریک محور مجموعه عمودی می‌شود و برچسب‌ها سمت راست می‌آیند.
 */
export function startExplode(opts: {
  canvas: HTMLCanvasElement;
  host: HTMLElement;
  labels: Iterable<HTMLElement>;
  progress: () => number;
  bar: HTMLElement | null;
  /** کارت مشخصات جزء انتخاب‌شده: [data-name]، [data-proc]، [data-spec]، a[data-link]، [data-close] */
  card: HTMLElement | null;
}): Scene3D {
  const { canvas, host, labels, progress, bar, card } = opts;
  const { renderer, scene, dispose } = makeRenderer(canvas, false);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80);
  const mats = buildMaterials();
  const asm = buildAssembly(mats);
  const turn = new THREE.Group();
  turn.add(asm.root);
  scene.add(turn);
  const byKey = new Map(asm.items.map((it) => [it.key, it]));
  const labelEls = [...labels].map((el) => ({
    el,
    item: byKey.get(el.dataset.part as PartKey),
    at: Number(el.dataset.at ?? 0),
  }));
  // ---- انتخاب جزء: هر جزء مواد خودش را دارد تا جداگانه محو یا روشن شود
  type Pickable = { item: AssemblyItem; meshes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] };
  const pickables: Pickable[] = asm.items.map((item) => {
    const meshes: Pickable["meshes"] = [];
    item.holder.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const mesh = o as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      mesh.material = mesh.material.clone();
      mesh.material.transparent = true;
      mesh.material.emissive.setHex(0x6d4bd6);
      mesh.material.emissiveIntensity = 0;
      meshes.push(mesh);
    });
    return { item, meshes };
  });
  const allMeshes = pickables.flatMap((pk) => pk.meshes);
  const owner = new Map(pickables.flatMap((pk) => pk.meshes.map((m) => [m, pk] as const)));
  // دو لوله یک جزءاند
  const infoKey = (key: PartKey) => (key === "pipeB" ? "pipe" : key);
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pickAt = (clientX: number, clientY: number) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(allMeshes, false)[0];
    return hit ? (owner.get(hit.object as Pickable["meshes"][number]) ?? null) : null;
  };
  let selected: PartKey | null = null;
  let hovered: PartKey | null = null;
  const select = (key: PartKey | null) => {
    selected = key;
    host.classList.toggle("picking", key !== null);
    if (!key || !card) return;
    const label = labelEls.find((l) => l.el.dataset.part === key)?.el;
    if (!label) return;
    const set = (sel: string, text: string) => {
      const el = card.querySelector(sel);
      if (el) el.textContent = text;
    };
    set("[data-name]", label.querySelector("small")?.textContent ?? "");
    set("[data-proc]", label.querySelector("b")?.textContent ?? "");
    set("[data-spec]", label.dataset.spec ?? "");
    const link = card.querySelector<HTMLAnchorElement>("a[data-link]");
    if (link) link.href = label.getAttribute("href") ?? "#";
  };
  let downX = 0;
  let downY = 0;
  const onDown = (e: PointerEvent) => {
    downX = e.clientX;
    downY = e.clientY;
  };
  const onUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
    const pk = pickAt(e.clientX, e.clientY);
    const key = pk ? infoKey(pk.item.key) : null;
    select(key && key !== selected ? key : null);
  };
  const onHover = (e: PointerEvent) => {
    const pk = pickAt(e.clientX, e.clientY);
    hovered = pk ? infoKey(pk.item.key) : null;
    canvas.style.cursor = hovered ? "pointer" : "";
  };
  const onClose = () => select(null);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointermove", onHover);
  const closeBtn = card?.querySelector("[data-close]");
  closeBtn?.addEventListener("click", onClose);
  const focus = new THREE.Vector3();
  const want = new THREE.Vector3();
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  let vertical = false;
  let dist = 10;
  const resize = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    vertical = camera.aspect < 0.95;
    asm.root.rotation.z = vertical ? -Math.PI / 2 : 0;
    host.classList.toggle("vertical", vertical);
    if (vertical) camera.setViewOffset(w, h, w * 0.2, 0, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  const tmp = new THREE.Vector3();
  let e = 0;
  let time = 0;
  const loop = createLoop(host, (dt) => {
    time += dt;
    const p = clamp01(progress());
    const target = ease(clamp01((p - 0.1) / 0.68));
    e += (target - e) * Math.min(1, dt * 7);
    asm.apply(e);
    turn.rotation.y = -0.42 + 0.62 * p + Math.sin(time * 0.6) * 0.03;
    turn.position.y = Math.sin(time * 0.9) * 0.03;
    // دوربین طوری عقب می‌رود که کل مجموعه در قاب بماند
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const half = asm.halfLength(e);
    let need = vertical
      ? Math.max((half + 0.45) / tanV, 2.5 / (tanV * camera.aspect))
      : Math.max((half * 0.9 + 0.5) / (tanV * camera.aspect), 2.1 / tanV);
    want.set(0, 0, 0);
    const k = Math.min(1, dt * 5);
    for (const pk of pickables) {
      const key = infoKey(pk.item.key);
      const on = selected === null || key === selected;
      if (selected !== null && key === selected && pk.item.key !== "pipeB") {
        // دوربین روی جزء انتخاب‌شده نزدیک می‌رود
        box.setFromObject(pk.item.holder);
        box.getCenter(want);
        need = Math.max(3, box.getSize(size).length() * 2.4);
      }
      const glow = selected === null && hovered === key ? 0.35 : 0;
      for (const mesh of pk.meshes) {
        mesh.material.opacity += ((on ? 1 : 0.08) - mesh.material.opacity) * k;
        mesh.material.depthWrite = mesh.material.opacity > 0.95;
        mesh.material.emissiveIntensity += (glow - mesh.material.emissiveIntensity) * k;
      }
    }
    focus.lerp(want, k);
    dist += (need - dist) * Math.min(1, dt * 6);
    const el = THREE.MathUtils.degToRad(vertical ? 12 : 17);
    const az = THREE.MathUtils.degToRad(24);
    camera.position.set(
      focus.x + dist * Math.cos(el) * Math.sin(az),
      focus.y + dist * Math.sin(el),
      focus.z + dist * Math.cos(el) * Math.cos(az),
    );
    camera.lookAt(focus);
    renderer.render(scene, camera);
    for (const { el, item, at } of labelEls) {
      if (!item?.anchor) continue;
      tmp.copy(item.anchor);
      item.holder.localToWorld(tmp);
      const s = tmp.project(camera);
      el.style.transform = `translate(${((s.x + 1) / 2) * host.clientWidth}px, ${((1 - s.y) / 2) * host.clientHeight}px)`;
      el.classList.toggle("on", e > at);
    }
    if (bar) bar.style.transform = `scaleX(${p})`;
    host.classList.toggle("started", p > 0.06);
    host.classList.toggle("can-pick", e > 0.8);
  });
  return {
    stop: () => {
      loop.stop();
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointermove", onHover);
      closeBtn?.removeEventListener("click", onClose);
      dispose();
    },
  };
}

/**
 * پیکربندی زنده: فلنجی که با قطر، تعداد سوراخ و جنس انتخاب‌شده دوباره ساخته می‌شود؛ با کشیدن می‌چرخد.
 */
export function startConfigurator(opts: { canvas: HTMLCanvasElement; host: HTMLElement }): Scene3D & {
  set: (config: FlangeConfig) => void;
} {
  const { canvas, host } = opts;
  const { renderer, scene, dispose } = makeRenderer(canvas, false);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  const material = new THREE.MeshPhysicalMaterial({ color: 0xc9c7d3, metalness: 1, roughness: 0.28, side: THREE.DoubleSide });
  const holder = new THREE.Group();
  scene.add(holder);
  let radius = 1.2;
  const set = (config: FlangeConfig) => {
    holder.children.forEach((child) => (child as THREE.Mesh).geometry.dispose());
    holder.clear();
    const { R, t, bore, boltR, holeR, hubBase, hubTop, hubH } = flangeDims(config.diameter);
    radius = R;
    const shape = new THREE.Shape();
    shape.absarc(0, 0, R, 0, Math.PI * 2, false);
    const boreHole = new THREE.Path();
    boreHole.absarc(0, 0, bore, 0, Math.PI * 2, true);
    shape.holes.push(boreHole);
    for (let i = 0; i < config.holes; i++) {
      const a = (i / config.holes) * Math.PI * 2 + Math.PI / config.holes;
      const hole = new THREE.Path();
      hole.absarc(Math.cos(a) * boltR, Math.sin(a) * boltR, holeR, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
    const disk = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 64 });
    disk.rotateX(-Math.PI / 2);
    const hub = new THREE.LatheGeometry(
      [
        [hubBase, 0],
        [hubTop, hubH - 0.06],
        [hubTop, hubH],
        [bore + 0.02, hubH],
        [bore, 0],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      96,
    );
    hub.translate(0, t, 0);
    holder.add(new THREE.Mesh(disk, material), new THREE.Mesh(hub, material));
    material.color.setHex(config.material.color);
    material.metalness = config.material.metalness;
    material.roughness = config.material.roughness;
  };
  const resize = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  let yaw = 0;
  let vyaw = 0;
  let dragging = false;
  let lastX = 0;
  const onDown = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    vyaw = (e.clientX - lastX) * 0.01;
    yaw += vyaw;
    lastX = e.clientX;
  };
  const onUp = () => {
    dragging = false;
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  let dist = 6;
  const target = new THREE.Vector3();
  const loop = createLoop(host, (dt) => {
    if (!dragging) {
      vyaw *= 0.94;
      yaw += vyaw + dt * 0.25;
    }
    holder.rotation.y = yaw;
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const half = radius * 1.35 + 0.15;
    const need = Math.max(half / tanV, half / (tanV * camera.aspect));
    dist += (need - dist) * Math.min(1, dt * 5);
    target.set(0, radius * 0.22, 0);
    const el = THREE.MathUtils.degToRad(30);
    const az = THREE.MathUtils.degToRad(-30);
    camera.position.set(dist * Math.cos(el) * Math.sin(az), target.y + dist * Math.sin(el), dist * Math.cos(el) * Math.cos(az));
    camera.lookAt(target);
    renderer.render(scene, camera);
  });
  return {
    set,
    stop: () => {
      loop.stop();
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      dispose();
    },
  };
}
