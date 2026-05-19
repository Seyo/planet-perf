import { Container, Graphics } from "pixi.js";
import { normalize180 } from "../math";

const BASE_PPD = 24; // 120px / 5deg — matches all building rings
const Y_MIN = -130;
const Y_MAX = 430; // surface + mirrored underground city height
const DEST_DEG_SPREAD = 25; // max ±deg for next destination
const ARRIVAL_THRESHOLD = 3; // px world-space

// Headlight colors: warm white → amber → orange
const HEADLIGHT_COLORS = [0xfffde0, 0xfff0a0, 0xffd060, 0xffa040, 0xff8820];

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

class Car {
  deg: number;
  y: number;
  vDeg = 0;
  vY = 0;
  destDeg: number;
  destY: number;
  readonly gfx: Container;
  private speed: number;

  constructor() {
    this.deg     = Math.random() * 360;
    this.y       = Y_MIN + Math.random() * (Y_MAX - Y_MIN);
    this.destDeg = this.deg;
    this.destY   = this.y;
    this.speed   = 0.25 + Math.random() * 0.35;
    // half-length: cars 2–4px, buses/trucks up to 10px
    const halfLen   = 2 + Math.random() ** 2 * 8;
    const headColor = HEADLIGHT_COLORS[Math.floor(Math.random() * HEADLIGHT_COLORS.length)];
    this.gfx     = makeCar(halfLen, headColor);
    this.pickNewDest();
  }

  private pickNewDest() {
    const spread = (Math.random() * 2 - 1) * DEST_DEG_SPREAD;
    this.destDeg = ((this.deg + spread) % 360 + 360) % 360;
    const yDrift = (Math.random() * 2 - 1) * 40; // ±40px vertical drift per leg
    this.destY   = Math.max(Y_MIN, Math.min(Y_MAX, this.y + yDrift));
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
  }

  update(dt: number) {
    this.deg = ((this.deg + this.vDeg * dt) % 360 + 360) % 360;
    this.y  += this.vY * dt;

    const dxDeg = normalize180(this.destDeg - this.deg);
    const dxPx  = dxDeg * BASE_PPD;
    const dyPx  = this.destY - this.y;
    const dist  = Math.sqrt(dxPx * dxPx + dyPx * dyPx);
    if (dist < ARRIVAL_THRESHOLD) this.pickNewDest();

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
    carCount: number,
  ) {
    this.ppd  = BASE_PPD * motionScale;
    this.cars = Array.from({ length: carCount }, () => new Car());
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
      car.gfx.visible = Math.abs(screenX) < halfW + CULL_PAD;
    }
  }
}

export function makeActorLayer(motionScale: number, yMotionScale: number): ActorLayer {
  const carCount = 50 + Math.floor(Math.random() * 51); // 50–100
  return new ActorLayer(motionScale, yMotionScale, carCount);
}
