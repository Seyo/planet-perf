export const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

export function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return (Math.round(ar + (br - ar) * t) << 16)
       | (Math.round(ag + (bg - ag) * t) << 8)
       |  Math.round(ab + (bb - ab) * t);
}

export function normalize180(deg: number): number {
  // normalize to [-180, 180)
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}
