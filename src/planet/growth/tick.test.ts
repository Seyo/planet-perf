import { describe, expect, it } from 'vitest';
import { tick } from './tick';
import { seedDistricts } from './seed';
import type { GrowthConfig } from './types';

const cfg: GrowthConfig = {
  growthRate: 0.5,
  expansionThreshold: 1.0,
  maxSlicesPerDistrict: 71,
  densificationCap: 1.0,
};

describe('growth tick', () => {
  it('accumulates growth on a single district', () => {
    const initial = { districts: seedDistricts(1, 0) };
    const next = tick(initial, cfg);
    expect(next.districts[0].growth).toBe(0.5);
    expect(next.districts[0].sliceCount).toBe(1);
  });

  it('expands sliceCount once growth crosses expansionThreshold', () => {
    let state = { districts: seedDistricts(1, 0) };
    state = tick(state, cfg);
    state = tick(state, cfg);
    expect(state.districts[0].sliceCount).toBe(3);
  });

  it('transitions to densifying when sliceCount has reached the cap', () => {
    const districts = seedDistricts(1, 0);
    // sliceCount at cap with enough growth to push expansionDue past sliceCount/2
    districts[0] = { ...districts[0], sliceCount: 71, growth: 36.0 };
    const state = { districts };
    const next = tick(state, { ...cfg, maxSlicesPerDistrict: 71 });
    expect(next.districts[0].phase).toBe('densifying');
  });

  it('completes a district once densification hits the cap', () => {
    const districts = seedDistricts(1, 0);
    districts[0] = { ...districts[0], phase: 'densifying', densification: 0.9 };
    const state = { districts };
    const next = tick(state, cfg);
    expect(next.districts[0].phase).toBe('done');
    expect(next.districts[0].densification).toBe(1.0);
  });
});
