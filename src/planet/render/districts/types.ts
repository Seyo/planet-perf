import type { SliceFactory } from '../slice-ring';
import type { BuildingRegistry } from '../buildings';
import type { DistrictKind } from '../district-taper';

export type FrontStyleOpts = {
  sliceWidthPxAtZoom1: number;
  density:             number;
  maxH:                number;
  baseColor:           number;
  registry?:           BuildingRegistry;
  layerKey?:           string;
};

export type BackStyleOpts = FrontStyleOpts & {
  minH:           number;
  salt:           number;
  underground:    boolean;
  undergroundDim: number;
};

export type DistrictStyle = {
  key:   DistrictKind;
  label: string;
  makeFrontFactory(opts: FrontStyleOpts): SliceFactory;
  makeBackFactory (opts: BackStyleOpts):  SliceFactory;
};
