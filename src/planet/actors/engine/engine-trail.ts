import type { Graphics } from 'pixi.js';
import { lerpColor, normalize180 } from '../../math';
import type { EngineConfig } from './engine-config';

type TrailPoint = { deg: number; y: number };

export type DrawView = { ppd: number; anchorDeg: number; anchorY: number; speedPx: number; fadeFactor?: number };

function glowAlpha(t: number): number {
  const hot = Math.max(0, t - 0.5) / 0.5;
  return hot * hot * 0.3;
}

export class EngineTrail {
  private readonly buf: TrailPoint[];
  private head  = 0;
  private count = 0;

  constructor(maxPoints: number) {
    this.buf = Array.from({ length: maxPoints }, () => ({ deg: 0, y: 0 }));
  }

  get pointCount(): number { return this.count; }

  record(deg: number, y: number): void {
    const len  = this.buf.length;
    this.head  = (this.head - 1 + len) % len;
    this.buf[this.head].deg = deg;
    this.buf[this.head].y   = y;
    if (this.count < len) this.count++;
  }

  reset(): void { this.head = 0; this.count = 0; }

  draw(gfx: Graphics, view: DrawView, cfg: EngineConfig): void {
    const { anchorDeg, anchorY, speedPx, fadeFactor = 1 } = view;
    gfx.clear();
    if (this.count < 2) return;

    const visLen = Math.min(this.count, Math.floor(speedPx * cfg.trailSpeedFactor));
    if (visLen < 2) return;

    const len = this.buf.length;
    for (let i = 0; i < visLen - 1; i++) {
      const ptA  = this.buf[(this.head + i)     % len];
      const ptB  = this.buf[(this.head + i + 1) % len];
      const t    = 1 - i / (visLen - 1);
      const color = lerpColor(cfg.coolColor, cfg.warmColor, t);
      const ax   = normalize180(ptA.deg - anchorDeg) * view.ppd;
      const ay   = ptA.y - anchorY;
      const bx   = normalize180(ptB.deg - anchorDeg) * view.ppd;
      const by   = ptB.y - anchorY;

      const glow = glowAlpha(t) * cfg.engineIntensity * fadeFactor;
      if (glow > 0.005) {
        gfx.moveTo(ax, ay).lineTo(bx, by)
          .stroke({ color: cfg.warmColor, alpha: glow * 0.20, width: 12, cap: 'butt' });
        gfx.moveTo(ax, ay).lineTo(bx, by)
          .stroke({ color: cfg.warmColor, alpha: glow * 0.45, width: 5,  cap: 'butt' });
      }
      gfx.moveTo(ax, ay).lineTo(bx, by)
        .stroke({ color, alpha: t * fadeFactor, width: cfg.trailWidth });
    }
  }
}
