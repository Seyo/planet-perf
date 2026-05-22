export type TaperShape = 'linear' | 'smooth' | 'quad';

export type District = {
  startSlice: number;
  sliceCount: number;
  taperConfig: TaperConfig;
};

export type TaperConfig = {
  centerDensity: number;
  edgeDensity:   number;
  centerMaxH:    number;
  edgeMaxH:      number;
  shape:         TaperShape;
};

export const DEFAULT_TAPER: TaperConfig = {
  centerDensity: 0.68,
  edgeDensity:   0.20,
  centerMaxH:    280,
  edgeMaxH:       60,
  shape:         'smooth',
};

export const DEFAULT_DISTRICT2_TAPER: TaperConfig = {
  centerDensity: 0.50,
  edgeDensity:   0.75,
  centerMaxH:    500,
  edgeMaxH:       90,
  shape:         'quad',
};

function applyShape(d: number, shape: TaperShape): number {
  if (shape === 'linear') return d;
  if (shape === 'smooth') return d * d * (3 - 2 * d);
  return d * d;
}

function normalizedDist(sliceIdx: number, citySliceCount: number): number {
  const center = (citySliceCount - 1) / 2;
  return center === 0 ? 0 : Math.abs(sliceIdx - center) / center;
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

export function sliceTaperParams(
  sliceIdx: number,
  citySliceCount: number,
  config: TaperConfig,
): { density: number; maxH: number } {
  const t = applyShape(normalizedDist(sliceIdx, citySliceCount), config.shape);
  return {
    density: lerp(config.centerDensity, config.edgeDensity, t),
    maxH:    lerp(config.centerMaxH,    config.edgeMaxH,    t),
  };
}

const HEIGHT_NORM_REF = 600;

export function districtMass(config: TaperConfig): number {
  const avgDensity = (config.centerDensity + config.edgeDensity) / 2;
  const avgMaxH    = (config.centerMaxH    + config.edgeMaxH)    / 2;
  return avgDensity * (avgMaxH / HEIGHT_NORM_REF);
}

export function proportionalTaperParams(
  base: { density: number; maxH: number },
  sliceIdx: number,
  citySliceCount: number,
  config: TaperConfig,
): { density: number; maxH: number } {
  const t = applyShape(normalizedDist(sliceIdx, citySliceCount), config.shape);
  return {
    density: base.density * lerp(config.centerDensity, config.edgeDensity, t) / DEFAULT_TAPER.centerDensity,
    maxH:    base.maxH    * lerp(config.centerMaxH,    config.edgeMaxH,    t) / DEFAULT_TAPER.centerMaxH,
  };
}
