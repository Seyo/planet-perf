import { Application, Container, Graphics } from "pixi.js";

type Slice = Container & { homeDegree: number };

type WorldPos = {
  x: number; // degrees [0..360)
  v: number; // degrees per tick (inertia only)
};

const SLICE_COUNT = 72;
const DEG_PER_SLICE = 5;

// Zoom constraints expressed in "how many slices fit across the viewport"
const MAX_VISIBLE_SLICES_ZOOM_OUT = SLICE_COUNT * 0.5; // 50% of slices
const MAX_VISIBLE_SLICES_ZOOM_IN = 1; // 1 slice

// ✅ Declared slice width at zoom = 1 (edit this later when you add assets)
const SLICE_PX_AT_ZOOM_1 = 120;

// Wheel feel (smaller = slower zoom)
const WHEEL_ZOOM_SENSITIVITY = 0.0015;

// Inertia
const INERTIA_ENABLED = true;
const INERTIA_FRICTION = 0.95;

// Visuals (your recent “help me see changes” style)
const SLICE_MARKER_HEIGHT = 520;
const SLICE_MARKER_Y = 0;

const BOX_X = 10;
const BOX_Y = 10;
const BOX_W = 10;
const BOX_H = 40;

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
const wrap360 = (x: number) => ((x % 360) + 360) % 360;

export class PlanetLogic {
  readonly container = new Container();

  private slices: Slice[] = [];
  private worldPos: WorldPos = { x: 0, v: 0 };

  // Pointer state
  private pointerX = 0;
  private pointerDown = false;

  // Direct-drag anchor
  private dragStartPointerX = 0;
  private dragStartWorldX = 0;
  private prevPointerX = 0;

  // Zoom system (zoom=1 means slice width == SLICE_PX_AT_ZOOM_1)
  private zoom = 1;
  private zoomMin = 0.1;
  private zoomMax = 10;

  // Constant pixels-per-degree at zoom=1
  private readonly basePPD = SLICE_PX_AT_ZOOM_1 / DEG_PER_SLICE;

  constructor(private app: Application) {
    this.app.stage.addChild(this.container);

    this.installPointerHandlers();
    this.installWheelZoom();
    this.installResizeHandler();

    this.initSlices();
    this.recomputeZoomBoundsAndCenter();
  }

  update(dt: number) {
    this.frameStart(dt);
    this.frameEnd();
  }

  // --- Zoom / mapping -------------------------------------------------------

  private recomputeZoomBoundsAndCenter() {
    const width = this.app.renderer.width;

    // At zoom=1: slice width in screen px is SLICE_PX_AT_ZOOM_1
    // At arbitrary zoom: slice width is SLICE_PX_AT_ZOOM_1 * zoom
    //
    // visibleSlices ≈ width / (SLICE_PX_AT_ZOOM_1 * zoom)
    // => zoom ≈ width / (visibleSlices * SLICE_PX_AT_ZOOM_1)

    this.zoomMin = width / (MAX_VISIBLE_SLICES_ZOOM_OUT * SLICE_PX_AT_ZOOM_1);
    this.zoomMax = width / (MAX_VISIBLE_SLICES_ZOOM_IN * SLICE_PX_AT_ZOOM_1);

    // Safety if window is tiny or something weird happens
    this.zoomMin = Math.max(this.zoomMin, 0.01);
    this.zoomMax = Math.max(this.zoomMax, this.zoomMin);

    this.zoom = clamp(this.zoom, this.zoomMin, this.zoomMax);

    // Apply transform: center container horizontally
    this.container.scale.set(this.zoom);
    this.container.position.set(width / 2, 0);
  }

  private get degreesPerPixel(): number {
    // Effective pixels-per-degree on screen is basePPD * zoom
    return 1 / (this.basePPD * this.zoom);
  }

  // --- Init -----------------------------------------------------------------

  private initSlices() {
    this.slices = [];
    this.container.removeChildren();

    for (let i = 0; i < SLICE_COUNT; i++) {
      const slice = new Container() as Slice;
      slice.homeDegree = i * DEG_PER_SLICE;

      // 1px marker at slice start
      const marker = new Graphics()
        .rect(0, SLICE_MARKER_Y, 1, SLICE_MARKER_HEIGHT)
        .fill({ color: 0xffffff, alpha: 0.6 });

      const color = i === 0 ? 0xff0000 : i % 2 === 0 ? 0x00ffcc : 0x3366ff;

      // Pixi v8+ API: rect + fill (no beginFill/drawRect/endFill)
      const box = new Graphics()
        .rect(BOX_X, BOX_Y, BOX_W, BOX_H)
        .fill({ color, alpha: 1 });

      slice.addChild(marker, box);
      this.container.addChild(slice);
      this.slices.push(slice);
    }
  }

  // --- Update ---------------------------------------------------------------

  private frameStart(dt: number) {
    if (this.pointerDown) {
      // Direct manipulation: 1:1 with cursor in screen pixels
      const deltaPx = this.pointerX - this.dragStartPointerX;
      this.worldPos.x = wrap360(
        this.dragStartWorldX - deltaPx * this.degreesPerPixel,
      );

      if (INERTIA_ENABLED) {
        this.worldPos.v =
          (this.pointerX - this.prevPointerX) * this.degreesPerPixel;
      }
      this.prevPointerX = this.pointerX;
    } else if (INERTIA_ENABLED) {
      this.worldPos.v *= INERTIA_FRICTION;
      this.worldPos.x = wrap360(this.worldPos.x - this.worldPos.v * dt);
    }
  }

  private frameEnd() {
    const width = this.app.renderer.width;
    const halfW = width / 2;

    const wPosX = this.worldPos.x;

    for (const slice of this.slices) {
      let relDegree = slice.homeDegree - wPosX;

      // Keep in [-180, 180]
      if (relDegree > 180) relDegree -= 360;
      if (relDegree < -180) relDegree += 360;

      // Layout in unzoomed container space (zoom handled by container.scale)
      slice.x = relDegree * this.basePPD;

      // Cull in SCREEN space
      const screenX = slice.x * this.zoom;
      slice.visible = screenX > -halfW - 150 && screenX < halfW + 150;
    }
  }

  // --- Input ----------------------------------------------------------------

  private installPointerHandlers() {
    const canvas = this.app.canvas;

    const updatePointerX = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const cssX = e.clientX - rect.left;
      const scaleX = this.app.renderer.width / rect.width;
      this.pointerX = cssX * scaleX;
    };

    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.pointerDown = true;

      updatePointerX(e);

      // Anchor drag
      this.dragStartPointerX = this.pointerX;
      this.dragStartWorldX = this.worldPos.x;
      this.prevPointerX = this.pointerX;
    });

    canvas.addEventListener("pointermove", (e) => updatePointerX(e));

    const up = (e: PointerEvent) => {
      updatePointerX(e);
      this.pointerDown = false;
    };

    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    window.addEventListener("blur", () => (this.pointerDown = false));
  }

  private installWheelZoom() {
    const canvas = this.app.canvas;

    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();

        // Smooth exponential scaling (trackpad-safe)
        const factor = Math.exp(-e.deltaY * WHEEL_ZOOM_SENSITIVITY);
        this.zoom = clamp(this.zoom * factor, this.zoomMin, this.zoomMax);

        this.container.scale.set(this.zoom);

        // Avoid jumps if zoom changes mid-drag
        if (this.pointerDown) {
          this.dragStartPointerX = this.pointerX;
          this.dragStartWorldX = this.worldPos.x;
          this.prevPointerX = this.pointerX;
        }
      },
      { passive: false },
    );
  }

  private installResizeHandler() {
    window.addEventListener("resize", () =>
      this.recomputeZoomBoundsAndCenter(),
    );
  }
}
