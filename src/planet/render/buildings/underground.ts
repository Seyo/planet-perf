import { Container } from "pixi.js";
import { type RNG, chance, randInt } from "../rng";
import {
  makeCanvas, commitCanvas, drawBuilding,
  type BuildingCanvas, type BuildingTheme, type BuildingRect,
} from "./core";

type UgCityOpts = { yBase: number; dim: number };
type BridgeSpan = { bx: number; bw: number; bridgeY: number };

function findBridgePair(sorted: BuildingRect[]): [BuildingRect, BuildingRect] | null {
  for (let ai = 0; ai < sorted.length - 1; ai++) {
    for (let bi = ai + 1; bi < sorted.length; bi++) {
      const a = sorted[ai], b = sorted[bi];
      if (b.x - (a.x + a.w) < 5) continue;
      if (Math.min(a.h, b.h) - 5 < 60) continue;
      return [a, b];
    }
  }
  return null;
}

function placeBridgeLights(canvas: BuildingCanvas, rng: RNG, span: BridgeSpan): void {
  const lightCount = randInt(rng, 2, 4);
  for (let l = 0; l < lightCount; l++) {
    if (!chance(rng, 0.05)) continue;
    const lx = span.bx + Math.round((l + 0.5) * (span.bw / lightCount));
    canvas.glows.rect(lx - 1, span.bridgeY - 1, 3, 3);
    if (chance(rng, 0.6)) canvas.warm.rect(lx + 0.5, span.bridgeY + 0.5, 0.5, 0.5);
    else                  canvas.cool.rect(lx + 0.5, span.bridgeY + 0.5, 0.5, 0.5);
  }
}

function attemptBridge(canvas: BuildingCanvas, rng: RNG, sorted: BuildingRect[]): void {
  if (!chance(rng, 0.45)) return;
  const pair = findBridgePair(sorted);
  if (!pair) return;
  const [a, b] = pair;
  const span: BridgeSpan = {
    bx: Math.floor(a.x + a.w),
    bw: Math.floor(b.x - (a.x + a.w)),
    bridgeY: -randInt(rng, 60, Math.min(a.h, b.h) - 5),
  };
  canvas.struct.rect(span.bx, span.bridgeY, span.bw, 1);
  placeBridgeLights(canvas, rng, span);
}

export function drawUndergroundCity(
  root: Container,
  rng: RNG,
  built: BuildingRect[],
  { yBase, dim }: UgCityOpts,
): void {
  const depthT = dim * 2;
  const ugBodyColor =
    (Math.round(0x1a * depthT) << 16) |
    (Math.round(0x22 * depthT) << 8) |
    Math.round(0x32 * depthT);

  const ugTheme: BuildingTheme = {
    baseColor:      ugBodyColor,
    structColor:    0x0a0e16,
    shopLightColor: 0xffbb44,
    shopLightAlpha: 0.04,
    glowAlpha:      0.02,
    warmColor:      0xffee66,
    warmAlpha:      0.22,
    coolColor:      0x88ccff,
    coolAlpha:      0.22,
  };

  const ugCanvas = makeCanvas(0);
  for (const b of built) {
    drawBuilding(ugCanvas, rng, b, {
      yBase:               0,
      windowMinH:          25,
      windowOpts:          { stepX: 4, stepY: 4, padTop: 4, padBottom: 6, density: 0.05, warmChance: 0.55 },
      antennaChance:       0,
      shopFrontChance:     0,
      landingPadChance:    0,
      neonTrimChance:      0,
      diagonalAccentChance: 0,
      chamferChance:       0.4,
    });
  }

  const sorted = [...built].sort((a, b) => a.x - b.x);
  const bridgeCount = randInt(rng, 1, 2);
  for (let br = 0; br < bridgeCount; br++) attemptBridge(ugCanvas, rng, sorted);

  const ugContainer = new Container();
  commitCanvas(ugContainer, ugCanvas, ugTheme);
  ugContainer.scale.y = -1;
  ugContainer.y = yBase;
  root.addChild(ugContainer);
}
