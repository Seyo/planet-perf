import { Container, Graphics, Text } from "pixi.js";
import { normalize180, clamp, lerpColor } from "../../../math";
import { mulberry32 } from '../../rng';
import { EngineTrail, type EngineConfig } from '../../../actors/engine';
import {
  createShuttleSimState, createTrailBuffer, distanceFlightPlan, explodeShuttle, tickShuttle,
  DEFAULT_FLIGHT_CONFIG, DEFAULT_EXPLOSION_CONFIG, SURFACE_Y,
  type ExplosionConfig, type ExplosionOrigin, type FlightConfig, type FlightPlanFn,
  type ShuttleEvent, type ShuttleSimState, type TrailBuffer,
} from '../../../shuttle-sim';

const BASE_PPD = 24;
const FIZZLE_FADE_FRAMES = 20;
const LAYOUT_CULL_PAD = 400;
const MIN_CRUISE_DEG            = 15; // minimum trip distance

type DistrictRange = { readonly startDeg: number; readonly endDeg: number };
type CruisePicker = (deg: number) => { toDeg: number } | null;

function pickFromDistrict(districts: readonly DistrictRange[], depIdx: number, rng: () => number): { startDeg: number; endDeg: number } {
  const candidates = districts.filter((_, i) => i !== depIdx);
  return candidates.length > 0
    ? candidates[Math.floor(rng() * candidates.length)]
    : districts[Math.floor(rng() * districts.length)];
}

function pickDegInDistricts(districts: readonly DistrictRange[], rng: () => number): number {
  const d = districts[Math.floor(rng() * districts.length)];
  return d.startDeg + rng() * (d.endDeg - d.startDeg);
}

function inAnyDistrict(deg: number, districts: readonly DistrictRange[]): boolean {
  const norm = ((deg % 360) + 360) % 360;
  return districts.some(d => norm >= d.startDeg && norm < d.endDeg);
}

function enforceMinDist(fromNorm: number, toDeg: number, districts: readonly DistrictRange[], rng: () => number): number {
  const diff = normalize180(toDeg - fromNorm);
  if (Math.abs(diff) >= MIN_CRUISE_DEG) return toDeg;
  const sign = diff >= 0 ? 1 : -1;
  const fwd  = ((fromNorm + sign  * MIN_CRUISE_DEG) % 360 + 360) % 360;
  if (inAnyDistrict(fwd, districts)) return fwd;
  const bwd  = ((fromNorm - sign  * MIN_CRUISE_DEG) % 360 + 360) % 360;
  if (inAnyDistrict(bwd, districts)) return bwd;
  return pickDegInDistricts(districts, rng);
}

type DistrictHolder = { districts: readonly DistrictRange[] };

function makeCruisePicker(holder: DistrictHolder, rng: () => number): CruisePicker {
  return (deg: number): { toDeg: number } | null => {
    const { districts } = holder;
    if (districts.length === 0) return null;
    const norm   = ((deg % 360) + 360) % 360;
    const depIdx = districts.findIndex(d => norm >= d.startDeg && norm < d.endDeg);
    const target = districts.length === 1 ? districts[0] : pickFromDistrict(districts, depIdx, rng);
    const toDeg  = target.startDeg + rng() * (target.endDeg - target.startDeg);
    return { toDeg: enforceMinDist(norm, toDeg, districts, rng) };
  };
}

// Callout geometry (world-space units)
const CALLOUT_RING  = 5;
const CALLOUT_DIAG  = 15;
const CALLOUT_HORIZ = 18;


// Camera snapshot used to position, cull, and render elements in a layer.
type CameraView = { cameraDeg: number; zoom: number; halfW: number; ppd: number; showCallout: boolean };

// Paired engine/nose colours for a shuttle.
type ShuttleColors = { warm: number; cool: number };

// Minimal world-space position (deg + y).
type DegY = { deg: number; y: number };

// One simulation step, carrying the delta-time through the internal update chain.
type Tick = { dt: number };

// Configuration for a shuttle callout label overlay.
type CalloutConfig = { label: string };
type Callout = { container: Container; updateLabel: (s: string) => void };

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


function makeCallout(config: CalloutConfig): Callout {
  const c = new Container();

  const ring = new Graphics()
    .circle(0, 0, CALLOUT_RING)
    .stroke({ color: 0xffffff, width: 0.5, alpha: 0.75 });

  const edge = CALLOUT_RING * Math.SQRT1_2;
  const lines = new Graphics();
  lines
    .moveTo(edge, -edge)
    .lineTo(CALLOUT_DIAG, -CALLOUT_DIAG)
    .lineTo(CALLOUT_DIAG + CALLOUT_HORIZ, -CALLOUT_DIAG)
    .stroke({ color: 0xffffff, width: 0.5, alpha: 0.75 });

  const text = new Text({
    text: config.label,
    style: { fill: '#ffffff', fontSize: 7, fontFamily: 'monospace' },
  });
  text.anchor.set(0, 0.5);
  text.x = CALLOUT_DIAG + CALLOUT_HORIZ + 2;
  text.y = -CALLOUT_DIAG;

  c.addChild(ring, lines, text);
  return { container: c, updateLabel: (s) => { text.text = s; } };
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

// ─── Shared rendering helper ─────────────────────────────────────────────────

type SegPts  = { ax: number; ay: number; bx: number; by: number };
type SegFill = { width: number; color: number; alpha: number };

// Renders a line segment as a filled quad instead of a Graphics stroke, avoiding
// Pixi's toStrokeStyle normalisation which is the dominant cost when drawing many
// trail segments per frame. Visually identical to stroke with cap:'butt'.
function fillSegment(gfx: Graphics, pts: SegPts, fill: SegFill): void {
  const dx = pts.bx - pts.ax;
  const dy = pts.by - pts.ay;
  const d  = Math.sqrt(dx * dx + dy * dy);
  if (d < 0.001) return;
  const hw = fill.width * 0.5;
  const nx = (-dy / d) * hw;
  const ny = ( dx / d) * hw;
  gfx.poly([pts.ax + nx, pts.ay + ny, pts.bx + nx, pts.by + ny,
            pts.bx - nx, pts.by - ny, pts.ax - nx, pts.ay - ny])
     .fill({ color: fill.color, alpha: fill.alpha });
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
  private readonly trailDeg: Float64Array;
  private readonly trailY:   Float64Array;
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
    this.trailDeg = new Float64Array(DEFAULT_EXPLOSION_CONFIG.debrisTrailPoints);
    this.trailY   = new Float64Array(DEFAULT_EXPLOSION_CONFIG.debrisTrailPoints);

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

    const len = this.trailDeg.length;
    this.vY  += DEFAULT_EXPLOSION_CONFIG.debrisGravity * tick.dt;
    this.deg  = ((this.deg + this.vDeg * tick.dt) % 360 + 360) % 360;
    this.y   += this.vY * tick.dt;

    this.trailHead = (this.trailHead - 1 + len) % len;
    this.trailDeg[this.trailHead] = this.deg;
    this.trailY[this.trailHead]   = this.y;
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

    const len    = this.trailDeg.length;
    const visLen = this.trailCount;
    const tScale = Math.max(1, visLen - 1);
    for (let i = 0; i < visLen - 1; i++) {
      const spawnFade = clamp((fizzleAt - this.age + i) / FIZZLE_FADE_FRAMES, 0, 1);
      const idxA = (this.trailHead + i)     % len;
      const idxB = (this.trailHead + i + 1) % len;
      const t    = Math.max(0, 1 - i / tScale - lingerProgress);
      const color = getDebrisTrailColor(t);
      const ax   = normalize180(this.trailDeg[idxA] - this.deg) * view.ppd;
      const ay   = this.trailY[idxA] - this.y;
      const bx   = normalize180(this.trailDeg[idxB] - this.deg) * view.ppd;
      const by   = this.trailY[idxB] - this.y;

      const glow = getDebrisGlowAlpha(t) * spawnFade * this.intensity;
      const pts: SegPts = { ax, ay, bx, by };
      if (glow > 0.005) {
        fillSegment(this.trailGfx, pts, { width: 12, color, alpha: glow * 0.2 });
        fillSegment(this.trailGfx, pts, { width: 5, color, alpha: glow * 0.45 });
      }
      fillSegment(this.trailGfx, pts, {
        width: this.trailWidth, color,
        alpha: Math.min(t * spawnFade * this.intensity, 1),
      });
    }
  }

  isDone(): boolean {
    return this.landed && this.lingerTick >= DEFAULT_EXPLOSION_CONFIG.debrisLingerFrames;
  }
}

// ─── Shuttle ──────────────────────────────────────────────────────────────────

class Shuttle {
  readonly gfx: Container;
  readonly state: ShuttleSimState;
  readonly trail: TrailBuffer;
  private readonly trailGfx: Graphics;
  private readonly bodyGfx: Container;
  private readonly callout: Container;
  private readonly debugGfx: Graphics;
  private readonly updateCalloutLabel: (s: string) => void;
  private readonly config: FlightConfig;
  private readonly engineTrail: EngineTrail;
  private readonly engineCfg: EngineConfig;
  private warmColor: number;
  private coolColor: number;
  public pendingExplosion: ExplosionOrigin | null = null;
  private readonly pickTarget: CruisePicker | undefined;
  private readonly respawnDeg: (() => number) | undefined;
  private readonly planFn: FlightPlanFn;
  private readonly rng: () => number;

  // Layer code still reads these directly off the shuttle; getters keep the
  // public surface stable while state moves to ShuttleSimState.
  get deg():       number  { return this.state.deg; }
  get y():         number  { return this.state.y; }
  get isFlying():  boolean { return this.state.phase !== 'grounded' && this.state.phase !== 'dying'; }

  constructor(colors: ShuttleColors, label: string, config: FlightConfig = DEFAULT_FLIGHT_CONFIG, init: { rng: () => number; startDeg?: number; pickTarget?: CruisePicker; respawnDeg?: () => number; planFn?: FlightPlanFn }) {
    this.config      = config;
    this.rng         = init.rng;
    this.pickTarget  = init.pickTarget;
    this.respawnDeg  = init.respawnDeg;
    this.planFn      = init.planFn ?? distanceFlightPlan;
    const startDeg   = init.startDeg ?? this.rng() * 360;
    const halfLen    = config.bodyHalfLenMin + this.rng() * (config.bodyHalfLenMax - config.bodyHalfLenMin);
    const maxSpeed   = config.maxHorizSpeed * (0.75 + this.rng() * 0.5);
    this.state       = createShuttleSimState({ deg: startDeg, halfLen, maxSpeed });
    this.warmColor   = colors.warm;
    this.coolColor   = colors.cool;
    this.trail       = createTrailBuffer(config.maxTrailPoints);
    this.engineTrail = new EngineTrail(this.trail);
    this.engineCfg   = {
      warmColor:        colors.warm,
      coolColor:        colors.cool,
      maxTrailPoints:   config.maxTrailPoints,
      trailSpeedFactor: config.trailSpeedFactor,
      engineIntensity:  1.0,
      trailWidth:       1.0,
      // 2 bloom passes: enough for a visible glow at the hot tip without the
      // per-segment cost of the previous 3–5 random layers.
      bloomLayers:      2,
    };
    this.trailGfx = new Graphics();

    const body = new Graphics().rect(-halfLen, -0.5, halfLen * 2, 1).fill(0x222233);
    const nose = new Graphics().circle(halfLen, 0, 0.5).fill(colors.cool);
    this.bodyGfx = new Container();
    this.bodyGfx.addChild(body, nose);

    const callout = makeCallout({ label });
    this.callout = callout.container;
    this.callout.visible = false;
    this.updateCalloutLabel = callout.updateLabel;

    this.debugGfx = new Graphics();

    this.gfx = new Container();
    this.gfx.addChild(this.bodyGfx, this.trailGfx, this.callout, this.debugGfx);
    this.startWait();
  }

  setColors(colors: ShuttleColors): void {
    this.warmColor             = colors.warm;
    this.coolColor             = colors.cool;
    this.engineCfg.warmColor   = colors.warm;
    this.engineCfg.coolColor   = colors.cool;
  }

  private startWait(): void {
    const s = this.state;
    s.phase        = 'grounded';
    s.vDeg         = 0;
    s.vY           = 0;
    s.y            = SURFACE_Y;
    s.flyingFrames = 0;
    s.waitTicks    = this.config.waitTicksMin
      + Math.floor(this.rng() * (this.config.waitTicksMax - this.config.waitTicksMin));
    this.engineTrail.reset();
    this.bodyGfx.visible  = true;
    this.bodyGfx.rotation = 0;
  }

  private launch(): void {
    const s = this.state;
    const toDeg = this.pickTarget?.(s.deg)?.toDeg ?? null;
    const plan  = this.planFn(s.deg, toDeg, this.config, this.rng);
    s.cruiseY        = plan.cruiseY;
    s.cruiseSpeed    = s.maxSpeed * (plan.cruiseSpeed / this.config.maxHorizSpeed);
    s.dirSign        = plan.dirSign;
    s.landingDeg     = plan.landingDeg;
    s.cruiseDegLimit = plan.cruiseDegLimit;
    s.traveledDeg    = 0;
    s.overshootCount = 0;
    s.willExplode    = plan.willExplode;
    s.phase          = 'ascending';
  }

  // External trigger (debug annihilate, scripted tests). Delegates to the
  // brain's exported explode helper so the wrapper handles the resulting
  // events uniformly with brain-emitted ones.
  triggerExplosion(): void {
    const events = explodeShuttle(this.state, this.trail, this.config, BASE_PPD);
    for (const e of events) this.handleEvent(e);
  }

  update(tick: Tick): void {
    const s = this.state;
    if (s.phase === 'grounded') {
      s.waitTicks -= tick.dt;
      if (s.waitTicks <= 0) this.launch();
      return;
    }
    const events = tickShuttle({ state: s, trail: this.trail, config: this.config, basePPD: BASE_PPD, dt: tick.dt });
    for (const e of events) this.handleEvent(e);
    if (this.isFlying) this.bodyGfx.rotation = Math.atan2(s.vY, s.vDeg * BASE_PPD);
  }

  private handleEvent(e: ShuttleEvent): void {
    if (e.type === 'explode') {
      this.pendingExplosion = e.origin;
      this.bodyGfx.visible = false;
      return;
    }
    if (e.type === 'landed') {
      this.startWait();
      return;
    }
    // 'respawn-ready'
    this.state.deg = this.respawnDeg ? this.respawnDeg() : this.rng() * 360;
    this.startWait();
  }

  private computeDyingFade(): number {
    const s = this.state;
    return s.phase === 'dying' && s.dyingTrailMax > 0 ? s.dyingTrailLen / s.dyingTrailMax : 1;
  }

  private drawDebugInfo(view: CameraView): void {
    this.debugGfx.clear();
    const s = this.state;
    if (s.landingDeg === null || !this.isFlying) return;
    const remainDeg = s.dirSign * normalize180(s.landingDeg - s.deg);
    this.updateCalloutLabel(`${remainDeg.toFixed(1)}°`);
    const dx = normalize180(s.landingDeg - s.deg) * view.ppd;
    const dy = SURFACE_Y - s.y;
    this.debugGfx
      .moveTo(0, 0).lineTo(dx, dy)
      .stroke({ color: 0x44ddaa, alpha: 0.75, width: 1 });
    this.debugGfx
      .moveTo(dx - 3, dy).lineTo(dx + 3, dy)
      .stroke({ color: 0x44ddaa, alpha: 1.0, width: 1.5 });
  }

  drawTrail(view: CameraView): void {
    this.callout.visible = view.showCallout;
    this.debugGfx.visible = view.showCallout;
    if (view.showCallout) this.drawDebugInfo(view);
    const s = this.state;
    if (s.phase === 'grounded') { this.engineTrail.ensureClear(this.trailGfx); return; }

    const dying     = s.phase === 'dying';
    const dyingFade = this.computeDyingFade();
    const speedPx   = dying
      ? s.dyingTrailLen / this.config.trailSpeedFactor
      : Math.sqrt((s.vDeg * view.ppd) ** 2 + s.vY ** 2);

    if (!dying) {
      const maxSpeedPx = this.config.maxHorizSpeed * view.ppd;
      this.engineCfg.engineIntensity = 0.4 + clamp(speedPx / maxSpeedPx, 0, 1) * 0.3;
    }

    this.engineTrail.draw(this.trailGfx, {
      ppd: view.ppd, anchorDeg: s.deg, anchorY: s.y, speedPx, fadeFactor: dyingFade,
    }, this.engineCfg);
  }
}

// ─── ShuttleLayer ─────────────────────────────────────────────────────────────

type ShuttleLayerSpec = {
  motionScale:   number;
  yMotionScale:  number;
  label:         string;
  districts?:    readonly DistrictRange[];
  planFn?:       FlightPlanFn;
  seed?:         number;
};
type ShuttleLayerInit = ShuttleLayerSpec & { count: number };

export class ShuttleLayer {
  readonly container = new Container();
  private readonly shuttles: Shuttle[];
  private readonly ppd: number;
  private readonly motionScale:  number;
  private readonly yMotionScale: number;
  private readonly debugToggle:  { visible: boolean };
  private colors: ShuttleColors = { warm: 0xffee66, cool: 0x88ccff };
  private readonly explosions: Explosion[] = [];
  private readonly allDebris:  Debris[]    = [];
  private readonly districtHolder: DistrictHolder;
  private readonly rng: () => number;

  constructor(init: ShuttleLayerInit, debugToggle: { visible: boolean }) {
    this.motionScale    = init.motionScale;
    this.yMotionScale   = init.yMotionScale;
    this.debugToggle    = debugToggle;
    this.ppd            = BASE_PPD * init.motionScale;
    this.districtHolder = { districts: init.districts ?? [] };
    // Per-layer seeded RNG. Same seed → identical sim for replay / tests.
    // Missing seed falls back to a one-shot Math.random; gives variety
    // across instances while keeping each layer internally deterministic.
    this.rng = mulberry32(init.seed ?? Math.floor(Math.random() * 1e9));
    const holder        = this.districtHolder;
    const rng           = this.rng;
    const picker        = makeCruisePicker(holder, rng);
    const respawnDeg    = () => {
      const { districts } = holder;
      return districts.length > 0 ? pickDegInDistricts(districts, rng) : rng() * 360;
    };
    this.shuttles = Array.from({ length: init.count }, () => {
      const { districts } = holder;
      const startDeg = districts.length > 0 ? pickDegInDistricts(districts, rng) : undefined;
      return new Shuttle(this.colors, init.label, DEFAULT_FLIGHT_CONFIG, { rng, startDeg, pickTarget: picker, respawnDeg, planFn: init.planFn });
    });
    for (const s of this.shuttles) this.container.addChild(s.gfx);
  }

  get layerPpd():          number { return this.ppd; }
  get layerYMotionScale(): number { return this.yMotionScale; }
  get hasShuttles():       boolean { return this.shuttles.length > 0; }

  /** Replace the routing districts without interrupting in-flight shuttles.
   *  Shuttles finish their current trip, then pick from the new layout. */
  updateDistricts(newDistricts: readonly DistrictRange[]): void {
    this.districtHolder.districts = newDistricts;
  }

  setLightColors(colors: ShuttleColors) {
    this.colors = colors;
    for (const s of this.shuttles) s.setColors(colors);
  }

  private spawnAirExplosion(origin: ExplosionOrigin, cfg = DEFAULT_EXPLOSION_CONFIG) {
    const exp = new Explosion(origin, cfg.airRingRadius);
    this.container.addChild(exp.gfx);
    this.explosions.push(exp);

    const rng = this.rng;
    const count = cfg.debrisCountMin
      + Math.floor(rng() * (cfg.debrisCountMax - cfg.debrisCountMin + 1));
    for (let i = 0; i < count; i++) {
      const scattered: ExplosionOrigin = {
        deg:  origin.deg,
        y:    origin.y,
        vDeg: origin.vDeg * (0.5 + rng()) + (rng() * 2 - 1) * 0.02,
        vY:   origin.vY   * (0.5 + rng()) + (rng() * 2 - 1) * 0.4,
      };
      const willFizzle = rng() < cfg.debrisFizzleChance;
      const piece: DebrisPieceConfig = {
        fizzleFrames: willFizzle
          ? cfg.debrisFizzleFramesMin
            + rng() * (cfg.debrisFizzleFramesMax - cfg.debrisFizzleFramesMin)
          : null,
        intensity:  cfg.debrisIntensityMin
          + rng() * (cfg.debrisIntensityMax - cfg.debrisIntensityMin),
        trailWidth: cfg.debrisTrailWidthMin
          + rng() * (cfg.debrisTrailWidthMax - cfg.debrisTrailWidthMin),
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

  private pickRandomFlying(): Shuttle | null {
    let flyingCount = 0;
    for (const s of this.shuttles) if (s.isFlying) flyingCount++;
    if (flyingCount === 0) return null;
    let pick = Math.floor(this.rng() * flyingCount);
    for (const s of this.shuttles) {
      if (!s.isFlying) continue;
      if (pick === 0) return s;
      pick--;
    }
    return null;
  }

  // Programmatically detonate a shuttle. If index is given, targets that shuttle;
  // otherwise picks a random currently-flying shuttle.
  triggerExplosion(index?: number) {
    if (index !== undefined) this.shuttles[index]?.triggerExplosion();
    else this.pickRandomFlying()?.triggerExplosion();
  }

  annihilate(): void {
    let delay = 0;
    for (const s of this.shuttles) {
      if (!s.isFlying) continue;
      delay += 250;
      setTimeout(() => { if (s.isFlying) s.triggerExplosion(); }, delay);
    }
  }

  spawnExplosionAt(pos: DegY, cfg: ExplosionConfig): void {
    this.spawnAirExplosion({ ...pos, vDeg: 0, vY: 0 }, cfg);
  }

  spawnShuttleAt(deg: number, cfg: FlightConfig): void {
    const s = new Shuttle(this.colors, 'tester', cfg, { rng: this.rng, startDeg: deg });
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
      const x = normalize180(s.deg - view.cameraDeg) * view.ppd;
      s.gfx.visible = Math.abs(x * view.zoom) < view.halfW + LAYOUT_CULL_PAD;
      if (s.gfx.visible) {
        s.gfx.x = x;
        s.gfx.y = s.y;
        s.drawTrail(view);
      }
    }
  }

  private layoutExplosions(view: CameraView): void {
    for (const e of this.explosions) {
      const x = normalize180(e.deg - view.cameraDeg) * view.ppd;
      e.gfx.visible = Math.abs(x * view.zoom) < view.halfW + LAYOUT_CULL_PAD;
      if (e.gfx.visible) {
        e.gfx.x = x;
        e.gfx.y = e.y;
        e.draw();
      }
    }
  }

  private layoutDebris(view: CameraView): void {
    for (const d of this.allDebris) {
      const x = normalize180(d.deg - view.cameraDeg) * view.ppd;
      d.gfx.visible = Math.abs(x * view.zoom) < view.halfW + LAYOUT_CULL_PAD;
      if (d.gfx.visible) {
        d.gfx.x = x;
        d.gfx.y = d.y;
        d.drawTrail(view);
      }
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
  spec: ShuttleLayerSpec,
  debugToggle: { visible: boolean },
): ShuttleLayer {
  // Use the spec's seed (if any) to pick the count too — keeps the whole
  // layer deterministic given a seed. Non-seeded path stays as before.
  const countRng = spec.seed !== undefined ? mulberry32(spec.seed) : Math.random;
  const count = 2 + Math.floor(countRng() * 3);
  return new ShuttleLayer({ ...spec, count }, debugToggle);
}
