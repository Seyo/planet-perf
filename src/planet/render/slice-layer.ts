import { Container } from "pixi.js";
import { SliceRing } from "./slice-ring";

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

  layout(cameraDeg: number, zoom: number, viewWidthPx: number, cameraY: number) {
    this.ring.layout({ cameraDeg, zoom, viewWidthPx, motionScale: this.motionScale });
    this.container.y = -cameraY * this.yMotionScale;
  }
}
