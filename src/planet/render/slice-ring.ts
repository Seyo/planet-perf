import { Container, Graphics } from "pixi.js";
import { normalize180 } from "../math";

export type Slice = Container & { homeDeg: number };
export type SliceFactory = (i: number, homeDeg: number) => Container;

export class SliceRing {
  readonly container = new Container();
  readonly slices: Slice[] = [];

  readonly basePPD: number; // pixels-per-degree at zoom=1 for THIS ring
  constructor(
    public readonly sliceCount: number,
    public readonly degPerSlice: number,
    public readonly sliceWidthPxAtZoom1: number,
    private makeSlice: SliceFactory,
    private readonly bake = false,
  ) {
    this.basePPD = sliceWidthPxAtZoom1 / degPerSlice;
    this.build();
  }

  private build() {
    this.container.removeChildren();
    this.slices.length = 0;

    for (let i = 0; i < this.sliceCount; i++) {
      const slice = new Container() as Slice;
      slice.homeDeg = i * this.degPerSlice;

      // const marker = new Graphics()
      //   .rect(-0.5, 0, 1, 1024*2)
      //   .fill({ color: 0xffffff, alpha: 0.7 });

      const content = this.makeSlice(i, slice.homeDeg);

      slice.addChild(content);
      this.container.addChild(slice);
      this.slices.push(slice);

      // Bake the slice's static geometry into a single cached texture. Collapses
      // ~15–20 batched Graphics into one quad, so per-frame batch repacking
      // during pan stops dominating the frame. Resolution 2 keeps the cache
      // crisp at moderate zoom-ins while bounding GPU memory; layers that opt
      // in must not animate their content.
      if (this.bake) slice.cacheAsTexture({ resolution: 2 });
    }
  }

  /**
   * Layout using ONE shared camera angle.
   * motionScale is the parallax: <1 moves slower, >1 moves faster.
   * Notice: we do NOT change the camera/world angle per layer.
   */
  layout(
    cameraDeg: number,
    zoom: number,
    viewWidthPx: number,
    motionScale: number,
    cullPadPx = 150,
  ) {
    const halfW = viewWidthPx / 2;
    const ppd = this.basePPD * motionScale; // unzoomed coords; zoom is handled by outer container scale

    for (const slice of this.slices) {
      const relDeg = normalize180(slice.homeDeg - cameraDeg);

      slice.x = relDeg * ppd;

      // Cull in screen space: apply zoom
      const screenX = slice.x * zoom;
      const sliceScreenW = this.degPerSlice * ppd * zoom;
      slice.visible =
        screenX + sliceScreenW > -halfW - cullPadPx && screenX < halfW + cullPadPx;
    }
  }
}

// Simple debug content you can replace later
export function debugSliceFactory(i: number) {
  const color = i === 0 ? 0xff0000 : i % 2 === 0 ? 0x00ffcc : 0x3366ff;
  return new Graphics().rect(10, 10, 10, 40).fill({ color, alpha: 1 });
}
