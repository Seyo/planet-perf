export type RNG = () => number;

// Mulberry32 — tiny, fast, good enough for visuals
export function mulberry32(seed: number): RNG {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(sliceIndex: number, salt: number): number {
  let x = (sliceIndex + 1) * 0x9e3779b1;
  x ^= salt * 0x85ebca6b;
  x ^= x >>> 16;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 13;
  return x >>> 0;
}

export function randRange(rng: RNG, min: number, max: number): number {
  return min + (max - min) * rng();
}

export function randInt(rng: RNG, min: number, max: number): number {
  return Math.floor(randRange(rng, min, max + 1));
}

export function chance(rng: RNG, p: number): boolean {
  return rng() < p;
}
