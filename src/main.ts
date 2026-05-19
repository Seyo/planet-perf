import { Application, type Container, Graphics } from "pixi.js";
import {
  Planet,
  makeBackCityLayer,
  makeFrontLayer,
  makeGroundLayer,
  makeHazeOverlay,
  makeUndergroundHazeOverlay,
  makeShallowCaveLayer,
  makeSkyLayer,
} from "./planet/planet";
import { makeActorLayer } from "./planet/render/actor-layer";
import { DebugPanel } from "./debug/debug-panel";
import { SliceLineOverlay, YGridOverlay } from "./debug/screen-overlays";
import { PALETTES } from "./debug/palettes";
import type { Palette } from "./debug/palettes";
import type { SliceLayer } from "./planet/render/slice-layer";

const DEFAULT_PALETTE_IDX = PALETTES.findIndex(p => p.name === 'Sunrise');

const app = new Application();
await app.init({
  resizeTo: window,
  antialias: true,
  resolution: window.devicePixelRatio,
  autoDensity: true,
  backgroundAlpha: 1,
  backgroundColor: PALETTES[DEFAULT_PALETTE_IDX].backgroundColor,
});

document.body.appendChild(app.canvas);

const planet = new Planet(app);

// Back-to-front: first added = furthest back
let activeSkyLayer: SliceLayer = makeSkyLayer(PALETTES[DEFAULT_PALETTE_IDX].skyGradient);
planet.addLayer(activeSkyLayer,          { behindAll: true });
planet.addLayer(makeShallowCaveLayer(),  { behindAll: true });

// Background city layers — far to near, motionScale stepping by 0.03
const BACK_LAYER_COUNT  = 45;
const BACK_SCALE_START  = 0.70;
const BACK_SCALE_END    = 0.97;
const ACTOR_LAYER_START = BACK_LAYER_COUNT - 20;

type HazeEntry = { container: Container; alpha: number; underground: boolean };
const hazeEntries: HazeEntry[] = [];

for (let i = 0; i < BACK_LAYER_COUNT; i++) {
  const t           = BACK_LAYER_COUNT > 1 ? i / (BACK_LAYER_COUNT - 1) : 0;
  const motionScale = BACK_SCALE_START + t * (BACK_SCALE_END - BACK_SCALE_START);
  const minH        = Math.round(40  + t * 80);
  const maxH        = Math.round(100 + t * 180);
  const salt        = 1000 + i * 97;

  const isUnderground = i >= BACK_LAYER_COUNT - 10;
  const ugT = isUnderground ? (i - (BACK_LAYER_COUNT - 10)) / 9 : 0;
  planet.addLayer(
    makeBackCityLayer({ motionScale, yMotionScale: motionScale, minH, maxH, salt, underground: isUnderground, undergroundDim: isUnderground ? 0.5 * (1 - ugT) : 0 }),
    { behindAll: true },
  );
  if (i >= ACTOR_LAYER_START) {
    planet.addActorLayer(makeActorLayer(motionScale, motionScale));
  }

  const hazeAlpha = 0.30 - t * 0.24;
  const hazeContainer = makeHazeOverlay(hazeAlpha, PALETTES[DEFAULT_PALETTE_IDX].hazeColor);
  hazeEntries.push({ container: hazeContainer, alpha: hazeAlpha, underground: false });
  planet.addOverlay(hazeContainer, motionScale);
}

const ugHazeContainer = makeUndergroundHazeOverlay(0.45, PALETTES[DEFAULT_PALETTE_IDX].caveHazeColor);
hazeEntries.push({ container: ugHazeContainer, alpha: 0.45, underground: true });
planet.addOverlay(ugHazeContainer, 1.0);

planet.addLayer(makeGroundLayer(),   { behindAll: true });
planet.addLayer(makeFrontLayer(planet.animators), { asInteractionLayer: true });
planet.addActorLayer(makeActorLayer(1.0, 1.0));

const frontHazeContainer = makeHazeOverlay(0.25, PALETTES[DEFAULT_PALETTE_IDX].hazeColor);
hazeEntries.push({ container: frontHazeContainer, alpha: 0.25, underground: false });
planet.addOverlay(frontHazeContainer, 1.0);

planet.finalize();

// --- screen-space debug overlays ---

const sliceOverlay = new SliceLineOverlay();
app.stage.addChild(sliceOverlay.container);

const yGridOverlay = new YGridOverlay();
app.stage.addChild(yGridOverlay.container);

// --- debug panel ---

const debugPanel = new DebugPanel(PALETTES);
debugPanel.setActivePalette(DEFAULT_PALETTE_IDX);

// Standalone debug line — lives inside the sky layer so it follows its y-parallax.
// Re-parented in applyPalette whenever the sky layer is replaced.
const skyBottomLine = new Graphics().rect(-5000, 4, 10000, 2).fill(0xff0000);
activeSkyLayer.container.addChild(skyBottomLine);
debugPanel.registerToggle('sky-bottom',  'Sky bottom edge', skyBottomLine);
debugPanel.registerToggle('slice-lines', 'Slice lines',     sliceOverlay.container);
debugPanel.registerToggle('y-grid',      'Y grid',          yGridOverlay.container);

function applyPalette(p: Palette): void {
  app.renderer.background.color = p.backgroundColor;

  const newSky = makeSkyLayer(p.skyGradient);
  activeSkyLayer.container.removeChild(skyBottomLine);
  planet.replaceLayer(activeSkyLayer, newSky);
  activeSkyLayer = newSky;
  activeSkyLayer.container.addChild(skyBottomLine);

  for (const entry of hazeEntries) {
    if (entry.underground) {
      makeUndergroundHazeOverlay(entry.alpha, p.caveHazeColor, entry.container);
    } else {
      makeHazeOverlay(entry.alpha, p.hazeColor, -300, 10, entry.container);
    }
  }
}

debugPanel.onPaletteChange = (idx) => applyPalette(PALETTES[idx]);

app.ticker.add((ticker) => {
  planet.update(ticker.deltaTime);
  debugPanel.update({
    xDeg:      planet.xDeg,
    vDeg:      planet.vDeg,
    cameraY:   planet.cameraY,
    vY:        planet.vY,
    zoom:      planet.zoomLevel,
    fps:       app.ticker.FPS,
    viewportW: app.renderer.width,
    viewportH: app.renderer.height,
  });
  sliceOverlay.update(planet.xDeg, planet.zoomLevel, app.renderer.width);
  yGridOverlay.update(planet.cameraY, planet.zoomLevel, app.renderer.width, app.renderer.height);
});
