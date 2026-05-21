import { Application, type Container, Graphics } from "pixi.js";
import {
  Planet,
  makeBackCityLayer,
  makeGroupedBackCityLayer,
  makeFrontLayer,
  makeGroundLayer,
  makeHazeOverlay,
  makeUndergroundHazeOverlay,
  makeShallowCaveLayer,
  makeSkyLayer,
  HAZE_TOP_Y,
} from "./planet/planet";
import { makeActorLayer } from "./planet/render/actor-layer";
import { makeShuttleLayer, ShuttleLayer } from "./planet/render/actors";
import { DebugPanel } from "./debug/debug-panel";
import { ExplosionTesterPanel } from "./debug/explosion-tester";
import { ShuttleTesterPanel }   from "./debug/shuttle-tester";
import { EngineTesterPanel }    from "./debug/engine-tester";
import { TestBlockLayer }       from "./planet/actors/engine";
import { SliceLineOverlay, YGridOverlay } from "./debug/screen-overlays";
import { PALETTES, LIGHT_PALETTES, THEMES } from "./debug/palettes";
import type { Palette, LightPalette } from "./debug/palettes";
import { setLightColors } from "./planet/render/buildings";
import type { SliceLayer } from "./planet/render/slice-layer";

const DEFAULT_PALETTE_IDX = PALETTES.findIndex(p => p.name === 'Sunrise');

const app = new Application();
await app.init({
  preference: 'webgl',
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
const BACK_LAYER_COUNT  = 35;
const BACK_SCALE_START  = 0.70;
const BACK_SCALE_END    = 0.97;
const ACTOR_LAYER_START = BACK_LAYER_COUNT - 20;

// Far-background grouping: FAR_GROUP_COUNT groups of FAR_GROUP_SIZE original layers each.
// Layers within a group share one motionScale and are composited into one baked layer.
// Constraint: FAR_GROUP_COUNT * FAR_GROUP_SIZE <= BACK_LAYER_COUNT - 10 (underground boundary).
const FAR_GROUP_COUNT     = 3;
const FAR_GROUP_SIZE      = 3;
const FAR_HAZE_BOOST      = 0.08; // extra haze opacity for grouped far layers

type HazeEntry = { container: Container; alpha: number; underground: boolean };
const hazeEntries: HazeEntry[] = [];
const bakedLayers: SliceLayer[] = [];
const shuttleLayers: ShuttleLayer[] = [];
const shuttleDebugToggle = { visible: false };

// Section 1: far-background composite groups
for (let g = 0; g < FAR_GROUP_COUNT; g++) {
  const groupConfigs = [];
  for (let j = 0; j < FAR_GROUP_SIZE; j++) {
    const i = g * FAR_GROUP_SIZE + j;
    const t = i / (BACK_LAYER_COUNT - 1);
    const motionScale = BACK_SCALE_START + t * (BACK_SCALE_END - BACK_SCALE_START);
    groupConfigs.push({ motionScale, yMotionScale: motionScale, minH: Math.round(40 + t * 80), maxH: Math.round(100 + t * 180), salt: 1000 + i * 97 });
  }
  const backLayer = makeGroupedBackCityLayer(groupConfigs);
  bakedLayers.push(backLayer);
  planet.addLayer(backLayer, { behindAll: true });

  const midT = (g * FAR_GROUP_SIZE + Math.floor(FAR_GROUP_SIZE / 2)) / (BACK_LAYER_COUNT - 1);
  const midMotionScale = BACK_SCALE_START + midT * (BACK_SCALE_END - BACK_SCALE_START);
  const hazeAlpha = 0.30 - midT * 0.24 + FAR_HAZE_BOOST;
  const hazeContainer = makeHazeOverlay({ alpha: hazeAlpha, color: PALETTES[DEFAULT_PALETTE_IDX].hazeColor });
  hazeEntries.push({ container: hazeContainer, alpha: hazeAlpha, underground: false });
  planet.addOverlay(hazeContainer, midMotionScale);
}

// Section 2: remaining individual layers
for (let i = FAR_GROUP_COUNT * FAR_GROUP_SIZE; i < BACK_LAYER_COUNT; i++) {
  const t           = BACK_LAYER_COUNT > 1 ? i / (BACK_LAYER_COUNT - 1) : 0;
  const motionScale = BACK_SCALE_START + t * (BACK_SCALE_END - BACK_SCALE_START);
  const minH        = Math.round(40  + t * 80);
  const maxH        = Math.round(100 + t * 180);
  const salt        = 1000 + i * 97;

  const isUnderground = i >= BACK_LAYER_COUNT - 10;
  const ugT = isUnderground ? (i - (BACK_LAYER_COUNT - 10)) / 9 : 0;
  const bakeResolution = i >= BACK_LAYER_COUNT - 5 ? 2 : 1;
  const backLayer = makeBackCityLayer({ motionScale, yMotionScale: motionScale, minH, maxH, salt, underground: isUnderground, undergroundDim: isUnderground ? 0.5 * (1 - ugT) : 0, bakeResolution });
  bakedLayers.push(backLayer);
  planet.addLayer(backLayer, { behindAll: true });
  if (i >= ACTOR_LAYER_START) {
    planet.addActorLayer(makeActorLayer(motionScale, motionScale));
  }
  if (i >= ACTOR_LAYER_START && i < BACK_LAYER_COUNT - 5) {
    const sl = makeShuttleLayer({ motionScale, yMotionScale: motionScale, label: String(i) }, shuttleDebugToggle);
    shuttleLayers.push(sl);
    planet.addActorLayer(sl);
  }

  const hazeAlpha = 0.30 - t * 0.24;
  const hazeContainer = makeHazeOverlay({ alpha: hazeAlpha, color: PALETTES[DEFAULT_PALETTE_IDX].hazeColor });
  hazeEntries.push({ container: hazeContainer, alpha: hazeAlpha, underground: false });
  planet.addOverlay(hazeContainer, motionScale);
}

const ugHazeContainer = makeUndergroundHazeOverlay(0.45, PALETTES[DEFAULT_PALETTE_IDX].caveHazeColor);
hazeEntries.push({ container: ugHazeContainer, alpha: 0.45, underground: true });
planet.addOverlay(ugHazeContainer, 1.0);

planet.addLayer(makeGroundLayer(),   { behindAll: true });
planet.addLayer(makeFrontLayer(planet.animators), { asInteractionLayer: true });
planet.addActorLayer(makeActorLayer(1.0, 1.0));

const frontHazeContainer = makeHazeOverlay({ alpha: 0.25, color: PALETTES[DEFAULT_PALETTE_IDX].hazeColor });
hazeEntries.push({ container: frontHazeContainer, alpha: 0.25, underground: false });
planet.addOverlay(frontHazeContainer, 1.0);

planet.finalize();

// --- screen-space debug overlays ---

const sliceOverlay = new SliceLineOverlay();
app.stage.addChild(sliceOverlay.container);

const yGridOverlay = new YGridOverlay();
app.stage.addChild(yGridOverlay.container);

// --- debug panel ---

const debugPanel = new DebugPanel(PALETTES, LIGHT_PALETTES, THEMES);
debugPanel.setActivePalette(DEFAULT_PALETTE_IDX);

// Standalone debug line — lives inside the sky layer so it follows its y-parallax.
// Re-parented in applyPalette whenever the sky layer is replaced.
const skyBottomLine = new Graphics().rect(-5000, 4, 10000, 2).fill(0xff0000);
skyBottomLine.visible = false;
activeSkyLayer.container.addChild(skyBottomLine);
const hazeToggle = {
  get visible() { return hazeEntries[0]?.container.visible ?? true; },
  set visible(v: boolean) { for (const e of hazeEntries) e.container.visible = v; },
};

debugPanel.registerToggle('sky-bottom',    'Sky bottom edge', skyBottomLine);
debugPanel.registerToggle('slice-lines',  'Slice lines',     sliceOverlay.container);
debugPanel.registerToggle('y-grid',       'Y grid',          yGridOverlay.container);
debugPanel.registerToggle('shuttle-info', 'Shuttle info',    shuttleDebugToggle);
debugPanel.registerToggle('haze',         'Haze',            hazeToggle);

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
      makeHazeOverlay({ alpha: entry.alpha, color: p.hazeColor, topY: HAZE_TOP_Y, bottomY: 10, into: entry.container });
    }
  }
}

const explosionTester = new ExplosionTesterPanel();
const shuttleTester   = new ShuttleTesterPanel();
const engineTester    = new EngineTesterPanel();
const testBlock       = new TestBlockLayer();
testBlock.container.visible = false;
planet.addActorLayer(testBlock);

// Frontmost shuttle layer — its ppd/yMotionScale are the correct parallax basis.
const testerLayer = shuttleLayers[shuttleLayers.length - 1];
explosionTester.onSpawn = (deg, y, cfg) => testerLayer.spawnExplosionAt({ deg, y }, cfg);
shuttleTester.onSpawn   = (deg, cfg) => testerLayer.spawnShuttleAt(deg, cfg);
shuttleTester.onClear   = ()         => { for (const sl of shuttleLayers) sl.clearShuttles(); };

const updateCursor = () => {
  app.canvas.style.cursor =
    explosionTester.isVisible || shuttleTester.isVisible ? 'crosshair' : '';
};

app.canvas.addEventListener('click', (e) => {
  if (!explosionTester.isVisible && !shuttleTester.isVisible) return;
  const rect = app.canvas.getBoundingClientRect();
  const dpr  = window.devicePixelRatio;
  const cx   = (e.clientX - rect.left) * dpr;
  const cy   = (e.clientY - rect.top)  * dpr;
  const zoom = planet.zoomLevel;
  const deg  = planet.xDeg + (cx - app.renderer.width / 2) / (testerLayer.layerPpd * zoom);
  const y    = cy / zoom + planet.cameraY * testerLayer.layerYMotionScale;
  if (explosionTester.isVisible) explosionTester.spawnAt(deg, y);
  if (shuttleTester.isVisible)   shuttleTester.spawnAt(deg, y);
});

debugPanel.onAnnihilate = () => { for (const sl of shuttleLayers) sl.annihilate(); };
debugPanel.onExplosionTesterToggle = () => { explosionTester.toggle(); updateCursor(); };
debugPanel.onShuttleTesterToggle   = () => { shuttleTester.toggle();   updateCursor(); };
debugPanel.onEngineTesterToggle    = () => {
  engineTester.toggle();
  testBlock.container.visible = engineTester.isVisible;
  if (!engineTester.isVisible) planet.setCameraLock(null);
};
engineTester.onBlockUpdate = (patch) => testBlock.updateConfig(patch);
engineTester.onCameraLock  = (locked) => {
  planet.setCameraLock(locked ? () => testBlock.positionDeg : null);
};
debugPanel.onPaletteChange = (idx) => applyPalette(PALETTES[idx]);
debugPanel.onAutopanChange = (speed) => planet.setAutoPan(speed);
function applyLightPalette(lp: LightPalette): void {
  setLightColors(lp.warmColor, lp.coolColor);
  for (const sl of shuttleLayers) sl.setLightColors({ warm: lp.warmColor, cool: lp.coolColor });
  for (const layer of bakedLayers) {
    for (const slice of layer.ring.slices) slice.updateCacheTexture();
  }
}

debugPanel.onLightPaletteChange = (idx) => applyLightPalette(LIGHT_PALETTES[idx]);
debugPanel.onThemeChange = (paletteIdx, lightPaletteIdx) => {
  applyPalette(PALETTES[paletteIdx]);
  applyLightPalette(LIGHT_PALETTES[lightPaletteIdx]);
};

// ?live → kiosk mode: panel hidden, gentle autopan running.
if (new URLSearchParams(window.location.search).has('live')) {
  debugPanel.hide();
  planet.setAutoPan(0.02);
}

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
