import { makeBackCityFactory, makeFrontBuildingFactory } from '../layer-factories';
import type { DistrictStyle } from './types';

export const METROPOLIS_STYLE: DistrictStyle = {
  key:   'metropolis',
  label: 'metropolis',
  makeFrontFactory(opts) {
    return makeFrontBuildingFactory({
      sliceWidthPxAtZoom1: opts.sliceWidthPxAtZoom1,
      baseColor:           opts.baseColor,
      density:             opts.density,
      maxH:                opts.maxH,
      registry:            opts.registry,
      layerKey:            opts.layerKey,
    });
  },
  makeBackFactory(opts) {
    return makeBackCityFactory({
      sliceWidthPxAtZoom1: opts.sliceWidthPxAtZoom1,
      baseColor:           opts.baseColor,
      density:             opts.density,
      minH:                opts.minH,
      maxH:                opts.maxH,
      salt:                opts.salt,
      underground:         opts.underground,
      undergroundDim:      opts.undergroundDim,
      registry:            opts.registry,
      layerKey:            opts.layerKey,
    });
  },
};
