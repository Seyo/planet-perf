import type { District, TaperConfig } from '../render/district-taper';
import { districtSlices, TOTAL_SLICES, type DistrictGrowthState, type GrowthConfig, type GrowthSimState } from './types';

// centerT drives centre values: 0→0.5 during growth phase, 0.5→1 during densification.
// Targets at t=1, densification=1 (fully done): ρc=0.90, ρe=0.00, Hc=540, He=30.
function taperFromProgress(t: number, densification: number): TaperConfig {
  const centerT = t * 0.5 + densification * 0.5;
  return {
    centerDensity: Math.min(0.9,  centerT * 0.9),
    edgeDensity:   t * (0.25 - densification * 0.05),
    centerMaxH:    Math.round(centerT * 540),
    edgeMaxH:      Math.round(t * (60 - 30 * densification)),
    shape:         'smooth',
  };
}

function toDistrict(d: DistrictGrowthState, config: GrowthConfig): District {
  const slices = districtSlices(d);
  const t      = Math.min(1, d.sliceCount / Math.min(config.maxSlicesPerDistrict, TOTAL_SLICES));
  return { startSlice: slices[0], sliceCount: d.sliceCount, taperConfig: taperFromProgress(t, d.densification) };
}

export function toDistricts(state: GrowthSimState, config: GrowthConfig): District[] {
  return state.districts.map(d => toDistrict(d, config));
}
