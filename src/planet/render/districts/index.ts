import type { DistrictKind } from '../district-taper';
import type { DistrictStyle } from './types';
import { METROPOLIS_STYLE } from './metropolis';
import { INDUSTRIAL_HEAVY_STYLE } from './industrial-heavy';

export type { DistrictStyle } from './types';

export const ALL_STYLES: readonly DistrictStyle[] = [
  METROPOLIS_STYLE,
  INDUSTRIAL_HEAVY_STYLE,
];

const STYLES_BY_KEY = new Map<DistrictKind, DistrictStyle>(
  ALL_STYLES.map(s => [s.key, s]),
);

export function getDistrictStyle(kind: DistrictKind | undefined): DistrictStyle {
  return (kind && STYLES_BY_KEY.get(kind)) ?? METROPOLIS_STYLE;
}
