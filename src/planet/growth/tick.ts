import { districtSlices, TOTAL_SLICES, type DistrictGrowthState, type GrowthConfig, type GrowthSimState } from './types';

const claimedScratch = new Set<number>();

function buildClaimed(districts: DistrictGrowthState[]): Set<number> {
  claimedScratch.clear();
  for (const d of districts) for (const s of districtSlices(d)) claimedScratch.add(s);
  return claimedScratch;
}

function newEdgePair(d: DistrictGrowthState): [number, number] {
  const half  = Math.floor((d.sliceCount + 2) / 2);
  const left  = ((d.centerSlice - half) % TOTAL_SLICES + TOTAL_SLICES) % TOTAL_SLICES;
  const right = (d.centerSlice + half) % TOTAL_SLICES;
  return [left, right];
}

function canExpand(d: DistrictGrowthState, cap: number, claimed: Set<number>): boolean {
  if (d.sliceCount >= cap) return false;
  const [left, right] = newEdgePair(d);
  if (claimed.has(left)) return false;
  return !claimed.has(right);
}

function densifyOne(d: DistrictGrowthState, config: GrowthConfig): DistrictGrowthState {
  const densification = d.densification + config.growthRate / 2;
  if (densification >= config.densificationCap) {
    return { ...d, densification: config.densificationCap, phase: 'done' };
  }
  return { ...d, densification };
}

function growingOne(d: DistrictGrowthState, config: GrowthConfig, claimed: Set<number>): DistrictGrowthState {
  const growth = d.growth + config.growthRate;
  const expansionDue = Math.floor(growth / config.expansionThreshold) > (d.sliceCount - 1) / 2;
  if (!expansionDue) return { ...d, growth };
  if (canExpand(d, Math.min(config.maxSlicesPerDistrict, TOTAL_SLICES), claimed)) {
    return { ...d, growth, sliceCount: d.sliceCount + 2 };
  }
  return { ...d, growth, phase: 'densifying' };
}

export function tick(state: GrowthSimState, config: GrowthConfig): GrowthSimState {
  const claimed = buildClaimed(state.districts);
  const districts = state.districts.map(d => {
    if (d.phase === 'done')       return d;
    if (d.phase === 'densifying') return densifyOne(d, config);
    return growingOne(d, config, claimed);
  });
  return { districts };
}
