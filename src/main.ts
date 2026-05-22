import { Application, type Container, Graphics } from "pixi.js";
import {
  Planet,
  makeBackCityLayer,
  makeTaperedFrontLayer,
  makeGroundLayer,
  makeHazeOverlay,
  makeShallowCaveLayer,
  makeSkyLayer,
  HAZE_TOP_Y,
  DEFAULT_TAPER,
  DEFAULT_DISTRICT2_TAPER,
  type TaperConfig,
  type District,
} from "./planet/planet";
import { makeActorLayer } from "./planet/render/actor-layer";
import { makeShuttleLayer, ShuttleLayer } from "./planet/render/actors";
import { DebugPanel } from "./debug/debug-panel";
import { UserPanel } from "./ui";
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
try {
  await app.init({
    preference: 'webgl',
    resizeTo: window,
    antialias: true,
    resolution: window.devicePixelRatio,
    autoDensity: true,
    backgroundAlpha: 1,
    backgroundColor: PALETTES[DEFAULT_PALETTE_IDX].backgroundColor,
  });
} catch {
  const msg = document.createElement('div');
  Object.assign(msg.style, {
    position: 'fixed', inset: '0', display: 'flex', alignItems: 'center',
    justifyContent: 'center', background: '#0a0a0a', color: '#ccc',
    fontFamily: 'monospace', fontSize: '14px', textAlign: 'center',
    lineHeight: '2', padding: '40px',
  });
  msg.innerHTML = 'WebGL is not available.<br>If you\'re using Brave, try disabling Shields for this page.<br>Otherwise, Chrome or Firefox should work.';
  document.body.appendChild(msg);
  throw new Error('WebGL unavailable');
}

document.body.appendChild(app.canvas);

const planet = new Planet(app);

// Back-to-front: first added = furthest back
let activeSkyLayer: SliceLayer = makeSkyLayer(PALETTES[DEFAULT_PALETTE_IDX].skyGradient);
planet.addLayer(activeSkyLayer,         { behindAll: true });
planet.addLayer(makeShallowCaveLayer(), { behindAll: true });

// Background city layers — far to near, uniform motionScale steps including the front layer at 1.0
const BACK_LAYER_COUNT  = 25;
const BACK_SCALE_START  = 0.70;
const BACK_SCALE_END    = (BACK_LAYER_COUNT - 1 + BACK_SCALE_START) / BACK_LAYER_COUNT;
const ACTOR_LAYER_START = BACK_LAYER_COUNT - 20;

let district1State: TaperConfig = { ...DEFAULT_TAPER };
let district2State: TaperConfig = { ...DEFAULT_DISTRICT2_TAPER };

const DEGS_PER_SLICE = 5;

function getDistricts(): District[] {
  return [
    { startSlice:  0, sliceCount: 9, taperConfig: district1State },
    { startSlice: 36, sliceCount: 9, taperConfig: district2State },
  ];
}

const ACTOR_DISTRICTS = getDistricts().map(d => ({
  startDeg: d.startSlice * DEGS_PER_SLICE,
  endDeg:   (d.startSlice + d.sliceCount) * DEGS_PER_SLICE,
}));

type HazeEntry  = { container: Container; alpha: number; bottomAlpha: number };
type BackEntry  = { layer: SliceLayer; rebuild: (districts: District[]) => SliceLayer };
const hazeEntries: HazeEntry[] = [];
const bakedLayers: SliceLayer[] = [];
const backEntries: BackEntry[]  = [];
const shuttleLayers: ShuttleLayer[] = [];
const shuttleDebugToggle = { visible: false };

// Individual back-city layers, far to near
for (let i = 0; i < BACK_LAYER_COUNT; i++) {
  const t           = BACK_LAYER_COUNT > 1 ? i / (BACK_LAYER_COUNT - 1) : 0;
  const motionScale = BACK_SCALE_START + t * (BACK_SCALE_END - BACK_SCALE_START);
  const minH        = Math.round(40  + t * 80);
  const maxH        = Math.round(100 + t * 180);
  const salt        = 1000 + i * 97;

  const bakeResolution = i >= BACK_LAYER_COUNT - 5 ? 2 : 1;
  const layerCfg = { motionScale, yMotionScale: motionScale, minH, maxH, salt, bakeResolution };
  const rebuild = (districts: District[]) => makeBackCityLayer(layerCfg, districts);
  const backLayer = rebuild(getDistricts());
  backEntries.push({ layer: backLayer, rebuild });
  bakedLayers.push(backLayer);
  planet.addLayer(backLayer, { behindAll: true });
  if (i >= ACTOR_LAYER_START) {
    planet.addActorLayer(makeActorLayer(motionScale, motionScale, ACTOR_DISTRICTS));
  }
  if (i >= ACTOR_LAYER_START && i < BACK_LAYER_COUNT - 5) {
    const sl = makeShuttleLayer({ motionScale, yMotionScale: motionScale, label: String(i), districts: ACTOR_DISTRICTS }, shuttleDebugToggle);
    shuttleLayers.push(sl);
    planet.addActorLayer(sl);
  }

  const hazeAlpha    = 0.30 - t * 0.24;
  const backT        = i < 10 ? 1 - i / 9 : 0;
  const bottomAlpha  = Math.round(backT * 0.95 * 100) / 100;
  const hazeContainer = makeHazeOverlay({ alpha: hazeAlpha, bottomAlpha, color: PALETTES[DEFAULT_PALETTE_IDX].hazeColor });
  hazeEntries.push({ container: hazeContainer, alpha: hazeAlpha, bottomAlpha });
  planet.addOverlay(hazeContainer, motionScale);
}

planet.addLayer(makeGroundLayer(), { behindAll: true });
let activeFrontLayer = makeTaperedFrontLayer(getDistricts(), planet.animators);
planet.addLayer(activeFrontLayer, { asInteractionLayer: true });
planet.addActorLayer(makeActorLayer(1.0, 1.0, ACTOR_DISTRICTS));

const frontHazeContainer = makeHazeOverlay({ alpha: 0.25, color: PALETTES[DEFAULT_PALETTE_IDX].hazeColor });
hazeEntries.push({ container: frontHazeContainer, alpha: 0.25, bottomAlpha: 0 });
planet.addOverlay(frontHazeContainer, 1.0);

planet.finalize();

function rebuildFrontLayer() {
  planet.animators.length = 0;
  const next = makeTaperedFrontLayer(getDistricts(), planet.animators);
  planet.replaceLayer(activeFrontLayer, next);
  activeFrontLayer = next;
}

function rebuildBackLayers() {
  const districts = getDistricts();
  for (const entry of backEntries) {
    const old = entry.layer;
    const next = entry.rebuild(districts);
    planet.replaceLayer(old, next);
    entry.layer = next;
    const idx = bakedLayers.indexOf(old);
    if (idx !== -1) bakedLayers[idx] = next;
  }
}

// --- screen-space debug overlays ---

const sliceOverlay = new SliceLineOverlay();
app.stage.addChild(sliceOverlay.container);

const yGridOverlay = new YGridOverlay();
app.stage.addChild(yGridOverlay.container);

// --- debug panel ---

const debugPanel = new DebugPanel(PALETTES, LIGHT_PALETTES, THEMES);
debugPanel.setActivePalette(DEFAULT_PALETTE_IDX);

const userPanel = new UserPanel(PALETTES, LIGHT_PALETTES, THEMES, { initialPaletteIdx: DEFAULT_PALETTE_IDX });

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
    makeHazeOverlay({ alpha: entry.alpha, bottomAlpha: entry.bottomAlpha, color: p.hazeColor, topY: HAZE_TOP_Y, bottomY: 10, into: entry.container });
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
debugPanel.onPaletteChange  = (idx) => { applyPalette(PALETTES[idx]); userPanel.setPalette(idx); };
debugPanel.onAutopanChange  = (speed) => planet.setAutoPan(speed);
debugPanel.onDistrict1TaperChange  = (c) => { district1State = c; rebuildFrontLayer(); };
debugPanel.onDistrict1TaperRelease = (c) => { district1State = c; rebuildBackLayers(); };
debugPanel.onDistrict2TaperChange  = (c) => { district2State = c; rebuildFrontLayer(); };
debugPanel.onDistrict2TaperRelease = (c) => { district2State = c; rebuildBackLayers(); };
function applyLightPalette(lp: LightPalette): void {
  setLightColors(lp.warmColor, lp.coolColor);
  for (const sl of shuttleLayers) sl.setLightColors({ warm: lp.warmColor, cool: lp.coolColor });
  for (const layer of bakedLayers) {
    for (const slice of layer.ring.slices) slice.updateCacheTexture();
  }
}

debugPanel.onLightPaletteChange = (idx) => { applyLightPalette(LIGHT_PALETTES[idx]); userPanel.setLights(idx); };
debugPanel.onThemeChange = (paletteIdx, lightPaletteIdx) => {
  applyPalette(PALETTES[paletteIdx]);
  applyLightPalette(LIGHT_PALETTES[lightPaletteIdx]);
  userPanel.setPalette(paletteIdx);
  userPanel.setLights(lightPaletteIdx);
};

userPanel.onPaletteChange  = (idx) => { applyPalette(PALETTES[idx]); debugPanel.setActivePalette(idx); };
userPanel.onLightsChange   = (idx) => { applyLightPalette(LIGHT_PALETTES[idx]); debugPanel.setActiveLightPalette(idx); };
userPanel.onAnnihilate     = () => { for (const sl of shuttleLayers) sl.annihilate(); };
userPanel.onAutopanChange  = (speed) => planet.setAutoPan(speed);

const params = new URLSearchParams(window.location.search);

let initPaletteIdx = DEFAULT_PALETTE_IDX;
let initLightPaletteIdx = 0;

const themeParam = params.get('theme');
if (themeParam !== null) {
  const theme = THEMES.find(t => t.name.toLowerCase() === themeParam.toLowerCase());
  if (theme) {
    initPaletteIdx = theme.paletteIdx;
    initLightPaletteIdx = theme.lightPaletteIdx;
  }
}

const paletteParam = params.get('palette');
if (paletteParam !== null) {
  const idx = PALETTES.findIndex(p => p.name.toLowerCase() === paletteParam.toLowerCase());
  if (idx !== -1) initPaletteIdx = idx;
}

const lightsParam = params.get('lights');
if (lightsParam !== null) {
  const idx = LIGHT_PALETTES.findIndex(lp => lp.name.toLowerCase() === lightsParam.toLowerCase());
  if (idx !== -1) initLightPaletteIdx = idx;
}

if (initPaletteIdx !== DEFAULT_PALETTE_IDX) {
  applyPalette(PALETTES[initPaletteIdx]);
  debugPanel.setActivePalette(initPaletteIdx);
  userPanel.setPalette(initPaletteIdx);
}
if (initLightPaletteIdx !== 0) {
  applyLightPalette(LIGHT_PALETTES[initLightPaletteIdx]);
  debugPanel.setActiveLightPalette(initLightPaletteIdx);
  userPanel.setLights(initLightPaletteIdx);
}

const autopanParam = params.get('autopan');
if (autopanParam !== null) {
  const speed = parseFloat(autopanParam);
  if (!isNaN(speed)) { planet.setAutoPan(speed); userPanel.setAutopan(speed); }
}

if (!params.has('debug')) debugPanel.hide();

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
