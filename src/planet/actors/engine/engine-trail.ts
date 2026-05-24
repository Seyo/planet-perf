import type { Graphics } from 'pixi.js';
import { lerpColor, normalize180 } from '../../math';
import type { EngineConfig } from './engine-config';

type TrailPoint = { deg: number; y: number };
type BloomSeg   = { ax: number; ay: number; bx: number; by: number; first: boolean };
type CapSpec    = { x: number; y: number; r: number; angle: number };

export type DrawView = { ppd: number; anchorDeg: number; anchorY: number; speedPx: number; fadeFactor?: number };

const BLOOM_INNER_ALPHA = 0.50;
const BLOOM_OUTER_ALPHA = 0.20;

function glowAlpha(t: number): number {
  const hot = Math.max(0, t - 0.5) / 0.5;
  return hot * hot * 0.3;
}

function bloomLayerAlpha(layer: number, totalLayers: number): number {
  const frac = totalLayers > 1 ? layer / (totalLayers - 1) : 0;
  return BLOOM_INNER_ALPHA + (BLOOM_OUTER_ALPHA - BLOOM_INNER_ALPHA) * frac;
}

type SegPts  = { ax: number; ay: number; bx: number; by: number };
type SegFill = { width: number; color: number; alpha: number };

// Renders a line segment as a filled quad (4-vertex polygon) rather than a
// Graphics stroke. Avoids Pixi's toStrokeStyle normalisation on every call,
// which is the dominant cost when drawing many trail segments per frame.
// Produces identical visuals to stroke with cap:'butt' (flat ends).
function fillSegment(gfx: Graphics, pts: SegPts, fill: SegFill): void {
  const dx = pts.bx - pts.ax;
  const dy = pts.by - pts.ay;
  const d  = Math.sqrt(dx * dx + dy * dy);
  if (d < 0.001) return;
  const hw = fill.width * 0.5; // perpendicular half-width
  const nx = (-dy / d) * hw;
  const ny = ( dx / d) * hw;
  gfx.poly([pts.ax + nx, pts.ay + ny, pts.bx + nx, pts.by + ny,
            pts.bx - nx, pts.by - ny, pts.ax - nx, pts.ay - ny])
     .fill({ color: fill.color, alpha: fill.alpha });
}

// Draws one forward-facing semicircle (the nose cap) for one bloom layer.
// The arc sweeps clockwise from (angle - π/2) to (angle + π/2); fill() auto-closes
// the shape with a straight diameter line.
function drawCapSemi(gfx: Graphics, cap: CapSpec, color: number, alpha: number): void {
  const a0 = cap.angle - Math.PI / 2;
  const a1 = cap.angle + Math.PI / 2;
  gfx.moveTo(cap.x + cap.r * Math.cos(a0), cap.y + cap.r * Math.sin(a0))
     .arc(cap.x, cap.y, cap.r, a0, a1, false)
     .fill({ color, alpha });
}

function drawBloom(gfx: Graphics, seg: BloomSeg, glow: number, cfg: EngineConfig): void {
  // Nose direction: from (bx,by) toward (ax,ay) — opposite of trail.
  const noseAngle = seg.first
    ? Math.atan2(seg.ay - seg.by, seg.ax - seg.bx)
    : 0;
  for (let layer = cfg.bloomLayers - 1; layer >= 0; layer--) {
    const alpha = glow * bloomLayerAlpha(layer, cfg.bloomLayers);
    if (alpha <= 0.005) continue;
    const w = cfg.trailWidth + 2 + layer;
    fillSegment(gfx, seg, { width: w, color: cfg.warmColor, alpha });
    if (seg.first)
      drawCapSemi(gfx, { x: seg.ax, y: seg.ay, r: w / 2, angle: noseAngle }, cfg.warmColor, alpha);
  }
}

export class EngineTrail {
  private readonly buf: TrailPoint[];
  private head  = 0;
  private count = 0;
  private clean = true;

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

  ensureClear(gfx: Graphics): void {
    if (!this.clean) { gfx.clear(); this.clean = true; }
  }

  draw(gfx: Graphics, view: DrawView, cfg: EngineConfig): void {
    const { anchorDeg, anchorY, speedPx, fadeFactor = 1 } = view;
    if (this.count < 2) { this.ensureClear(gfx); return; }

    const visLen = Math.min(this.count, Math.floor(speedPx * cfg.trailSpeedFactor));
    if (visLen < 2) { this.ensureClear(gfx); return; }

    gfx.clear();
    this.clean = false;

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
      if (glow > 0.005) drawBloom(gfx, { ax, ay, bx, by, first: i === 0 }, glow, cfg);

      fillSegment(gfx, { ax, ay, bx, by }, { width: cfg.trailWidth, color, alpha: t * fadeFactor });
    }
  }
}
