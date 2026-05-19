import { Container, FillGradient, Graphics, Text } from 'pixi.js';
import { normalize180 } from '../planet/math';

// Front ring constants (must match makeFrontLayer in planet.ts)
const FRONT_SLICE_COUNT = 72;
const FRONT_DEG_PER_SLICE = 5;
const FRONT_BASE_PPD = 24; // 120px / 5deg

const FADE_PX = 100;

function makeVGradient(opaqueColor: string, fadeColor: string): FillGradient {
  return new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    textureSpace: 'local',
    colorStops: [
      { offset: 0, color: opaqueColor },
      { offset: 1, color: fadeColor },
    ],
  });
}

function makeHGradient(): FillGradient {
  return new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
    textureSpace: 'local',
    colorStops: [
      { offset: 0, color: 'rgba(255,255,255,1)' },
      { offset: 1, color: 'rgba(255,255,255,0)' },
    ],
  });
}

export class SliceLineOverlay {
  readonly container = new Container();
  private entries: Array<{ gfx: Graphics; text: Text }> = [];

  constructor() {
    this.container.visible = false;

    for (let i = 0; i < FRONT_SLICE_COUNT; i++) {
      const isFirst = i === 0;
      const [opaqueColor, fadeColor] = isFirst
        ? ['rgba(255,60,60,1)', 'rgba(255,60,60,0)']
        : ['rgba(255,255,255,1)', 'rgba(255,255,255,0)'];
      const gfx = new Graphics()
        .rect(0, 0, 1, FADE_PX)
        .fill(makeVGradient(opaqueColor, fadeColor));

      const deg = i * FRONT_DEG_PER_SLICE;
      const text = new Text({
        text: `${i}|${deg}°`,
        style: {
          fill: isFirst ? 0xff3c3c : 0xffffff,
          fontSize: 9,
          fontFamily: 'monospace',
        },
      });
      text.y = 3;

      this.container.addChild(gfx);
      this.container.addChild(text);
      this.entries.push({ gfx, text });
    }
  }

  update(xDeg: number, zoom: number, viewWidth: number): void {
    const halfW = viewWidth / 2;
    for (let i = 0; i < FRONT_SLICE_COUNT; i++) {
      const homeDeg = i * FRONT_DEG_PER_SLICE;
      const relDeg = normalize180(homeDeg - xDeg);
      const screenX = halfW + relDeg * FRONT_BASE_PPD * zoom;
      const visible = screenX > -2 && screenX < viewWidth + 2;
      const { gfx, text } = this.entries[i];
      gfx.visible = visible;
      text.visible = visible;
      if (visible) {
        gfx.x = screenX;
        text.x = screenX + 2;
      }
    }
  }
}

const Y_GRID_POOL = 25;

export class YGridOverlay {
  readonly container = new Container();
  private entries: Array<{ gfx: Graphics; text: Text }> = [];

  constructor() {
    this.container.visible = false;
    const hGrad = makeHGradient();

    for (let i = 0; i < Y_GRID_POOL; i++) {
      const gfx = new Graphics()
        .rect(0, -0.5, FADE_PX, 1)
        .fill(hGrad);

      const text = new Text({
        text: '0',
        style: {
          fill: 0xffffff,
          fontSize: 9,
          fontFamily: 'monospace',
        },
      });
      text.x = 3;
      text.y = -10;

      gfx.visible = false;
      text.visible = false;

      this.container.addChild(gfx);
      this.container.addChild(text);
      this.entries.push({ gfx, text });
    }
  }

  update(cameraY: number, zoom: number, _viewWidth: number, viewHeight: number): void {
    let worldY = Math.floor(cameraY / 100) * 100;
    let slot = 0;

    while (slot < Y_GRID_POOL) {
      const screenY = (worldY - cameraY) * zoom;
      const visible = screenY >= -1 && screenY <= viewHeight + 1;

      if (screenY > viewHeight + 1) break;

      const { gfx, text } = this.entries[slot];
      gfx.visible = visible;
      text.visible = visible;
      if (visible) {
        gfx.y = screenY;
        text.y = screenY - 10;
        text.text = String(worldY);
      }

      worldY += 100;
      slot++;
    }

    // Hide remaining pool slots
    for (; slot < Y_GRID_POOL; slot++) {
      this.entries[slot].gfx.visible = false;
      this.entries[slot].text.visible = false;
    }
  }
}
