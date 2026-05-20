import { Container, Graphics, Text } from "pixi.js";
import { normalize180, clamp, lerpColor } from "../../../math";
import { DEFAULT_FLIGHT_CONFIG, DEFAULT_EXPLOSION_CONFIG, type FlightConfig, type ExplosionConfig } from './physics';

const BASE_PPD = 24;
const SURFACE_Y = -2;
const FIZZLE_FADE_FRAMES = 20;
const LAYOUT_CULL_PAD = 400;

// Callout geometry (world-space units)
const CALLOUT_RING  = 5;
const CALLOUT_DIAG  = 15;
const CALLOUT_HORIZ = 18;

export const MAX_CLIMB_RATE   = DEFAULT_FLIGHT_CONFIG.maxClimbRate;
export const MAX_DESCENT_RATE = DEFAULT_FLIGHT_CONFIG.maxDescentRate;
export const MAX_VERT_ACCEL   = DEFAULT_FLIGHT_CONFIG.maxVertAccel;
export const MAX_HORIZ_SPEED  = DEFAULT_FLIGHT_CONFIG.maxHorizSpeed;
export const MAX_TURN_ACCEL   = DEFAULT_FLIGHT_CONFIG.maxTurnAccel;

type Phase = 'grounded' | 'ascending' | 'cruising' | 'descending' | 'dying';

// Camera snapshot used to position, cull, and render elements in a layer.
type CameraView = { cameraDeg: number; zoom: number; halfW: number; ppd: number; showCallout: boolean };

// Paired engine/nose colours for a shuttle.
type ShuttleColors = { warm: number; cool: number };

// Position and velocity at the moment of an explosion trigger.
type ExplosionOrigin = { deg: number; y: number; vDeg: number; vY: number };

// Minimal world-space position (deg + y).
type DegY = { deg: number; y: number };

// One simulation step, carrying the delta-time through the internal update chain.
type Tick = { dt: number };

// Configuration for a shuttle callout label overlay.
type CalloutConfig = { label: string };

// Common interface for pruneable effects (explosions, debris).
type Effect = { isDone(): boolean; gfx: Container };

// Per-piece randomised properties resolved from ExplosionConfig at spawn time.
type DebrisPieceConfig = {
  fizzleFrames: number | null; // frames until in-air fade-out; null = reaches ground
  intensity:    number;        // scales glow and core alpha
  trailWidth:   number;        // core line width in px
};

// Maps trail freshness t (1=fresh tip, 0=old tail) → fire/smoke color.
// Only the top ~28% glows; the rest is near-black debris smoke.
function getDebrisTrailColor(t: number): number {
  if (t > 0.92) return lerpColor(0xffdd00, 0xffffff, (t - 0.92) / 0.08); // white→yellow
  if (t > 0.80) return lerpColor(0xff2200, 0xffdd00, (t - 0.80) / 0.12); // yellow→red
  if (t > 0.72) return lerpColor(0x080808, 0xff2200, (t - 0.72) / 0.08); // red→black
  return 0x080808;
}

// Bloom glow multiplier for the hot zone; 0 outside it.
// Fades toward zero as t approaches the red end (more transparent = more red).
function getDebrisGlowAlpha(t: number): number {
  if (t <= 0.72) return 0;
  const ht = (t - 0.72) / 0.28;
  return ht * ht * 0.4;
}

// Shuttle trail glow — strongest at the warm engine tip, zero below the midpoint.
function getShuttleGlowAlpha(t: number): number {
  const hot = Math.max(0, t - 0.5) / 0.5;
  return hot * hot * 0.3;
}

function makeCallout(config: CalloutConfig): Container {
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
    text: config.label,
    style: { fill: '#ffffff', fontSize: 7, fontFamily: 'monospace' },
  });
  text.anchor.set(0, 0.5);
  text.x = CALLOUT_DIAG + CALLOUT_HORIZ + 2;
  text.y = -CALLOUT_DIAG;

  c.addChild(ring, lines, text);
  return c;
}

// ─── Explosion ────────────────────────────────────────────────────────────────

const SHOCK_MULT = 2.2;

class Explosion {
  readonly deg: number;
  readonly y: number;
  age = 0;
  private readonly maxRingRadius: number;
  readonly gfx: Graphics;

  constructor(pos: DegY, maxRingRadius = DEFAULT_EXPLOSION_CONFIG.airRingRadius) {
    this.deg = pos.deg;
    this.y   = pos.y;
    this.maxRingRadius = maxRingRadius;
    this.gfx = new Graphics();
  }

  update(tick: Tick) {
    this.age += tick.dt;
  }

  draw() {
    const maxF  = DEFAULT_EXPLOSION_CONFIG.maxFrames;
    const shockF = maxF * SHOCK_MULT;
    const t      = clamp(this.age / maxF, 0, 1);
    const ts     = clamp(this.age / shockF, 0, 1);
    this.gfx.clear();

    if (t < 1) {
      const r = t * this.maxRingRadius;
      this.gfx.circle(0, 0, r).fill({ color: 0xffffff, alpha: 1 - t });
    }

    if (ts < 1) {
      const sr = ts * this.maxRingRadius * SHOCK_MULT;
      this.gfx
        .circle(0, 0, sr)
        .stroke({ color: 0xffffff, alpha: (1 - ts) * 0.07, width: 2 });
    }
  }

  isDone(): boolean {
    return this.age >= DEFAULT_EXPLOSION_CONFIG.maxFrames * SHOCK_MULT;
  }
}

// ─── Debris ───────────────────────────────────────────────────────────────────

class Debris {
  deg: number;
  y: number;
  vDeg: number;
  vY: number;
  landed               = false;
  fizzled              = false;
  landExplosionSpawned = false;
  private lingerTick   = 0;
  private age          = 0;
  private readonly fizzleFrames: number | null;
  private readonly intensity: number;
  private readonly trailWidth: number;
  private readonly trail: Array<{ deg: number; y: number }>;
  private trailHead  = 0;
  private trailCount = 0;
  readonly gfx: Container;
  private readonly trailGfx: Graphics;
  private readonly bodyGfx: Graphics;

  constructor(origin: ExplosionOrigin, piece: DebrisPieceConfig) {
    this.deg          = origin.deg;
    this.y            = origin.y;
    this.vDeg         = origin.vDeg;
    this.vY           = origin.vY;
    this.fizzleFrames = piece.fizzleFrames;
    this.intensity    = piece.intensity;
    this.trailWidth   = piece.trailWidth;
    this.trail = Array.from(
      { length: DEFAULT_EXPLOSION_CONFIG.debrisTrailPoints },
      () => ({ deg: 0, y: 0 }),
    );

    this.trailGfx = new Graphics();
    this.bodyGfx  = new Graphics()
      .rect(-0.5, -0.5, 1, 1)
      .fill(0x000000);

    this.gfx = new Container();
    this.gfx.addChild(this.trailGfx, this.bodyGfx);
  }

  update(tick: Tick) {
    if (this.landed) {
      this.lingerTick += tick.dt;
      return;
    }

    this.age += tick.dt;
    if (this.fizzleFrames !== null && this.age >= this.fizzleFrames) {
      this.landed          = true;
      this.fizzled         = true;
      this.bodyGfx.visible = false;
      return;
    }

    const len = this.trail.length;
    this.vY  += DEFAULT_EXPLOSION_CONFIG.debrisGravity * tick.dt;
    this.deg  = ((this.deg + this.vDeg * tick.dt) % 360 + 360) % 360;
    this.y   += this.vY * tick.dt;

    this.trailHead = (this.trailHead - 1 + len) % len;
    const slot = this.trail[this.trailHead];
    slot.deg = this.deg;
    slot.y   = this.y;
    if (this.trailCount < len) this.trailCount++;

    this.bodyGfx.rotation = Math.atan2(this.vY, this.vDeg * BASE_PPD);

    if (this.y >= SURFACE_Y - 3) {
      this.landed = true;
      this.y = SURFACE_Y;
    }
  }

  drawTrail(view: CameraView) {
    this.trailGfx.clear();
    if (this.trailCount < 2) return;

    // lingerProgress (0→1) acts as a shared age offset: every particle ages by
    // this amount each linger tick, so the oldest end reaches t=0 first and the
    // trail dissolves tip-to-tail — the same particle-by-particle behaviour as flight.
    const lingerProgress = this.landed
      ? clamp(this.lingerTick / DEFAULT_EXPLOSION_CONFIG.debrisLingerFrames, 0, 1)
      : 0;
    if (lingerProgress >= 1) return;

    const fizzleAt = this.fizzleFrames ?? Infinity;
    const tipFade  = clamp((fizzleAt - this.age) / FIZZLE_FADE_FRAMES, 0, 1);
    this.bodyGfx.alpha = (1 - lingerProgress) * tipFade;

    const len    = this.trail.length;
    const visLen = this.trailCount;
    const tScale = Math.max(1, visLen - 1);
    for (let i = 0; i < visLen - 1; i++) {
      const spawnFade = clamp((fizzleAt - this.age + i) / FIZZLE_FADE_FRAMES, 0, 1);
      const ptA  = this.trail[(this.trailHead + i)     % len];
      const ptB  = this.trail[(this.trailHead + i + 1) % len];
      const t    = Math.max(0, 1 - i / tScale - lingerProgress);
      const color = getDebrisTrailColor(t);
      const ax   = normalize180(ptA.deg - this.deg) * view.ppd;
      const ay   = ptA.y - this.y;
      const bx   = normalize180(ptB.deg - this.deg) * view.ppd;
      const by   = ptB.y - this.y;

      const glow = getDebrisGlowAlpha(t) * spawnFade * this.intensity;
      if (glow > 0.005) {
        this.trailGfx.moveTo(ax, ay).lineTo(bx, by).stroke({ color, alpha: glow * 0.2,  width: 12 });
        this.trailGfx.moveTo(ax, ay).lineTo(bx, by).stroke({ color, alpha: glow * 0.45, width: 5  });
      }
      this.trailGfx
        .moveTo(ax, ay)
        .lineTo(bx, by)
        .stroke({ color, alpha: Math.min(t * spawnFade * this.intensity, 1), width: this.trailWidth });
    }
  }

  isDone(): boolean {
    return this.landed && this.lingerTick >= DEFAULT_EXPLOSION_CONFIG.debrisLingerFrames;
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
  private readonly config: FlightConfig;
  private warmColor: number;
  private coolColor: number;
  private phase: Phase = 'grounded';
  private waitTicks      = 0;
  private dirSign        = 1;
  private cruiseY        = -250;
  private cruiseDegLimit = 80;
  private traveledDeg    = 0;
  private willExplode      = false;
  private dyingTrailLen    = 0;
  private dyingTrailMax    = 0;
  private flyingFrames     = 0;
  public pendingExplosion: ExplosionOrigin | null = null;
  private readonly trail: Array<{ deg: number; y: number; vDeg: number }>;
  private trailHead  = 0;
  private trailCount = 0;
  private readonly halfLen: number;

  get isFlying(): boolean {
    return this.phase !== 'grounded' && this.phase !== 'dying';
  }

  constructor(colors: ShuttleColors, label: string, config: FlightConfig = DEFAULT_FLIGHT_CONFIG, startDeg?: number) {
    this.config    = config;
    this.deg       = startDeg ?? Math.random() * 360;
    this.halfLen   = config.bodyHalfLenMin
      + Math.random() * (config.bodyHalfLenMax - config.bodyHalfLenMin);
    this.maxSpeed  = config.maxHorizSpeed * (0.75 + Math.random() * 0.5);
    this.warmColor = colors.warm;
    this.coolColor = colors.cool;
    this.trail     = Array.from(
      { length: config.maxTrailPoints },
      () => ({ deg: 0, y: 0, vDeg: 0 }),
    );
    this.trailGfx  = new Graphics();

    const body   = new Graphics().rect(-this.halfLen, -0.5, this.halfLen * 2, 1).fill(0x222233);
    this.engGlow = new Graphics().circle(-this.halfLen, 0, 2)
      .fill({ color: colors.warm, alpha: Math.min(0.25 * config.engineIntensity, 0.9) });
    const nose   = new Graphics().circle(this.halfLen, 0, 0.5).fill(colors.cool);
    this.bodyGfx = new Container();
    this.bodyGfx.addChild(body, this.engGlow, nose);

    this.callout = makeCallout({ label });
    this.callout.visible = false;

    this.gfx = new Container();
    this.gfx.addChild(this.trailGfx, this.bodyGfx, this.callout);
    this.startWait();
  }

  setColors(colors: ShuttleColors) {
    this.warmColor = colors.warm;
    this.coolColor = colors.cool;
    this.engGlow.clear();
    this.engGlow.circle(-this.halfLen, 0, 2)
      .fill({ color: colors.warm, alpha: Math.min(0.25 * this.config.engineIntensity, 0.9) });
  }

  private startWait() {
    this.phase            = 'grounded';
    this.vDeg             = 0;
    this.vY               = 0;
    this.y                = SURFACE_Y;
    this.flyingFrames     = 0;
    this.waitTicks        = this.config.waitTicksMin
      + Math.floor(Math.random() * (this.config.waitTicksMax - this.config.waitTicksMin));
    this.trailHead        = 0;
    this.trailCount       = 0;
    this.bodyGfx.visible  = true;
    this.bodyGfx.rotation = 0;
  }

  private launch() {
    this.dirSign        = Math.random() < 0.5 ? 1 : -1;
    this.cruiseY        = this.config.cruiseYMin
      + Math.random() * (this.config.cruiseYMax - this.config.cruiseYMin);
    this.cruiseDegLimit = this.config.cruiseDegMin
      + Math.random() * (this.config.cruiseDegMax - this.config.cruiseDegMin);
    this.traveledDeg    = 0;
    this.willExplode    = Math.random() < this.config.explodeChance;
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
    const len = this.trail.length;
    this.trailHead = (this.trailHead - 1 + len) % len;
    this.trail[this.trailHead].deg  = this.deg;
    this.trail[this.trailHead].y    = this.y;
    this.trail[this.trailHead].vDeg = this.vDeg;
    if (this.trailCount < len) this.trailCount++;

    this.pendingExplosion = { deg: this.deg, y: this.y, vDeg: this.vDeg, vY: this.vY };

    const speedPx        = Math.sqrt((this.vDeg * BASE_PPD) ** 2 + this.vY ** 2);
    this.dyingTrailLen   = Math.min(this.trailCount, Math.floor(speedPx * this.config.trailSpeedFactor));
    this.dyingTrailMax   = this.dyingTrailLen;
    this.phase           = 'dying';
    this.vDeg            = 0;
    this.vY              = 0;
    this.bodyGfx.visible = false;
  }

  private updateGrounded(tick: Tick): void {
    this.waitTicks -= tick.dt;
    if (this.waitTicks <= 0) this.launch();
  }

  private updateDying(tick: Tick): void {
    this.dyingTrailLen -= tick.dt;
    if (this.dyingTrailLen <= 0) {
      this.deg = Math.random() * 360; // teleport before landing so remnant is off-screen
      this.startWait();
    }
  }

  private vertControlParams(): { targetY: number; pdGain: number } {
    const targetY = this.phase === 'descending' ? SURFACE_Y : this.cruiseY;
    const pdGain  = this.phase === 'descending' ? 0.008 : 0.12;
    return { targetY, pdGain };
  }

  private horizTargetSpeed(): number {
    if (this.phase === 'ascending') return this.maxSpeed * 0.35; // slow climb — fighting gravity
    if (this.phase === 'cruising')  return this.maxSpeed;
    // Quadratic decel: maintains speed through most of descent, brakes hard near ground.
    const af = clamp((this.y - this.cruiseY) / (SURFACE_Y - this.cruiseY), 0, 1);
    return this.maxSpeed * (1 - af * af);
  }

  private applyPhysics(tick: Tick): void {
    const { targetY, pdGain } = this.vertControlParams();
    const targetVY = clamp(
      (targetY - this.y) * pdGain,
      -this.config.maxClimbRate,
      this.config.maxDescentRate,
    );
    this.vY += clamp(
      targetVY - this.vY,
      -this.config.maxVertAccel * tick.dt,
      this.config.maxVertAccel * tick.dt,
    );

    const targetVDeg = this.horizTargetSpeed() * this.dirSign;
    this.vDeg += clamp(
      targetVDeg - this.vDeg,
      -this.config.maxTurnAccel * tick.dt,
      this.config.maxTurnAccel * tick.dt,
    );

    this.deg = ((this.deg + this.vDeg * tick.dt) % 360 + 360) % 360;
    this.y  += this.vY * tick.dt;
  }

  private recordTrail(): void {
    const len = this.trail.length;
    this.trailHead = (this.trailHead - 1 + len) % len;
    const slot = this.trail[this.trailHead];
    slot.deg  = this.deg;
    slot.y    = this.y;
    slot.vDeg = this.vDeg;
    if (this.trailCount < len) this.trailCount++;
  }

  // Returns true when the shuttle has just triggered an explosion (caller must return early).
  private checkCruisingPhase(tick: Tick): boolean {
    this.traveledDeg += Math.abs(this.vDeg * tick.dt);
    if (this.willExplode && this.traveledDeg >= this.cruiseDegLimit * 0.5) {
      this.triggerExplosion();
      return true;
    }
    if (this.traveledDeg >= this.cruiseDegLimit) this.phase = 'descending';
    return false;
  }

  private checkExplodeAfterFrames(): boolean {
    return this.config.explodeAfterFrames > 0
      && this.flyingFrames >= this.config.explodeAfterFrames;
  }

  private updateFlying(tick: Tick): void {
    this.flyingFrames += tick.dt;
    if (this.checkExplodeAfterFrames()) { this.triggerExplosion(); return; }

    this.applyPhysics(tick);

    if (this.phase === 'ascending' && Math.abs(this.y - this.cruiseY) < this.config.levelThreshold) {
      this.phase = 'cruising';
    }
    if (this.phase === 'cruising' && this.checkCruisingPhase(tick)) return;
    if (this.phase === 'descending' && this.y >= SURFACE_Y - this.config.landThreshold) {
      this.startWait();
      return;
    }

    this.recordTrail();
    this.bodyGfx.rotation = Math.atan2(this.vY, this.vDeg * BASE_PPD);
  }

  update(tick: Tick): void {
    if (this.phase === 'grounded') { this.updateGrounded(tick); return; }
    if (this.phase === 'dying')    { this.updateDying(tick);    return; }
    this.updateFlying(tick);
  }

  private computeDyingFade(): number {
    return this.phase === 'dying' && this.dyingTrailMax > 0
      ? this.dyingTrailLen / this.dyingTrailMax
      : 1;
  }

  drawTrail(view: CameraView) {
    this.callout.visible = view.showCallout;
    this.trailGfx.clear();
    if (this.phase === 'grounded' || this.trailCount < 2) return;

    const dying      = this.phase === 'dying';
    const dyingFade  = this.computeDyingFade();
    const visibleLen = dying
      ? Math.max(0, Math.ceil(this.dyingTrailLen))
      : Math.min(this.trailCount, Math.floor(
          Math.sqrt((this.vDeg * view.ppd) ** 2 + this.vY ** 2) * this.config.trailSpeedFactor));
    if (visibleLen < 2) return;

    const len = this.trail.length;
    for (let i = 0; i < visibleLen - 1; i++) {
      const ptA  = this.trail[(this.trailHead + i)     % len];
      const ptB  = this.trail[(this.trailHead + i + 1) % len];
      const t    = 1 - i / (visibleLen - 1);
      const color = lerpColor(this.coolColor, this.warmColor, t);
      const ax   = normalize180(ptA.deg - this.deg) * view.ppd;
      const ay   = ptA.y - this.y;
      const bx   = normalize180(ptB.deg - this.deg) * view.ppd;
      const by   = ptB.y - this.y;

      const glow = getShuttleGlowAlpha(t) * this.config.engineIntensity * dyingFade;
      if (glow > 0.005) {
        this.trailGfx.moveTo(ax, ay).lineTo(bx, by).stroke({ color: this.warmColor, alpha: glow * 0.2,  width: 12 });
        this.trailGfx.moveTo(ax, ay).lineTo(bx, by).stroke({ color: this.warmColor, alpha: glow * 0.45, width: 5  });
      }
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
  private colors: ShuttleColors = { warm: 0xffee66, cool: 0x88ccff };
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
    this.shuttles = Array.from({ length: count }, () => new Shuttle(this.colors, label));
    for (const s of this.shuttles) this.container.addChild(s.gfx);
  }

  get layerPpd():          number { return this.ppd; }
  get layerYMotionScale(): number { return this.yMotionScale; }

  setLightColors(colors: ShuttleColors) {
    this.colors = colors;
    for (const s of this.shuttles) s.setColors(colors);
  }

  private spawnAirExplosion(origin: ExplosionOrigin, cfg = DEFAULT_EXPLOSION_CONFIG) {
    const exp = new Explosion(origin, cfg.airRingRadius);
    this.container.addChild(exp.gfx);
    this.explosions.push(exp);

    const count = cfg.debrisCountMin
      + Math.floor(Math.random() * (cfg.debrisCountMax - cfg.debrisCountMin + 1));
    for (let i = 0; i < count; i++) {
      const scattered: ExplosionOrigin = {
        deg:  origin.deg,
        y:    origin.y,
        vDeg: origin.vDeg * (0.5 + Math.random()) + (Math.random() * 2 - 1) * 0.02,
        vY:   origin.vY   * (0.5 + Math.random()) + (Math.random() * 2 - 1) * 0.4,
      };
      const willFizzle = Math.random() < cfg.debrisFizzleChance;
      const piece: DebrisPieceConfig = {
        fizzleFrames: willFizzle
          ? cfg.debrisFizzleFramesMin
            + Math.random() * (cfg.debrisFizzleFramesMax - cfg.debrisFizzleFramesMin)
          : null,
        intensity:  cfg.debrisIntensityMin
          + Math.random() * (cfg.debrisIntensityMax - cfg.debrisIntensityMin),
        trailWidth: cfg.debrisTrailWidthMin
          + Math.random() * (cfg.debrisTrailWidthMax - cfg.debrisTrailWidthMin),
      };
      const debris = new Debris(scattered, piece);
      this.container.addChild(debris.gfx);
      this.allDebris.push(debris);
    }
  }

  private spawnGroundExplosion(pos: DegY) {
    const exp = new Explosion(pos, DEFAULT_EXPLOSION_CONFIG.groundRingRadius);
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

  annihilate(): void {
    for (const s of this.shuttles) {
      if (s.isFlying) s.triggerExplosion();
    }
  }

  spawnExplosionAt(deg: number, y: number, cfg: ExplosionConfig): void {
    this.spawnAirExplosion({ deg, y, vDeg: 0, vY: 0 }, cfg);
  }

  spawnShuttleAt(deg: number, cfg: FlightConfig): void {
    const s = new Shuttle(this.colors, 'tester', cfg, deg);
    this.shuttles.push(s);
    this.container.addChild(s.gfx);
  }

  clearShuttles(): void {
    for (const s of this.shuttles) {
      this.container.removeChild(s.gfx);
      s.gfx.destroy({ children: true });
    }
    this.shuttles.length = 0;
  }

  private tickDebris(tick: Tick): void {
    for (const d of this.allDebris) {
      d.update(tick);
      const needsGroundBlast = d.landed && !d.fizzled && !d.landExplosionSpawned;
      if (needsGroundBlast) {
        d.landExplosionSpawned = true;
        this.spawnGroundExplosion({ deg: d.deg, y: SURFACE_Y });
      }
    }
  }

  private pruneList(list: Effect[]): void {
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].isDone()) {
        this.container.removeChild(list[i].gfx);
        list.splice(i, 1);
      }
    }
  }

  private tickExplosions(tick: Tick): void {
    this.tickDebris(tick);
    for (const e of this.explosions) e.update(tick);
    this.pruneList(this.explosions);
    this.pruneList(this.allDebris);
  }

  update(dt: number) {
    const tick: Tick = { dt };
    for (const s of this.shuttles) {
      s.update(tick);
      if (s.pendingExplosion) {
        this.spawnAirExplosion(s.pendingExplosion);
        s.pendingExplosion = null;
      }
    }
    this.tickExplosions(tick);
  }

  private layoutShuttles(view: CameraView): void {
    for (const s of this.shuttles) {
      s.gfx.x = normalize180(s.deg - view.cameraDeg) * view.ppd;
      s.gfx.y = s.y;
      s.gfx.visible = Math.abs(s.gfx.x * view.zoom) < view.halfW + LAYOUT_CULL_PAD;
      if (s.gfx.visible) s.drawTrail(view);
    }
  }

  private layoutExplosions(view: CameraView): void {
    for (const e of this.explosions) {
      e.gfx.x = normalize180(e.deg - view.cameraDeg) * view.ppd;
      e.gfx.y = e.y;
      e.gfx.visible = Math.abs(e.gfx.x * view.zoom) < view.halfW + LAYOUT_CULL_PAD;
      if (e.gfx.visible) e.draw();
    }
  }

  private layoutDebris(view: CameraView): void {
    for (const d of this.allDebris) {
      d.gfx.x = normalize180(d.deg - view.cameraDeg) * view.ppd;
      d.gfx.y = d.y;
      d.gfx.visible = Math.abs(d.gfx.x * view.zoom) < view.halfW + LAYOUT_CULL_PAD;
      if (d.gfx.visible) d.drawTrail(view);
    }
  }

  layout(cameraDeg: number, zoom: number, viewWidthPx: number, cameraY: number) {
    this.container.y = -cameraY * this.yMotionScale;
    const view: CameraView = {
      cameraDeg,
      zoom,
      halfW: viewWidthPx / 2,
      ppd: this.ppd,
      showCallout: this.debugToggle.visible,
    };
    this.layoutShuttles(view);
    this.layoutExplosions(view);
    this.layoutDebris(view);
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
