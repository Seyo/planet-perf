import { Container, Graphics, Sprite, type Renderer, type Texture } from "pixi.js";
import { normalize180 } from "../math";
import type { BuildingBounds, BuildingRegistry } from "./buildings";

const BASE_PPD = 24; // 120px / 5deg — matches all building rings
const SURFACE_Y          =  -2; // top of dirt — matches surfaceY in makeGroundSectionFactory
const ARRIVAL_THRESHOLD  =   3; // px world-space
const DEGS_PER_SLICE     =   5;
const CARS_PER_SLICE_MIN =   1;
const CARS_PER_SLICE_MAX =   6;
const CARS_MASS_FALLBACK = 0.3;
const DEST_SLICE_SPREAD  =   3; // search up to ±3 slices for destination buildings

const HEADLIGHT_COLORS = [0xfffde0, 0xfff0a0, 0xffd060, 0xffa040, 0xff8820];

export type DistrictRange = { readonly startDeg: number; readonly endDeg: number; readonly mass?: number };

type CarAppearance = { halfLen: number; headColor: number };

// Cars are baked to a small set of textures (5 halfLen buckets × 5 head colors)
// rendered once via Renderer.generateTexture. Each Car is then a single Sprite
// — collapses the previous 1 Container + 5 Graphics per car (~3000 scene-graph
// nodes across all actor layers) into one Sprite per car.
let _renderer: Renderer | null = null;
const _carTextureCache = new Map<string, Texture>();

export function initCarTextures(renderer: Renderer): void {
  _renderer = renderer;
}

function carTextureKey(app: CarAppearance): string {
  return `${app.halfLen}|${app.headColor.toString(16)}`;
}

function getCarTexture(app: CarAppearance): Texture {
  const key = carTextureKey(app);
  const cached = _carTextureCache.get(key);
  if (cached) return cached;
  if (!_renderer) throw new Error('initCarTextures(renderer) must be called before constructing Cars');

  const { halfLen, headColor } = app;
  const g = new Container();
  g.addChild(new Graphics().rect(-halfLen, -0.5, halfLen * 2, 1).fill(0x111111));
  g.addChild(new Graphics().circle( halfLen, 0, 1.5).fill({ color: headColor, alpha: 0.12 }));
  g.addChild(new Graphics().circle(-halfLen, 0, 1.0).fill({ color: 0xff2020, alpha: 0.10 }));
  g.addChild(new Graphics().circle( halfLen, 0, 0.4).fill(headColor));
  g.addChild(new Graphics().circle(-halfLen, 0, 0.3).fill(0xff2020));

  // resolution: 4 keeps the sub-pixel features (0.4px radius headlights) sharp
  // when zoomed in.
  const texture = _renderer.generateTexture({ target: g, resolution: 4 });
  g.destroy({ children: true });
  _carTextureCache.set(key, texture);
  return texture;
}

export type ActorLayerConfig = {
  motionScale:  number;
  yMotionScale: number;
  registry?:    BuildingRegistry;
  layerKey?:    string;
};

function makeCar(app: CarAppearance): Sprite {
  const s = new Sprite(getCarTexture(app));
  s.anchor.set(0.5);
  return s;
}

class Car {
  deg: number;
  y: number;
  vDeg = 0;
  destDeg: number;
  readonly gfx: Sprite;
  private speed: number;
  private dirSign = 1;
  district: DistrictRange | null;
  private readonly registry: BuildingRegistry | null;
  private readonly layerKey: string;
  private readonly layerPpd: number;
  private startSlice: number;
  private endSlice: number;
  onScreen = false;

  constructor(
    motionScale: number,
    registry: BuildingRegistry | null,
    layerKey: string,
    district: DistrictRange | null = null,
  ) {
    this.registry   = registry;
    this.layerKey   = layerKey;
    this.layerPpd   = BASE_PPD * motionScale;
    this.district   = district;
    this.startSlice = district ? Math.floor(district.startDeg / DEGS_PER_SLICE) : 0;
    this.endSlice   = district ? Math.floor(district.endDeg   / DEGS_PER_SLICE) : 71;
    this.deg        = district
      ? district.startDeg + Math.random() * (district.endDeg - district.startDeg)
      : Math.random() * 360;
    this.y          = SURFACE_Y;
    this.destDeg    = this.deg;
    this.speed      = 0.12 + Math.random() * 0.18;
    // Discretise halfLen to integers in [2, 6] so we get 5 buckets × 5 head
    // colors = 25 baked car textures total. Pixi batches sprites by texture.
    const halfLen   = Math.round(2 + Math.random() ** 2 * 4);
    const headColor = HEADLIGHT_COLORS[Math.floor(Math.random() * HEADLIGHT_COLORS.length)];
    this.gfx        = makeCar({ halfLen, headColor });
    this.pickNewDest();
  }

  private clampDeg(raw: number): number {
    if (!this.district) return ((raw % 360) + 360) % 360;
    return Math.max(this.district.startDeg, Math.min(this.district.endDeg, raw));
  }

  private randomBuilding(sliceIndex: number): BuildingBounds | null {
    if (!this.registry) return null;
    const buildings = this.registry.getBuildings(sliceIndex, this.layerKey);
    if (buildings.length === 0) return null;
    let total = 0;
    for (const b of buildings) total += b.yBottom - b.yTop;
    let pick = Math.random() * total;
    for (const b of buildings) {
      pick -= b.yBottom - b.yTop;
      if (pick <= 0) return b;
    }
    return buildings[buildings.length - 1];
  }

  private pickNewDest() {
    const nd           = ((this.deg % 360) + 360) % 360;
    const currentSlice = Math.floor(nd / DEGS_PER_SLICE);
    const spread       = Math.round((Math.random() * 2 - 1) * DEST_SLICE_SPREAD);
    const destSlice    = Math.max(this.startSlice, Math.min(this.endSlice, currentSlice + spread));

    const src = this.randomBuilding(currentSlice);
    const dst = this.randomBuilding(destSlice);

    if (src && dst) {
      const yTopShared = Math.max(src.yTop, dst.yTop);
      const yBotShared = Math.min(src.yBottom, dst.yBottom);
      if (yTopShared < yBotShared) {
        this.y = yTopShared + Math.random() * (yBotShared - yTopShared);
      }
      const dstCenterX = (dst.xLeft + dst.xRight) / 2;
      this.destDeg = this.clampDeg(destSlice * DEGS_PER_SLICE + dstCenterX / this.layerPpd);
    } else {
      const rawSpread  = (Math.random() * 2 - 1) * DEST_SLICE_SPREAD * DEGS_PER_SLICE;
      this.destDeg     = this.clampDeg(this.deg + rawSpread);
    }

    this.recomputeVelocity();
  }

  private recomputeVelocity() {
    const dxDeg = normalize180(this.destDeg - this.deg);
    if (Math.abs(dxDeg) < 0.01) { this.vDeg = 0; return; }
    this.vDeg = Math.sign(dxDeg) * this.speed / BASE_PPD;
    if (this.vDeg !== 0) this.dirSign = Math.sign(this.vDeg);
  }

  update(dt: number) {
    this.deg = this.clampDeg(this.deg + this.vDeg * dt);
    if (Math.abs(normalize180(this.destDeg - this.deg)) * BASE_PPD < ARRIVAL_THRESHOLD) {
      this.pickNewDest();
    }
    this.gfx.rotation = this.dirSign > 0 ? 0 : Math.PI;
  }

  reassign(district: DistrictRange): void {
    this.district   = district;
    this.startSlice = Math.floor(district.startDeg / DEGS_PER_SLICE);
    this.endSlice   = Math.floor(district.endDeg   / DEGS_PER_SLICE);
    this.deg        = this.clampDeg(this.deg);
    this.destDeg    = this.clampDeg(this.destDeg);
    this.recomputeVelocity();
  }
}

function carsPerSlice(d: DistrictRange): number {
  const t = Math.sqrt(Math.min(1, d.mass ?? CARS_MASS_FALLBACK));
  return CARS_PER_SLICE_MIN + Math.round(t * (CARS_PER_SLICE_MAX - CARS_PER_SLICE_MIN));
}

function desiredCarCount(d: DistrictRange): number {
  const sliceCount = Math.max(1, Math.round((d.endDeg - d.startDeg) / DEGS_PER_SLICE));
  return sliceCount * carsPerSlice(d);
}

export class ActorLayer {
  readonly container = new Container();
  private readonly cars: Car[];
  private readonly ppd: number;
  private readonly yMotionScale: number;

  constructor(config: ActorLayerConfig, cars: Car[]) {
    this.ppd          = BASE_PPD * config.motionScale;
    this.yMotionScale = config.yMotionScale;
    this.cars         = cars;
    for (const car of this.cars) this.container.addChild(car.gfx);
  }

  reconcile(districts: readonly DistrictRange[], config: ActorLayerConfig): void {
    const oldByStart  = new Map<number, Car[]>();
    const noDistrict: Car[] = [];
    for (const car of this.cars) {
      if (!car.district) { noDistrict.push(car); continue; }
      const startSlice = Math.floor(car.district.startDeg / DEGS_PER_SLICE);
      let list = oldByStart.get(startSlice);
      if (!list) { list = []; oldByStart.set(startSlice, list); }
      list.push(car);
    }

    const nextCars: Car[] = [];
    const registry        = config.registry ?? null;
    const layerKey        = config.layerKey ?? '';

    for (const d of districts) {
      const startSlice = Math.floor(d.startDeg / DEGS_PER_SLICE);
      const desired    = desiredCarCount(d);
      const existing   = oldByStart.get(startSlice) ?? [];
      oldByStart.delete(startSlice);

      const reuse = Math.min(existing.length, desired);
      for (let i = 0; i < reuse; i++) {
        existing[i].reassign(d);
        nextCars.push(existing[i]);
      }
      for (let i = reuse; i < existing.length; i++) this.destroyCar(existing[i]);
      for (let i = reuse; i < desired; i++) {
        const car = new Car(config.motionScale, registry, layerKey, d);
        this.container.addChild(car.gfx);
        nextCars.push(car);
      }
    }

    for (const list of oldByStart.values()) for (const car of list) this.destroyCar(car);
    for (const car of noDistrict) this.destroyCar(car);

    this.cars.splice(0, this.cars.length, ...nextCars);
  }

  private destroyCar(car: Car): void {
    this.container.removeChild(car.gfx);
    car.gfx.destroy({ children: true });
  }

  update(dt: number) {
    for (const car of this.cars) {
      // gfx.visible was set by the previous frame's layout() and includes the
      // 150 px cull-pad buffer zone.  Cars outside that zone are never rendered
      // and their sub-pixel positional drift is invisible, so we skip the
      // simulation step entirely.  The gate lifts automatically the frame they
      // scroll into the buffer zone and layout() sets visible=true.
      if (car.gfx.visible) car.update(dt);
    }
  }

  layout(cameraDeg: number, zoom: number, viewWidthPx: number, cameraY: number) {
    this.container.y = -cameraY * this.yMotionScale;
    const halfW         = viewWidthPx / 2;
    const CULL_PAD      = 150;
    // Pre-compute the cull threshold in degree-space so off-screen cars can
    // be rejected before any pixel-space multiply.  absDeg is the inlined
    // equivalent of Math.abs(normalize180(car.deg - cameraDeg)) — same
    // arithmetic, no function-call overhead, and the branch exits before
    // the ×ppd / ×zoom chain for the ~80 % of cars that are off-screen.
    const cullThreshDeg = (halfW + CULL_PAD) / (this.ppd * zoom);

    for (const car of this.cars) {
      const diff   = ((car.deg - cameraDeg) % 360 + 360) % 360; // [0, 360)
      const absDeg = diff > 180 ? 360 - diff : diff;             // [0, 180]
      if (absDeg > cullThreshDeg) {
        car.onScreen    = false;
        car.gfx.visible = false;
        continue;
      }
      // Car is inside the cull zone — compute pixel position and write transform.
      // absDeg ≤ cullThreshDeg  ↔  |screenX| ≤ halfW + CULL_PAD, so visible = true.
      const x     = (diff > 180 ? diff - 360 : diff) * this.ppd;
      car.onScreen    = Math.abs(x * zoom) < halfW;
      car.gfx.visible = true;
      car.gfx.x       = x;
      car.gfx.y       = car.y;
    }
  }
}

function makeCarsForDistricts(config: ActorLayerConfig, districts: readonly DistrictRange[]): Car[] {
  const registry = config.registry ?? null;
  const layerKey = config.layerKey ?? '';
  return districts.flatMap(d =>
    Array.from({ length: desiredCarCount(d) }, () => new Car(config.motionScale, registry, layerKey, d)),
  );
}

export function makeActorLayer(config: ActorLayerConfig, districts?: readonly DistrictRange[]): ActorLayer {
  const registry = config.registry ?? null;
  const layerKey = config.layerKey ?? '';
  const cars = districts && districts.length > 0
    ? makeCarsForDistricts(config, districts)
    : Array.from({ length: 50 + Math.floor(Math.random() * 51) }, () => new Car(config.motionScale, registry, layerKey, null));
  return new ActorLayer(config, cars);
}
