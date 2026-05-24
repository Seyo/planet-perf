import { Container } from "pixi.js";
import { SliceRing } from "./slice-ring";

type Layout = {
  cameraDeg:   number;
  zoom:        number;
  viewWidthPx: number;
  cameraY:     number;
  vDeg?:       number;
};

export class SliceLayer {
  readonly container = new Container();

  constructor(
    public readonly ring: SliceRing,

    // Parallax as motion scale (translation only). This prevents drift.
    public readonly motionScale = 1,

    // Optional: scale the layer’s content (true “far away” feel)
    public readonly sizeScale = 1,

    // Vertical parallax: how much this layer tracks camera Y (1 = locked, <1 = slower/deeper feel)
    public readonly yMotionScale = 1,
  ) {
    this.container.addChild(ring.container);
    this.container.scale.set(sizeScale);
  }

  layout({ cameraDeg, zoom, viewWidthPx, cameraY, vDeg = 0 }: Layout): void {
    // Convert world velocity (°/frame) to pixel velocity in this layer's own
    // space so the pre-warm zone width correctly reflects each parallax depth.
    const speedPx = Math.abs(vDeg) * this.ring.basePPD * this.motionScale * zoom;
    this.ring.layout({ cameraDeg, zoom, viewWidthPx, motionScale: this.motionScale, speedPx });
    this.container.y = -cameraY * this.yMotionScale;
  }
}
