import { Container } from "pixi.js";
import { normalize180 } from "../math";

export type Slice = Container & { homeDeg: number };
export type SliceFactory = (i: number, homeDeg: number) => Container;

export type SliceLayoutParams = {
  cameraDeg:   number;
  zoom:        number;
  viewWidthPx: number;
  motionScale: number;
  cullPadPx?:  number;
  /** Camera speed in this layer's pixel space (px/frame). Used to size the
   *  pre-warm zone so slices bake their cacheAsTexture off-screen rather than
   *  in the same frame they enter the viewport. */
  speedPx?:    number;
};

// Pre-warm tuning — slices spend ~SAFETY_FRAMES frames in the off-screen warm
// zone before entering the required zone, giving the per-frame budget time to
// uncull them without pop-in. MAX_PRE_PAD caps the zone so we don't keep the
// full world visible during a very fast pan.
const UNCULL_SAFETY_FRAMES = 4;
const UNCULL_MAX_PRE_PAD   = 800; // px
const UNCULL_BUDGET        = 2;   // max new visible=true per frame (pre-warm only)

export class SliceRing {
  readonly container = new Container();
  readonly slices: Slice[] = [];
  readonly contentSigs: string[] = [];

  readonly basePPD: number; // pixels-per-degree at zoom=1 for THIS ring
  constructor(
    public readonly sliceCount: number,
    public readonly degPerSlice: number,
    public readonly sliceWidthPxAtZoom1: number,
    private makeSlice: SliceFactory,
    readonly bakeResolution = 0,
  ) {
    this.basePPD = sliceWidthPxAtZoom1 / degPerSlice;
    this.build();
  }

  private build() {
    this.container.removeChildren();
    this.slices.length = 0;
    this.contentSigs.length = 0;

    for (let i = 0; i < this.sliceCount; i++) {
      const slice = new Container() as Slice;
      slice.homeDeg = i * this.degPerSlice;

      const content = this.makeSlice(i, slice.homeDeg);

      slice.addChild(content);
      this.container.addChild(slice);
      this.slices.push(slice);
      this.contentSigs.push('');

      // Bake the slice's static geometry into a single cached texture. Collapses
      // ~15–20 batched Graphics into one quad, so per-frame batch repacking
      // during pan stops dominating the frame. Resolution 2 keeps the cache
      // crisp at moderate zoom-ins while bounding GPU memory; layers that opt
      // in must not animate their content.
      if (this.bakeResolution > 0) slice.cacheAsTexture({ resolution: this.bakeResolution });
    }
  }

  // Swap a single slice's content in place. Reuses the slice Container, so the
  // outer scene-graph structure and cacheAsTexture binding are preserved —
  // only the inner Graphics subtree is reallocated. updateCacheTexture()
  // signals Pixi to rebake the cached texture from the new content.
  replaceSliceContent(i: number, content: Container, sig: string): void {
    const slice = this.slices[i];
    for (const child of [...slice.children]) child.destroy({ children: true });
    slice.addChild(content);
    this.contentSigs[i] = sig;
    if (this.bakeResolution > 0) slice.updateCacheTexture();
  }

  layout(params: SliceLayoutParams) {
    const { cameraDeg, zoom, viewWidthPx, motionScale,
            cullPadPx = 150, speedPx = 0 } = params;
    const halfW = viewWidthPx / 2;
    const ppd = this.basePPD * motionScale; // unzoomed coords; zoom handled by outer container
    const sliceScreenW = this.degPerSlice * ppd * zoom;

    // Pre-warm zone: extend beyond the required zone proportional to speed so
    // each slice spends ~SAFETY_FRAMES frames becoming visible off-screen before
    // entering the required zone. This spreads cacheAsTexture rebakes across
    // multiple frames instead of spiking them all in one frame during fast pans.
    const prePadPx = cullPadPx + Math.min(speedPx * UNCULL_SAFETY_FRAMES, UNCULL_MAX_PRE_PAD);

    let newlyVisible = 0;
    for (const slice of this.slices) {
      const relDeg = normalize180(slice.homeDeg - cameraDeg);
      const x = relDeg * ppd;
      const screenX = x * zoom;
      const right = screenX + sliceScreenW;

      if (right > -halfW - cullPadPx && screenX < halfW + cullPadPx) {
        // Required zone — must be visible, no budget limit. Guarantees no pop-in.
        slice.visible = true;
        slice.x = x;
      } else if (right > -halfW - prePadPx && screenX < halfW + prePadPx) {
        // Pre-warm zone — stagger new uncull events to spread rebakes.
        newlyVisible = this.warmSlice(slice, x, newlyVisible);
      } else {
        slice.visible = false;
        // Skip transform write — stale x while invisible doesn't dirty render group.
      }
    }
  }

  // Warm up a single slice in the pre-warm zone. Returns the updated budget counter.
  // Already-visible slices stay visible and get their transform refreshed without
  // consuming budget — only first-time visibility (= cacheAsTexture rebake) is gated.
  private warmSlice(slice: Slice, x: number, budget: number): number {
    if (!slice.visible && budget < UNCULL_BUDGET) {
      slice.visible = true;
      return budget + 1;
    }
    if (slice.visible) slice.x = x;
    return budget;
  }
}
