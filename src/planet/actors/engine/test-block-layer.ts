import { Container, Graphics } from 'pixi.js';
import { normalize180 } from '../../math';
import type { ActorLike } from '../../planet';
import { EngineTrail } from './engine-trail';
import type { EngineConfig } from './engine-config';
import { DEFAULT_ENGINE_CONFIG } from './engine-config';

const BASE_PPD = 24;
const HALF_LEN = 5;

export type TestBlockConfig = {
  speedDeg: number;
  cruiseY:  number;
  engine:   EngineConfig;
};

export const DEFAULT_TEST_BLOCK_CONFIG: TestBlockConfig = {
  speedDeg: 0.15,
  cruiseY:  -220,
  engine:   { ...DEFAULT_ENGINE_CONFIG },
};

export class TestBlockLayer implements ActorLike {
  readonly container = new Container();
  private readonly blockGfx = new Container();
  private readonly bodyCtr  = new Container();
  private readonly trailGfx = new Graphics();
  private readonly noseGfx  = new Graphics();
  private trail: EngineTrail;
  private config: TestBlockConfig;
  private deg    = 0;
  private lastSign = 0;

  constructor(config: TestBlockConfig = DEFAULT_TEST_BLOCK_CONFIG) {
    this.config = { ...config, engine: { ...config.engine } };
    this.trail  = new EngineTrail(config.engine.maxTrailPoints);

    const body = new Graphics()
      .rect(-HALF_LEN, -0.5, HALF_LEN * 2, 1)
      .fill(0x222233);

    this.rebuildNose();
    this.bodyCtr.addChild(body, this.noseGfx);
    this.blockGfx.addChild(this.trailGfx, this.bodyCtr);
    this.container.addChild(this.blockGfx);
  }

  private rebuildNose(): void {
    this.noseGfx.clear()
      .circle(HALF_LEN, 0, 0.5)
      .fill(this.config.engine.coolColor);
  }

  get positionDeg(): number { return this.deg; }

  updateConfig(patch: Partial<TestBlockConfig>): void {
    if (patch.engine) {
      const needsReset = patch.engine.maxTrailPoints !== this.config.engine.maxTrailPoints;
      Object.assign(this.config.engine, patch.engine);
      if (needsReset) this.resetTrail();
      this.rebuildNose();
    }
    if (patch.speedDeg !== undefined) this.config.speedDeg = patch.speedDeg;
    if (patch.cruiseY  !== undefined) this.config.cruiseY  = patch.cruiseY;
  }

  private resetTrail(): void {
    this.trail = new EngineTrail(this.config.engine.maxTrailPoints);
  }

  update(dt: number): void {
    const sign = Math.sign(this.config.speedDeg);
    if (sign !== this.lastSign) {
      this.trail.reset();
      this.lastSign = sign;
    }
    this.deg = ((this.deg + this.config.speedDeg * dt) % 360 + 360) % 360;
    if (sign !== 0) this.trail.record(this.deg, this.config.cruiseY);
  }

  layout(cameraDeg: number, _zoom: number, _viewWidthPx: number, cameraY: number): void {
    const { cruiseY, speedDeg, engine } = this.config;
    this.container.y      = -cameraY;
    this.blockGfx.x       = normalize180(this.deg - cameraDeg) * BASE_PPD;
    this.blockGfx.y       = cruiseY;
    this.bodyCtr.rotation = speedDeg >= 0 ? 0 : Math.PI;
    this.trailGfx.x       = speedDeg >= 0 ? -HALF_LEN : HALF_LEN;

    const speedPx = Math.abs(speedDeg * BASE_PPD);
    this.trail.draw(
      this.trailGfx,
      { ppd: BASE_PPD, anchorDeg: this.deg, anchorY: cruiseY, speedPx },
      engine,
    );
  }
}
