import { type Graphics } from "pixi.js";
import { type RNG, chance, randInt } from "../rng";
import type { BuildingCanvas, BuildingOpts, BuildingRect, Tier } from "./core";

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
  const top        = yBase - building.h;
  const stickRight = chance(rng, 0.5);
  const padX       = stickRight ? x : x - 8;
  const padW       = w + 8;

  canvas.struct.rect(padX, top - 2, padW, 2);
  const tipX = stickRight ? padX + padW - 1 : padX - 1;
  canvas.glows.rect(tipX, top - 3, 3, 3);
  canvas.cool.rect(tipX + 0.5, top - 1.5, 0.5, 0.5);

  const cx = x + w / 2;
  canvas.struct.rect(cx, top - 6, 1, 4);
  canvas.glows.rect(cx - 1, top - 7, 3, 3);
  canvas.warm.rect(cx + 0.5, top - 5.5, 0.5, 0.5);
}

function drawChamferNeon(
  canvas: BuildingCanvas,
  tier: Tier,
  accentLayer: Graphics,
): void {
  if (!tier.chamfer) return;
  const cs     = tier.chamfer.size;
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
  const len    = randInt(rng, 4, maxLen);
  const dirRight = chance(rng, 0.5);
  const startX = tier.x + randInt(rng, 1, Math.max(1, tier.w - len - 1));
  const startY = tier.top + randInt(rng, 3, Math.max(3, tier.h - len - 2));
  for (let i = 0; i < len; i++) {
    const px = dirRight ? startX + i : startX + (len - 1 - i);
    accentLayer.rect(px, startY + i, 1, 1);
    canvas.glows.rect(px - 1, startY + i - 1, 3, 3);
  }
}

export function drawBuildingDecorations(
  canvas: BuildingCanvas,
  rng: RNG,
  tiers: Tier[],
  topTier: Tier,
  building: BuildingRect,
  yBase: number,
  opts: BuildingOpts,
  accent: "warm" | "cool",
): void {
  const accentLayer = accent === "warm" ? canvas.warm : canvas.cool;

  const trimP = opts.neonTrimChance ?? 0.4;
  for (const t of tiers) {
    if (!t.chamfer) continue;
    if (chance(rng, trimP)) drawChamferNeon(canvas, t, accentLayer);
  }

  const diagP = opts.diagonalAccentChance ?? 0;
  if (diagP > 0) {
    for (const t of tiers) {
      if (chance(rng, diagP)) drawDiagonalAccent(canvas, rng, t, accentLayer);
    }
  }

  const {
    antennaChance     = 0,
    antennaPadX,
    antennaHRange,
    antennaLightChance,
    shopFrontChance   = 0,
    shopFrontMinH     = 0,
    landingPadChance  = 0,
    landingPadMinH    = 150,
  } = opts;

  if (landingPadChance > 0 && topTier.h >= landingPadMinH && chance(rng, landingPadChance)) {
    drawLandingPad(canvas, rng, { x: topTier.x, w: topTier.w, h: topTier.h }, topTier.bottom);
  }

  if (antennaChance > 0) {
    drawAntenna(canvas, rng, { x: topTier.x, w: topTier.w, h: topTier.h }, topTier.bottom, {
      chanceP: antennaChance,
      ...(antennaPadX        !== undefined && { padX: antennaPadX }),
      ...(antennaHRange      !== undefined && { minH: antennaHRange[0], maxH: antennaHRange[1] }),
      ...(antennaLightChance !== undefined && { lightChance: antennaLightChance }),
    });
  }

  if (shopFrontChance > 0 && building.h > shopFrontMinH && chance(rng, shopFrontChance)) {
    drawShopFront(canvas, building, yBase);
  }
}
