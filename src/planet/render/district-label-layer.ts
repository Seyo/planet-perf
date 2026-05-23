import { Container, Graphics, Text } from 'pixi.js';
import { normalize180 } from '../math';
import { districtMass, type District } from './district-taper';

const PPD           = 24;   // pixels per degree at zoom=1, matches front ring
const CALLOUT_RING  =  4;
const CALLOUT_DIAG  = 100;
const CALLOUT_HORIZ = 120;
const BASE_Y        =  -2;  // world-space ground level, matches SURFACE_Y in actor-layer

type LabelEntry = { gfx: Container; centerDeg: number; text: Text };

function formatLabel(d: District): string {
  const tc = d.taperConfig;
  const m  = districtMass(tc);
  return `${d.sliceCount}sl  ρ:${tc.centerDensity.toFixed(2)}/${tc.edgeDensity.toFixed(2)}  H:${Math.round(tc.centerMaxH)}/${Math.round(tc.edgeMaxH)}  m:${m.toFixed(3)}`;
}

function makeCalloutGfx(): { container: Container; text: Text } {
  const edge = CALLOUT_RING * Math.SQRT1_2;
  const c    = new Container();

  const ring = new Graphics()
    .circle(0, BASE_Y, CALLOUT_RING)
    .stroke({ color: 0xffffff, width: 0.5, alpha: 0.6 });

  const line = new Graphics()
    .moveTo(edge, BASE_Y - edge)
    .lineTo(CALLOUT_DIAG, BASE_Y - CALLOUT_DIAG)
    .lineTo(CALLOUT_DIAG + CALLOUT_HORIZ, BASE_Y - CALLOUT_DIAG)
    .stroke({ color: 0xffffff, width: 0.5, alpha: 0.6 });

  const text = new Text({
    text: '',
    style: { fill: '#ffffff', fontSize: 7, fontFamily: 'monospace' },
  });
  text.anchor.set(0, 0.5);
  text.x = CALLOUT_DIAG + CALLOUT_HORIZ + 2;
  text.y = BASE_Y - CALLOUT_DIAG;

  c.addChild(ring, line, text);
  return { container: c, text };
}

function makeEntry(d: District): LabelEntry {
  const centerDeg = (d.startSlice + d.sliceCount / 2) * 5;
  const { container: gfx, text } = makeCalloutGfx();
  text.text = formatLabel(d);
  return { gfx, centerDeg, text };
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
