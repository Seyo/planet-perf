import { Application } from "pixi.js";
import {
  Planet,
  makeBackCityLayer,
  makeDeepCoreLayer,
  makeFrontLayer,
  makeGroundLayer,
  makeHazeOverlay,
  makeUndergroundHazeOverlay,
  makeShallowCaveLayer,
  makeSkyLayer,
} from "./planet/planet";
import { makeActorLayer } from "./planet/render/actor-layer";

const app = new Application();
await app.init({
  resizeTo: window,
  antialias: true,
  resolution: window.devicePixelRatio,
  autoDensity: true,
  backgroundAlpha: 1,
  backgroundColor: 0x3a1255,
});

document.body.appendChild(app.canvas);

const planet = new Planet(app);

// Back-to-front: first added = furthest back
planet.addLayer(makeSkyLayer(),      { behindAll: true });
planet.addLayer(makeDeepCoreLayer(), { behindAll: true });
planet.addLayer(makeShallowCaveLayer(), { behindAll: true });
// Background city layers — far to near, motionScale stepping by 0.03
const BACK_LAYER_COUNT  = 45;
const BACK_SCALE_START  = 0.70;
const BACK_SCALE_END    = 0.97;
const ACTOR_LAYER_START = BACK_LAYER_COUNT - 10; // nearest 10 back layers get actor layers

for (let i = 0; i < BACK_LAYER_COUNT; i++) {
  const t           = BACK_LAYER_COUNT > 1 ? i / (BACK_LAYER_COUNT - 1) : 0;
  const motionScale = BACK_SCALE_START + t * (BACK_SCALE_END - BACK_SCALE_START);
  const minH        = Math.round(40  + t * 80);      // 40 → 120
  const maxH        = Math.round(100 + t * 180);     // 100 → 280
  const salt        = 1000 + i * 97;                 // unique seed stream per layer

  planet.addLayer(
    makeBackCityLayer({ motionScale, yMotionScale: motionScale, minH, maxH, salt, underground: i >= BACK_LAYER_COUNT - 10 }),
    { behindAll: true },
  );
  if (i >= ACTOR_LAYER_START) {
    planet.addActorLayer(makeActorLayer(motionScale, motionScale));
  }
  planet.addOverlay(makeHazeOverlay(0.30 - t * 0.24), motionScale);
  planet.addOverlay(makeUndergroundHazeOverlay(0.30 - t * 0.24), motionScale);
}
planet.addLayer(makeGroundLayer(),   { behindAll: true });
planet.addLayer(makeFrontLayer(planet.animators), { asInteractionLayer: true });
planet.addActorLayer(makeActorLayer(1.0, 1.0)); // front actor layer (no haze above)



planet.finalize();

app.ticker.add((ticker) => planet.update(ticker.deltaTime));
