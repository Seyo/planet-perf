import { Container, Graphics } from 'pixi.js';
import { normalize180 } from '../planet/math';
import type { BuildingBounds, BuildingRegistry } from '../planet/render/buildings';

type TooltipHit = {
  screenX:    number;
  screenY:    number;
  sliceIndex: number;
  layerKey:   string;
  bounds:     BuildingBounds;
};

export type BoundsLayerInfo = {
  layerKey: string;
  motionScale: number;
  yMotionScale: number;
  color: number;
};

const DEG_PER_SLICE  = 5;
const BASE_PPD       = 24;
const SLICE_COUNT    = 72;
const CULL_PAD_DEG   = 20; // degrees of extra slices to check on each side

export class BuildingBoundsOverlay {
  readonly container = new Container();
  private readonly gfx = new Graphics();
  private tooltip: HTMLDivElement | null = null;

  constructor() {
    this.container.visible = false;
    this.container.addChild(this.gfx);
  }

  update(
    cameraDeg: number,
    zoom: number,
    viewW: number,
    cameraY: number,
    layers: readonly BoundsLayerInfo[],
    registry: BuildingRegistry,
  ): void {
    if (!this.container.visible) return;
    this.gfx.clear();
    const halfW          = viewW / 2;
    const degsVisible    = (viewW / zoom) / BASE_PPD + CULL_PAD_DEG;
    const startSlice     = Math.floor(normDeg(cameraDeg - degsVisible / 2) / DEG_PER_SLICE);

    for (const layer of layers) {
      const ppd = BASE_PPD * layer.motionScale;
      for (let di = 0; di <= Math.ceil(degsVisible / DEG_PER_SLICE) + 1; di++) {
        const si     = ((startSlice + di) % SLICE_COUNT + SLICE_COUNT) % SLICE_COUNT;
        const bounds = registry.getBuildings(si, layer.layerKey);
        if (bounds.length === 0) continue;
        const sliceHomeDeg  = si * DEG_PER_SLICE;
        const sliceScreenX  = halfW + normalize180(sliceHomeDeg - cameraDeg) * ppd * zoom;

        for (const b of bounds) {
          const rx = sliceScreenX + b.xLeft * zoom;
          const rw = (b.xRight - b.xLeft) * zoom;
          const ry = (b.yTop  - cameraY * layer.yMotionScale) * zoom;
          const rh = (b.yBottom - b.yTop) * zoom;
          this.gfx.rect(rx, ry, rw, rh).stroke({ color: layer.color, alpha: 0.6, width: 1 });
        }
      }
    }
  }

  handleClick(
    screenX: number,
    screenY: number,
    cameraDeg: number,
    zoom: number,
    viewW: number,
    cameraY: number,
    layers: readonly BoundsLayerInfo[],
    registry: BuildingRegistry,
  ): void {
    if (!this.container.visible) return;
    const halfW = viewW / 2;

    for (const layer of layers) {
      const ppd = BASE_PPD * layer.motionScale;
      const clickDeg = cameraDeg + (screenX - halfW) / (ppd * zoom);
      const nd       = normDeg(clickDeg);
      const si       = Math.floor(nd / DEG_PER_SLICE);
      const xLocal   = (nd - si * DEG_PER_SLICE) * ppd;
      const worldY   = screenY / zoom + cameraY * layer.yMotionScale;
      const hit      = registry.collide(si, layer.layerKey, xLocal, worldY);

      if (hit) {
        this.showTooltip({ screenX, screenY, sliceIndex: si, layerKey: layer.layerKey, bounds: hit });
        return;
      }
    }

    this.hideTooltip();
  }

  private showTooltip(hit: TooltipHit): void {
    if (!this.tooltip) {
      this.tooltip = document.createElement('div');
      Object.assign(this.tooltip.style, {
        position: 'fixed',
        background: '#111',
        color: '#eee',
        font: '11px monospace',
        padding: '4px 6px',
        borderRadius: '3px',
        pointerEvents: 'none',
        zIndex: '9999',
        whiteSpace: 'pre',
        lineHeight: '1.4',
      });
      document.body.appendChild(this.tooltip);
    }
    const { screenX, screenY, sliceIndex, layerKey, bounds: b } = hit;
    this.tooltip.textContent =
      `slice: ${sliceIndex}  layer: ${layerKey}\n` +
      `xLeft:${b.xLeft.toFixed(1)}  xRight:${b.xRight.toFixed(1)}\n` +
      `yTop:${b.yTop.toFixed(1)}  yBottom:${b.yBottom.toFixed(1)}`;
    this.tooltip.style.left = `${screenX + 12}px`;
    this.tooltip.style.top  = `${screenY + 12}px`;
    this.tooltip.style.display = 'block';
  }

  hideTooltip(): void {
    if (this.tooltip) this.tooltip.style.display = 'none';
  }

  destroy(): void {
    this.tooltip?.remove();
    this.tooltip = null;
  }
}

function normDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}
