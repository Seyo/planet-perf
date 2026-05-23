import { Container, Graphics } from 'pixi.js';
import { normalize180 } from '../math';
import type { District } from './district-taper';

const PPD          = 24;   // pixels per degree at zoom=1, matches front ring
const CALLOUT_RING =  4;
const BASE_Y       = -2;   // world-space ground level, matches SURFACE_Y in actor-layer

type LabelEntry = { gfx: Container; centerDeg: number };

function makeCalloutGfx(): Container {
  const c = new Container();
  const ring = new Graphics()
    .circle(0, BASE_Y, CALLOUT_RING)
    .stroke({ color: 0xffffff, width: 0.5, alpha: 0.6 });
  c.addChild(ring);
  return c;
}

function makeEntry(d: District): LabelEntry {
  const centerDeg = (d.startSlice + d.sliceCount / 2) * 5;
  return { gfx: makeCalloutGfx(), centerDeg };
}

export class DistrictLabelLayer {
  readonly container = new Container();
  private labels: LabelEntry[] = [];

  setDistricts(districts: District[]): void {
    for (const { gfx } of this.labels) {
      this.container.removeChild(gfx);
      gfx.destroy({ children: true });
    }
    this.labels = districts.map(makeEntry);
    for (const { gfx } of this.labels) this.container.addChild(gfx);
  }

  layout(cameraDeg: number, zoom: number, viewW: number, cameraY: number): void {
    this.container.x = viewW / 2;
    this.container.y = -cameraY;
    this.container.scale.set(zoom);
    for (const { gfx, centerDeg } of this.labels) {
      const relDeg = normalize180(centerDeg - cameraDeg);
      gfx.x        = relDeg * PPD;
      gfx.visible  = Math.abs(gfx.x * zoom) < viewW / 2 + 400;
    }
  }
}
