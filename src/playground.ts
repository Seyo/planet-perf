import { Application, Container, Graphics, Text } from "pixi.js";
import {
  drawBuilding,
  makeCanvas,
  commitCanvas,
  FRONT_THEME,
  type Archetype,
} from "./planet/render/buildings";
import { mulberry32, hashSeed, randInt } from "./planet/render/rng";

// ---- static playground config ----
const SLICE_W = 120;

// ---- slider schema ----
type SliderKind = "number" | "color";
type SliderSpec = {
  key:    string;
  label:  string;
  kind:   SliderKind;
  min:    number;
  max:    number;
  step:   number;
  default: number;
};

const SPECS: SliderSpec[] = [
  { key: "seed",              label: "Seed",                kind: "number", min: 0,    max: 9999, step: 1,    default: 0      },
  { key: "buildingCount",     label: "Building count",      kind: "number", min: 1,    max: 8,    step: 1,    default: 4      },
  { key: "bgColor",           label: "Background",          kind: "color",  min: 0,    max: 0xffffff, step: 1, default: 0xcc3300 },
  { key: "baseColor",         label: "Building base",       kind: "color",  min: 0,    max: 0xffffff, step: 1, default: 0x060810 },
  { key: "warmAccent",        label: "Accent (warm)",       kind: "color",  min: 0,    max: 0xffffff, step: 1, default: 0xff4422 },
  { key: "coolAccent",        label: "Accent (cool)",       kind: "color",  min: 0,    max: 0xffffff, step: 1, default: 0xff8844 },
  { key: "bodyColorVariance", label: "Body color variance", kind: "number", min: 0,    max: 0.4,  step: 0.01, default: 0.10   },
  { key: "minHeight",         label: "Height min",          kind: "number", min: 20,   max: 200,  step: 1,    default: 60     },
  { key: "maxHeight",         label: "Height max",          kind: "number", min: 60,   max: 320,  step: 1,    default: 220    },
  { key: "widthMin",          label: "Width min",           kind: "number", min: 6,    max: 40,   step: 1,    default: 14     },
  { key: "widthMax",          label: "Width max",           kind: "number", min: 10,   max: 80,   step: 1,    default: 36     },
  { key: "volumeCountMin",    label: "Volumes min",         kind: "number", min: 1,    max: 6,    step: 1,    default: 2      },
  { key: "volumeCountMax",    label: "Volumes max",         kind: "number", min: 1,    max: 8,    step: 1,    default: 4      },
  { key: "setbackMin",        label: "Setback min",         kind: "number", min: 1,    max: 10,   step: 1,    default: 2      },
  { key: "setbackMax",        label: "Setback max",         kind: "number", min: 1,    max: 15,   step: 1,    default: 5      },
  { key: "w_squatT",          label: "Weight squat-T",      kind: "number", min: 0,    max: 1,    step: 0.01, default: 0.25   },
  { key: "w_stepped",         label: "Weight stepped",      kind: "number", min: 0,    max: 1,    step: 0.01, default: 0.4    },
  { key: "w_staircase",       label: "Weight staircase",    kind: "number", min: 0,    max: 1,    step: 0.01, default: 0.25   },
  { key: "w_twinStack",       label: "Weight twin-stack",   kind: "number", min: 0,    max: 1,    step: 0.01, default: 0.1    },
  { key: "windowDensity",     label: "Window density",      kind: "number", min: 0,    max: 1,    step: 0.01, default: 0.45   },
  { key: "windowWarmChance",  label: "Window warm chance",  kind: "number", min: 0,    max: 1,    step: 0.01, default: 0.6    },
  { key: "neonTrimChance",      label: "Neon trim chance",      kind: "number", min: 0, max: 1, step: 0.01, default: 0.5  },
  { key: "neonTrimDensity",     label: "Neon trim density",     kind: "number", min: 0, max: 1, step: 0.01, default: 0.6  },
  { key: "chamferChance",       label: "Chamfer (45°) chance",  kind: "number", min: 0, max: 1, step: 0.01, default: 0.4  },
  { key: "diagonalAccentChance",label: "Diagonal accent chance",kind: "number", min: 0, max: 1, step: 0.01, default: 0.15 },
  { key: "antennaChance",       label: "Antenna chance",        kind: "number", min: 0, max: 1, step: 0.01, default: 0.55 },
  { key: "shopFrontChance",     label: "Shop front chance",     kind: "number", min: 0, max: 1, step: 0.01, default: 0.35 },
];

type SliderState = { value: number; locked: boolean };
const state: Record<string, SliderState> = {};
for (const s of SPECS) state[s.key] = { value: s.default, locked: false };

const get = (k: string) => state[k].value;

// ---- pixi app ----
const app = new Application();
await app.init({
  resizeTo:        window,
  antialias:       false,
  resolution:      window.devicePixelRatio,
  autoDensity:     true,
  backgroundColor: get("bgColor"),
  backgroundAlpha: 1,
});
document.body.appendChild(app.canvas);

const world = new Container();
app.stage.addChild(world);

let currentBuildings: Container | null = null;

function regenerate(): void {
  if (currentBuildings) {
    world.removeChild(currentBuildings);
    currentBuildings.destroy({ children: true });
  }
  const c = new Container();
  const rng = mulberry32(hashSeed(Math.floor(get("seed")), 101));

  const archetypeWeights: Partial<Record<Archetype, number>> = {
    squatT:    get("w_squatT"),
    stepped:   get("w_stepped"),
    staircase: get("w_staircase"),
    twinStack: get("w_twinStack"),
  };

  const wMin = Math.min(get("widthMin"), get("widthMax"));
  const wMax = Math.max(get("widthMin"), get("widthMax"));
  const hMin = Math.min(get("minHeight"), get("maxHeight"));
  const hMax = Math.max(get("minHeight"), get("maxHeight"));
  const vMin = Math.min(get("volumeCountMin"), get("volumeCountMax"));
  const vMax = Math.max(get("volumeCountMin"), get("volumeCountMax"));
  const sMin = Math.min(get("setbackMin"), get("setbackMax"));
  const sMax = Math.max(get("setbackMin"), get("setbackMax"));

  const theme = {
    ...FRONT_THEME,
    baseColor:    get("baseColor"),
    warmOverride: get("warmAccent"),
    coolOverride: get("coolAccent"),
  };

  // Each building gets its own canvas + sub-container so later buildings
  // fully occlude earlier ones (bodies AND windows/neon), not just bodies.
  const count = Math.floor(get("buildingCount"));
  for (let i = 0; i < count; i++) {
    const w = randInt(rng, Math.floor(wMin), Math.floor(wMax));
    const h = randInt(rng, Math.floor(hMin), Math.floor(hMax));
    const x = randInt(rng, 0, Math.max(0, SLICE_W - w));
    const bCanvas = makeCanvas(0);
    drawBuilding(bCanvas, rng, { x, w, h }, {
      yBase:                0,
      windowMinH:           18,
      windowOpts:           { density: get("windowDensity"), warmChance: get("windowWarmChance") },
      antennaChance:        get("antennaChance"),
      shopFrontChance:      get("shopFrontChance"),
      bodyColorVariance:    get("bodyColorVariance"),
      volumeCountRange:     [vMin, vMax],
      setbackRange:         [sMin, sMax],
      archetypeWeights,
      neonTrimChance:       get("neonTrimChance"),
      neonTrimDensity:      get("neonTrimDensity"),
      chamferChance:        get("chamferChance"),
      diagonalAccentChance: get("diagonalAccentChance"),
    });
    const sub = new Container();
    commitCanvas(sub, bCanvas, theme);
    c.addChild(sub);
  }

  world.addChild(c);
  currentBuildings = c;

  app.renderer.background.color = get("bgColor");
}

function resetView(): void {
  world.x = Math.round(app.screen.width  / 2 - SLICE_W / 2);
  world.y = Math.round(app.screen.height * 0.75);
  world.scale.set(1);
}
resetView();
regenerate();

// ---- screen-space debug overlay ----

const LABEL_STYLE = { fill: "#ff8844", fontSize: 8, fontFamily: "monospace" } as const;
const HEIGHTS = [50, 100, 150, 200, 250, 300];
const WIDE = 20000;
const TALL = 20000;

const groundLine = new Graphics()
  .rect(-WIDE / 2, 0, WIDE, 1)
  .fill({ color: 0xff6600, alpha: 0.85 });
app.stage.addChild(groundLine);

const heightGuides = HEIGHTS.map((h) => {
  const line = new Graphics()
    .rect(-WIDE / 2, 0, WIDE, 1)
    .fill({ color: 0xffffff, alpha: 0.15 });
  const label = new Text({ text: `h${h}`, style: LABEL_STYLE });
  label.x = 4;
  app.stage.addChild(line);
  app.stage.addChild(label);
  return { line, label, worldY: -h };
});

const [leftBound, rightBound] = [0, SLICE_W].map(() => {
  const line = new Graphics()
    .rect(0, -TALL / 2, 1, TALL)
    .fill({ color: 0xffffff, alpha: 0.25 });
  app.stage.addChild(line);
  return line;
});

const infoText = new Text({
  text:  `w${SLICE_W}   scroll=zoom  drag=pan  dbl=reset`,
  style: { fill: "#ff884466", fontSize: 8, fontFamily: "monospace" },
});
infoText.x = 4;
app.stage.addChild(infoText);

function repositionInfo() { infoText.y = app.screen.height - 14; }
repositionInfo();
app.renderer.on("resize", repositionInfo);

app.ticker.add(() => {
  groundLine.y = world.y;
  for (const { line, label, worldY } of heightGuides) {
    const sy = world.y + worldY * world.scale.y;
    const visible = sy > -2 && sy < app.screen.height + 2;
    line.visible  = visible;
    label.visible = visible;
    if (visible) {
      line.y  = sy;
      label.y = sy + 2;
    }
  }
  leftBound.x  = world.x;
  rightBound.x = world.x + SLICE_W * world.scale.x;
});

// ---- pan & zoom ----

const canvas = app.canvas;
canvas.style.cursor = "grab";

let dragging     = false;
let dragStartX   = 0;
let dragStartY   = 0;
let worldAtDragX = 0;
let worldAtDragY = 0;

canvas.addEventListener("pointerdown", (e) => {
  if ((e.target as HTMLElement).closest("#playground-panel")) return;
  dragging     = true;
  dragStartX   = e.clientX;
  dragStartY   = e.clientY;
  worldAtDragX = world.x;
  worldAtDragY = world.y;
  canvas.style.cursor = "grabbing";
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  world.x = worldAtDragX + (e.clientX - dragStartX);
  world.y = worldAtDragY + (e.clientY - dragStartY);
});

canvas.addEventListener("pointerup", () => {
  dragging = false;
  canvas.style.cursor = "grab";
});

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  const rect = canvas.getBoundingClientRect();
  const cx   = e.clientX - rect.left;
  const cy   = e.clientY - rect.top;
  const wx = (cx - world.x) / world.scale.x;
  const wy = (cy - world.y) / world.scale.y;
  world.scale.x *= factor;
  world.scale.y *= factor;
  world.x = cx - wx * world.scale.x;
  world.y = cy - wy * world.scale.y;
}, { passive: false });

canvas.addEventListener("dblclick", resetView);

// ---- control panel (injected DOM) ----

const panel = document.createElement("div");
panel.id = "playground-panel";
Object.assign(panel.style, {
  position:       "fixed",
  top:            "0",
  right:          "0",
  width:          "320px",
  height:         "100vh",
  overflowY:      "auto",
  padding:        "10px",
  background:     "rgba(15, 15, 22, 0.92)",
  color:          "#e6e6f0",
  font:           "12px/1.35 ui-monospace, Menlo, Consolas, monospace",
  zIndex:         "10",
  boxSizing:      "border-box",
  borderLeft:     "1px solid #2a2a3a",
} as CSSStyleDeclaration);
document.body.appendChild(panel);

// header
const header = document.createElement("div");
header.style.cssText = "display:flex; flex-direction:column; gap:6px; margin-bottom:10px;";
const fullRandomBtn = document.createElement("button");
fullRandomBtn.textContent = "🎲  Full Random";
styleButton(fullRandomBtn);
fullRandomBtn.onclick = () => {
  for (const s of SPECS) {
    if (state[s.key].locked) continue;
    state[s.key].value = randomFor(s);
  }
  syncAllControls();
  regenerate();
};
const resetBtn = document.createElement("button");
resetBtn.textContent = "↻  Reset Defaults";
styleButton(resetBtn);
resetBtn.onclick = () => {
  for (const s of SPECS) state[s.key].value = s.default;
  syncAllControls();
  regenerate();
};
header.appendChild(fullRandomBtn);
header.appendChild(resetBtn);
panel.appendChild(header);

const rowEls: Record<string, { range?: HTMLInputElement; num?: HTMLInputElement; color?: HTMLInputElement; lock: HTMLButtonElement; }> = {};

for (const spec of SPECS) {
  const row = document.createElement("div");
  row.style.cssText = "display:grid; grid-template-columns: 1fr; gap:2px; padding:5px 2px; border-bottom:1px solid #20202a;";

  const labelRow = document.createElement("div");
  labelRow.style.cssText = "display:flex; justify-content:space-between; align-items:center;";
  const labelEl = document.createElement("span");
  labelEl.textContent = spec.label;
  labelEl.style.cssText = "opacity:0.85;";
  labelRow.appendChild(labelEl);

  const rightGroup = document.createElement("span");
  rightGroup.style.cssText = "display:flex; gap:4px; align-items:center;";
  const diceBtn = document.createElement("button");
  diceBtn.textContent = "🎲";
  styleIconBtn(diceBtn);
  diceBtn.title = "Randomize this value";
  diceBtn.onclick = () => {
    state[spec.key].value = randomFor(spec);
    syncRow(spec);
    regenerate();
  };
  const lockBtn = document.createElement("button");
  lockBtn.textContent = "🔓";
  styleIconBtn(lockBtn);
  lockBtn.title = "Lock value (skipped by Full Random)";
  lockBtn.onclick = () => {
    state[spec.key].locked = !state[spec.key].locked;
    lockBtn.textContent = state[spec.key].locked ? "🔒" : "🔓";
    row.style.opacity = state[spec.key].locked ? "0.6" : "1";
  };
  rightGroup.appendChild(diceBtn);
  rightGroup.appendChild(lockBtn);
  labelRow.appendChild(rightGroup);
  row.appendChild(labelRow);

  const controlRow = document.createElement("div");
  controlRow.style.cssText = "display:flex; gap:5px; align-items:center;";

  if (spec.kind === "color") {
    const colorEl = document.createElement("input");
    colorEl.type = "color";
    colorEl.style.cssText = "flex:1; height:24px; padding:0; border:1px solid #333; background:#111; cursor:pointer;";
    colorEl.value = hexStr(spec.default);
    colorEl.addEventListener("input", () => {
      state[spec.key].value = parseInt(colorEl.value.slice(1), 16);
      regenerate();
    });
    controlRow.appendChild(colorEl);
    rowEls[spec.key] = { color: colorEl, lock: lockBtn };
  } else {
    const range = document.createElement("input");
    range.type  = "range";
    range.min   = String(spec.min);
    range.max   = String(spec.max);
    range.step  = String(spec.step);
    range.value = String(spec.default);
    range.style.cssText = "flex:1; min-width:0;";
    const num = document.createElement("input");
    num.type  = "number";
    num.min   = String(spec.min);
    num.max   = String(spec.max);
    num.step  = String(spec.step);
    num.value = String(spec.default);
    num.style.cssText = "width:64px; background:#15151c; color:#e6e6f0; border:1px solid #333; padding:2px 4px; font:inherit;";
    range.addEventListener("input", () => {
      state[spec.key].value = clamp(parseFloat(range.value), spec);
      num.value = String(state[spec.key].value);
      regenerate();
    });
    num.addEventListener("change", () => {
      state[spec.key].value = clamp(parseFloat(num.value), spec);
      range.value = String(state[spec.key].value);
      regenerate();
    });
    controlRow.appendChild(range);
    controlRow.appendChild(num);
    rowEls[spec.key] = { range, num, lock: lockBtn };
  }

  row.appendChild(controlRow);
  panel.appendChild(row);
}

function syncRow(spec: SliderSpec): void {
  const els = rowEls[spec.key];
  const v = state[spec.key].value;
  if (spec.kind === "color" && els.color) {
    els.color.value = hexStr(v);
  } else {
    if (els.range) els.range.value = String(v);
    if (els.num)   els.num.value   = String(v);
  }
}
function syncAllControls(): void { for (const s of SPECS) syncRow(s); }

function randomFor(spec: SliderSpec): number {
  if (spec.kind === "color") return Math.floor(Math.random() * 0x1000000);
  const range = spec.max - spec.min;
  if (spec.step >= 1) return spec.min + Math.floor(Math.random() * (range + 1));
  const v = spec.min + Math.random() * range;
  const steps = Math.round((v - spec.min) / spec.step);
  return +(spec.min + steps * spec.step).toFixed(4);
}

function clamp(v: number, spec: SliderSpec): number {
  if (Number.isNaN(v)) return spec.default;
  return Math.max(spec.min, Math.min(spec.max, v));
}

function hexStr(n: number): string {
  return "#" + n.toString(16).padStart(6, "0");
}

function styleButton(b: HTMLButtonElement): void {
  b.style.cssText = "padding:6px 8px; background:#1d1d28; color:#e6e6f0; border:1px solid #333; cursor:pointer; font:inherit; text-align:left;";
  b.onmouseenter = () => (b.style.background = "#2a2a3a");
  b.onmouseleave = () => (b.style.background = "#1d1d28");
}
function styleIconBtn(b: HTMLButtonElement): void {
  b.style.cssText = "padding:1px 4px; background:#1d1d28; color:#e6e6f0; border:1px solid #333; cursor:pointer; font:11px ui-monospace, monospace; line-height:1;";
  b.onmouseenter = () => (b.style.background = "#2a2a3a");
  b.onmouseleave = () => (b.style.background = "#1d1d28");
}
