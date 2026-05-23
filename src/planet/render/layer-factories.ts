import { Container, FillGradient, Graphics } from "pixi.js";
import {
  mulberry32, hashSeed, randInt, chance,
  type RNG,
} from "./rng";
import {
  makeCanvas, commitCanvas,
  drawBuilding, drawStreetLamps, drawBridge, drawDetailedGreebles, drawSimpleGreebles,
  FRONT_THEME, BACK_THEME,
  BuildingRegistry,
  type BuildingCanvas, type BuildingRect, type BuildingTheme, type SliceContext, type Tier,
} from "./buildings";
import type { SliceFactory } from "./slice-ring";

function darken(color: number, amount: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8)  & 0xff;
  const b =  color        & 0xff;
  const k = 1 - amount;
  const rr = Math.max(0, Math.min(255, Math.round(r * k)));
  const gg = Math.max(0, Math.min(255, Math.round(g * k)));
  const bb = Math.max(0, Math.min(255, Math.round(b * k)));
  return (rr << 16) | (gg << 8) | bb;
}

// Shared ground cross-section boundaries and colours — referenced by both
// the back city fill and the front ground section so all layers stay in sync.
const GROUND_SURFACE_Y   =  -2;
const GROUND_STONE_Y     =  50;
const GROUND_BOTTOM_Y    =  62;
const GROUND_PATH_COLOR  = 0x060810;
const GROUND_STONE_COLOR = 0x1a1a22;

type FactoryOpts = {
  sliceWidthPxAtZoom1: number;
  baseColor?: number;
  density?: number;
  salt?: number;
  yBase?: number;
  minH?: number;
  maxH?: number;
  skyGradient?: Array<{ offset: number; color: number }>;
  underground?: boolean;
  undergroundDim?: number;
  registry?: BuildingRegistry;
  layerKey?: string;
};

// Front: skyscrapers with glowing 1x1px windows
export function makeFrontBuildingFactory(opts: FactoryOpts): SliceFactory {
  const {
    sliceWidthPxAtZoom1,
    baseColor = 0x060810,
    density   = 0.68,
    salt      = 101,
    yBase     = 0,
    minH      = 20,
    maxH      = 280,
    registry,
    layerKey,
  } = opts;

  return (i) => {
    const root = new Container();
    const rng  = mulberry32(hashSeed(i, salt));
    const built: BuildingRect[] = [];
    const theme: BuildingTheme = { ...FRONT_THEME, baseColor };

    // One shared canvas for all buildings — avoids 7-8 Graphics objects per building.
    const buildingCanvas = makeCanvas();
    const allTiers: Tier[] = [];

    // Pass 1: low-rise fillers (always present, keeps ground covered)
    const fillerCount = randInt(rng, 3, 5);
    for (let b = 0; b < fillerCount; b++) {
      const w = randInt(rng, 6, 26) + 0.5;
      const h = randInt(rng, 8, 38);
      const building = { x: randInt(rng, 0, Math.max(0, sliceWidthPxAtZoom1 - w)), w, h };
      built.push(building);
      allTiers.push(...drawBuilding(buildingCanvas, rng, building, {
        yBase,
        windowMinH:     18,
        windowOpts:     { stepX: 4, stepY: 4, padTop: 4, padBottom: 6, density: 0.45 },
        shopFrontChance: 0.55,
      }));
    }

    // Pass 2: main skyscrapers (density-gated)
    if (chance(rng, density)) {
      const count = randInt(rng, 1, 3);
      for (let b = 0; b < count; b++) {
        const w = randInt(rng, 8, 40) + 0.5;
        const h = randInt(rng, minH, maxH);
        const building = { x: randInt(rng, 0, Math.max(0, sliceWidthPxAtZoom1 - w)), w, h };
        built.push(building);
        allTiers.push(...drawBuilding(buildingCanvas, rng, building, {
          yBase,
          windowMinH:       25,
          antennaChance:    0.55,
          shopFrontChance:  0.45,
          landingPadChance: 0.10,
          landingPadMinH:   150,
          diagonalAccentChance: 0.1,
          chamferChance: 0.95,
        }));
      }
    }

    if (registry && layerKey) {
      registry.register(i, layerKey, allTiers.map(t => ({
        xLeft: t.x, xRight: t.x + t.w, yTop: t.top, yBottom: t.bottom, chamfer: t.chamfer,
      })));
    }

    // Commit all buildings in a single batch.
    commitCanvas(root, buildingCanvas, theme);

    // Slice-level features on a single canvas painted ON TOP of all buildings.
    const sliceCanvas = makeCanvas();
    const frontCtx: SliceContext = { canvas: sliceCanvas, rng, sliceW: sliceWidthPxAtZoom1, yBase };
    drawStreetLamps(frontCtx);
    if (chance(rng, 0.28)) {
      drawBridge(sliceCanvas, rng, built, yBase, { minHeight: 40, bridgeHeight: 2, endpointGlows: true, lightCount: [3, 6] });
    }
    drawDetailedGreebles(frontCtx, randInt(rng, 10, 20));
    commitCanvas(root, sliceCanvas, theme);

    return root;
  };
}

// Background city: narrower spires with dimmer windows, own ground strip

type BackCityCtx = {
  canvas: BuildingCanvas;
  rng: RNG;
  built: BuildingRect[];
  tiers: Tier[];
  sliceW: number;
  yBase: number;
};

function buildBackFillers(ctx: BackCityCtx, count: number): void {
  for (let b = 0; b < count; b++) {
    const w = randInt(ctx.rng, 4, 14) + 0.5;
    const h = randInt(ctx.rng, 5, 22);
    const building: BuildingRect = { x: randInt(ctx.rng, 0, Math.max(0, ctx.sliceW - w)), w, h };
    ctx.built.push(building);
    ctx.tiers.push(...drawBuilding(ctx.canvas, ctx.rng, building, {
      yBase: ctx.yBase,
      windowMinH: 8,
      windowOpts: { stepX: 5, stepY: 5, padTop: 3, padBottom: 6, padLeft: 1, padRight: 2, density: 0.3 },
      shopFrontChance: 0.45,
      shopFrontMinH: 8,
    }));
  }
}

function buildBackTowers(ctx: BackCityCtx, count: number, minH: number, maxH: number): void {
  for (let b = 0; b < count; b++) {
    const w = randInt(ctx.rng, 5, 18) + 0.5;
    const h = randInt(ctx.rng, minH, maxH);
    const building: BuildingRect = { x: randInt(ctx.rng, 0, Math.max(0, ctx.sliceW - w)), w, h };
    ctx.built.push(building);
    ctx.tiers.push(...drawBuilding(ctx.canvas, ctx.rng, building, {
      yBase: ctx.yBase,
      windowMinH: 25,
      antennaChance: 0.5,
      antennaPadX: 1,
      antennaHRange: [5, 14],
      antennaLightChance: 0.45,
      shopFrontChance: 0.35,
      diagonalAccentChance: 0.1,
      chamferChance: 0.95,
    }));
  }
}

export function makeBackCityFactory(opts: FactoryOpts): SliceFactory {
  const {
    sliceWidthPxAtZoom1,
    baseColor = 0x060810,
    density   = 0.65,
    salt      = 202,
    yBase     = 0,
    minH      = 40,
    maxH      = 280,
    registry,
    layerKey,
  } = opts;

  return (i) => {
    const root = new Container();
    const rng = mulberry32(hashSeed(i, salt));
    const theme: BuildingTheme = { ...BACK_THEME, baseColor };
    const built: BuildingRect[] = [];
    const buildingCanvas = makeCanvas();
    const ctx: BackCityCtx = { canvas: buildingCanvas, rng, built, tiers: [], sliceW: sliceWidthPxAtZoom1, yBase };

    buildBackFillers(ctx, randInt(rng, 2, 4));
    if (chance(rng, density)) buildBackTowers(ctx, randInt(rng, 1, 4), minH, maxH);

    if (registry && layerKey) {
      registry.register(i, layerKey, ctx.tiers.map(t => ({
        xLeft: t.x, xRight: t.x + t.w, yTop: t.top, yBottom: t.bottom, chamfer: t.chamfer,
      })));
    }

    commitCanvas(root, buildingCanvas, theme);

    const sliceCanvas = makeCanvas();
    const backCtx: SliceContext = { canvas: sliceCanvas, rng, sliceW: sliceWidthPxAtZoom1, yBase };
    const bridgeCount = randInt(rng, 1, 2);
    for (let br = 0; br < bridgeCount; br++) {
      if (chance(rng, 0.45)) drawBridge(sliceCanvas, rng, built, yBase, { minHeight: 30, bridgeHeight: 1, endpointGlows: false, lightCount: [2, 4] });
    }
    drawSimpleGreebles(backCtx, randInt(rng, 8, 14));
    commitCanvas(root, sliceCanvas, theme);

    root.addChild(new Graphics().rect(0, yBase + GROUND_SURFACE_Y, sliceWidthPxAtZoom1, GROUND_STONE_Y - GROUND_SURFACE_Y).fill({ color: GROUND_PATH_COLOR }));
    root.addChild(new Graphics().rect(0, yBase + GROUND_STONE_Y,   sliceWidthPxAtZoom1, GROUND_BOTTOM_Y - GROUND_STONE_Y  ).fill({ color: GROUND_STONE_COLOR }));

    return root;
  };
}

// Ground cross-section: surface path + layered earth between buildings and cave
export function makeGroundSectionFactory(opts: FactoryOpts): SliceFactory {
  const { sliceWidthPxAtZoom1, salt = 606 } = opts;

  const soilY     =  13;
  const subsoilY  =  32;

  const soilColor    = 0x2a1e0e;
  const subsoilColor = 0x1e1610;

  return (i) => {
    const root = new Container();
    const rng  = mulberry32(hashSeed(i, salt));
    const w    = sliceWidthPxAtZoom1;

    root.addChild(new Graphics().rect(0, GROUND_SURFACE_Y, w, soilY            - GROUND_SURFACE_Y).fill({ color: GROUND_PATH_COLOR }));
    root.addChild(new Graphics().rect(0, soilY,            w, subsoilY - soilY               ).fill({ color: soilColor }));
    root.addChild(new Graphics().rect(0, subsoilY,         w, GROUND_STONE_Y   - subsoilY    ).fill({ color: subsoilColor }));
    root.addChild(new Graphics().rect(0, GROUND_STONE_Y,   w, GROUND_BOTTOM_Y  - GROUND_STONE_Y).fill({ color: GROUND_STONE_COLOR }));

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

    if (chance(rng, 0.5)) {
      const rx   = randInt(rng, 0, w - 20);
      const ry   = randInt(rng, soilY + 4, subsoilY - 3);
      const rlen = randInt(rng, 8, 20);
      root.addChild(
        new Graphics().rect(rx, ry, rlen, 1).fill({ color: 0x3a2a10, alpha: 0.6 }),
      );
    }

    return root;
  };
}

// Empty district slice: soil cross-section only, no buildings.
export function makeEmptySliceFactory(opts: FactoryOpts): SliceFactory {
  return makeGroundSectionFactory({ sliceWidthPxAtZoom1: opts.sliceWidthPxAtZoom1 });
}

// Empty district slice for back/grouped layers: flat ground cover matching the city slice approach.
// No soil cross-section — avoids a brown band artifact on far layers where the parallax offsets
// the detailed fill out from under the sky gradient.
export function makeBackEmptySliceFactory(opts: FactoryOpts): SliceFactory {
  const { sliceWidthPxAtZoom1 } = opts;
  return (_i) => {
    const root = new Container();
    root.addChild(new Graphics().rect(0, GROUND_SURFACE_Y, sliceWidthPxAtZoom1, GROUND_STONE_Y - GROUND_SURFACE_Y).fill({ color: GROUND_PATH_COLOR }));
    root.addChild(new Graphics().rect(0, GROUND_STONE_Y,   sliceWidthPxAtZoom1, GROUND_BOTTOM_Y - GROUND_STONE_Y).fill({ color: GROUND_STONE_COLOR }));
    return root;
  };
}

// Shallow underground: cave chamber with stalactites + stalagmites + crystals
export function makeShallowCaveFactory(opts: FactoryOpts): SliceFactory {
  const {
    sliceWidthPxAtZoom1,
    baseColor = 0x1a2535,
    density   = 0.9,
    salt      = 404,
  } = opts;

  const ceilingY     =  50;
  const floorY       = 2060;
  const crystalColor = 0x4fd8e8;

  return (i) => {
    const root = new Container();
    const rng  = mulberry32(hashSeed(i, salt));

    root.addChild(
      new Graphics()
        .rect(0, ceilingY, sliceWidthPxAtZoom1, floorY - ceilingY)
        .fill({ color: baseColor, alpha: 1 }),
    );

    if (!chance(rng, density)) return root;

    const crystalCount = randInt(rng, 1, 4);
    for (let n = 0; n < crystalCount; n++) {
      if (!chance(rng, 0.4)) continue;
      const cx = randInt(rng, 4, sliceWidthPxAtZoom1 - 4);
      const cy = randInt(rng, ceilingY + 30, floorY - 30);
      const ch = randInt(rng, 6, 16);
      root.addChild(new Graphics().rect(cx, cy, 3, ch).fill({ color: crystalColor, alpha: 0.85 }));
      root.addChild(new Graphics().rect(cx - 1, cy, 5, ch).fill({ color: crystalColor, alpha: 0.2 }));
    }

    return root;
  };
}


const DEFAULT_SKY_GRADIENT: Array<{ offset: number; color: number }> = [
  { offset: 0,    color: 0x000005 },
  { offset: 0.87, color: 0x000005 },
  { offset: 0.95, color: 0x12082a },
  { offset: 1,    color: 0x3a1255 },
];

// Sky: full-height gradient from near-black at top to horizon colour at the bottom
export function makeSkyGradientFactory(opts: FactoryOpts): SliceFactory {
  const topY    = -4150;
  const bottomY =     5;
  const stops   = opts.skyGradient ?? DEFAULT_SKY_GRADIENT;

  return (_i) => {
    const root = new Container();

    const gradient = new FillGradient({
      type:         'linear',
      start:        { x: 0, y: 0 },
      end:          { x: 0, y: 1 },
      textureSpace: 'local',
      colorStops:   stops,
    });

    root.addChild(
      new Graphics().rect(-5000, topY, 10000, bottomY - topY).fill(gradient),
    );

    return root;
  };
}
