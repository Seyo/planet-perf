export const TOTAL_SLICES = 72;

type Phase = 'growing' | 'densifying' | 'done';

export type DistrictGrowthState = {
  readonly id: number;
  readonly centerSlice: number;
  sliceCount: number;
  growth: number;
  phase: Phase;
  densification: number; // 0→cap during 'densifying', frozen at cap when 'done'
};

export type GrowthSimState = {
  readonly districts: DistrictGrowthState[];
};

export type GrowthConfig = {
  growthRate: number;
  expansionThreshold: number;
  maxSlicesPerDistrict: number;
  densificationCap: number; // 0–1: how far densification runs before district is 'done'
};

export function districtSlices(d: DistrictGrowthState): number[] {
  const half = Math.floor(d.sliceCount / 2);
  const start = ((d.centerSlice - half) % TOTAL_SLICES + TOTAL_SLICES) % TOTAL_SLICES;
  return Array.from({ length: d.sliceCount }, (_, i) => (start + i) % TOTAL_SLICES);
}
