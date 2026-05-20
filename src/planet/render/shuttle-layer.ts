import { Container, Graphics, Text } from "pixi.js";
import { normalize180 } from "../math";

const BASE_PPD = 24;
const SURFACE_Y = -2;

export const MAX_CLIMB_RATE   = 0.9;
export const MAX_DESCENT_RATE = 1.2;
export const MAX_VERT_ACCEL   = 0.035;
export const MAX_HORIZ_SPEED  = 0.22;   // deg/frame base — each shuttle varies ±25%
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

const MAX_EXPLOSION_FRAMES   = 90;
const AIR_RING_RADIUS        = 90;
const GROUND_RING_RADIUS     = 50;
const EXPLOSION_LIGHT_RADIUS = 250;
const DEBRIS_GRAVITY         = 0.04;
const DEBRIS_TRAIL_POINTS    = 120;
const DEBRIS_LINGER_FRAMES   = 80;

// Callout geometry (world-space units)
const CALLOUT_RING  = 5;   // selection circle radius
const CALLOUT_DIAG  = 15;  // 45° leg length
const CALLOUT_HORIZ = 18;  // horizontal leg length

type Phase = 'grounded' | 'ascending' | 'cruising' | 'descending' | 'dying';

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

// Maps trail freshness t (1=fresh tip, 0=old tail) → fire/smoke color.
// Fire is only the top ~25% near the debris; the rest quickly becomes dark smoke.
function getDebrisTrailColor(t: number): number {
  if (t > 0.85) return lerpColor(0xffdd00, 0xffffff, (t - 0.85) / 0.15); // white→yellow
  if (t > 0.72) return lerpColor(0xff2200, 0xffdd00, (t - 0.72) / 0.13); // yellow→red
  if (t > 0.60) return lerpColor(0x222222, 0xff2200, (t - 0.60) / 0.12); // red→dark
  return 0x222222; // smoke (bottom 60% of trail)
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

// ─── Explosion ────────────────────────────────────────────────────────────────

class Explosion {
  readonly deg: number;
  readonly y: number;
  age = 0;
  private readonly maxRingRadius: number;
  readonly gfx: Graphics;

  constructor(deg: number, y: number, maxRingRadius = AIR_RING_RADIUS) {
    this.deg = deg;
    this.y   = y;
    this.maxRingRadius = maxRingRadius;
    this.gfx = new Graphics();
  }

  update(dt: number) {
    this.age += dt;
  }

  draw() {
    const t = clamp(this.age / MAX_EXPLOSION_FRAMES, 0, 1);
    this.gfx.clear();
    if (t >= 1) return;

    // Solid filled circle that starts small and expands while fading out
    const r = t * this.maxRingRadius;
    this.gfx.circle(0, 0, r).fill({ color: 0xffffff, alpha: 1 - t });
  }

  isDone(): boolean {
    return this.age >= MAX_EXPLOSION_FRAMES;
  }
}

// ─── Debris ───────────────────────────────────────────────────────────────────

class Debris {
  deg: number;
  y: number;
  vDeg: number;
  vY: number;
  landed              = false;
  landExplosionSpawned = false;
  private lingerTick  = 0;
  private readonly trail: Array<{ deg: number; y: number }>;
  private trailHead  = 0;
  private trailCount = 0;
  readonly gfx: Container;
  private readonly trailGfx: Graphics;
  private readonly bodyGfx: Graphics;

  constructor(deg: number, y: number, vDeg: number, vY: number) {
    this.deg  = deg;
    this.y    = y;
    this.vDeg = vDeg;
    this.vY   = vY;
    this.trail = Array.from({ length: DEBRIS_TRAIL_POINTS }, () => ({ deg: 0, y: 0 }));

    this.trailGfx = new Graphics();
    this.bodyGfx  = new Graphics()
      .rect(-0.5, -0.5, 1, 1)
      .fill(0x000000);

    this.gfx = new Container();
    this.gfx.addChild(this.trailGfx, this.bodyGfx);
  }

  update(dt: number) {
    if (this.landed) {
      this.lingerTick += dt;
      return;
    }

    this.vY  += DEBRIS_GRAVITY * dt;
    this.deg  = ((this.deg + this.vDeg * dt) % 360 + 360) % 360;
    this.y   += this.vY * dt;

    this.trailHead = (this.trailHead - 1 + DEBRIS_TRAIL_POINTS) % DEBRIS_TRAIL_POINTS;
    const slot = this.trail[this.trailHead];
    slot.deg = this.deg;
    slot.y   = this.y;
    if (this.trailCount < DEBRIS_TRAIL_POINTS) this.trailCount++;

    this.bodyGfx.rotation = Math.atan2(this.vY, this.vDeg * BASE_PPD);

    if (this.y >= SURFACE_Y - 3) {
      this.landed = true;
      this.y = SURFACE_Y;
    }
  }

  drawTrail(ppd: number) {
    this.trailGfx.clear();
    if (this.trailCount < 2) return;

    const linger     = this.landed ? clamp(this.lingerTick / DEBRIS_LINGER_FRAMES, 0, 1) : 0;
    const fadeAlpha  = 1 - linger;
    if (fadeAlpha <= 0) return;

    const visLen = this.trailCount;
    for (let i = 0; i < visLen - 1; i++) {
      const ptA = this.trail[(this.trailHead + i)     % DEBRIS_TRAIL_POINTS];
      const ptB = this.trail[(this.trailHead + i + 1) % DEBRIS_TRAIL_POINTS];
      const t   = 1 - i / (visLen - 1);

      const color = getDebrisTrailColor(t);

      const ax = normalize180(ptA.deg - this.deg) * ppd;
      const ay = ptA.y - this.y;
      const bx = normalize180(ptB.deg - this.deg) * ppd;
      const by = ptB.y - this.y;

      const alpha = fadeAlpha * t;

      this.trailGfx
        .moveTo(ax, ay)
        .lineTo(bx, by)
        .stroke({ color, alpha, width: 1 });
    }
  }

  isDone(): boolean {
    return this.landed && this.lingerTick >= DEBRIS_LINGER_FRAMES;
  }
}

// ─── Shuttle ──────────────────────────────────────────────────────────────────

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
  private willExplode      = false;
  private dyingTrailLen    = 0;
  private dyingTrailMax    = 0;
  public pendingExplosion: { deg: number; y: number; vDeg: number; vY: number } | null = null;
  private readonly trail: Array<{ deg: number; y: number; vDeg: number }>;
  private trailHead  = 0;
  private trailCount = 0;
  private readonly halfLen: number;

  get isFlying(): boolean {
    return this.phase !== 'grounded' && this.phase !== 'dying';
  }

  constructor(warmColor: number, coolColor: number, label: string) {
    this.deg      = Math.random() * 360;
    this.halfLen  = 3 + Math.random() * 2;
    this.maxSpeed = MAX_HORIZ_SPEED * (0.75 + Math.random() * 0.5); // 75–125% of base
    this.trail    = Array.from({ length: MAX_TRAIL_POINTS }, () => ({ deg: 0, y: 0, vDeg: 0 }));
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
    this.phase            = 'grounded';
    this.vDeg             = 0;
    this.vY               = 0;
    this.y                = SURFACE_Y;
    this.waitTicks        = WAIT_TICKS_MIN + Math.floor(Math.random() * (WAIT_TICKS_MAX - WAIT_TICKS_MIN));
    this.trailHead        = 0;
    this.trailCount       = 0;
    this.bodyGfx.visible  = true;
    this.bodyGfx.rotation = 0;
  }

  private launch() {
    this.dirSign        = Math.random() < 0.5 ? 1 : -1;
    this.cruiseY        = CRUISE_Y_MIN + Math.random() * (CRUISE_Y_MAX - CRUISE_Y_MIN);
    this.cruiseDegLimit = CRUISE_DEG_MIN + Math.random() * (CRUISE_DEG_MAX - CRUISE_DEG_MIN);
    this.traveledDeg    = 0;
    this.willExplode    = Math.random() < 0.25;
    this.phase          = 'ascending';
  }

  triggerExplosion() {
    if (this.phase === 'grounded' || this.phase === 'dying') return;

    // Move anchor to engine (rear of shuttle body) so trail tip, explosion, and
    // debris all originate from the same point with no gap.
    const rot        = Math.atan2(this.vY, this.vDeg * BASE_PPD);
    this.deg         = ((this.deg + (-this.halfLen * Math.cos(rot)) / BASE_PPD) % 360 + 360) % 360;
    this.y          +=  -this.halfLen * Math.sin(rot);

    // Record one final trail point at the engine position so the trail tip is flush
    this.trailHead = (this.trailHead - 1 + MAX_TRAIL_POINTS) % MAX_TRAIL_POINTS;
    this.trail[this.trailHead].deg  = this.deg;
    this.trail[this.trailHead].y    = this.y;
    this.trail[this.trailHead].vDeg = this.vDeg;
    if (this.trailCount < MAX_TRAIL_POINTS) this.trailCount++;

    this.pendingExplosion = { deg: this.deg, y: this.y, vDeg: this.vDeg, vY: this.vY };

    const speedPx        = Math.sqrt((this.vDeg * BASE_PPD) ** 2 + this.vY ** 2);
    this.dyingTrailLen   = Math.min(this.trailCount, Math.floor(speedPx * TRAIL_SPEED_FACTOR));
    this.dyingTrailMax   = this.dyingTrailLen;
    this.phase           = 'dying';
    this.vDeg            = 0;
    this.vY              = 0;
    this.bodyGfx.visible = false;
  }

  update(dt: number) {
    if (this.phase === 'grounded') {
      this.waitTicks -= dt;
      if (this.waitTicks <= 0) this.launch();
      return;
    }

    if (this.phase === 'dying') {
      this.dyingTrailLen -= dt;
      if (this.dyingTrailLen <= 0) {
        this.deg = Math.random() * 360; // teleport before landing so remnant is off-screen
        this.startWait();
      }
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
      if (this.willExplode && this.traveledDeg >= this.cruiseDegLimit * 0.5) {
        this.triggerExplosion();
        return;
      }
      if (this.traveledDeg >= this.cruiseDegLimit) this.phase = 'descending';
    }
    if (this.phase === 'descending' && this.y >= SURFACE_Y - LAND_THRESHOLD) {
      this.startWait();
      return;
    }

    this.trailHead = (this.trailHead - 1 + MAX_TRAIL_POINTS) % MAX_TRAIL_POINTS;
    const slot = this.trail[this.trailHead];
    slot.deg  = this.deg;
    slot.y    = this.y;
    slot.vDeg = this.vDeg;
    if (this.trailCount < MAX_TRAIL_POINTS) this.trailCount++;

    this.bodyGfx.rotation = Math.atan2(this.vY, this.vDeg * BASE_PPD);
  }

  drawTrail(cameraDeg: number, ppd: number, warmColor: number, coolColor: number) {
    this.trailGfx.clear();
    if (this.phase === 'grounded' || this.trailCount < 2) return;

    const dying = this.phase === 'dying';
    const dyingFade = dying && this.dyingTrailMax > 0
      ? this.dyingTrailLen / this.dyingTrailMax
      : 1;
    const visibleLen = dying
      ? Math.max(0, Math.ceil(this.dyingTrailLen))
      : Math.min(this.trailCount, Math.floor(
          Math.sqrt((this.vDeg * BASE_PPD) ** 2 + this.vY ** 2) * TRAIL_SPEED_FACTOR));
    if (visibleLen < 2) return;

    for (let i = 0; i < visibleLen - 1; i++) {
      const ptA  = this.trail[(this.trailHead + i)     % MAX_TRAIL_POINTS];
      const ptB  = this.trail[(this.trailHead + i + 1) % MAX_TRAIL_POINTS];
      const t    = 1 - i / (visibleLen - 1);
      const color = lerpColor(coolColor, warmColor, t);
      const ax   = normalize180(ptA.deg - this.deg) * ppd;
      const ay   = ptA.y - this.y;
      const bx   = normalize180(ptB.deg - this.deg) * ppd;
      const by   = ptB.y - this.y;
      this.trailGfx
        .moveTo(ax, ay)
        .lineTo(bx, by)
        .stroke({ color, alpha: t * dyingFade, width: 1 });
    }
  }
}

// ─── ShuttleLayer ─────────────────────────────────────────────────────────────

export class ShuttleLayer {
  readonly container = new Container();
  private readonly shuttles: Shuttle[];
  private readonly ppd: number;
  private warmColor = 0xffee66;
  private coolColor = 0x88ccff;
  private readonly explosions: Explosion[] = [];
  private readonly allDebris:  Debris[]    = [];

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

  private spawnAirExplosion(deg: number, y: number, vDeg: number, vY: number) {
    const exp = new Explosion(deg, y, AIR_RING_RADIUS);
    this.container.addChild(exp.gfx);
    this.explosions.push(exp);

    const count = 4 + Math.floor(Math.random() * 4); // 4–7 pieces
    for (let i = 0; i < count; i++) {
      const dVDeg = vDeg * (0.5 + Math.random()) + (Math.random() * 2 - 1) * 0.02;
      const dVY   = vY   * (0.5 + Math.random()) + (Math.random() * 2 - 1) * 0.4;
      const debris = new Debris(deg, y, dVDeg, dVY);
      this.container.addChild(debris.gfx);
      this.allDebris.push(debris);
    }
  }

  private spawnGroundExplosion(deg: number) {
    const exp = new Explosion(deg, SURFACE_Y, GROUND_RING_RADIUS);
    this.container.addChild(exp.gfx);
    this.explosions.push(exp);
  }

  // Programmatically detonate a shuttle. If index is given, targets that shuttle;
  // otherwise picks a random currently-flying shuttle.
  triggerExplosion(index?: number) {
    if (index !== undefined) {
      this.shuttles[index]?.triggerExplosion();
    } else {
      const flying = this.shuttles.filter(s => s.isFlying);
      if (flying.length) flying[Math.floor(Math.random() * flying.length)].triggerExplosion();
    }
  }

  update(dt: number) {
    for (const s of this.shuttles) {
      s.update(dt);
      if (s.pendingExplosion) {
        const { deg, y, vDeg, vY } = s.pendingExplosion;
        s.pendingExplosion = null;
        this.spawnAirExplosion(deg, y, vDeg, vY);
      }
    }

    for (const d of this.allDebris) {
      d.update(dt);
      if (d.landed && !d.landExplosionSpawned) {
        d.landExplosionSpawned = true;
        this.spawnGroundExplosion(d.deg);
      }
    }

    for (const e of this.explosions) e.update(dt);

    // Remove finished effects and their Pixi containers
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      if (this.explosions[i].isDone()) {
        this.container.removeChild(this.explosions[i].gfx);
        this.explosions.splice(i, 1);
      }
    }
    for (let i = this.allDebris.length - 1; i >= 0; i--) {
      if (this.allDebris[i].isDone()) {
        this.container.removeChild(this.allDebris[i].gfx);
        this.allDebris.splice(i, 1);
      }
    }
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

    for (const e of this.explosions) {
      const relDeg  = normalize180(e.deg - cameraDeg);
      e.gfx.x       = relDeg * this.ppd;
      e.gfx.y       = e.y;
      const screenX = e.gfx.x * zoom;
      e.gfx.visible = Math.abs(screenX) < halfW + CULL_PAD;
      if (e.gfx.visible) e.draw();
    }

    for (const d of this.allDebris) {
      const relDeg  = normalize180(d.deg - cameraDeg);
      d.gfx.x       = relDeg * this.ppd;
      d.gfx.y       = d.y;
      const screenX = d.gfx.x * zoom;
      d.gfx.visible = Math.abs(screenX) < halfW + CULL_PAD;
      if (d.gfx.visible) d.drawTrail(this.ppd);
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
