export const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

export function normalize180(deg: number): number {
  // normalize to [-180, 180)
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}
