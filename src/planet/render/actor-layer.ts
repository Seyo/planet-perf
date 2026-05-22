import { Container, Graphics } from "pixi.js";
import { normalize180 } from "../math";

const BASE_PPD = 24; // 120px / 5deg — matches all building rings
const Y_SKY_MIN       = -200;
const SURFACE_Y       =   -2; // top of dirt — matches surfaceY in makeGroundSectionFactory
const DEST_DEG_SPREAD = 25; // max ±deg for next destination
const ARRIVAL_THRESHOLD = 3; // px world-space
const DEGS_PER_SLICE  = 5;
const CARS_PER_SLICE_MIN = 2;
const CARS_PER_SLICE_MAX = 4;

// Headlight colors: warm white → amber → orange
const HEADLIGHT_COLORS = [0xfffde0, 0xfff0a0, 0xffd060, 0xffa040, 0xff8820];

export type DistrictRange = { readonly startDeg: number; readonly endDeg: number };

function makeCar(halfLen: number, headColor: number): Container {
  const c = new Container();
  const body      = new Graphics().rect(-halfLen, -0.5, halfLen * 2, 1).fill(0x111111);
  const frontGlow = new Graphics().circle(halfLen, 0, 1.5).fill({ color: headColor, alpha: 0.12 });
  const tailGlow  = new Graphics().circle(-halfLen, 0, 1).fill({ color: 0xff2020, alpha: 0.10 });
  const front     = new Graphics().circle(halfLen, 0, 0.4).fill(headColor);
  const tail      = new Graphics().circle(-halfLen, 0, 0.3).fill(0xff2020);
  c.addChild(body, frontGlow, tailGlow, front, tail);
  return c;
}

function spawnDeg(district: DistrictRange | null): number {
  if (!district) return Math.random() * 360;
  return district.startDeg + Math.random() * (district.endDeg - district.startDeg);
}

class Car {
  deg: number;
  y: number;
  vDeg = 0;
  vY = 0;
  destDeg: number;
  destY: number;
  readonly gfx: Container;
  private speed: number;
  private dirSign = 1;
  private readonly district: DistrictRange | null;
  onScreen = false;    // set each frame by ActorLayer.layout()

  constructor(district: DistrictRange | null = null) {
    this.district = district;
    this.deg     = spawnDeg(district);
    this.y       = Y_SKY_MIN + Math.random() * (SURFACE_Y - Y_SKY_MIN);
    this.destDeg = this.deg;
    this.destY   = this.y;
    this.speed   = 0.25 + Math.random() * 0.35;
    const halfLen   = 2 + Math.random() ** 2 * 4;
    const headColor = HEADLIGHT_COLORS[Math.floor(Math.random() * HEADLIGHT_COLORS.length)];
    this.gfx        = makeCar(halfLen, headColor);
    this.pickNewDest();
  }

  private clampDeg(raw: number): number {
    if (!this.district) return ((raw % 360) + 360) % 360;
    return Math.max(this.district.startDeg, Math.min(this.district.endDeg, raw));
  }

  private globalDestDeg(spread: number): number {
    const s = this.onScreen && spread !== 0 && Math.sign(spread) !== this.dirSign ? -spread : spread;
    return ((this.deg + s) % 360 + 360) % 360;
  }

  private pickNewDest() {
    const rawSpread = (Math.random() * 2 - 1) * DEST_DEG_SPREAD;
    this.destDeg = this.district
      ? this.clampDeg(this.deg + rawSpread)
      : this.globalDestDeg(rawSpread);
    this.destY = Math.max(Y_SKY_MIN, Math.min(SURFACE_Y, this.y + (Math.random() * 2 - 1) * 40));
    this.recomputeVelocity();
  }

  private recomputeVelocity() {
    const dxDeg = normalize180(this.destDeg - this.deg);
    const dxPx  = dxDeg * BASE_PPD;
    const dyPx  = this.destY - this.y;
    const len   = Math.sqrt(dxPx * dxPx + dyPx * dyPx);
    if (len < 0.01) { this.pickNewDest(); return; }
    this.vDeg = (dxPx / len) * this.speed / BASE_PPD;
    this.vY   = (dyPx / len) * this.speed;
    if (this.vDeg !== 0) this.dirSign = Math.sign(this.vDeg);
  }

  update(dt: number) {
    this.deg = this.clampDeg(this.deg + this.vDeg * dt);
    this.y  += this.vY * dt;

    const dxDeg = normalize180(this.destDeg - this.deg);
    const dxPx  = dxDeg * BASE_PPD;
    const dyPx  = this.destY - this.y;
    if (Math.sqrt(dxPx * dxPx + dyPx * dyPx) < ARRIVAL_THRESHOLD) this.pickNewDest();

    // Orient car to face direction of travel
    this.gfx.rotation = Math.atan2(this.vY, this.vDeg * BASE_PPD);
  }
}

export class ActorLayer {
  readonly container = new Container();
  private readonly cars: Car[];
  private readonly ppd: number;

  constructor(
    private readonly motionScale: number,
    private readonly yMotionScale: number,
    cars: Car[],
  ) {
    this.ppd  = BASE_PPD * motionScale;
    this.cars = cars;
    for (const car of this.cars) this.container.addChild(car.gfx);
  }

  update(dt: number) {
    for (const car of this.cars) car.update(dt);
  }

  layout(cameraDeg: number, zoom: number, viewWidthPx: number, cameraY: number) {
    this.container.y = -cameraY * this.yMotionScale;
    const halfW = viewWidthPx / 2;
    const CULL_PAD = 150;

    for (const car of this.cars) {
      const relDeg  = normalize180(car.deg - cameraDeg);
      car.gfx.x     = relDeg * this.ppd;
      car.gfx.y     = car.y;
      const screenX = car.gfx.x * zoom;
      car.onScreen        = Math.abs(screenX) < halfW;
      car.gfx.visible     = Math.abs(screenX) < halfW + CULL_PAD;
    }
  }
}

function makeCarsForDistricts(districts: readonly DistrictRange[]): Car[] {
  return districts.flatMap(d => {
    const sliceCount = Math.max(1, Math.round((d.endDeg - d.startDeg) / DEGS_PER_SLICE));
    const carsPerSlice = CARS_PER_SLICE_MIN + Math.floor(Math.random() * (CARS_PER_SLICE_MAX - CARS_PER_SLICE_MIN + 1));
    return Array.from({ length: sliceCount * carsPerSlice }, () => new Car(d));
  });
}

export function makeActorLayer(
  motionScale: number,
  yMotionScale: number,
  districts?: readonly DistrictRange[],
): ActorLayer {
  const cars = districts && districts.length > 0
    ? makeCarsForDistricts(districts)
    : Array.from({ length: 50 + Math.floor(Math.random() * 51) }, () => new Car(null));
  return new ActorLayer(motionScale, yMotionScale, cars);
}
