import { Container, Graphics } from "pixi.js";
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

export type ActorLayerConfig = {
  motionScale:  number;
  yMotionScale: number;
  registry?:    BuildingRegistry;
  layerKey?:    string;
};

type CarAppearance = { halfLen: number; headColor: number };

function makeCar(app: CarAppearance): Container {
  const { halfLen, headColor } = app;
  const c = new Container();
  const body      = new Graphics().rect(-halfLen, -0.5, halfLen * 2, 1).fill(0x111111);
  const frontGlow = new Graphics().circle(halfLen, 0, 1.5).fill({ color: headColor, alpha: 0.12 });
  const tailGlow  = new Graphics().circle(-halfLen, 0, 1).fill({ color: 0xff2020, alpha: 0.10 });
  const front     = new Graphics().circle(halfLen, 0, 0.4).fill(headColor);
  const tail      = new Graphics().circle(-halfLen, 0, 0.3).fill(0xff2020);
  c.addChild(body, frontGlow, tailGlow, front, tail);
  return c;
}

class Car {
  deg: number;
  y: number;
  vDeg = 0;
  destDeg: number;
  readonly gfx: Container;
  private speed: number;
  private dirSign = 1;
  private readonly district: DistrictRange | null;
  private readonly registry: BuildingRegistry | null;
  private readonly layerKey: string;
  private readonly layerPpd: number;
  private readonly startSlice: number;
  private readonly endSlice: number;
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
    const halfLen   = 2 + Math.random() ** 2 * 4;
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

  reset(districts: readonly DistrictRange[], config: ActorLayerConfig): void {
    for (const car of this.cars) {
      this.container.removeChild(car.gfx);
      car.gfx.destroy({ children: true });
    }
    this.cars.splice(0);
    const newCars = districts.length > 0 ? makeCarsForDistricts(config, districts) : [];
    for (const car of newCars) this.container.addChild(car.gfx);
    this.cars.push(...newCars);
  }

  update(dt: number) {
    for (const car of this.cars) car.update(dt);
  }

  layout(cameraDeg: number, zoom: number, viewWidthPx: number, cameraY: number) {
    this.container.y = -cameraY * this.yMotionScale;
    const halfW    = viewWidthPx / 2;
    const CULL_PAD = 150;

    for (const car of this.cars) {
      const relDeg  = normalize180(car.deg - cameraDeg);
      car.gfx.x     = relDeg * this.ppd;
      car.gfx.y     = car.y;
      const screenX = car.gfx.x * zoom;
      car.onScreen      = Math.abs(screenX) < halfW;
      car.gfx.visible   = Math.abs(screenX) < halfW + CULL_PAD;
    }
  }
}

function makeCarsForDistricts(config: ActorLayerConfig, districts: readonly DistrictRange[]): Car[] {
  const registry = config.registry ?? null;
  const layerKey = config.layerKey ?? '';
  return districts.flatMap(d => {
    const sliceCount   = Math.max(1, Math.round((d.endDeg - d.startDeg) / DEGS_PER_SLICE));
    const t            = Math.sqrt(Math.min(1, d.mass ?? CARS_MASS_FALLBACK));
    const carsPerSlice = CARS_PER_SLICE_MIN + Math.round(t * (CARS_PER_SLICE_MAX - CARS_PER_SLICE_MIN));
    return Array.from({ length: sliceCount * carsPerSlice }, () => new Car(config.motionScale, registry, layerKey, d));
  });
}

export function makeActorLayer(config: ActorLayerConfig, districts?: readonly DistrictRange[]): ActorLayer {
  const registry = config.registry ?? null;
  const layerKey = config.layerKey ?? '';
  const cars = districts && districts.length > 0
    ? makeCarsForDistricts(config, districts)
    : Array.from({ length: 50 + Math.floor(Math.random() * 51) }, () => new Car(config.motionScale, registry, layerKey, null));
  return new ActorLayer(config, cars);
}
