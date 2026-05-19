import { Container, Graphics } from "pixi.js";
import { type RNG, chance, randInt } from "./rng";

export type { RNG };
export type Animator = { update(tick: number): void };
export type BuildingRect = { x: number; w: number; h: number };

export type BuildingCanvas = {
  bodies:    Graphics;
  struct:    Graphics;
  shopLight: Graphics;
  glows:     Graphics;
  warm:      Graphics;
  cool:      Graphics;
  fwarm:     Graphics[]; // flicker groups (empty = no flicker)
  fcool:     Graphics[];
};

export type BuildingTheme = {
  baseColor:      number;
  structColor:    number;
  shopLightColor: number;
  shopLightAlpha: number;
  glowAlpha:      number;
  warmColor:      number;
  warmAlpha:      number;
  coolColor:      number;
  coolAlpha:      number;
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

export type BuildingOpts = {
  yBase:              number;
  windowOpts?:        WindowOpts;
  windowMinH?:        number; // minimum h to draw windows (exclusive)
  antennaChance?:     number;
  antennaPadX?:       number; // x offset from building edge
  antennaHRange?:     [number, number];
  antennaLightChance?: number;
  shopFrontChance?:   number;
  shopFrontMinH?:     number; // h must exceed this to roll shop front
  landingPadChance?:  number;
  landingPadMinH?:    number; // h must be >= this to roll landing pad
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
  root.addChild(canvas.bodies.fill({ color: theme.baseColor }));
  root.addChild(canvas.struct.fill({ color: theme.structColor }));
  root.addChild(canvas.shopLight.fill({ color: theme.shopLightColor, alpha: theme.shopLightAlpha }));
  root.addChild(canvas.glows.fill({ color: 0xffffff, alpha: theme.glowAlpha }));
  root.addChild(canvas.warm.fill({ color: theme.warmColor, alpha: theme.warmAlpha }));
  root.addChild(canvas.cool.fill({ color: theme.coolColor, alpha: theme.coolAlpha }));
  for (const fg of canvas.fwarm) root.addChild(fg.fill({ color: theme.warmColor, alpha: theme.warmAlpha }));
  for (const fg of canvas.fcool) root.addChild(fg.fill({ color: theme.coolColor, alpha: theme.coolAlpha }));
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

// ---------- primitives ----------

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
  } = opts;

  const { x, w, h } = building;
  canvas.bodies.rect(x, yBase - h, w, h);

  if (h > windowMinH) {
    drawWindowGrid(canvas, rng, building, yBase, windowOpts);
  }

  // order matches original RNG stream: landing pad → antenna → shop front
  if (landingPadChance > 0 && h >= landingPadMinH && chance(rng, landingPadChance)) {
    drawLandingPad(canvas, rng, building, yBase);
  }

  if (antennaChance > 0) {
    drawAntenna(canvas, rng, building, yBase, {
      chanceP:     antennaChance,
      ...(antennaPadX       !== undefined && { padX: antennaPadX }),
      ...(antennaHRange     !== undefined && { minH: antennaHRange[0], maxH: antennaHRange[1] }),
      ...(antennaLightChance !== undefined && { lightChance: antennaLightChance }),
    });
  }

  if (shopFrontChance > 0 && h > shopFrontMinH && chance(rng, shopFrontChance)) {
    drawShopFront(canvas, building, yBase);
  }
}

// ---------- compound: slice-level features ----------

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

// Detailed greebles: boxes with optional glows, pipes, conduits, cable trays (foreground)
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

// Simple greebles: boxes and pipes only (background)
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
