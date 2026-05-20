import { Container, Graphics, Text } from "pixi.js";
import { normalize180 } from "../math";

const BASE_PPD = 24;
const SURFACE_Y = -2;

export const MAX_CLIMB_RATE   = 0.9;
export const MAX_DESCENT_RATE = 1.2;
export const MAX_VERT_ACCEL   = 0.035;
export const MAX_HORIZ_SPEED  = 0.13;   // deg/frame base — each shuttle varies ±25%
export const MAX_TURN_ACCEL   = 0.004;

const CRUISE_Y_MIN     = -320;
const CRUISE_Y_MAX     = -180;
const CRUISE_DEG_MIN   = 50;
const CRUISE_DEG_MAX   = 140;
const LEVEL_THRESHOLD  = 15;
const LAND_THRESHOLD   = 4;
const WAIT_TICKS_MIN   = 120;
const WAIT_TICKS_MAX   = 360;
const MAX_TRAIL_POINTS   = 100;
const TRAIL_SPEED_FACTOR = 20;

// Callout geometry (world-space units)
const CALLOUT_RING  = 5;   // selection circle radius
const CALLOUT_DIAG  = 15;  // 45° leg length
const CALLOUT_HORIZ = 18;  // horizontal leg length

type Phase = 'grounded' | 'ascending' | 'cruising' | 'descending';

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return (Math.round(ar + (br - ar) * t) << 16)
       | (Math.round(ag + (bg - ag) * t) << 8)
       |  Math.round(ab + (bb - ab) * t);
}

function makeCallout(label: string): Container {
  const c = new Container();

  // Selection ring around the shuttle body
  const ring = new Graphics()
    .circle(0, 0, CALLOUT_RING)
    .stroke({ color: 0xffffff, width: 0.5, alpha: 0.75 });

  // 45° line starting from the ring edge, then horizontal
  const edge = CALLOUT_RING * Math.SQRT1_2; // point on ring in the 45° up-right direction
  const lines = new Graphics();
  lines
    .moveTo(edge, -edge)
    .lineTo(CALLOUT_DIAG, -CALLOUT_DIAG)
    .lineTo(CALLOUT_DIAG + CALLOUT_HORIZ, -CALLOUT_DIAG)
    .stroke({ color: 0xffffff, width: 0.5, alpha: 0.75 });

  // Text vertically centred, anchored to the right end of the horizontal line
  const text = new Text({
    text: label,
    style: { fill: '#ffffff', fontSize: 7, fontFamily: 'monospace' },
  });
  text.anchor.set(0, 0.5);
  text.x = CALLOUT_DIAG + CALLOUT_HORIZ + 2;
  text.y = -CALLOUT_DIAG;

  c.addChild(ring, lines, text);
  return c;
}

class Shuttle {
  deg: number;
  y      = SURFACE_Y;
  vDeg   = 0;
  vY     = 0;
  readonly gfx: Container;
  private readonly trailGfx: Graphics;
  private readonly bodyGfx: Container;
  private readonly engGlow: Graphics;
  private readonly callout: Container;
  private readonly maxSpeed: number;
  private phase: Phase = 'grounded';
  private waitTicks      = 0;
  private dirSign        = 1;
  private cruiseY        = -250;
  private cruiseDegLimit = 80;
  private traveledDeg    = 0;
  private readonly trail: Array<{ deg: number; y: number; vDeg: number }> = [];
  private readonly halfLen: number;

  constructor(warmColor: number, coolColor: number, label: string) {
    this.deg      = Math.random() * 360;
    this.halfLen  = 3 + Math.random() * 2;
    this.maxSpeed = MAX_HORIZ_SPEED * (0.75 + Math.random() * 0.5); // 75–125% of base
    this.trailGfx = new Graphics();

    const body   = new Graphics().rect(-this.halfLen, -0.5, this.halfLen * 2, 1).fill(0x222233);
    this.engGlow = new Graphics().circle(-this.halfLen, 0, 2).fill({ color: warmColor, alpha: 0.25 });
    const nose   = new Graphics().circle(this.halfLen, 0, 0.5).fill(coolColor);
    this.bodyGfx = new Container();
    this.bodyGfx.addChild(body, this.engGlow, nose);

    this.callout = makeCallout(label);
    this.callout.visible = false;

    this.gfx = new Container();
    this.gfx.addChild(this.trailGfx, this.bodyGfx, this.callout);
    this.startWait();
  }

  setColors(warm: number, cool: number) {
    this.engGlow.clear();
    this.engGlow.circle(-this.halfLen, 0, 2).fill({ color: warm, alpha: 0.25 });
  }

  setCalloutVisible(v: boolean) {
    this.callout.visible = v;
  }

  private startWait() {
    this.phase           = 'grounded';
    this.vDeg            = 0;
    this.vY              = 0;
    this.y               = SURFACE_Y;
    this.waitTicks       = WAIT_TICKS_MIN + Math.floor(Math.random() * (WAIT_TICKS_MAX - WAIT_TICKS_MIN));
    this.trail.length    = 0;
    this.bodyGfx.rotation = 0; // rest flat on the ground
  }

  private launch() {
    this.dirSign        = Math.random() < 0.5 ? 1 : -1;
    this.cruiseY        = CRUISE_Y_MIN + Math.random() * (CRUISE_Y_MAX - CRUISE_Y_MIN);
    this.cruiseDegLimit = CRUISE_DEG_MIN + Math.random() * (CRUISE_DEG_MAX - CRUISE_DEG_MIN);
    this.traveledDeg    = 0;
    this.phase          = 'ascending';
  }

  update(dt: number) {
    if (this.phase === 'grounded') {
      this.waitTicks -= dt;
      if (this.waitTicks <= 0) this.launch();
      return;
    }

    const targetY  = this.phase === 'descending' ? SURFACE_Y : this.cruiseY;
    const errY     = targetY - this.y;
    // Ascending/cruising: high gain → steep climb, snaps to cruise altitude (fighting gravity).
    // Descending: low gain → 150px decel zone → S-curve arrival.
    const pdGain   = this.phase === 'descending' ? 0.008 : 0.12;
    const targetVY = clamp(errY * pdGain, -MAX_CLIMB_RATE, MAX_DESCENT_RATE);
    this.vY += clamp(targetVY - this.vY, -MAX_VERT_ACCEL * dt, MAX_VERT_ACCEL * dt);

    let targetSpeed: number;
    if (this.phase === 'ascending') {
      targetSpeed = this.maxSpeed * 0.35; // slow climb — fighting gravity
    } else if (this.phase === 'cruising') {
      targetSpeed = this.maxSpeed;
    } else {
      // Quadratic decel: maintains speed through most of descent, brakes hard near ground.
      // This pairs with the low vY gain to create an S-curve arrival.
      const af = clamp((this.y - this.cruiseY) / (SURFACE_Y - this.cruiseY), 0, 1);
      targetSpeed = this.maxSpeed * (1 - af * af);
    }
    const targetVDeg = targetSpeed * this.dirSign;
    this.vDeg += clamp(targetVDeg - this.vDeg, -MAX_TURN_ACCEL * dt, MAX_TURN_ACCEL * dt);

    this.deg = ((this.deg + this.vDeg * dt) % 360 + 360) % 360;
    this.y  += this.vY * dt;

    if (this.phase === 'ascending' && Math.abs(this.y - this.cruiseY) < LEVEL_THRESHOLD) {
      this.phase = 'cruising';
    }
    if (this.phase === 'cruising') {
      this.traveledDeg += Math.abs(this.vDeg * dt);
      if (this.traveledDeg >= this.cruiseDegLimit) this.phase = 'descending';
    }
    if (this.phase === 'descending' && this.y >= SURFACE_Y - LAND_THRESHOLD) {
      this.startWait();
      return;
    }

    this.trail.unshift({ deg: this.deg, y: this.y, vDeg: this.vDeg });
    if (this.trail.length > MAX_TRAIL_POINTS) this.trail.pop();

    this.bodyGfx.rotation = Math.atan2(this.vY, this.vDeg * BASE_PPD);
  }

  drawTrail(cameraDeg: number, ppd: number, warmColor: number, coolColor: number) {
    this.trailGfx.clear();
    if (this.phase === 'grounded' || this.trail.length < 2) return;

    const speedPx    = Math.sqrt((this.vDeg * BASE_PPD) ** 2 + this.vY ** 2);
    const visibleLen = Math.min(this.trail.length, Math.floor(speedPx * TRAIL_SPEED_FACTOR));
    if (visibleLen < 2) return;

    for (let i = 0; i < visibleLen; i++) {
      const t     = 1 - i / (visibleLen - 1);
      const alpha = t;
      const color = lerpColor(coolColor, warmColor, t);
      const lx    = normalize180(this.trail[i].deg - this.deg) * ppd;
      const ly    = this.trail[i].y - this.y;
      const w     = Math.max(1, Math.ceil(Math.abs(this.trail[i].vDeg * ppd)));
      const x0    = this.trail[i].vDeg >= 0 ? lx - w : lx;
      this.trailGfx.rect(x0, ly - 0.5, w, 1).fill({ color, alpha });
    }
  }
}

export class ShuttleLayer {
  readonly container = new Container();
  private readonly shuttles: Shuttle[];
  private readonly ppd: number;
  private warmColor = 0xffee66;
  private coolColor = 0x88ccff;

  constructor(
    private readonly motionScale: number,
    private readonly yMotionScale: number,
    count: number,
    label: string,
    private readonly debugToggle: { visible: boolean },
  ) {
    this.ppd      = BASE_PPD * motionScale;
    this.shuttles = Array.from({ length: count }, () => new Shuttle(this.warmColor, this.coolColor, label));
    for (const s of this.shuttles) this.container.addChild(s.gfx);
  }

  setLightColors(warm: number, cool: number) {
    this.warmColor = warm;
    this.coolColor = cool;
    for (const s of this.shuttles) s.setColors(warm, cool);
  }

  update(dt: number) {
    for (const s of this.shuttles) s.update(dt);
  }

  layout(cameraDeg: number, zoom: number, viewWidthPx: number, cameraY: number) {
    this.container.y = -cameraY * this.yMotionScale;
    const halfW       = viewWidthPx / 2;
    const CULL_PAD    = 400;
    const showCallout = this.debugToggle.visible;

    for (const s of this.shuttles) {
      const relDeg  = normalize180(s.deg - cameraDeg);
      s.gfx.x       = relDeg * this.ppd;
      s.gfx.y       = s.y;
      const screenX = s.gfx.x * zoom;
      s.gfx.visible = Math.abs(screenX) < halfW + CULL_PAD;
      if (s.gfx.visible) {
        s.drawTrail(cameraDeg, this.ppd, this.warmColor, this.coolColor);
        s.setCalloutVisible(showCallout);
      }
    }
  }
}

export function makeShuttleLayer(
  motionScale: number,
  yMotionScale: number,
  label: string,
  debugToggle: { visible: boolean },
): ShuttleLayer {
  const count = 2 + Math.floor(Math.random() * 3);
  return new ShuttleLayer(motionScale, yMotionScale, count, label, debugToggle);
}
