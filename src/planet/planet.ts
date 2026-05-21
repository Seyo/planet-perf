import type { Application } from "pixi.js";
import { Container, FillGradient, Graphics } from "pixi.js";
import { PointerX } from "./input/pointer-x";
import { WheelZoom } from "./input/wheel-zoom";
import { ActorLayer } from "./render/actor-layer";

export interface ActorLike {
  container: Container;
  update(dt: number): void;
  layout(cameraDeg: number, zoom: number, viewWidthPx: number, cameraY: number): void;
}
import { SliceLayer } from "./render/slice-layer";
import { SliceRing } from "./render/slice-ring";
import type { SliceFactory } from "./render/slice-ring";
import { makeBackCityFactory, makeDeepCoreFactory, makeFrontBuildingFactory, makeGroundSectionFactory, makeShallowCaveFactory, makeSkyGradientFactory } from "./render/layer-factories";
import type { Animator } from "./render/layer-factories";

export type WorldState = {
  xDeg: number;   // continuous, never wrapped
  vDeg: number;   // degrees per tick
  cameraY: number; // px at zoom=1; increases = looking underground
  vY: number;      // px per tick
};

const INERTIA_ENABLED = true;
const INERTIA_FRICTION = 0.95;

export const HAZE_COLOR = 0x7a6090; // dusty purple — tweak freely
export const CAVE_HAZE_COLOR = 0x2c3f5a; // slightly brighter than shallow cave background

// Zoom constraints based on FRONT ring slice density
const MAX_VISIBLE_SLICES_ZOOM_OUT = 72 * 0.5;
const MAX_VISIBLE_SLICES_ZOOM_IN = 1;

export class Planet {
  readonly root = new Container(); // we scale + center this
  readonly animators: Animator[] = [];
  private tick = 0;
  private world: WorldState = { xDeg: 0, vDeg: 0, cameraY: 0, vY: 0 };

  private pointer: PointerX;
  private zoom: WheelZoom;

  private dragStartPointerX = 0;
  private dragStartWorldXDeg = 0;
  private dragStartPointerY = 0;
  private dragStartCameraY = 0;
  private prevPointerX: number | null = null;
  private prevPointerY: number | null = null;

  private layers: SliceLayer[] = [];
  private actorLayers: ActorLike[] = [];
  private overlays: Array<{ container: Container; yMotionScale: number }> = [];
  private interactionLayer!: SliceLayer;

  private autoPanDegPerTick = 0;
  private cameraLockTarget: (() => number) | null = null;

  constructor(private app: Application) {
    this.pointer = new PointerX(app);
    this.pointer.attach();

    this.zoom = new WheelZoom(0.0015);

    this.app.stage.addChild(this.root);

    this.installWheel();
    this.installResize();
  }

  addLayer(
    layer: SliceLayer,
    { asInteractionLayer = false, behindAll = false } = {},
  ) {
    if (behindAll) {
      this.layers.push(layer);
      this.root.addChild(layer.container);
    } else {
      this.layers.push(layer);
      this.root.addChild(layer.container);
    }

    if (asInteractionLayer || !this.interactionLayer) {
      this.interactionLayer = layer;
      this.recomputeZoomAndCenter();
    }
  }

  addActorLayer(layer: ActorLike) {
    this.actorLayers.push(layer);
    this.root.addChild(layer.container);
  }

  addOverlay(container: Container, yMotionScale: number) {
    this.overlays.push({ container, yMotionScale });
    this.root.addChild(container);
  }

  replaceLayer(old: SliceLayer, newLayer: SliceLayer): void {
    const idx = this.layers.indexOf(old);
    if (idx === -1) return;
    const rootIdx = this.root.getChildIndex(old.container);
    this.root.removeChild(old.container);
    old.container.destroy({ children: true });
    this.root.addChildAt(newLayer.container, rootIdx);
    this.layers[idx] = newLayer;
    if (this.interactionLayer === old) this.interactionLayer = newLayer;
  }

  get xDeg():     number { return this.world.xDeg; }
  get vDeg():     number { return this.world.vDeg; }
  get cameraY():  number { return this.world.cameraY; }
  get vY():       number { return this.world.vY; }
  get zoomLevel():number { return this.zoom.zoom; }

  setAutoPan(degPerTick: number): void { this.autoPanDegPerTick = degPerTick; }

  setCameraLock(getTarget: (() => number) | null): void {
    this.cameraLockTarget = getTarget;
    if (getTarget) this.world.vDeg = 0;
  }

  finalize() {
    // Call after adding layers. Ensures zoom bounds computed.
    if (!this.interactionLayer) {
      throw new Error("Planet needs an interaction layer (frontmost ring).");
    }
    this.recomputeZoomAndCenter();
    // Center the ground line (world Y=0) in the viewport on first load
    this.world.cameraY = this.clampCameraY(-this.app.renderer.height / (2 * this.zoom.zoom));

    // Only the front interaction layer needs to receive pointer events.
    // Hit-testing recurses through the scene graph on every mousemove, so
    // opting everything else out cuts that walk to a single ring.
    for (const layer of this.layers) {
      if (layer !== this.interactionLayer) layer.container.eventMode = "none";
    }
    for (const al of this.actorLayers) al.container.eventMode = "none";
    for (const o of this.overlays) o.container.eventMode = "none";
  }

  update(dt: number) {
    this.tick += dt;
    for (const a of this.animators) a.update(this.tick);
    for (const al of this.actorLayers) al.update(dt);
    this.stepWorld(dt);
    this.layout();
  }

  // Cursor-locked drag uses the interaction layer’s effective mapping
  private get degreesPerPixel(): number {
    const ppdEffective = this.interactionLayer.ring.basePPD * this.zoom.zoom; // motionScale is NOT included for drag feel
    return 1 / ppdEffective;
  }

  private applyPointerDrag(): void {
    if (this.prevPointerX === null) {
      this.dragStartPointerX = this.pointer.x;
      this.dragStartWorldXDeg = this.world.xDeg;
      this.dragStartPointerY = this.pointer.y;
      this.dragStartCameraY = this.world.cameraY;
      this.prevPointerX = this.pointer.x;
      this.prevPointerY = this.pointer.y;
    }

    const deltaPx = this.pointer.x - this.dragStartPointerX;
    this.world.xDeg = this.dragStartWorldXDeg - deltaPx * this.degreesPerPixel;

    // Drag up → reveal underground (drag up = deltaPy negative = cameraY increases)
    const deltaPy = this.pointer.y - this.dragStartPointerY;
    this.world.cameraY = this.clampCameraY(this.dragStartCameraY - deltaPy / this.zoom.zoom);

    if (INERTIA_ENABLED) {
      this.world.vDeg = (this.pointer.x - this.prevPointerX) * this.degreesPerPixel;
      this.world.vY = (this.pointer.y - this.prevPointerY!) / this.zoom.zoom;
    }
    this.prevPointerX = this.pointer.x;
    this.prevPointerY = this.pointer.y;
  }

  private applyFreeMotion(dt: number): void {
    this.prevPointerX = null;
    this.prevPointerY = null;

    if (this.cameraLockTarget) {
      this.world.xDeg = this.cameraLockTarget();
      this.world.vDeg = 0;
    } else if (this.autoPanDegPerTick !== 0) {
      this.world.xDeg += this.autoPanDegPerTick * dt;
      this.world.vDeg = 0;
    } else if (INERTIA_ENABLED) {
      this.world.vDeg *= INERTIA_FRICTION;
      this.world.xDeg = this.world.xDeg - this.world.vDeg * dt;
    }

    if (INERTIA_ENABLED) {
      this.world.vY *= INERTIA_FRICTION;
      const rawY = this.world.cameraY - this.world.vY * dt;
      const clampedY = this.clampCameraY(rawY);
      if (clampedY !== rawY) this.world.vY = 0;
      this.world.cameraY = clampedY;
    }
  }

  private stepWorld(dt: number) {
    if (this.pointer.isDown) {
      this.applyPointerDrag();
    } else {
      this.applyFreeMotion(dt);
    }
  }

  private clampCameraY(y: number): number {
    const min = -4150 / 0.55;
    const max = (2060 - this.app.renderer.height / this.zoom.zoom) / 0.93;
    return Math.max(min, Math.min(max, y));
  }

  private layout() {
    const width = this.app.renderer.width;
    const z = this.zoom.zoom;

    for (const layer of this.layers) {
      layer.layout(this.world.xDeg, z, width, this.world.cameraY);
    }
    for (const al of this.actorLayers) {
      al.layout(this.world.xDeg, z, width, this.world.cameraY);
    }
    for (const o of this.overlays) {
      o.container.y = -this.world.cameraY * o.yMotionScale;
    }
  }

  private recomputeZoomAndCenter() {
    if (!this.interactionLayer) return;

    const width = this.app.renderer.width;

    this.zoom.recomputeBounds(
      width,
      this.interactionLayer.ring.sliceWidthPxAtZoom1,
      MAX_VISIBLE_SLICES_ZOOM_OUT,
      MAX_VISIBLE_SLICES_ZOOM_IN,
    );

    this.root.scale.set(this.zoom.zoom);
    this.root.position.set(width / 2, 0);
  }

  private installWheel() {
    const canvas = this.app.canvas;

    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();

        const prevZoom = this.zoom.zoom;
        this.zoom.applyWheel(e.deltaY);
        const newZoom = this.zoom.zoom;

        // Keep the vertical screen-center stable during zoom
        const height = this.app.renderer.height;
        this.world.cameraY = this.clampCameraY(
          this.world.cameraY + (height / 2) * (1 / prevZoom - 1 / newZoom),
        );

        this.root.scale.set(newZoom);

        // Re-anchor both axes mid-drag to avoid position jumps
        if (this.pointer.isDown) {
          this.dragStartPointerX = this.pointer.x;
          this.dragStartWorldXDeg = this.world.xDeg;
          this.prevPointerX = this.pointer.x;
          this.dragStartPointerY = this.pointer.y;
          this.dragStartCameraY = this.world.cameraY;
          this.prevPointerY = this.pointer.y;
        }
      },
      { passive: false },
    );
  }

  private installResize() {
    window.addEventListener("resize", () => {
      requestAnimationFrame(() => this.recomputeZoomAndCenter());
    });
  }
}

// Convenience builders
export function makeFrontLayer(animators?: Animator[]) {
 const frontRing = new SliceRing(
   72,
   5,
   120,
   makeFrontBuildingFactory({
     sliceWidthPxAtZoom1: 120,
     density: 0.68,
     baseColor: 0x060810,
   }, animators),
 );
 const frontLayer = new SliceLayer(frontRing, 1.0, 1.0, 1.0);
 return frontLayer;
}

export type BackCityConfig = {
  motionScale?:    number;
  yMotionScale?:   number;
  baseColor?:      number;
  density?:        number;
  minH?:           number;
  maxH?:           number;
  salt?:           number;
  underground?:    boolean;
  undergroundDim?: number;
  bakeResolution?: number;
};

// Group this many 5° slices into one baked super-slice.
// 72 / 9 = 8 super-slices of 45° each — clean division, no remainder.
const BACK_SUPER_SIZE = 9;

export function makeBackCityLayer(config: BackCityConfig = {}) {
  const {
    motionScale    = 0.97,
    yMotionScale   = 0.97,
    baseColor      = 0x060810,
    density        = 0.85,
    minH           = 40,
    maxH           = 280,
    salt           = 202,
    underground    = false,
    undergroundDim = 0,
    bakeResolution = 1,
  } = config;

  const singleWidth  = 120;
  const singleDeg    = 5;
  const superCount   = 72 / BACK_SUPER_SIZE;           // 8
  const superDeg     = singleDeg  * BACK_SUPER_SIZE;   // 45°
  const superWidth   = singleWidth * BACK_SUPER_SIZE;  // 1080px

  const singleFactory = makeBackCityFactory({
    sliceWidthPxAtZoom1: singleWidth, baseColor, density, minH, maxH, salt, underground, undergroundDim,
  });

  const superFactory: SliceFactory = (superIndex) => {
    const root = new Container();
    for (let j = 0; j < BACK_SUPER_SIZE; j++) {
      const content = singleFactory(superIndex * BACK_SUPER_SIZE + j, 0);
      content.x = j * singleWidth;
      root.addChild(content);
    }
    return root;
  };

  const ring = new SliceRing(superCount, superDeg, superWidth, superFactory, bakeResolution);
  return new SliceLayer(ring, motionScale, 1.0, yMotionScale);
}

export function makeGroupedBackCityLayer(configs: BackCityConfig[]): SliceLayer {
  const n = configs.length;
  const motionScale  = configs.reduce((s, c) => s + (c.motionScale  ?? 0.97), 0) / n;
  const yMotionScale = configs.reduce((s, c) => s + (c.yMotionScale ?? motionScale), 0) / n;
  const bakeResolution = Math.max(...configs.map(c => c.bakeResolution ?? 1));

  const singleWidth = 120;
  const superCount  = 72 / BACK_SUPER_SIZE;
  const superDeg    = 5   * BACK_SUPER_SIZE;
  const superWidth  = singleWidth * BACK_SUPER_SIZE;

  const factories = configs.map(c => makeBackCityFactory({
    sliceWidthPxAtZoom1: singleWidth,
    baseColor:      c.baseColor      ?? 0x060810,
    density:        c.density        ?? 0.85,
    minH:           c.minH           ?? 40,
    maxH:           c.maxH           ?? 280,
    salt:           c.salt           ?? 202,
    underground:    c.underground    ?? false,
    undergroundDim: c.undergroundDim ?? 0,
  }));

  const superFactory: SliceFactory = (superIndex) => {
    const root = new Container();
    for (let j = 0; j < BACK_SUPER_SIZE; j++) {
      const sliceIdx = superIndex * BACK_SUPER_SIZE + j;
      const subSlice = new Container();
      for (const factory of factories) subSlice.addChild(factory(sliceIdx, 0));
      subSlice.x = j * singleWidth;
      root.addChild(subSlice);
    }
    return root;
  };

  const ring = new SliceRing(superCount, superDeg, superWidth, superFactory, bakeResolution);
  return new SliceLayer(ring, motionScale, 1.0, yMotionScale);
}

export function makeGroundLayer() {
  const ring = new SliceRing(
    72,
    5,
    120,
    makeGroundSectionFactory({ sliceWidthPxAtZoom1: 120 }),
  );
  // Locked to surface on both axes — ground moves with buildings
  return new SliceLayer(ring, 1.0, 1.0, 1.0);
}

export function makeShallowCaveLayer() {
  const ring = new SliceRing(
    72,
    5,
    120,
    makeShallowCaveFactory({ sliceWidthPxAtZoom1: 120 }),
  );
  // Slower X parallax (0.96) + slightly slower Y (0.93) → feels one depth deeper
  return new SliceLayer(ring, 0.50, 1.0, 0.93);
}

export function makeDeepCoreLayer() {
  const ring = new SliceRing(
    36,
    10,
    120,
    makeDeepCoreFactory({ sliceWidthPxAtZoom1: 120 }),
  );
  // Much slower on both axes → clearly deeper than the cave
  return new SliceLayer(ring, 0.82, 1.0, 0.75);
}

// Sky slices intentionally render a 10000×4155 gradient rect spanning the
// whole viewport. Baking that to a texture would blow past the GPU's max
// texture size and crash the cacheAsTexture shader pipeline, so the sky
// stays uncached — its per-slice Graphics count is 1 anyway, so it isn't
// a perf hotspot.
export function makeSkyLayer(skyGradient?: Array<{ offset: number; color: number }>) {
  const skyRing = new SliceRing(
    36,
    10,
    120,
    makeSkyGradientFactory({ sliceWidthPxAtZoom1: 120, skyGradient }),
  );
  // yMotionScale=0.40: sky barely drifts vertically — feels very distant
  return new SliceLayer(skyRing, 0.7, 1.0, 0.55);
}

// Single full-width gradient overlay — no slice boundaries, no bleed.
// Pass to planet.addOverlay() with the same yMotionScale as its city layer.
// Pass `into` to update an existing container in-place (for palette switching).
export const HAZE_TOP_Y = -250;

type HazeOpts = {
  alpha:    number;
  color?:   number;
  topY?:    number;
  bottomY?: number;
  into?:    Container;
};

export function makeHazeOverlay(opts: HazeOpts): Container {
  const { alpha: hazeAlpha, color = HAZE_COLOR, topY = HAZE_TOP_Y, bottomY = 10, into } = opts;
  const r = (color >> 16) & 0xff;
  const g = (color >> 8)  & 0xff;
  const b =  color        & 0xff;

  const gradient = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end:   { x: 0, y: 1 },
    textureSpace: 'local',
    colorStops: [
      { offset: 0,    color: `rgba(${r},${g},${b},0)` },
      { offset: 0.90, color: `rgba(${r},${g},${b},${hazeAlpha})` },
      { offset: 1,    color: `rgba(${r},${g},${b},0)` },
    ],
  });

  const container = into ?? new Container();
  if (into) for (const c of into.removeChildren()) c.destroy();
  container.addChild(
    new Graphics()
      .rect(-5000, topY, 10000, bottomY - topY)
      .fill(gradient),
  );
  return container;
}

// Haze for the underground mirror city — gradient runs top-to-bottom below the ground line.
// Pass `into` to update an existing container in-place (for palette switching).
export function makeUndergroundHazeOverlay(hazeAlpha: number, color = CAVE_HAZE_COLOR, into?: Container): Container {
  const topY    =   -2;  // ground surface
  const bottomY = 1850;  // ~5× the original 352px depth

  const r = (color >> 16) & 0xff;
  const g = (color >> 8)  & 0xff;
  const b =  color        & 0xff;

  const gradient = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end:   { x: 0, y: 1 },
    textureSpace: 'local',
    colorStops: [
      { offset: 0,    color: `rgba(${r},${g},${b},0)` },
      { offset: 0.03, color: `rgba(${r},${g},${b},${hazeAlpha})` },
      { offset: 1,    color: `rgba(${r},${g},${b},0)` },
    ],
  });

  const container = into ?? new Container();
  if (into) for (const c of into.removeChildren()) c.destroy();
  container.addChild(
    new Graphics()
      .rect(-5000, topY, 10000, bottomY - topY)
      .fill(gradient),
  );
  return container;
}
