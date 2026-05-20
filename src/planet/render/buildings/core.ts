import { Container, Graphics } from "pixi.js";
import { type RNG, chance, randInt, randRange } from "../rng";

export type { RNG };
export type Animator = { update(tick: number): void };

// Registry for dynamic light color updates via tinting
const _warmGfxRefs: WeakRef<Graphics>[] = [];
const _coolGfxRefs: WeakRef<Graphics>[] = [];

export function setLightColors(warm: number, cool: number): void {
  for (const ref of _warmGfxRefs) {
    const g = ref.deref();
    if (g && !g.destroyed) g.tint = warm;
  }
  for (const ref of _coolGfxRefs) {
    const g = ref.deref();
    if (g && !g.destroyed) g.tint = cool;
  }
}
export type BuildingRect = { x: number; w: number; h: number };

export type BodyTint = { x: number; y: number; w: number; h: number; d: number };

export type BuildingCanvas = {
  bodies:    Graphics;
  bodyTints: BodyTint[];
  struct:    Graphics;
  shopLight: Graphics;
  glows:     Graphics;
  warm:      Graphics;
  cool:      Graphics;
  fwarm:     Graphics[];
  fcool:     Graphics[];
};

export type BuildingTheme = {
  baseColor:       number;
  structColor:     number;
  shopLightColor:  number;
  shopLightAlpha:  number;
  glowAlpha:       number;
  warmColor:       number;
  warmAlpha:       number;
  coolColor:       number;
  coolAlpha:       number;
  warmOverride?:   number;
  coolOverride?:   number;
};

export const FRONT_THEME: BuildingTheme = {
  baseColor:      0x060810,
  structColor:    0x131b2a,
  shopLightColor: 0xffbb44,
  shopLightAlpha: 0.28,
  glowAlpha:      0.07,
  warmColor:      0xffee66,
  warmAlpha:      0.9,
  coolColor:      0x88ccff,
  coolAlpha:      0.9,
};

export const BACK_THEME: BuildingTheme = {
  baseColor:      0x060810,
  structColor:    0x0e1520,
  shopLightColor: 0xffbb44,
  shopLightAlpha: 0.22,
  glowAlpha:      0.05,
  warmColor:      0xffee66,
  warmAlpha:      0.7,
  coolColor:      0x88ccff,
  coolAlpha:      0.7,
};

export type WindowOpts = {
  stepX?:      number;
  stepY?:      number;
  padTop?:     number;
  padBottom?:  number;
  padLeft?:    number;
  padRight?:   number;
  density?:    number;
  warmChance?: number;
};

export type Archetype = "squatT" | "stepped" | "staircase" | "twinStack";

export type BuildingOpts = {
  yBase:                number;
  windowOpts?:          WindowOpts;
  windowMinH?:          number;
  antennaChance?:       number;
  antennaPadX?:         number;
  antennaHRange?:       [number, number];
  antennaLightChance?:  number;
  shopFrontChance?:     number;
  shopFrontMinH?:       number;
  landingPadChance?:    number;
  landingPadMinH?:      number;

  // v2 additions
  volumeCountRange?:     [number, number];
  setbackRange?:         [number, number];
  archetypeWeights?:     Partial<Record<Archetype, number>>;
  neonTrimChance?:       number;
  neonTrimDensity?:      number;
  bodyColorVariance?:    number;
  chamferChance?:        number;
  diagonalAccentChance?: number;
};

export type BridgeOpts = {
  minGap?:        number;
  minHeight?:     number;
  bridgeHeight?:  number;
  endpointGlows?: boolean;
  lightCount?:    [number, number];
};

// ---------- canvas lifecycle ----------

export function makeCanvas(flickerGroups = 0): BuildingCanvas {
  return {
    bodies:    new Graphics(),
    bodyTints: [],
    struct:    new Graphics(),
    shopLight: new Graphics(),
    glows:     new Graphics(),
    warm:      new Graphics(),
    cool:      new Graphics(),
    fwarm: Array.from({ length: flickerGroups }, () => new Graphics()),
    fcool: Array.from({ length: flickerGroups }, () => new Graphics()),
  };
}

export function commitCanvas(root: Container, canvas: BuildingCanvas, theme: BuildingTheme): void {
  const warmC = theme.warmOverride ?? theme.warmColor;
  const coolC = theme.coolOverride ?? theme.coolColor;

  root.addChild(canvas.bodies.fill({ color: theme.baseColor }));

  if (canvas.bodyTints.length > 0) {
    const r0 = (theme.baseColor >> 16) & 0xff;
    const g0 = (theme.baseColor >> 8)  & 0xff;
    const b0 =  theme.baseColor        & 0xff;
    const tintsG = new Graphics();
    for (const t of canvas.bodyTints) {
      const rr = Math.max(0, Math.min(255, r0 + t.d));
      const gg = Math.max(0, Math.min(255, g0 + t.d));
      const bb = Math.max(0, Math.min(255, b0 + t.d));
      tintsG.rect(t.x, t.y, t.w, t.h).fill({ color: (rr << 16) | (gg << 8) | bb });
    }
    root.addChild(tintsG);
  }

  root.addChild(canvas.struct.fill({ color: theme.structColor }));
  canvas.shopLight.fill({ color: 0xffffff, alpha: theme.shopLightAlpha });
  canvas.shopLight.tint = warmC;
  _warmGfxRefs.push(new WeakRef(canvas.shopLight));
  root.addChild(canvas.shopLight);
  root.addChild(canvas.glows.fill({ color: 0xffffff, alpha: theme.glowAlpha }));

  canvas.warm.fill({ color: 0xffffff, alpha: theme.warmAlpha });
  canvas.warm.tint = warmC;
  _warmGfxRefs.push(new WeakRef(canvas.warm));
  root.addChild(canvas.warm);

  canvas.cool.fill({ color: 0xffffff, alpha: theme.coolAlpha });
  canvas.cool.tint = coolC;
  _coolGfxRefs.push(new WeakRef(canvas.cool));
  root.addChild(canvas.cool);

  for (const fg of canvas.fwarm) {
    fg.fill({ color: 0xffffff, alpha: theme.warmAlpha });
    fg.tint = warmC;
    _warmGfxRefs.push(new WeakRef(fg));
    root.addChild(fg);
  }
  for (const fg of canvas.fcool) {
    fg.fill({ color: 0xffffff, alpha: theme.coolAlpha });
    fg.tint = coolC;
    _coolGfxRefs.push(new WeakRef(fg));
    root.addChild(fg);
  }
}

export function registerFlickerAnimators(
  canvas: BuildingCanvas,
  rng: RNG,
  animators: Animator[],
): void {
  for (let gi = 0; gi < canvas.fwarm.length; gi++) {
    const fw = canvas.fwarm[gi];
    const fc = canvas.fcool[gi];
    const phase = rng() * Math.PI * 2;
    const speed = 0.03 + rng() * 0.06;
    animators.push({
      update(tick) {
        const v = Math.sin(tick * speed + phase);
        const a = v > 0.6 ? 0.9 : v > -0.2 ? 0.35 : 0.0;
        fw.alpha = a;
        fc.alpha = a;
      },
    });
  }
}

// ---------- primitives (kept identical to v1 for API parity) ----------

function placeWindow(canvas: BuildingCanvas, rng: RNG, wx: number, wy: number, isWarm: boolean): void {
  if (canvas.fwarm.length > 0 && chance(rng, 0.03)) {
    const g = randInt(rng, 0, canvas.fwarm.length - 1);
    if (isWarm) canvas.fwarm[g].rect(wx + 0.5, wy + 0.5, 0.5, 0.5);
    else        canvas.fcool[g].rect(wx + 0.5, wy + 0.5, 0.5, 0.5);
  } else {
    if (isWarm) canvas.warm.rect(wx + 0.5, wy + 0.5, 0.5, 0.5);
    else        canvas.cool.rect(wx + 0.5, wy + 0.5, 0.5, 0.5);
  }
}

export function drawWindowGrid(
  canvas: BuildingCanvas,
  rng: RNG,
  building: BuildingRect,
  yBase: number,
  opts: WindowOpts = {},
): void {
  const {
    stepX = 3, stepY = 3,
    padTop = 5, padBottom = 9,
    padLeft = 2, padRight = 3,
    density = 0.65, warmChance = 0.6,
  } = opts;

  const { x, w, h } = building;
  const top = yBase - h;

  for (let wy = top + padTop; wy <= yBase - padBottom; wy += stepY) {
    for (let wx = x + padLeft; wx <= x + w - padRight; wx += stepX) {
      if (!chance(rng, density)) continue;
      canvas.glows.rect(wx - 1, wy - 1, 3, 3);
      placeWindow(canvas, rng, wx, wy, chance(rng, warmChance));
    }
  }
}

export function drawAntenna(
  canvas: BuildingCanvas,
  rng: RNG,
  building: BuildingRect,
  yBase: number,
  opts: { chanceP?: number; padX?: number; minH?: number; maxH?: number; lightChance?: number } = {},
): void {
  const { chanceP = 0.55, padX = 2, minH = 6, maxH = 16, lightChance = 0.5 } = opts;
  if (!chance(rng, chanceP)) return;

  const { x, w } = building;
  const top = yBase - building.h;
  const ax  = x + randInt(rng, padX, Math.max(padX, w - padX));
  const ah  = randInt(rng, minH, maxH);

  canvas.struct.rect(ax, top - ah, 1, ah);
  if (chance(rng, lightChance)) {
    canvas.glows.rect(ax - 1, top - ah - 1, 3, 3);
    if (chance(rng, 0.5)) canvas.warm.rect(ax + 0.5, top - ah + 0.5, 0.5, 0.5);
    else                  canvas.cool.rect(ax + 0.5, top - ah + 0.5, 0.5, 0.5);
  }
}

export function drawShopFront(
  canvas: BuildingCanvas,
  building: BuildingRect,
  yBase: number,
): void {
  const { x, w } = building;
  canvas.shopLight.rect(x, yBase - 3, w - 0.5, 3);
  canvas.glows.rect(x - 1, yBase - 4, w + 1, 4);
}

export function drawLandingPad(
  canvas: BuildingCanvas,
  rng: RNG,
  building: BuildingRect,
  yBase: number,
): void {
  const { x, w } = building;
  const top       = yBase - building.h;
  const stickRight = chance(rng, 0.5);
  const padX      = stickRight ? x : x - 8;
  const padW      = w + 8;

  canvas.struct.rect(padX, top - 2, padW, 2);
  const tipX = stickRight ? padX + padW - 1 : padX - 1;
  canvas.glows.rect(tipX, top - 3, 3, 3);
  canvas.cool.rect(tipX + 0.5, top - 1.5, 0.5, 0.5);

  const cx = x + w / 2;
  canvas.struct.rect(cx, top - 6, 1, 4);
  canvas.glows.rect(cx - 1, top - 7, 3, 3);
  canvas.warm.rect(cx + 0.5, top - 5.5, 0.5, 0.5);
}

// ---------- v2: stacked-volume helpers ----------

type ChamferCorner = "tl" | "tr" | "both";
type Chamfer = { corner: ChamferCorner; size: number };
type Tier = { x: number; w: number; h: number; top: number; bottom: number; chamfer?: Chamfer };

function pickColorDrift(rng: RNG, variance: number): { d: number } {
  if (variance <= 0) return { d: 0 };
  const amount = variance * 255;
  return { d: Math.round((rng() - 0.5) * 2 * amount) };
}

const DEFAULT_WEIGHTS: Record<Archetype, number> = {
  squatT: 0.25, stepped: 0.4, staircase: 0.25, twinStack: 0.1,
};

function chooseArchetype(rng: RNG, h: number, weights: Partial<Record<Archetype, number>> = {}): Archetype {
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  if (h < 25) return "squatT";
  if (h < 60) {
    w.twinStack = 0;
    w.squatT *= 1.6;
  } else if (h > 140) {
    w.squatT *= 0.4;
    w.stepped *= 1.4;
  }
  if (h < 70) w.twinStack = 0;
  const total = (w.squatT ?? 0) + (w.stepped ?? 0) + (w.staircase ?? 0) + (w.twinStack ?? 0);
  if (total <= 0) return "stepped";
  let r = rng() * total;
  if ((r -= w.squatT    ?? 0) < 0) return "squatT";
  if ((r -= w.stepped   ?? 0) < 0) return "stepped";
  if ((r -= w.staircase ?? 0) < 0) return "staircase";
  return "twinStack";
}

function tierFrom(x: number, w: number, h: number, top: number): Tier {
  return { x, w, h, top, bottom: top + h };
}

function layoutSquatT(building: BuildingRect, yBase: number, rng: RNG): Tier[] {
  const { x, w, h } = building;
  const baseH = Math.max(6, Math.floor(h * randRange(rng, 0.5, 0.65)));
  const baseTop = yBase - baseH;
  const base = tierFrom(x, w, baseH, baseTop);

  const remH = h - baseH;
  if (remH < 6 || w < 6) return [base];

  const tiers: Tier[] = [base];
  const extrCount = w >= 14 && chance(rng, 0.45) ? 2 : 1;
  if (extrCount === 1) {
    const ew = Math.max(3, Math.floor(w * randRange(rng, 0.35, 0.6)));
    const ex = x + randInt(rng, 0, w - ew);
    const eh = remH;
    tiers.push(tierFrom(ex, ew, eh, baseTop - eh));
  } else {
    const ew1 = Math.max(3, Math.floor(w * randRange(rng, 0.25, 0.4)));
    const ew2 = Math.max(3, Math.floor(w * randRange(rng, 0.25, 0.4)));
    const ex1 = x + randInt(rng, 0, Math.floor(w / 2) - ew1);
    const ex2 = x + Math.floor(w / 2) + randInt(rng, 0, Math.max(0, Math.floor(w / 2) - ew2));
    const eh1 = randInt(rng, Math.max(4, Math.floor(remH * 0.5)), remH);
    const eh2 = randInt(rng, Math.max(4, Math.floor(remH * 0.5)), remH);
    tiers.push(tierFrom(ex1, ew1, eh1, baseTop - eh1));
    tiers.push(tierFrom(ex2, ew2, eh2, baseTop - eh2));
  }
  return tiers;
}

function layoutStepped(building: BuildingRect, yBase: number, rng: RNG, opts: BuildingOpts): Tier[] {
  const { x, w, h } = building;
  const [vMin, vMax] = opts.volumeCountRange ?? [2, 4];
  const [sMin, sMax] = opts.setbackRange ?? [2, 5];
  let n = randInt(rng, vMin, vMax);
  if (h < 50) n = Math.min(n, 2);
  if (h < 25) n = 1;

  const tiers: Tier[] = [];
  let curX = x, curW = w, remH = h;
  let curTop = yBase;
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    const tierH = isLast
      ? remH
      : Math.max(5, Math.floor(remH * randRange(rng, 0.35, 0.6)));
    const top = curTop - tierH;
    tiers.push(tierFrom(curX, curW, tierH, top));
    remH -= tierH;
    curTop = top;
    if (isLast) break;
    const setback = randInt(rng, sMin, sMax);
    if (curW - setback * 2 < 2) break;
    curX += setback;
    curW -= setback * 2;
  }
  return tiers;
}

function layoutStaircase(building: BuildingRect, yBase: number, rng: RNG, opts: BuildingOpts): Tier[] {
  const { x, w, h } = building;
  const [vMin, vMax] = opts.volumeCountRange ?? [2, 4];
  const [sMin, sMax] = opts.setbackRange ?? [2, 5];
  let n = randInt(rng, vMin, vMax);
  if (h < 50) n = Math.min(n, 2);
  if (h < 25) n = 1;

  const side: "left" | "right" = chance(rng, 0.5) ? "left" : "right";

  const tiers: Tier[] = [];
  let curX = x, curW = w, remH = h;
  let curTop = yBase;
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    const tierH = isLast
      ? remH
      : Math.max(5, Math.floor(remH * randRange(rng, 0.35, 0.6)));
    const top = curTop - tierH;
    tiers.push(tierFrom(curX, curW, tierH, top));
    remH -= tierH;
    curTop = top;
    if (isLast) break;
    const setback = randInt(rng, sMin, sMax);
    if (curW - setback < 2) break;
    if (side === "left") curX += setback;
    curW -= setback;
  }
  return tiers;
}

function layoutTwinStack(building: BuildingRect, yBase: number, rng: RNG): Tier[] {
  const { x, w, h } = building;
  const baseH = Math.max(6, Math.floor(h * randRange(rng, 0.25, 0.4)));
  const baseTop = yBase - baseH;
  const base = tierFrom(x, w, baseH, baseTop);

  const remH = h - baseH;
  if (remH < 10 || w < 8) return [base];

  const halfW = Math.floor(w / 2);
  const w1 = Math.max(3, Math.floor(halfW * randRange(rng, 0.6, 0.9)));
  const w2 = Math.max(3, Math.floor(halfW * randRange(rng, 0.6, 0.9)));
  const x1 = x + randInt(rng, 0, Math.max(0, halfW - w1));
  const x2 = x + halfW + randInt(rng, 0, Math.max(0, halfW - w2));
  const h1 = randInt(rng, Math.max(8, Math.floor(remH * 0.55)), remH);
  const h2 = randInt(rng, Math.max(8, Math.floor(remH * 0.55)), remH);

  return [
    base,
    tierFrom(x1, w1, h1, baseTop - h1),
    tierFrom(x2, w2, h2, baseTop - h2),
  ];
}

function maybeChamfer(rng: RNG, tier: Tier, opts: BuildingOpts): void {
  const p = opts.chamferChance ?? 0;
  if (p <= 0) return;
  if (tier.h < 10 || tier.w < 6) return;
  if (!chance(rng, p)) return;

  const corner: ChamferCorner =
    chance(rng, 0.15) ? "both" :
    chance(rng, 0.5)  ? "tl"   : "tr";

  const maxSize = Math.min(
    8,
    Math.floor(tier.w / 2) - 1,
    Math.floor(tier.h / 2),
  );
  if (maxSize < 2) return;
  tier.chamfer = { corner, size: randInt(rng, 2, maxSize) };
}

function layoutVolumes(building: BuildingRect, yBase: number, rng: RNG, opts: BuildingOpts): Tier[] {
  if (building.h < 15) {
    return [tierFrom(building.x, building.w, building.h, yBase - building.h)];
  }
  const arc = chooseArchetype(rng, building.h, opts.archetypeWeights);
  let tiers: Tier[];
  switch (arc) {
    case "squatT":    tiers = layoutSquatT(building, yBase, rng); break;
    case "stepped":   tiers = layoutStepped(building, yBase, rng, opts); break;
    case "staircase": tiers = layoutStaircase(building, yBase, rng, opts); break;
    case "twinStack": tiers = layoutTwinStack(building, yBase, rng); break;
  }
  for (const t of tiers) maybeChamfer(rng, t, opts);
  return tiers;
}

function emitTierBody(
  canvas: BuildingCanvas,
  tier: Tier,
  drift: { d: number } | null,
): void {
  const useTints = drift !== null;
  const push = (x: number, y: number, w: number, h: number) => {
    if (w <= 0 || h <= 0) return;
    if (useTints) canvas.bodyTints.push({ x, y, w, h, d: drift.d });
    else canvas.bodies.rect(x, y, w, h);
  };

  if (!tier.chamfer) {
    push(tier.x, tier.top, tier.w, tier.h);
    return;
  }

  const cs = tier.chamfer.size;
  const corner = tier.chamfer.corner;
  // body below chamfer zone
  push(tier.x, tier.top + cs, tier.w, tier.h - cs);
  // stair-step rows from top of chamfer down to first full-width row
  for (let row = 0; row < cs; row++) {
    const taper = cs - 1 - row;
    let rx = tier.x;
    let rw = tier.w;
    if (corner === "tl" || corner === "both") { rx += taper; rw -= taper; }
    if (corner === "tr" || corner === "both") rw -= taper;
    push(rx, tier.top + row, rw, 1);
  }
}

function drawChamferNeon(
  canvas: BuildingCanvas,
  tier: Tier,
  accentLayer: Graphics,
): void {
  if (!tier.chamfer) return;
  const cs = tier.chamfer.size;
  const corner = tier.chamfer.corner;
  for (let row = 0; row < cs; row++) {
    const taper = cs - 1 - row;
    if (corner === "tl" || corner === "both") {
      const ex = tier.x + taper;
      accentLayer.rect(ex, tier.top + row, 1, 1);
      canvas.glows.rect(ex - 1, tier.top + row - 1, 3, 3);
    }
    if (corner === "tr" || corner === "both") {
      const ex = tier.x + tier.w - taper - 1;
      accentLayer.rect(ex, tier.top + row, 1, 1);
      canvas.glows.rect(ex - 1, tier.top + row - 1, 3, 3);
    }
  }
}

function drawDiagonalAccent(
  canvas: BuildingCanvas,
  rng: RNG,
  tier: Tier,
  accentLayer: Graphics,
): void {
  if (tier.h < 18 || tier.w < 8) return;
  const maxLen = Math.min(12, Math.floor(tier.h / 2), tier.w - 2);
  if (maxLen < 4) return;
  const len = randInt(rng, 4, maxLen);
  const dirRight = chance(rng, 0.5);
  const startX = tier.x + randInt(rng, 1, Math.max(1, tier.w - len - 1));
  const startY = tier.top + randInt(rng, 3, Math.max(3, tier.h - len - 2));
  for (let i = 0; i < len; i++) {
    const px = dirRight ? startX + i : startX + (len - 1 - i);
    accentLayer.rect(px, startY + i, 1, 1);
    canvas.glows.rect(px - 1, startY + i - 1, 3, 3);
  }
}

function drawNeonTrim(
  canvas: BuildingCanvas,
  rng: RNG,
  tiers: Tier[],
  accent: "warm" | "cool",
  opts: BuildingOpts,
): void {
  const trimChance = opts.neonTrimChance ?? 0.4;
  const trimDensity = opts.neonTrimDensity ?? 0.6;
  if (trimChance <= 0) return;

  const accentLayer = accent === "warm" ? canvas.warm : canvas.cool;
  const sideLayer   = accent === "warm" ? canvas.cool : canvas.warm;

  for (let i = 1; i < tiers.length; i++) {
    const t = tiers[i];
    const below = tiers[i - 1];
    if (t.top + t.h !== below.top) continue;
    if (!chance(rng, trimChance)) continue;
    const sx = Math.max(t.x, below.x);
    const sw = Math.min(t.x + t.w, below.x + below.w) - sx;
    if (sw <= 0) continue;
    const seamY = t.top + t.h;
    accentLayer.rect(sx, seamY, sw, 1);
    canvas.glows.rect(sx - 1, seamY - 1, sw + 2, 3);
  }

  for (const t of tiers) {
    if (t.h <= 20) continue;
    if (!chance(rng, trimChance * 0.5)) continue;
    const sideRight = chance(rng, 0.5);
    const sx = sideRight ? t.x + t.w - 1 : t.x;
    const len = Math.max(3, Math.floor(t.h * trimDensity));
    const sy = t.top + Math.floor((t.h - len) / 2);
    sideLayer.rect(sx, sy, 1, len);
    canvas.glows.rect(sx - 1, sy - 1, 3, len + 2);
  }
}

// ---------- compound: single building ----------

export function drawBuilding(
  canvas: BuildingCanvas,
  rng: RNG,
  building: BuildingRect,
  opts: BuildingOpts,
): void {
  const {
    yBase,
    windowOpts,
    windowMinH        = 0,
    antennaChance     = 0,
    antennaPadX,
    antennaHRange,
    antennaLightChance,
    shopFrontChance   = 0,
    shopFrontMinH     = 0,
    landingPadChance  = 0,
    landingPadMinH    = 150,
    bodyColorVariance = 0,
  } = opts;

  const tiers = layoutVolumes(building, yBase, rng, opts);
  if (tiers.length === 0) return;

  // each tier gets a small per-channel color drift that commitCanvas applies relative to baseColor
  for (const t of tiers) {
    const drift = bodyColorVariance > 0 ? pickColorDrift(rng, bodyColorVariance) : null;
    emitTierBody(canvas, t, drift);
  }

  // pick the accent (warm vs cool) once for this building
  const accent: "warm" | "cool" = chance(rng, 0.55) ? "warm" : "cool";

  // window grids per tier
  for (const t of tiers) {
    if (t.h > windowMinH) {
      drawWindowGrid(canvas, rng, { x: t.x, w: t.w, h: t.h }, t.bottom, windowOpts);
    }
  }

  // neon trim
  drawNeonTrim(canvas, rng, tiers, accent, opts);

  // diagonal neon along chamfered edges (gated by the same trim chance)
  const accentLayer = accent === "warm" ? canvas.warm : canvas.cool;
  const trimP = opts.neonTrimChance ?? 0.4;
  for (const t of tiers) {
    if (!t.chamfer) continue;
    if (chance(rng, trimP)) drawChamferNeon(canvas, t, accentLayer);
  }

  // standalone diagonal slash detail
  const diagP = opts.diagonalAccentChance ?? 0;
  if (diagP > 0) {
    for (const t of tiers) {
      if (chance(rng, diagP)) drawDiagonalAccent(canvas, rng, t, accentLayer);
    }
  }

  // landing pad on top tier
  const topTier = tiers.reduce((a, b) => (a.top < b.top ? a : b));
  if (landingPadChance > 0 && topTier.h >= landingPadMinH && chance(rng, landingPadChance)) {
    drawLandingPad(canvas, rng, { x: topTier.x, w: topTier.w, h: topTier.h }, topTier.bottom);
  }

  // antennae on top tier
  if (antennaChance > 0) {
    drawAntenna(canvas, rng, { x: topTier.x, w: topTier.w, h: topTier.h }, topTier.bottom, {
      chanceP:     antennaChance,
      ...(antennaPadX        !== undefined && { padX: antennaPadX }),
      ...(antennaHRange      !== undefined && { minH: antennaHRange[0], maxH: antennaHRange[1] }),
      ...(antennaLightChance !== undefined && { lightChance: antennaLightChance }),
    });
  }

  // shop front along the base
  if (shopFrontChance > 0 && building.h > shopFrontMinH && chance(rng, shopFrontChance)) {
    drawShopFront(canvas, building, yBase);
  }
}

// ---------- compound: slice-level features (kept identical to v1) ----------

export function drawStreetLamps(
  canvas: BuildingCanvas,
  rng: RNG,
  sliceW: number,
  yBase: number,
  opts: { chanceP?: number; countRange?: [number, number] } = {},
): void {
  const { chanceP = 0.65, countRange = [1, 2] } = opts;
  if (!chance(rng, chanceP)) return;

  const count = randInt(rng, countRange[0], countRange[1]);
  for (let l = 0; l < count; l++) {
    const lx = randInt(rng, 2, sliceW - 2);
    canvas.struct.rect(lx, yBase - 18, 1, 18);
    canvas.struct.rect(lx - 1, yBase - 18, 3, 1);
    canvas.glows.rect(lx - 2, yBase - 20, 5, 5);
    canvas.warm.rect(lx + 0.5, yBase - 17.5, 0.5, 0.5);
  }
}

export function drawBridge(
  canvas: BuildingCanvas,
  rng: RNG,
  buildings: BuildingRect[],
  yBase: number,
  opts: BridgeOpts = {},
): boolean {
  const {
    minGap       = 5,
    minHeight    = 40,
    bridgeHeight = 2,
    endpointGlows = true,
    lightCount   = [3, 6],
  } = opts;

  const sorted = [...buildings].sort((a, b) => a.x - b.x);
  let bx = -1, bw = 0, bridgeY = yBase;

  outer: for (let ai = 0; ai < sorted.length - 1; ai++) {
    for (let bi = ai + 1; bi < sorted.length; bi++) {
      const a = sorted[ai], b = sorted[bi];
      const gap = b.x - (a.x + a.w);
      if (gap < minGap) continue;
      const sharedTop = Math.max(yBase - a.h, yBase - b.h);
      if (sharedTop >= yBase - minHeight) continue;
      bridgeY = randInt(rng, sharedTop + 10, yBase - minHeight);
      bx = Math.floor(a.x + a.w);
      bw = Math.floor(gap);
      break outer;
    }
  }

  if (bx < 0) return false;

  canvas.struct.rect(bx, bridgeY, bw, bridgeHeight);
  if (endpointGlows) {
    canvas.glows.rect(bx - 1, bridgeY - 1, 4, 4);
    canvas.glows.rect(bx + bw - 2, bridgeY - 1, 4, 4);
  }

  const lc = randInt(rng, lightCount[0], lightCount[1]);
  for (let l = 0; l < lc; l++) {
    const lx = bx + Math.round((l + 0.5) * (bw / lc));
    canvas.glows.rect(lx - 1, bridgeY - 1, 3, 3);
    if (chance(rng, 0.6)) canvas.warm.rect(lx + 0.5, bridgeY + 0.5, 0.5, 0.5);
    else                  canvas.cool.rect(lx + 0.5, bridgeY + 0.5, 0.5, 0.5);
  }
  return true;
}

export function drawDetailedGreebles(
  canvas: BuildingCanvas,
  rng: RNG,
  count: number,
  sliceW: number,
  yBase: number,
): void {
  for (let g = 0; g < count; g++) {
    const type = randInt(rng, 0, 2);
    if (type === 0) {
      const gw = randInt(rng, 2, 6);
      const gh = randInt(rng, 2, 4);
      const gx = randInt(rng, 0, Math.max(0, sliceW - gw));
      canvas.struct.rect(gx, yBase - gh, gw, gh);
      if (chance(rng, 0.3)) canvas.glows.rect(gx + 1, yBase - gh - 1, 2, 2);
    } else if (type === 1) {
      const gl = randInt(rng, 6, 20);
      const gx = randInt(rng, 0, Math.max(0, sliceW - gl));
      canvas.struct.rect(gx, yBase - 2, gl, 1);
    } else {
      if (chance(rng, 0.5)) {
        const gs = randInt(rng, 4, 10);
        const gx = randInt(rng, 0, sliceW - 1);
        canvas.struct.rect(gx, yBase - gs, 1, gs);
      } else {
        const gl = randInt(rng, 10, 30);
        const gx = randInt(rng, 0, Math.max(0, sliceW - gl));
        canvas.struct.rect(gx, yBase - 5, gl, 1);
      }
    }
  }
}

export function drawSimpleGreebles(
  canvas: BuildingCanvas,
  rng: RNG,
  count: number,
  sliceW: number,
  yBase: number,
): void {
  for (let g = 0; g < count; g++) {
    if (chance(rng, 0.5)) {
      const gw = randInt(rng, 2, 5);
      const gh = randInt(rng, 2, 3);
      const gx = randInt(rng, 0, Math.max(0, sliceW - gw));
      canvas.struct.rect(gx, yBase - gh, gw, gh);
    } else {
      const gl = randInt(rng, 5, 16);
      const gx = randInt(rng, 0, Math.max(0, sliceW - gl));
      canvas.struct.rect(gx, yBase - 2, gl, 1);
    }
  }
}
