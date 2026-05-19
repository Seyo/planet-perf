import { Container, FillGradient, Graphics } from "pixi.js";
import type { SliceFactory } from "./slice-ring";

// ---------- deterministic random (stable per slice) ----------

type RNG = () => number;

// Mulberry32 — tiny, fast, good enough for visuals
function mulberry32(seed: number): RNG {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(sliceIndex: number, salt: number): number {
  // cheap mixing
  let x = (sliceIndex + 1) * 0x9e3779b1;
  x ^= salt * 0x85ebca6b;
  x ^= x >>> 16;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 13;
  return x >>> 0;
}

function randRange(rng: RNG, min: number, max: number): number {
  return min + (max - min) * rng();
}

function randInt(rng: RNG, min: number, max: number): number {
  return Math.floor(randRange(rng, min, max + 1));
}

function chance(rng: RNG, p: number): boolean {
  return rng() < p;
}

export type Animator = { update(tick: number): void };

export function shouldSpawn(
  sliceIndex: number,
  density: number,
  salt = 1,
): boolean {
  const rng = mulberry32(hashSeed(sliceIndex, salt));
  return chance(rng, density);
}

export function darken(color: number, amount: number): number {
  // amount: 0..1 (0 = no change, 1 = black)
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;

  const k = 1 - amount;
  const rr = Math.max(0, Math.min(255, Math.round(r * k)));
  const gg = Math.max(0, Math.min(255, Math.round(g * k)));
  const bb = Math.max(0, Math.min(255, Math.round(b * k)));

  return (rr << 16) | (gg << 8) | bb;
}

// ---------- layer factories ----------

type FactoryOpts = {
  sliceWidthPxAtZoom1: number; // authoring width for this ring
  baseColor?: number;
  density?: number; // chance slice has "content"
  salt?: number; // different seed stream per layer
  yBase?: number; // baseline y for ground/horizon
  minH?: number;     // minimum building height
  maxH?: number;     // maximum building height
  underground?: boolean; // draw underground mirror with windows/bridges
};

// Front: skyscrapers with glowing 1x1px windows
export function makeFrontBuildingFactory(opts: FactoryOpts, animators?: Animator[]): SliceFactory {
  const {
    sliceWidthPxAtZoom1,
    baseColor = 0x060810,
    density = 0.68,
    salt = 101,
    yBase = 150,
  } = opts;

  return (i) => {
    const root      = new Container();
    const rng       = mulberry32(hashSeed(i, salt));
    const bodies    = new Graphics();
    const struct    = new Graphics();
    const shopLight = new Graphics();
    const glows     = new Graphics();
    const warm      = new Graphics();
    const cool      = new Graphics();
    // Three flicker groups — windows batched by group, each group animates together
    const fwarm     = [new Graphics(), new Graphics(), new Graphics()];
    const fcool     = [new Graphics(), new Graphics(), new Graphics()];

    // Helper: place a window, routing ~12% to a flicker group
    const placeWindow = (wx: number, wy: number, isWarm: boolean) => {
      if (animators && chance(rng, 0.03)) {
        const g = randInt(rng, 0, 2);
        if (isWarm) fwarm[g].rect(wx + 0.5, wy + 0.5, 0.5, 0.5);
        else        fcool[g].rect(wx + 0.5, wy + 0.5, 0.5, 0.5);
      } else {
        if (isWarm) warm.rect(wx + 0.5, wy + 0.5, 0.5, 0.5);
        else        cool.rect(wx + 0.5, wy + 0.5, 0.5, 0.5);
      }
    };

    const frontBuilt: Array<{ x: number; w: number; h: number }> = [];

    // --- Pass 1: always-present low-rise filler (keeps ground line covered) ---
    const fillerCount = randInt(rng, 3, 5);
    for (let b = 0; b < fillerCount; b++) {
      const w   = randInt(rng, 6, 26) + 0.5;
      const h   = randInt(rng, 8, 38);
      const x   = randInt(rng, 0, Math.max(0, sliceWidthPxAtZoom1 - w));
      const top = yBase - h;

      bodies.rect(x, top, w, h);
      frontBuilt.push({ x, w, h });

      if (h > 18) {
        for (let wy = top + 4; wy <= yBase - 6; wy += 4) {
          for (let wx = x + 2; wx <= x + w - 3; wx += 4) {
            if (!chance(rng, 0.45)) continue;
            glows.rect(wx - 1, wy - 1, 3, 3);
            placeWindow(wx, wy, chance(rng, 0.6));
          }
        }
      }

      if (chance(rng, 0.55)) {
        shopLight.rect(x, yBase - 3, w - 0.5, 3);
        glows.rect(x - 1, yBase - 4, w + 1, 4);
      }
    }

    // --- Pass 2: main buildings (density-gated, wide height variation) ---
    let minTop = yBase;
    if (chance(rng, density)) {
      const count = randInt(rng, 1, 3);

      for (let b = 0; b < count; b++) {
        const w   = randInt(rng, 8, 40) + 0.5;
        const h   = randInt(rng, 20, 280);
        const x   = randInt(rng, 0, Math.max(0, sliceWidthPxAtZoom1 - w));
        const top = yBase - h;
        if (top < minTop) minTop = top;

        bodies.rect(x, top, w, h);
        frontBuilt.push({ x, w, h });

        if (h > 25) {
          for (let wy = top + 5; wy <= yBase - 9; wy += 3) {
            for (let wx = x + 2; wx <= x + w - 3; wx += 3) {
              if (!chance(rng, 0.65)) continue;
              glows.rect(wx - 1, wy - 1, 3, 3);
              placeWindow(wx, wy, chance(rng, 0.6));
            }
          }
        }

        // Drone landing pad — 10% of skyscrapers (h >= 150)
        if (h >= 150 && chance(rng, 0.10)) {
          const stickRight = chance(rng, 0.5);
          const padX = stickRight ? x : x - 8;
          const padW = w + 8;
          struct.rect(padX, top - 2, padW, 2);
          const tipX = stickRight ? padX + padW - 1 : padX - 1;
          glows.rect(tipX, top - 3, 3, 3);
          cool.rect(tipX + 0.5, top - 1.5, 0.5, 0.5);
          const cx = x + w / 2;
          struct.rect(cx, top - 6, 1, 4);
          glows.rect(cx - 1, top - 7, 3, 3);
          warm.rect(cx + 0.5, top - 5.5, 0.5, 0.5);
        }

        // Rooftop antenna
        if (chance(rng, 0.55)) {
          const ax = x + randInt(rng, 2, Math.max(2, w - 2));
          const ah = randInt(rng, 6, 16);
          struct.rect(ax, top - ah, 1, ah);
          if (chance(rng, 0.5)) {
            glows.rect(ax - 1, top - ah - 1, 3, 3);
            if (chance(rng, 0.5)) warm.rect(ax + 0.5, top - ah + 0.5, 0.5, 0.5);
            else                  cool.rect(ax + 0.5, top - ah + 0.5, 0.5, 0.5);
          }
        }

        // Shop-front glow strip
        if (chance(rng, 0.45)) {
          shopLight.rect(x, yBase - 3, w - 0.5, 3);
          glows.rect(x - 1, yBase - 4, w + 1, 4);
        }
      }
    }

    // --- Street lamp posts ---
    if (chance(rng, 0.65)) {
      const lampCount = randInt(rng, 1, 2);
      for (let l = 0; l < lampCount; l++) {
        const lx = randInt(rng, 2, sliceWidthPxAtZoom1 - 2);
        struct.rect(lx, yBase - 18, 1, 18);
        struct.rect(lx - 1, yBase - 18, 3, 1);
        glows.rect(lx - 2, yBase - 20, 5, 5);
        warm.rect(lx + 0.5, yBase - 17.5, 0.5, 0.5);
      }
    }

    // --- Sky platform/bridge (spans between two buildings) ---
    if (chance(rng, 0.28)) {
      const sorted = [...frontBuilt].sort((a, b) => a.x - b.x);
      let bx = -1, bw = 0, platformTop = yBase;
      outer: for (let ai = 0; ai < sorted.length - 1; ai++) {
        for (let bi = ai + 1; bi < sorted.length; bi++) {
          const a = sorted[ai], b = sorted[bi];
          const gap = b.x - (a.x + a.w);
          if (gap < 5) continue;
          const sharedTop = Math.max(yBase - a.h, yBase - b.h);
          if (sharedTop >= yBase - 40) continue;
          platformTop = randInt(rng, sharedTop + 10, yBase - 40);
          bx = Math.floor(a.x + a.w);
          bw = Math.floor(gap);
          break outer;
        }
      }
      if (bx >= 0) {
        struct.rect(bx, platformTop, bw, 2);
        glows.rect(bx - 1, platformTop - 1, 4, 4);
        glows.rect(bx + bw - 2, platformTop - 1, 4, 4);
        const lightCount = randInt(rng, 3, 6);
        for (let l = 0; l < lightCount; l++) {
          const lx = bx + Math.round((l + 0.5) * (bw / lightCount));
          glows.rect(lx - 1, platformTop - 1, 3, 3);
          if (chance(rng, 0.6)) warm.rect(lx + 0.5, platformTop + 0.5, 0.5, 0.5);
          else                  cool.rect(lx + 0.5, platformTop + 0.5, 0.5, 0.5);
        }
      }
    }

    // --- Greebles: ground-level surface clutter ---
    const greebleCount = randInt(rng, 10, 20);
    for (let g = 0; g < greebleCount; g++) {
      const type = randInt(rng, 0, 2);
      if (type === 0) {
        // Box / utility crate
        const gw = randInt(rng, 2, 6);
        const gh = randInt(rng, 2, 4);
        const gx = randInt(rng, 0, Math.max(0, sliceWidthPxAtZoom1 - gw));
        struct.rect(gx, yBase - gh, gw, gh);
        if (chance(rng, 0.3)) glows.rect(gx + 1, yBase - gh - 1, 2, 2);
      } else if (type === 1) {
        // Horizontal pipe run
        const gl = randInt(rng, 6, 20);
        const gx = randInt(rng, 0, Math.max(0, sliceWidthPxAtZoom1 - gl));
        struct.rect(gx, yBase - 2, gl, 1);
      } else {
        if (chance(rng, 0.5)) {
          // Vertical conduit stub
          const gs = randInt(rng, 4, 10);
          const gx = randInt(rng, 0, sliceWidthPxAtZoom1 - 1);
          struct.rect(gx, yBase - gs, 1, gs);
        } else {
          // Elevated cable tray
          const gl = randInt(rng, 10, 30);
          const gx = randInt(rng, 0, Math.max(0, sliceWidthPxAtZoom1 - gl));
          struct.rect(gx, yBase - 5, gl, 1);
        }
      }
    }

    root.addChild(bodies.fill({ color: baseColor }));
    root.addChild(struct.fill({ color: 0x131b2a }));
    root.addChild(shopLight.fill({ color: 0xffbb44, alpha: 0.28 }));
    root.addChild(glows.fill({ color: 0xffffff, alpha: 0.07 }));
    root.addChild(warm.fill({ color: 0xffee66, alpha: 0.9 }));
    root.addChild(cool.fill({ color: 0x88ccff, alpha: 0.9 }));

    // Flicker groups: fill + add + register animators
    for (let gi = 0; gi < 3; gi++) {
      root.addChild(fwarm[gi].fill({ color: 0xffee66, alpha: 0.9 }));
      root.addChild(fcool[gi].fill({ color: 0x88ccff, alpha: 0.9 }));
      if (animators) {
        const fw = fwarm[gi];
        const fc = fcool[gi];
        const phase = rng() * Math.PI * 2;
        const speed = 0.03 + rng() * 0.06;
        animators.push({ update(tick) {
          const v = Math.sin(tick * speed + phase);
          const a = v > 0.6 ? 0.9 : v > -0.2 ? 0.35 : 0.0;
          fw.alpha = a;
          fc.alpha = a;
        }});
      }
    }

    return root;
  };
}

// Background city: narrower spires with dimmer windows, own ground strip
export function makeBackCityFactory(opts: FactoryOpts): SliceFactory {
  const {
    sliceWidthPxAtZoom1,
    baseColor  = 0x060810,
    density    = 0.65,
    salt       = 202,
    yBase      = 150,
    minH       = 40,
    maxH       = 280,
    underground = false,
  } = opts;

  return (i) => {
    const root      = new Container();
    const rng       = mulberry32(hashSeed(i, salt));
    const bodies    = new Graphics();
    const struct    = new Graphics();
    const shopLight = new Graphics();
    const glows     = new Graphics();
    const warm      = new Graphics();
    const cool      = new Graphics();

    // Ground plate — only on underground layers; ground section layer covers the surface
    if (underground) {
      root.addChild(
        new Graphics()
          .rect(0, yBase, sliceWidthPxAtZoom1, 55)
          .fill({ color: baseColor }),
      );
    }

    // Track all buildings for underground mirror and bridge anchoring
    const allBuilt: Array<{ x: number; w: number; h: number }> = [];
    let minTop = yBase;

    // --- Pass 1: always-present low-rise filler ---
    const fillerCount = randInt(rng, 2, 4);
    for (let b = 0; b < fillerCount; b++) {
      const w   = randInt(rng, 4, 14) + 0.5;
      const h   = randInt(rng, 5, 22);
      const x   = randInt(rng, 0, Math.max(0, sliceWidthPxAtZoom1 - w));

      const top = yBase - h;
      if (top < minTop) minTop = top;
      bodies.rect(x, top, w, h);
      allBuilt.push({ x, w, h });

      // Sparse windows even on short fillers
      if (h > 8) {
        for (let wy = top + 3; wy <= yBase - 6; wy += 5) {
          for (let wx = x + 1; wx <= x + w - 2; wx += 5) {
            if (!chance(rng, 0.30)) continue;
            glows.rect(wx - 1, wy - 1, 3, 3);
            if (chance(rng, 0.6)) warm.rect(wx + 0.5, wy + 0.5, 0.5, 0.5);
            else                  cool.rect(wx + 0.5, wy + 0.5, 0.5, 0.5);
          }
        }
      }

      if (h > 8 && chance(rng, 0.45)) {
        shopLight.rect(x, yBase - 3, w - 0.5, 3);
        glows.rect(x - 1, yBase - 4, w + 1, 4);
      }
    }

    // --- Pass 2: main buildings (density-gated) ---
    if (chance(rng, density)) {
      const count = randInt(rng, 1, 4);

      for (let b = 0; b < count; b++) {
        const w   = randInt(rng, 5, 18) + 0.5;
        const h   = randInt(rng, minH, maxH);
        const x   = randInt(rng, 0, Math.max(0, sliceWidthPxAtZoom1 - w));
        const top = yBase - h;

        if (top < minTop) minTop = top;
        bodies.rect(x, top, w, h);
        allBuilt.push({ x, w, h });

        if (h > 25) {
          for (let wy = top + 5; wy <= yBase - 9; wy += 3) {
            for (let wx = x + 1; wx <= x + w - 2; wx += 3) {
              if (!chance(rng, 0.65)) continue;
              glows.rect(wx - 1, wy - 1, 3, 3);
              if (chance(rng, 0.6)) warm.rect(wx + 0.5, wy + 0.5, 0.5, 0.5);
              else                  cool.rect(wx + 0.5, wy + 0.5, 0.5, 0.5);
            }
          }
        }

        // Antenna
        if (chance(rng, 0.5)) {
          const ax = x + randInt(rng, 1, Math.max(1, w - 1));
          const ah = randInt(rng, 5, 14);
          struct.rect(ax, top - ah, 1, ah);
          if (chance(rng, 0.45)) {
            glows.rect(ax - 1, top - ah - 1, 3, 3);
            if (chance(rng, 0.5)) warm.rect(ax + 0.5, top - ah + 0.5, 0.5, 0.5);
            else                  cool.rect(ax + 0.5, top - ah + 0.5, 0.5, 0.5);
          }
        }

        // Shop front
        if (chance(rng, 0.35)) {
          shopLight.rect(x, yBase - 3, w - 0.5, 3);
          glows.rect(x - 1, yBase - 4, w + 1, 4);
        }
      }
    }

    // --- Mid-level bridges (span between two buildings) ---
    const bridgeCount = randInt(rng, 1, 2);
    const sortedBuilt = [...allBuilt].sort((a, b) => a.x - b.x);
    for (let br = 0; br < bridgeCount; br++) {
      if (!chance(rng, 0.45)) continue;
      let bx = -1, bw = 0, bridgeY = yBase;
      outer: for (let ai = 0; ai < sortedBuilt.length - 1; ai++) {
        for (let bi = ai + 1; bi < sortedBuilt.length; bi++) {
          const a = sortedBuilt[ai], b = sortedBuilt[bi];
          const gap = b.x - (a.x + a.w);
          if (gap < 5) continue;
          const sharedTop = Math.max(yBase - a.h, yBase - b.h);
          if (sharedTop >= yBase - 30) continue;
          bridgeY = randInt(rng, sharedTop + 10, yBase - 30);
          bx = Math.floor(a.x + a.w);
          bw = Math.floor(gap);
          break outer;
        }
      }
      if (bx < 0) continue;
      struct.rect(bx, bridgeY, bw, 1);
      const lightCount = randInt(rng, 2, 4);
      for (let l = 0; l < lightCount; l++) {
        const lx = bx + Math.round((l + 0.5) * (bw / lightCount));
        glows.rect(lx - 1, bridgeY - 1, 3, 3);
        if (chance(rng, 0.6)) warm.rect(lx + 0.5, bridgeY + 0.5, 0.5, 0.5);
        else                  cool.rect(lx + 0.5, bridgeY + 0.5, 0.5, 0.5);
      }
    }

    // --- Greebles: background ground-level clutter ---
    const bgGreebleCount = randInt(rng, 8, 14);
    for (let g = 0; g < bgGreebleCount; g++) {
      if (chance(rng, 0.5)) {
        const gw = randInt(rng, 2, 5);
        const gh = randInt(rng, 2, 3);
        const gx = randInt(rng, 0, Math.max(0, sliceWidthPxAtZoom1 - gw));
        struct.rect(gx, yBase - gh, gw, gh);
      } else {
        const gl = randInt(rng, 5, 16);
        const gx = randInt(rng, 0, Math.max(0, sliceWidthPxAtZoom1 - gl));
        struct.rect(gx, yBase - 2, gl, 1);
      }
    }

    if (underground) {
      // Underground mirror — all buildings reflected below yBase
      for (const { x, w, h } of allBuilt) {
        bodies.rect(x, yBase, w, h);
      }

      // Underground details: sparse windows + bridges (~5% of topside density)
      const ugRng = mulberry32(hashSeed(i, salt + 99999));
      for (const { x, w, h } of allBuilt) {
        if (h <= 25) continue;
        for (let wy = yBase + 5; wy <= yBase + h - 9; wy += 3) {
          for (let wx = x + 1; wx <= x + w - 2; wx += 3) {
            if (!chance(ugRng, 0.033)) continue;
            glows.rect(wx - 1, wy - 1, 3, 3);
            if (chance(ugRng, 0.6)) warm.rect(wx + 0.5, wy + 0.5, 0.5, 0.5);
            else                    cool.rect(wx + 0.5, wy + 0.5, 0.5, 0.5);
          }
        }
      }

      const ugSorted = [...allBuilt].sort((a, b) => a.x - b.x);
      const ugBridgeCount = randInt(ugRng, 1, 2);
      for (let br = 0; br < ugBridgeCount; br++) {
        if (!chance(ugRng, 0.45)) continue;
        let bx = -1, bw = 0, bridgeY = yBase;
        outer: for (let ai = 0; ai < ugSorted.length - 1; ai++) {
          for (let bi = ai + 1; bi < ugSorted.length; bi++) {
            const a = ugSorted[ai], b = ugSorted[bi];
            const gap = b.x - (a.x + a.w);
            if (gap < 5) continue;
            const maxDepth = Math.min(a.h, b.h) - 5;
            if (maxDepth < 60) continue;
            bridgeY = yBase + randInt(ugRng, 60, maxDepth);
            bx = Math.floor(a.x + a.w);
            bw = Math.floor(gap);
            break outer;
          }
        }
        if (bx < 0) continue;
        struct.rect(bx, bridgeY, bw, 1);
        const lightCount = randInt(ugRng, 2, 4);
        for (let l = 0; l < lightCount; l++) {
          if (!chance(ugRng, 0.05)) continue;
          const lx = bx + Math.round((l + 0.5) * (bw / lightCount));
          glows.rect(lx - 1, bridgeY - 1, 3, 3);
          if (chance(ugRng, 0.6)) warm.rect(lx + 0.5, bridgeY + 0.5, 0.5, 0.5);
          else                    cool.rect(lx + 0.5, bridgeY + 0.5, 0.5, 0.5);
        }
      }
    }

    root.addChild(bodies.fill({ color: baseColor }));
    root.addChild(struct.fill({ color: 0x0e1520 }));
    root.addChild(shopLight.fill({ color: 0xffbb44, alpha: 0.22 }));
    root.addChild(glows.fill({ color: 0xffffff, alpha: 0.05 }));
    root.addChild(warm.fill({ color: 0xffee66, alpha: 0.7 }));
    root.addChild(cool.fill({ color: 0x88ccff, alpha: 0.7 }));

    return root;
  };
}

// Ground cross-section: surface path + layered earth between buildings and cave
export function makeGroundSectionFactory(opts: FactoryOpts): SliceFactory {
  const {
    sliceWidthPxAtZoom1,
    salt = 606,
  } = opts;

  // Y zones (surface yBase = 150)
  const surfaceY  = 148; // top of ground — buildings sit here
  const soilY     = 163; // top of dark soil layer
  const subsoilY  = 182; // top of clay/rock layer
  const stoneY    = 200; // top of stone layer (meets cave at ~210)
  const bottomY   = 212;

  const pathColor    = 0x060810;
  const soilColor    = 0x2a1e0e;
  const subsoilColor = 0x1e1610;
  const stoneColor   = 0x1a1a22;

  return (i) => {
    const root = new Container();
    const rng  = mulberry32(hashSeed(i, salt));

    const w = sliceWidthPxAtZoom1;

    // Surface path strip
    root.addChild(new Graphics().rect(0, surfaceY, w, soilY - surfaceY).fill({ color: pathColor }));

    // Dark soil
    root.addChild(new Graphics().rect(0, soilY, w, subsoilY - soilY).fill({ color: soilColor }));

    // Clay / subsoil
    root.addChild(new Graphics().rect(0, subsoilY, w, stoneY - subsoilY).fill({ color: subsoilColor }));

    // Stone (meets cave ceiling)
    root.addChild(new Graphics().rect(0, stoneY, w, bottomY - stoneY).fill({ color: stoneColor }));

    // Embedded rocks in soil
    const rockCount = randInt(rng, 1, 4);
    for (let n = 0; n < rockCount; n++) {
      const rw = randInt(rng, 3, 9);
      const rh = randInt(rng, 2, 5);
      const rx = randInt(rng, 0, w - rw);
      const ry = randInt(rng, soilY + 2, subsoilY - rh - 1);
      root.addChild(
        new Graphics().rect(rx, ry, rw, rh).fill({ color: darken(soilColor, -0.2), alpha: 0.7 }),
      );
    }

    // Root tendrils — thin horizontal lines in soil
    if (chance(rng, 0.5)) {
      const rx = randInt(rng, 0, w - 20);
      const ry = randInt(rng, soilY + 4, subsoilY - 3);
      const rlen = randInt(rng, 8, 20);
      root.addChild(
        new Graphics().rect(rx, ry, rlen, 1).fill({ color: 0x3a2a10, alpha: 0.6 }),
      );
    }

    return root;
  };
}

// Shallow underground: cave chamber with stalactites + stalagmites + crystals
export function makeShallowCaveFactory(opts: FactoryOpts): SliceFactory {
  const {
    sliceWidthPxAtZoom1,
    baseColor = 0x1a2535,
    density = 0.9,
    salt = 404,
  } = opts;

  const ceilingY = 210;
  const floorY   = 2210;
  const crystalColor = 0x4fd8e8;

  return (i) => {
    const root = new Container();
    const rng  = mulberry32(hashSeed(i, salt));

    if (!chance(rng, density)) return root;

    // Cave ceiling fill
    root.addChild(
      new Graphics()
        .rect(0, ceilingY, sliceWidthPxAtZoom1, floorY - ceilingY)
        .fill({ color: baseColor, alpha: 1 }),
    );

    // Glowing crystals
    const crystalCount = randInt(rng, 1, 4);
    for (let n = 0; n < crystalCount; n++) {
      if (!chance(rng, 0.4)) continue;
      const cx = randInt(rng, 4, sliceWidthPxAtZoom1 - 4);
      const cy = randInt(rng, ceilingY + 30, floorY - 30);
      const ch = randInt(rng, 6, 16);
      root.addChild(
        new Graphics().rect(cx, cy, 3, ch).fill({ color: crystalColor, alpha: 0.85 }),
      );
      // small halo
      root.addChild(
        new Graphics().rect(cx - 1, cy, 5, ch).fill({ color: crystalColor, alpha: 0.2 }),
      );
    }

    return root;
  };
}

// Deep core: dense glowing magma pillars
export function makeDeepCoreFactory(opts: FactoryOpts): SliceFactory {
  const {
    sliceWidthPxAtZoom1,
    baseColor = 0x2a0800,
    density = 1.0,
    salt = 505,
    yBase = 2350,
  } = opts;

  const glowColor = 0xff5500;

  return (i) => {
    const root = new Container();
    const rng  = mulberry32(hashSeed(i, salt));

    if (!chance(rng, density)) return root;

    // Background rock fill
    root.addChild(
      new Graphics()
        .rect(0, yBase - 120, sliceWidthPxAtZoom1, 120)
        .fill({ color: baseColor, alpha: 1 }),
    );

    // Lava/magma pool strip at base
    const lavaColor = darken(glowColor, randRange(rng, 0.0, 0.2));
    root.addChild(
      new Graphics()
        .rect(0, yBase - 12, sliceWidthPxAtZoom1, 12)
        .fill({ color: lavaColor, alpha: 1 }),
    );

    // Glowing pillars rising from lava
    const pillarCount = randInt(rng, 1, 3);
    for (let n = 0; n < pillarCount; n++) {
      const w = randInt(rng, 10, 28);
      const h = randInt(rng, 30, 100);
      const x = randInt(rng, 0, Math.max(0, sliceWidthPxAtZoom1 - w));
      const c = darken(glowColor, randRange(rng, 0.1, 0.45));
      root.addChild(
        new Graphics().rect(x, yBase - h, w, h).fill({ color: c, alpha: 1 }),
      );
      // glow fringe
      root.addChild(
        new Graphics().rect(x - 2, yBase - h, w + 4, h).fill({ color: glowColor, alpha: 0.12 }),
      );
    }

    // Hot spots (bright dots)
    if (chance(rng, 0.5)) {
      const hx = randInt(rng, 2, sliceWidthPxAtZoom1 - 2);
      root.addChild(
        new Graphics().rect(hx, yBase - 14, 2, 4).fill({ color: 0xffcc44, alpha: 0.9 }),
      );
    }

    return root;
  };
}

// Sky: full-height gradient from cyan at top to near-black at the horizon
export function makeSkyGradientFactory(opts: FactoryOpts): SliceFactory {
  const { sliceWidthPxAtZoom1 } = opts;
  const topY    = -4000;
  const bottomY =  155;

  return (_i) => {
    const root = new Container();

    const gradient = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end:   { x: 0, y: 1 },
      textureSpace: 'local',
      colorStops: [
        { offset: 0,    color: 0x000005 },
        { offset: 0.87, color: 0x000005 },
        { offset: 0.95, color: 0x12082a },
        { offset: 1,    color: 0x3a1255 },
      ],
    });

    root.addChild(
      new Graphics()
        .rect(0, topY, sliceWidthPxAtZoom1, bottomY - topY)
        .fill(gradient),
    );

    return root;
  };
}
