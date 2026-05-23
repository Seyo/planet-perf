import { mulberry32 } from '../render/rng';
import { TOTAL_SLICES, type DistrictGrowthState } from './types';

const MIN_SPACING = 8;
const MAX_ATTEMPTS = 2000;

function newDistrict(centerSlice: number): DistrictGrowthState {
  return { id: centerSlice, centerSlice, sliceCount: 1, growth: 0, phase: 'growing', densification: 0 };
}

function circularDist(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, TOTAL_SLICES - d);
}

function isFarEnough(candidate: number, placed: DistrictGrowthState[]): boolean {
  return placed.every(d => circularDist(d.centerSlice, candidate) >= MIN_SPACING);
}

export function seedDistricts(count: number, seed: number): DistrictGrowthState[] {
  const states: DistrictGrowthState[] = [newDistrict(0)];
  if (count <= 1) return states;
  const rng = mulberry32(seed + 1);
  let attempts = 0;
  while (states.length < count && attempts < MAX_ATTEMPTS) {
    attempts++;
    const candidate = Math.floor(rng() * TOTAL_SLICES);
    if (isFarEnough(candidate, states)) states.push(newDistrict(candidate));
  }
  return states;
}
