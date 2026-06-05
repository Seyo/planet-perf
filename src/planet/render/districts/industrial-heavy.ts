import { Container, Graphics } from 'pixi.js';
import {
  type RNG, mulberry32, hashSeed, randInt, chance,
} from '../rng';
import {
  makeCanvas, commitCanvas, drawBuilding, drawBridge, drawSimpleGreebles,
  FRONT_THEME, BACK_THEME,
  type BuildingCanvas, type BuildingTheme, type BuildingRect, type Tier,
} from '../buildings';
import type { SliceFactory } from '../slice-ring';
import type { DistrictStyle, FrontStyleOpts, BackStyleOpts } from './types';

const INDUSTRIAL_FRONT_THEME: BuildingTheme = {
  ...FRONT_THEME,
  structColor:    0x1a140e,
  warmColor:      0xff7733,
  shopLightColor: 0xff8844,
  glowAlpha:      0.10,
};

const INDUSTRIAL_BACK_THEME: BuildingTheme = {
  ...BACK_THEME,
  structColor:    0x14100a,
  warmColor:      0xff7733,
  shopLightColor: 0xff8844,
  glowAlpha:      0.06,
};

// Ground-strip constants mirror layer-factories.ts so back industrial
// slices keep the same surface/stone silhouette as back metropolis slices.
// Kept private here to avoid editing the (yellow) layer-factories.ts.
const GROUND_SURFACE_Y   =  -2;
const GROUND_STONE_Y     =  50;
const GROUND_BOTTOM_Y    =  62;
const GROUND_PATH_COLOR  = 0x060810;
const GROUND_STONE_COLOR = 0x1a1a22;

const FRONT_SALT = 303;

type Range = [number, number];
type WindowGrid = { stepX: number; stepY: number; padTop: number; padBottom: number; density: number };
type IndustrialArchetypes = { squatT: number; stepped: number; staircase: number; twinStack: number };
const INDUSTRIAL_ARCHETYPES: IndustrialArchetypes = { squatT: 0.3, stepped: 0.6, staircase: 0.1, twinStack: 0 };

type Ctx = {
  canvas: BuildingCanvas;
  rng:    RNG;
  sliceW: number;
  yBase:  number;
  tiers:  Tier[];
  built:  BuildingRect[];
};

type WarehousePass = {
  count:           number;
  widthRange:      Range;
  heightRange:     Range;
  shopFrontChance: number;
  windowGrid:      WindowGrid;
  windowMinH:      number;
};

type SmokestackPass = {
  density:    number;
  countRange: Range;
  widthRange: Range;
  heightRange: Range;
};

type CoolingTowerPass = {
  minHeight: number;
  maxHeight: number;
};

function bound(t: Tier) {
  return { xLeft: t.x, xRight: t.x + t.w, yTop: t.top, yBottom: t.bottom, chamfer: t.chamfer };
}

function makeCtx(canvas: BuildingCanvas, rng: RNG, sliceW: number): Ctx {
  return { canvas, rng, sliceW, yBase: 0, tiers: [], built: [] };
}

// ---- primitives ----

function drawWarehouses(ctx: Ctx, pass: WarehousePass): Tier[] {
  const produced: Tier[] = [];
  for (let b = 0; b < pass.count; b++) {
    const w        = randInt(ctx.rng, pass.widthRange[0],  pass.widthRange[1]);
    const h        = randInt(ctx.rng, pass.heightRange[0], pass.heightRange[1]);
    const building = { x: randInt(ctx.rng, 0, Math.max(0, ctx.sliceW - w)), w, h };
    ctx.built.push(building);
    const tiers = drawBuilding(ctx.canvas, ctx.rng, building, {
      yBase:            ctx.yBase,
      windowMinH:       pass.windowMinH,
      windowOpts:       { ...pass.windowGrid, warmChance: 0.8 },
      shopFrontChance:  pass.shopFrontChance,
      shopFrontMinH:    10,
      archetypeWeights: INDUSTRIAL_ARCHETYPES,
    });
    ctx.tiers.push(...tiers);
    produced.push(...tiers);
  }
  return produced;
}

function drawSmokestacks(ctx: Ctx, pass: SmokestackPass): void {
  if (!chance(ctx.rng, Math.max(0.3, pass.density))) return;
  const count = randInt(ctx.rng, pass.countRange[0], pass.countRange[1]);
  for (let s = 0; s < count; s++) {
    const w   = randInt(ctx.rng, pass.widthRange[0],  pass.widthRange[1]);
    const h   = randInt(ctx.rng, pass.heightRange[0], pass.heightRange[1]);
    const x   = randInt(ctx.rng, 0, Math.max(0, ctx.sliceW - w));
    const top = ctx.yBase - h;
    ctx.canvas.bodies.rect(x, top, w, h);
    ctx.canvas.warm.rect(x + 0.5, top - 0.5, Math.max(0.5, w - 1), 1);
    ctx.canvas.glows.rect(x - 1, top - 2, w + 2, 4);
    ctx.tiers.push({ x, w, h, top, bottom: ctx.yBase });
  }
}

function drawCorrugation(ctx: Ctx, tiers: Tier[]): void {
  for (const t of tiers) {
    if (t.h < 8) continue;
    for (let y = t.top + 2; y < t.bottom - 2; y += 4) {
      ctx.canvas.struct.rect(t.x + 1, y, t.w - 2, 0.5);
    }
  }
}

function drawCoolingTower(ctx: Ctx, pass: CoolingTowerPass): void {
  const h      = randInt(ctx.rng, pass.minHeight, pass.maxHeight);
  const baseW  = randInt(ctx.rng, 14, 22);
  const waistW = Math.max(6, Math.round(baseW * 0.6));
  const topW   = Math.max(8, Math.round(baseW * 0.85));
  const x      = randInt(ctx.rng, 0, Math.max(0, ctx.sliceW - baseW));
  const segH   = Math.floor(h / 3);
  const y      = ctx.yBase;

  const base:  Tier = { x, w: baseW, h: segH, top: y - segH, bottom: y };
  const waist: Tier = {
    x: x + Math.floor((baseW - waistW) / 2), w: waistW, h: segH,
    top: y - 2 * segH, bottom: y - segH,
  };
  const cap: Tier = {
    x: x + Math.floor((baseW - topW) / 2), w: topW, h: h - 2 * segH,
    top: y - h, bottom: y - 2 * segH,
  };
  for (const t of [base, waist, cap]) ctx.canvas.bodies.rect(t.x, t.top, t.w, t.h);
  ctx.canvas.glows.rect(cap.x - 1, cap.top - 1, cap.w + 2, 3);
  ctx.tiers.push(base, waist, cap);
}

// ---- pass configs ----

const FRONT_WAREHOUSE: Omit<WarehousePass, 'count'> = {
  widthRange:  [20, 50],
  heightRange: [12, 30],
  shopFrontChance: 0.75,
  windowGrid:  { stepX: 4, stepY: 4, padTop: 2, padBottom: 4, density: 0.15 },
  windowMinH:  10,
};

const BACK_WAREHOUSE: Omit<WarehousePass, 'count'> = {
  widthRange:  [10, 28],
  heightRange: [ 8, 22],
  shopFrontChance: 0.4,
  windowGrid:  { stepX: 5, stepY: 5, padTop: 2, padBottom: 5, density: 0.08 },
  windowMinH:  8,
};

// ---- front factory ----

function drawFrontIndustrial(ctx: Ctx, density: number, maxH: number): void {
  const warehouseTiers = drawWarehouses(ctx, {
    ...FRONT_WAREHOUSE,
    count: randInt(ctx.rng, 3, 5),
  });
  drawCorrugation(ctx, warehouseTiers);

  const frontStackMax = Math.max(80, Math.round(maxH * 0.55));
  drawSmokestacks(ctx, {
    density,
    countRange:  [1, 3],
    widthRange:  [3, 6],
    heightRange: [Math.min(50, frontStackMax - 20), frontStackMax],
  });

  if (density >= 0.6 && chance(ctx.rng, 0.3)) {
    drawCoolingTower(ctx, { minHeight: 80, maxHeight: Math.max(160, Math.floor(maxH * 0.6)) });
  }
}

function drawFrontSliceFeatures(
  rng: RNG, theme: BuildingTheme, sliceW: number, built: BuildingRect[],
): Container {
  const sliceCanvas = makeCanvas();
  if (built.length >= 2 && chance(rng, 0.45)) {
    drawBridge(sliceCanvas, rng, built, 0, {
      minHeight: 30, bridgeHeight: 3, endpointGlows: true, lightCount: [3, 6],
    });
  }
  drawSimpleGreebles({ canvas: sliceCanvas, rng, sliceW, yBase: 0 }, randInt(rng, 6, 12));
  const overlay = new Container();
  commitCanvas(overlay, sliceCanvas, theme);
  return overlay;
}

function makeIndustrialHeavyFront(opts: FrontStyleOpts): SliceFactory {
  return (i) => {
    const root   = new Container();
    const rng    = mulberry32(hashSeed(i, FRONT_SALT));
    const canvas = makeCanvas();
    const theme: BuildingTheme = { ...INDUSTRIAL_FRONT_THEME, baseColor: opts.baseColor };
    const ctx    = makeCtx(canvas, rng, opts.sliceWidthPxAtZoom1);

    drawFrontIndustrial(ctx, opts.density, opts.maxH);

    if (opts.registry && opts.layerKey) {
      opts.registry.register(i, opts.layerKey, ctx.tiers.map(bound));
    }

    commitCanvas(root, canvas, theme);
    root.addChild(drawFrontSliceFeatures(rng, theme, opts.sliceWidthPxAtZoom1, ctx.built));
    return root;
  };
}

// ---- back factory ----

function drawBackIndustrial(ctx: Ctx, density: number, minH: number, maxH: number): void {
  drawWarehouses(ctx, { ...BACK_WAREHOUSE, count: randInt(ctx.rng, 2, 4) });
  const stackMax = Math.max(40, Math.round(maxH * 0.5));
  const stackMin = Math.min(Math.max(20, minH), stackMax - 10);
  drawSmokestacks(ctx, {
    density,
    countRange:  [1, 2],
    widthRange:  [2, 5],
    heightRange: [stackMin, stackMax],
  });
}

function paintBackGroundStrip(root: Container, sliceW: number): void {
  root.addChild(new Graphics().rect(0, GROUND_SURFACE_Y, sliceW, GROUND_STONE_Y - GROUND_SURFACE_Y).fill({ color: GROUND_PATH_COLOR }));
  root.addChild(new Graphics().rect(0, GROUND_STONE_Y,   sliceW, GROUND_BOTTOM_Y - GROUND_STONE_Y ).fill({ color: GROUND_STONE_COLOR }));
}

function makeIndustrialHeavyBack(opts: BackStyleOpts): SliceFactory {
  return (i) => {
    const root   = new Container();
    const rng    = mulberry32(hashSeed(i, opts.salt));
    const canvas = makeCanvas();
    const theme: BuildingTheme = { ...INDUSTRIAL_BACK_THEME, baseColor: opts.baseColor };
    const ctx    = makeCtx(canvas, rng, opts.sliceWidthPxAtZoom1);

    drawBackIndustrial(ctx, opts.density, opts.minH, opts.maxH);

    if (opts.registry && opts.layerKey) {
      opts.registry.register(i, opts.layerKey, ctx.tiers.map(bound));
    }

    commitCanvas(root, canvas, theme);

    const sliceCanvas = makeCanvas();
    drawSimpleGreebles({ canvas: sliceCanvas, rng, sliceW: opts.sliceWidthPxAtZoom1, yBase: 0 }, randInt(rng, 4, 8));
    commitCanvas(root, sliceCanvas, theme);

    paintBackGroundStrip(root, opts.sliceWidthPxAtZoom1);
    return root;
  };
}

export const INDUSTRIAL_HEAVY_STYLE: DistrictStyle = {
  key:              'industrial-heavy',
  label:            'industrial',
  makeFrontFactory: makeIndustrialHeavyFront,
  makeBackFactory:  makeIndustrialHeavyBack,
};
