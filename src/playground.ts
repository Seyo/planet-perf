import { Application, Container, Graphics, Text } from "pixi.js";
import { makeFrontBuildingFactory } from "./planet/render/layer-factories";

// ---- params: edit these to iterate ----
const SLICE_IDX = 0;
const SLICE_W   = 120;
const DENSITY   = 1.0;
const BG_COLOR  = 0xcc3300;
// ----------------------------------------

const app = new Application();
await app.init({
  resizeTo:        window,
  antialias:       false,
  resolution:      window.devicePixelRatio,
  autoDensity:     true,
  backgroundColor: BG_COLOR,
  backgroundAlpha: 1,
});
document.body.appendChild(app.canvas);

// ---- world: panned & zoomed ----
const world = new Container();
app.stage.addChild(world);

// Slice drawn with yBase=0 — ground sits at world y=0, buildings extend into negative y
const factory = makeFrontBuildingFactory({ sliceWidthPxAtZoom1: SLICE_W, density: DENSITY });
world.addChild(factory(SLICE_IDX, SLICE_IDX * 5));

function resetView() {
  world.x = Math.round(app.screen.width  / 2 - SLICE_W / 2);
  world.y = Math.round(app.screen.height * 0.75);
  world.scale.set(1);
}
resetView();

// ---- screen-space debug overlay ----

const LABEL_STYLE = { fill: "#ff8844", fontSize: 8, fontFamily: "monospace" } as const;
const HEIGHTS = [50, 100, 150, 200, 250, 300];

// Oversized so guides always span the full screen regardless of canvas size
const WIDE = 20000;
const TALL = 20000;

// Ground line
const groundLine = new Graphics()
  .rect(-WIDE / 2, 0, WIDE, 1)
  .fill({ color: 0xff6600, alpha: 0.85 });
app.stage.addChild(groundLine);

// Height guides + labels
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

// Slice boundary lines
const [leftBound, rightBound] = [0, SLICE_W].map(() => {
  const line = new Graphics()
    .rect(0, -TALL / 2, 1, TALL)
    .fill({ color: 0xffffff, alpha: 0.25 });
  app.stage.addChild(line);
  return line;
});

// Info text — anchored to bottom-left, repositioned on resize
const infoText = new Text({
  text:  `slice ${SLICE_IDX}  w${SLICE_W}   scroll=zoom  drag=pan  dbl=reset`,
  style: { fill: "#ff884466", fontSize: 8, fontFamily: "monospace" },
});
infoText.x = 4;
app.stage.addChild(infoText);

function repositionInfo() { infoText.y = app.screen.height - 14; }
repositionInfo();
app.renderer.on("resize", repositionInfo);

// Sync all guides to world transform every frame
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
