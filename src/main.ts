import { Application, type Container, Graphics } from "pixi.js";
import {
  Planet,
  makeBackCityLayer,
  makeTaperedFrontLayer,
  makeGroundLayer,
  makeHazeOverlay,
  makeShallowCaveLayer,
  makeSkyLayer,
  updateBackCityLayer,
  updateTaperedFrontLayer,
  HAZE_TOP_Y,
  districtMass,
  type District,
  type BackCityConfig,
} from "./planet/planet";
import { makeActorLayer, initCarTextures, ActorLayer, type ActorLayerConfig, type DistrictRange } from "./planet/render/actor-layer";
import { makeShuttleLayer, ShuttleLayer } from "./planet/render/actors";
import { distanceFlightPlan, type FlightPlanFn } from "./planet/shuttle-sim";
import { LayoutPanel } from "./debug/layout-panel";
import { DebugPanel } from "./debug/debug-panel";
import { UserPanel } from "./ui";
import { ExplosionTesterPanel } from "./debug/explosion-tester";
import { ShuttleTesterPanel }   from "./debug/shuttle-tester";
import { EngineTesterPanel }    from "./debug/engine-tester";
import { TestBlockLayer }       from "./planet/actors/engine";
import { SliceLineOverlay, YGridOverlay } from "./debug/screen-overlays";
import { BuildingBoundsOverlay, type BoundsLayerInfo } from "./debug/building-bounds-overlay";
import { DistrictLabelLayer } from "./planet/render/district-label-layer";
import { PALETTES, LIGHT_PALETTES, THEMES } from "./debug/palettes";
import type { Palette, LightPalette } from "./debug/palettes";
import { setLightColors, BuildingRegistry } from "./planet/render/buildings";
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

initCarTextures(app.renderer);

const planet = new Planet(app);
const registry = new BuildingRegistry();
const boundsLayerInfos: BoundsLayerInfo[] = [];

// Back-to-front: first added = furthest back
let activeSkyLayer: SliceLayer = makeSkyLayer(PALETTES[DEFAULT_PALETTE_IDX].skyGradient);
const shallowCaveLayer: SliceLayer = makeShallowCaveLayer();
planet.addLayer(activeSkyLayer,    { behindAll: true });
planet.addLayer(shallowCaveLayer,  { behindAll: true });

// Background city layers — far to near, uniform motionScale steps including the front layer at 1.0
const BACK_LAYER_COUNT  = 25;
const BACK_SCALE_START  = 0.70;
const BACK_SCALE_END    = (BACK_LAYER_COUNT - 1 + BACK_SCALE_START) / BACK_LAYER_COUNT;
const ACTOR_LAYER_START = BACK_LAYER_COUNT - 20;

const DEGS_PER_SLICE       = 5;
const SHUTTLE_MIN_SLICES   = 10;

function shuttlesActive(districts: District[]): boolean {
  return districts.length > 1 || districts.some(d => d.sliceCount > SHUTTLE_MIN_SLICES);
}

const layoutPanel = new LayoutPanel();
let activeDistricts: District[] = layoutPanel.getDistricts();
const districtLabelLayer = new DistrictLabelLayer();
districtLabelLayer.setDistricts(activeDistricts);

function getDistricts(): District[] { return activeDistricts; }

function computeActorDistricts(districts: District[]) {
  return districts.map(d => ({
    startDeg: d.startSlice * DEGS_PER_SLICE,
    endDeg:   (d.startSlice + d.sliceCount) * DEGS_PER_SLICE,
    mass:     districtMass(d.taperConfig),
  }));
}

const ACTOR_DISTRICTS = computeActorDistricts(getDistricts());
const INITIAL_BOUNDARY_KEY = districtBoundaryKey(activeDistricts);

type HazeEntry    = { container: Container; alpha: number; bottomAlpha: number };
type BackEntry    = { layer: SliceLayer; config: BackCityConfig; lastBuiltSignature: string };
type ActorEntry   = { layer: ActorLayer; config: ActorLayerConfig };
type ShuttleEntry = { layer: ShuttleLayer; motionScale: number; yMotionScale: number; label: string; planFn: FlightPlanFn };

const hazeEntries: HazeEntry[]     = [];
const bakedLayers: SliceLayer[]    = [];
const backEntries: BackEntry[]     = [];
const actorEntries: ActorEntry[]   = [];
const shuttleEntries: ShuttleEntry[] = [];
const shuttleLayers: ShuttleLayer[] = [];
const shuttleDebugToggle = { visible: false };

// Individual back-city layers, far to near
for (let i = 0; i < BACK_LAYER_COUNT; i++) {
  const t           = i / (BACK_LAYER_COUNT - 1);
  const motionScale = BACK_SCALE_START + t * (BACK_SCALE_END - BACK_SCALE_START);
  const minH        = Math.round(40  + t * 80);
  const maxH        = Math.round(100 + t * 180);
  const salt        = 1000 + i * 97;

  const hasActors   = i >= ACTOR_LAYER_START;
  const layerKey    = hasActors ? `back:${i}` : undefined;
  const bakeResolution = i >= BACK_LAYER_COUNT - 5 ? 2 : 1;
  const layerCfg = {
    motionScale, yMotionScale: motionScale, minH, maxH, salt, bakeResolution,
    registry: hasActors ? registry : undefined,
    layerKey,
  };
  const backLayer = makeBackCityLayer(layerCfg, getDistricts());
  backEntries.push({ layer: backLayer, config: layerCfg, lastBuiltSignature: INITIAL_BOUNDARY_KEY });
  bakedLayers.push(backLayer);
  planet.addLayer(backLayer, { behindAll: true });
  if (hasActors) {
    const actorCfg: ActorLayerConfig = { motionScale, yMotionScale: motionScale, registry, layerKey };
    const actorLayer = makeActorLayer(actorCfg, ACTOR_DISTRICTS);
    actorEntries.push({ layer: actorLayer, config: actorCfg });
    planet.addActorLayer(actorLayer);
    const layerT = (i - ACTOR_LAYER_START) / (BACK_LAYER_COUNT - 1 - ACTOR_LAYER_START);
    boundsLayerInfos.push({
      layerKey: layerKey as string,
      motionScale,
      yMotionScale: motionScale,
      color: lerpColor(0x882222, 0x22bb44, layerT),
    });
  }
  if (hasActors && i < BACK_LAYER_COUNT - 5) {
    const sl = makeShuttleLayer({ motionScale, yMotionScale: motionScale, label: String(i), districts: ACTOR_DISTRICTS }, shuttleDebugToggle);
    shuttleEntries.push({ layer: sl, motionScale, yMotionScale: motionScale, label: String(i), planFn: distanceFlightPlan });
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

const groundLayer = makeGroundLayer();
planet.addLayer(groundLayer, { behindAll: true });
const activeFrontLayer = makeTaperedFrontLayer(getDistricts(), registry);
planet.addLayer(activeFrontLayer, { asInteractionLayer: true });

// Baked layers retint on light-palette change via slice.updateCacheTexture().
// All cacheAsTexture-enabled rings must be in this list — including the
// freshly-baked front, ground and shallow-cave layers.
bakedLayers.push(shallowCaveLayer, groundLayer, activeFrontLayer);
const frontActorCfg: ActorLayerConfig = { motionScale: 1.0, yMotionScale: 1.0, registry, layerKey: 'front' };
const frontActorLayer = makeActorLayer(frontActorCfg, ACTOR_DISTRICTS);
actorEntries.push({ layer: frontActorLayer, config: frontActorCfg });
planet.addActorLayer(frontActorLayer);
boundsLayerInfos.push({ layerKey: 'front', motionScale: 1.0, yMotionScale: 1.0, color: 0x44ccff });

const frontHazeContainer = makeHazeOverlay({ alpha: 0.25, color: PALETTES[DEFAULT_PALETTE_IDX].hazeColor });
hazeEntries.push({ container: frontHazeContainer, alpha: 0.25, bottomAlpha: 0 });
planet.addOverlay(frontHazeContainer, 1.0);

planet.finalize();

if (!shuttlesActive(getDistricts())) {
  for (const e of shuttleEntries) { e.layer.clearShuttles(); e.layer.container.visible = false; }
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bv = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bv;
}

function setLayerRange(back: number, front: number): void {
  for (let i = 0; i < BACK_LAYER_COUNT; i++) {
    const vis = i >= back && i <= front;
    backEntries[i].layer.container.visible = vis;
    hazeEntries[i].container.visible       = vis;
    if (vis && backEntries[i].lastBuiltSignature !== lastBoundaryKey) {
      pendingBackRebuilds.add(i);
    }
  }
  const frontVis = front >= BACK_LAYER_COUNT;
  activeFrontLayer.container.visible                    = frontVis;
  hazeEntries[hazeEntries.length - 1].container.visible = frontVis;
}

function rebuildBackEntry(entry: BackEntry, districts: District[]): void {
  updateBackCityLayer(entry.layer, entry.config, districts);
}

function rebuildShuttleEntry(e: ShuttleEntry, actorDists: readonly DistrictRange[]): void {
  const old = e.layer;
  const next = makeShuttleLayer(
    { motionScale: e.motionScale, yMotionScale: e.yMotionScale, label: e.label, districts: actorDists, planFn: e.planFn },
    shuttleDebugToggle,
  );
  planet.replaceActorLayer(old, next);
  e.layer = next;
  const i = shuttleLayers.indexOf(old);
  if (i !== -1) shuttleLayers[i] = next;
}

function districtBoundaryKey(districts: District[]): string {
  return districts.map(d => {
    const densityTier = (Math.round(d.taperConfig.centerDensity * 4) / 4).toFixed(2);
    return `${d.startSlice}:${d.sliceCount}:${densityTier}`;
  }).join('|');
}

let lastBoundaryKey = districtBoundaryKey(activeDistricts);

const pendingBackRebuilds = new Set<number>();
let pendingFrontRebuild = false;
const REBUILD_BUDGET_MS = 4;

function scheduleRebuilds(): void {
  pendingFrontRebuild = true;
  for (let i = 0; i < backEntries.length; i++) {
    const entry = backEntries[i];
    if (entry.lastBuiltSignature === lastBoundaryKey) continue;
    if (!entry.layer.container.visible) continue;
    pendingBackRebuilds.add(i);
  }
}

function drainBackRebuilds(districts: District[], key: string, start: number): void {
  const indices = [...pendingBackRebuilds].sort((a, b) => b - a);
  for (const i of indices) {
    if (performance.now() - start >= REBUILD_BUDGET_MS) return;
    rebuildBackEntry(backEntries[i], districts);
    backEntries[i].lastBuiltSignature = key;
    pendingBackRebuilds.delete(i);
  }
}

function drainRebuildQueue(): void {
  if (!pendingFrontRebuild && pendingBackRebuilds.size === 0) return;
  const districts = activeDistricts;
  const start     = performance.now();
  // Front first — it's the most visible layer, so prioritise visual freshness.
  if (pendingFrontRebuild) {
    rebuildFrontLayer(districts);
    pendingFrontRebuild = false;
  }
  if (performance.now() - start < REBUILD_BUDGET_MS) {
    drainBackRebuilds(districts, lastBoundaryKey, start);
  }
}

function applyStructuralLayers(districts: District[]): void {
  const actorDists = computeActorDistricts(districts);
  scheduleRebuilds();
  for (const entry of actorEntries) entry.layer.reconcile(actorDists, entry.config);
  const shuttlesEnabled = shuttlesActive(districts);
  for (const e of shuttleEntries) {
    if (!shuttlesEnabled) {
      e.layer.clearShuttles();
      e.layer.container.visible = false;
    } else if (e.layer.hasShuttles) {
      // District layout changed but shuttles exist — update routing without resetting.
      e.layer.updateDistricts(actorDists);
      e.layer.container.visible = true;
    } else {
      // First activation (or after a clear) — build shuttles from scratch.
      rebuildShuttleEntry(e, actorDists);
    }
  }
}

function rebuildFrontLayer(districts: District[]): void {
  updateTaperedFrontLayer(activeFrontLayer, districts, registry);
}

function applyDistricts(districts: District[]): void {
  activeDistricts = districts;
  districtLabelLayer.setDistricts(districts);

  const key = districtBoundaryKey(districts);
  if (key !== lastBoundaryKey) {
    lastBoundaryKey = key;
    applyStructuralLayers(districts);
  }
}

// --- screen-space debug overlays ---

const sliceOverlay = new SliceLineOverlay();
app.stage.addChild(sliceOverlay.container);

const yGridOverlay = new YGridOverlay();
app.stage.addChild(yGridOverlay.container);

const boundsOverlay = new BuildingBoundsOverlay();
app.stage.addChild(boundsOverlay.container);
app.stage.addChild(districtLabelLayer.container);

// --- debug panel ---

const debugPanel = new DebugPanel(PALETTES, LIGHT_PALETTES, THEMES);
debugPanel.setActivePalette(DEFAULT_PALETTE_IDX);

const userPanel = new UserPanel(PALETTES, LIGHT_PALETTES, THEMES, { initialPaletteIdx: DEFAULT_PALETTE_IDX, layerCount: BACK_LAYER_COUNT + 1 });

// Standalone debug line — lives inside the sky layer so it follows its y-parallax.
// Re-parented in applyPalette whenever the sky layer is replaced.
const skyBottomLine = new Graphics().rect(-5000, 4, 10000, 2).fill(0xff0000);
skyBottomLine.visible = false;
activeSkyLayer.container.addChild(skyBottomLine);
const hazeToggle = {
  get visible() { return hazeEntries[0]?.container.visible ?? true; },
  set visible(v: boolean) { for (const e of hazeEntries) e.container.visible = v; },
};

debugPanel.registerToggle('sky-bottom',      'Sky bottom edge',  skyBottomLine);
debugPanel.registerToggle('slice-lines',    'Slice lines',      sliceOverlay.container);
debugPanel.registerToggle('y-grid',         'Y grid',           yGridOverlay.container);
debugPanel.registerToggle('building-bounds','Building bounds',  boundsOverlay.container);
debugPanel.registerToggle('shuttle-info',   'Shuttle info',     shuttleDebugToggle);
debugPanel.registerToggle('haze',           'Haze',             hazeToggle);
debugPanel.registerToggle('district-labels','District labels',  districtLabelLayer.container);

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
const frontShuttle = (): ShuttleLayer | undefined => shuttleLayers[shuttleLayers.length - 1];
explosionTester.onSpawn  = (deg, y, cfg)        => { frontShuttle()?.spawnExplosionAt({ deg, y }, cfg); };
shuttleTester.onSpawn    = (deg, cfg, opts)     => { frontShuttle()?.spawnShuttleAt(deg, cfg, opts); };
shuttleTester.onClear    = ()                   => { for (const sl of shuttleLayers) sl.clearShuttles(); };
shuttleTester.onSetTarget = (id, target)        => { frontShuttle()?.setTesterTarget(id, target); };

const updateCursor = () => {
  app.canvas.style.cursor =
    explosionTester.isVisible || shuttleTester.isVisible ? 'crosshair' : '';
};

// Convert a canvas pointer event into (deg, y) world coords using the
// frontmost shuttle layer's parallax. Returns null when no shuttle layer
// exists (early boot path).
function pointerToWorld(e: { clientX: number; clientY: number }): { deg: number; y: number } | null {
  const shuttle = frontShuttle();
  if (!shuttle) return null;
  const rect = app.canvas.getBoundingClientRect();
  const dpr  = window.devicePixelRatio;
  const cx   = (e.clientX - rect.left) * dpr;
  const cy   = (e.clientY - rect.top)  * dpr;
  const zoom = planet.zoomLevel;
  const deg  = planet.xDeg + (cx - app.renderer.width / 2) / (shuttle.layerPpd * zoom);
  const y    = cy / zoom + planet.cameraY * shuttle.layerYMotionScale;
  return { deg, y };
}

// Plain click is reserved for camera interaction. Tester spawn requires
// Ctrl+click so the user can still pan / interact with the planet while
// either tester is open.
app.canvas.addEventListener('click', (e) => {
  const rect = app.canvas.getBoundingClientRect();
  const dpr  = window.devicePixelRatio;
  const cx   = (e.clientX - rect.left) * dpr;
  const cy   = (e.clientY - rect.top)  * dpr;
  const zoom = planet.zoomLevel;

  if (boundsOverlay.container.visible) {
    boundsOverlay.handleClick(cx, cy, planet.xDeg, zoom, app.renderer.width, planet.cameraY, boundsLayerInfos, registry);
  }

  if (!e.ctrlKey) return;
  if (!explosionTester.isVisible && !shuttleTester.isVisible) return;
  const w = pointerToWorld(e);
  if (!w) return;
  if (explosionTester.isVisible) explosionTester.spawnAt(w.deg, w.y);
  if (shuttleTester.isVisible)   shuttleTester.spawnAt(w.deg, w.y);
});

// Pointermove → tester so it can track the cursor target while
// Follow cursor is on. Listener stays installed; the tester's own
// `followCursorOn` gate cheaply ignores moves when off.
app.canvas.addEventListener('pointermove', (e) => {
  if (!shuttleTester.isVisible) return;
  const w = pointerToWorld(e);
  if (w) shuttleTester.onPointerMove(w.deg, w.y);
});

layoutPanel.onLayoutChange = applyDistricts;
debugPanel.onLayoutToggle  = () => { layoutPanel.toggle(); };
debugPanel.onAnnihilate = () => { for (const sl of shuttleLayers) sl.annihilate(); };
debugPanel.onExplosionTesterToggle = () => { explosionTester.toggle(); updateCursor(); };
debugPanel.onShuttleTesterToggle   = () => { shuttleTester.toggle();   updateCursor(); };
debugPanel.onEngineTesterToggle    = () => {
  engineTester.toggle();
  testBlock.container.visible = engineTester.isVisible;
  if (!engineTester.isVisible) planet.setCameraLock(null);
};
engineTester.onBlockUpdate = (patch) => { testBlock.updateConfig(patch); };
engineTester.onCameraLock  = (locked) => {
  planet.setCameraLock(locked ? () => testBlock.positionDeg : null);
};
debugPanel.onPaletteChange  = (idx) => { applyPalette(PALETTES[idx]); userPanel.setPalette(idx); };
debugPanel.onAutopanChange  = (speed) => { planet.setAutoPan(speed); };
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
userPanel.onAutopanChange    = (speed) => { planet.setAutoPan(speed); };
userPanel.onLayerRangeChange = setLayerRange;

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
  drainRebuildQueue();
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
  boundsOverlay.update(planet.xDeg, planet.zoomLevel, app.renderer.width, planet.cameraY, boundsLayerInfos, registry);
  districtLabelLayer.layout(planet.xDeg, planet.zoomLevel, app.renderer.width, planet.cameraY);
});
