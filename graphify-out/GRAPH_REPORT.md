# Graph Report - .  (2026-06-06)

## Corpus Check
- Corpus is ~47,821 words - fits in a single context window. You may not need a graph.

## Summary
- 886 nodes · 1875 edges · 61 communities (39 shown, 22 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 36 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Building Rendering Core|Building Rendering Core]]
- [[_COMMUNITY_District Growth & Blend|District Growth & Blend]]
- [[_COMMUNITY_Engine & Bloom Debug|Engine & Bloom Debug]]
- [[_COMMUNITY_App Entry & Actor Orchestration|App Entry & Actor Orchestration]]
- [[_COMMUNITY_Building Registry & Collision|Building Registry & Collision]]
- [[_COMMUNITY_Explosion & Shuttle Debug|Explosion & Shuttle Debug]]
- [[_COMMUNITY_Shuttle Visual Layer|Shuttle Visual Layer]]
- [[_COMMUNITY_Debug Panel & Palette System|Debug Panel & Palette System]]
- [[_COMMUNITY_Project Config & Dependencies|Project Config & Dependencies]]
- [[_COMMUNITY_Shuttle State & Camera|Shuttle State & Camera]]
- [[_COMMUNITY_Planet World Orchestrator|Planet World Orchestrator]]
- [[_COMMUNITY_Building Playground UI|Building Playground UI]]
- [[_COMMUNITY_Explosion Tester Panel|Explosion Tester Panel]]
- [[_COMMUNITY_Shuttle Physics & Tick|Shuttle Physics & Tick]]
- [[_COMMUNITY_User Control Panel|User Control Panel]]
- [[_COMMUNITY_Input & Slice Factories|Input & Slice Factories]]
- [[_COMMUNITY_Theme & Style System|Theme & Style System]]
- [[_COMMUNITY_Feature Plans & Config Concepts|Feature Plans & Config Concepts]]
- [[_COMMUNITY_Slice Rendering Pipeline|Slice Rendering Pipeline]]
- [[_COMMUNITY_District Style Registry|District Style Registry]]
- [[_COMMUNITY_Performance Fixes & District Plans|Performance Fixes & District Plans]]
- [[_COMMUNITY_Shuttle Actor Lifecycle|Shuttle Actor Lifecycle]]
- [[_COMMUNITY_TypeScript Configuration|TypeScript Configuration]]
- [[_COMMUNITY_Actor & District Wiring|Actor & District Wiring]]
- [[_COMMUNITY_Debug Palettes & State|Debug Palettes & State]]
- [[_COMMUNITY_District Taper Geometry|District Taper Geometry]]
- [[_COMMUNITY_Screen Debug Overlays|Screen Debug Overlays]]
- [[_COMMUNITY_Closed-Loop Shuttle Tests|Closed-Loop Shuttle Tests]]
- [[_COMMUNITY_Shuttle Flight Planning|Shuttle Flight Planning]]
- [[_COMMUNITY_Back Layer City Factories|Back Layer City Factories]]
- [[_COMMUNITY_Zoom Input & Math|Zoom Input & Math]]
- [[_COMMUNITY_Pixi Transform Hotspots|Pixi Transform Hotspots]]
- [[_COMMUNITY_Light Theme Application|Light Theme Application]]
- [[_COMMUNITY_Claude Settings|Claude Settings]]
- [[_COMMUNITY_Blend District Concept|Blend District Concept]]
- [[_COMMUNITY_District Design Docs|District Design Docs]]
- [[_COMMUNITY_Layer Rebuild Queue|Layer Rebuild Queue]]
- [[_COMMUNITY_Perf Targets & Guards|Perf Targets & Guards]]
- [[_COMMUNITY_WeakRef Tint Fix|WeakRef Tint Fix]]
- [[_COMMUNITY_Haze Overlay & Palette|Haze Overlay & Palette]]
- [[_COMMUNITY_Playground Regeneration|Playground Regeneration]]
- [[_COMMUNITY_CLAUDE.md Root|CLAUDE.md Root]]
- [[_COMMUNITY_CodeScene Requirement|CodeScene Requirement]]
- [[_COMMUNITY_Front Key Stability|Front Key Stability]]
- [[_COMMUNITY_Building Bounds Debug|Building Bounds Debug]]
- [[_COMMUNITY_CI Deploy Config|CI Deploy Config]]
- [[_COMMUNITY_Districts Reference Doc|Districts Reference Doc]]
- [[_COMMUNITY_HTML Entry Point|HTML Entry Point]]
- [[_COMMUNITY_Knip Dead Code Config|Knip Dead Code Config]]
- [[_COMMUNITY_Package JSON|Package JSON]]
- [[_COMMUNITY_Back Layer Rebuild Fix|Back Layer Rebuild Fix]]
- [[_COMMUNITY_Inertia Friction Constant|Inertia Friction Constant]]
- [[_COMMUNITY_Playground HTML|Playground HTML]]
- [[_COMMUNITY_Playground Sliders|Playground Sliders]]
- [[_COMMUNITY_Slice Content Replacement|Slice Content Replacement]]
- [[_COMMUNITY_Shuttle Layer Re-export|Shuttle Layer Re-export]]
- [[_COMMUNITY_Cruise Picker Factory|Cruise Picker Factory]]

## God Nodes (most connected - your core abstractions)
1. `normalize180()` - 37 edges
2. `DebugPanel` - 36 edges
3. `Planet` - 36 edges
4. `randInt()` - 31 edges
5. `UserPanel` - 30 edges
6. `ShuttleLayer` - 26 edges
7. `chance()` - 25 edges
8. `EngineTesterPanel` - 22 edges
9. `ShuttleTesterPanel` - 21 edges
10. `Shuttle` - 21 edges

## Surprising Connections (you probably didn't know these)
- `districtHolder mutable reference — enables live district routing without shuttle reset` --semantically_similar_to--> `computeFrontKey — stable key to skip front layer rebuild`  [INFERRED] [semantically similar]
  task_plan.md → performance-fix.md
- `UserPanel` --semantically_similar_to--> `playground.ts (building inspector app)`  [INFERRED] [semantically similar]
  src/ui/user-panel.ts → src/playground.ts
- `SliceLineOverlay` --semantically_similar_to--> `BuildingBoundsOverlay`  [INFERRED] [semantically similar]
  src/debug/screen-overlays.ts → src/debug/building-bounds-overlay.ts
- `EngineTesterPanel` --semantically_similar_to--> `ExplosionTesterPanel`  [INFERRED] [semantically similar]
  src/debug/engine-tester.ts → src/debug/explosion-tester.ts
- `DistrictRange` --semantically_similar_to--> `ShuttleLayer`  [INFERRED] [semantically similar]
  src/planet/render/actor-layer.ts → src/planet/render/actors/shuttle/shuttle-layer.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Debug Tester Panel System** — debug_debug_panel_debugpanel, debug_engine_tester_enginetesterpanel, debug_explosion_tester_explosiontesterpanel, debug_shuttle_tester_shuttletesterpanel, debug_layout_panel_layoutpanel [EXTRACTED 0.95]
- **Engine Trail Rendering Pipeline** — engine_engine_trail_enginetrail, engine_engine_trail_fillsegment, engine_engine_trail_drawbloom, engine_engine_trail_drawcapsemi, engine_engine_config_engineconfig [EXTRACTED 0.95]
- **District Growth Simulation Pipeline** — growth_seed_seeddistricts, growth_tick_tick, growth_convert_todistricts [EXTRACTED 0.95]
- **District-to-Slice Rendering Pipeline** — render_district_taper_district, districts_index_getdistrictstyle, districts_types_districtstyle, layer_factories_makefrontbuildingfactory, render_slice_layer_slicelayer [INFERRED 0.90]
- **Seeded RNG Deterministic Content Generation** — render_rng_mulberry32, render_rng_hashseed, buildings_core_drawbuilding, layer_factories_makefrontbuildingfactory, layer_factories_makebackcityfactory [EXTRACTED 0.95]
- **Performance Off-Screen Culling Pattern** — render_actor_layer_offscreen_sim_skip, planet_planet_staticworld_guard, render_actor_layer_actorlayer, render_slice_layer_slicelayer, shuttle_layer_shuttlelayer [INFERRED 0.85]
- **Shuttle Brain Pipeline: state + world + trail → tickShuttle → events** — shuttle_sim_state_shuttlesimstate, shuttle_sim_world_shuttleworld, shuttle_sim_trail_buffer_trailbuffer, shuttle_sim_tick_tickshuttle, shuttle_sim_events_shuttleevent [EXTRACTED 1.00]
- **Open-loop flight plan system: FlightConfig + distanceFlightPlan → FlightPlan → tick open-loop path** — shuttle_sim_physics_flightconfig, shuttle_sim_flight_plan_distanceflightplan, shuttle_sim_flight_plan_flightplan, shuttle_sim_tick_tickopenloop, shuttle_sim_tick_applyphysics [INFERRED 0.95]
- **SliceRing visible-slice cull + cacheAsTexture bake system** — render_slice_ring_slicering, render_slice_ring_layout, render_slice_ring_warmslice, render_slice_ring_prewarm_pattern, render_slice_ring_replaceslicecontent [EXTRACTED 1.00]
- **Buildings refactor dependency chain: Task01 → Task02 → Task03** — refactor_task01, refactor_task02, refactor_task03 [EXTRACTED 1.00]
- **Pixi transform pipeline hotspots: set x, updateLocalTransform, ActorLayer.layout** — perf_plan2_set_x_hotspot, perf_plan2_update_local_transform, perf_plan2_actor_layer_update [EXTRACTED 0.95]
- **District-aware actor ecosystem: shuttle targeting, car behaviour, industrial district** — plan03_shuttle_district_targeting, plan04_improved_car_behaviour, plan05_industrial_district [EXTRACTED 0.95]

## Communities (61 total, 22 thin omitted)

### Community 0 - "Building Rendering Core"
Cohesion: 0.05
Nodes (99): Archetype, BACK_THEME, BodyTint, BridgeOpts, BuildingCanvas, BuildingOpts, BuildingRect, BuildingTheme (+91 more)

### Community 1 - "District Growth & Blend"
Cohesion: 0.06
Nodes (53): District Growth Simulation, appendTaperSliders(), BlendState, blendWidth(), buildBlendDistricts(), Choice, DEFAULT_GROWTH_CONFIG, DistrictSide (+45 more)

### Community 2 - "Engine & Bloom Debug"
Cohesion: 0.07
Nodes (25): Bloom Trail Rendering Pattern, decimalsForStep(), EngineTesterPanel, numToHex(), SECTIONS, SliderKey, SliderSpec, DEFAULT_ENGINE_CONFIG (+17 more)

### Community 3 - "App Entry & Actor Orchestration"
Cohesion: 0.04
Nodes (48): ShuttleLayer (actors/index re-export), activeDistricts, activeFrontLayer, activeSkyLayer, ACTOR_DISTRICTS, actorEntries, ActorEntry, app (+40 more)

### Community 4 - "Building Registry & Collision"
Cohesion: 0.06
Nodes (28): BoundsWithChamfer, BuildingBounds, BuildingRegistry, chamferHit(), hitTest(), inRect(), SliceEntry, BoundsLayerInfo (+20 more)

### Community 5 - "Explosion & Shuttle Debug"
Cohesion: 0.12
Nodes (25): SECTIONS, SliderSpec, SECTIONS, SliderSpec, makeFlyingState(), runUntilLandedOrCap(), ShuttleEvent, shuttle-sim barrel (index.ts) (+17 more)

### Community 6 - "Shuttle Visual Layer"
Cohesion: 0.08
Nodes (3): Explosion, makeCruisePicker(), ShuttleLayer

### Community 7 - "Debug Panel & Palette System"
Cohesion: 0.13
Nodes (6): Debug Panel System, Palette and Theme System, DebugPanel, LightPalette, Palette, Theme

### Community 8 - "Project Config & Dependencies"
Cohesion: 0.07
Nodes (28): entry, project, author, dependencies, pixi.js, description, devDependencies, eslint (+20 more)

### Community 9 - "Shuttle State & Camera"
Cohesion: 0.09
Nodes (25): lerpColor(), Shuttle, Callout, CalloutConfig, CameraView, CruisePicker, Debris, DebrisPieceConfig (+17 more)

### Community 10 - "Planet World Orchestrator"
Cohesion: 0.11
Nodes (3): Planet, Static-World Guard Pattern, SliceLayer

### Community 11 - "Building Playground UI"
Cohesion: 0.08
Nodes (21): app, fullRandomBtn, groundLine, header, heightGuides, HEIGHTS, hexStr(), infoText (+13 more)

### Community 12 - "Explosion Tester Panel"
Cohesion: 0.12
Nodes (4): decimalsForStep(), ExplosionTesterPanel, decimalsForStep(), ShuttleTesterPanel

### Community 13 - "Shuttle Physics & Tick"
Cohesion: 0.19
Nodes (25): normalize180(), DESCENT_PD_GAIN constant, MAX_LEAD_TICKS constant, estimateDescentDeg(), advancePhase(), applyPhysics(), checkCruisingPhase(), checkDescending() (+17 more)

### Community 14 - "User Control Panel"
Cohesion: 0.15
Nodes (4): ui barrel (index.ts), bindCollapse(), makeButton(), UserPanel

### Community 15 - "Input & Slice Factories"
Cohesion: 0.12
Nodes (21): PointerX, makeEmptySliceFactory, makeGroundSectionFactory, makeShallowCaveFactory, makeSkyGradientFactory, BackCityConfig, BackResolved, frontSlicePlans() (+13 more)

### Community 16 - "Theme & Style System"
Cohesion: 0.19
Nodes (11): applyStyles(), injectSliderStyles(), lightBg(), makeDiv(), makeSwatch(), makeThemeChip(), paletteBg(), PanelConfig (+3 more)

### Community 17 - "Feature Plans & Config Concepts"
Cohesion: 0.17
Nodes (16): CodeScene 10.0 requirement — all new/modified files must reach Optimal, ExplosionConfig — typed explosion/debris config for Shuttle actor, FlightConfig — typed physics config object for Shuttle actor, HazeOpts — typed options object for makeHazeOverlay (replaces 5 primitives), makeButtonGroup generic helper — eliminates DebugPanel button code duplication, Shuttle three-phase dispatcher pattern (grounded / flying / dying), SliceContext — bundled {canvas, rng, sliceW, yBase} to reduce arg count, Plan 01: Throttle FPS Display Updates (+8 more)

### Community 18 - "Slice Rendering Pipeline"
Cohesion: 0.15
Nodes (8): Layout, SliceRing.layout, Pre-warm zone / uncull budget pattern, Slice, SliceFactory, SliceLayoutParams, SliceRing, SliceRing.warmSlice (pre-warm budget)

### Community 19 - "District Style Registry"
Cohesion: 0.31
Nodes (10): ALL_STYLES, getDistrictStyle(), STYLES_BY_KEY, INDUSTRIAL_HEAVY_STYLE, METROPOLIS_STYLE, BackStyleOpts, DistrictStyle, FrontStyleOpts (+2 more)

### Community 20 - "Performance Fixes & District Plans"
Cohesion: 0.18
Nodes (12): districtBoundaryKey — change-detection hash for back-layer rebuilds, districtHolder mutable reference — enables live district routing without shuttle reset, Foreground Soil Mask with Chasms (underground rendering approach), SmokeEmitter — particle pool for industrial chimney stacks, computeFrontKey — stable key to skip front layer rebuild, Front Layer Unconditional Rebuild (perf root cause 1), Plan 02: Background Layer Count & Haze/Ground Alpha, Plan 03: Shuttle District-to-District Targeting (+4 more)

### Community 21 - "Shuttle Actor Lifecycle"
Cohesion: 0.26
Nodes (3): makeCallout(), Shuttle, FlightPlanFn

### Community 22 - "TypeScript Configuration"
Cohesion: 0.18
Nodes (10): compilerOptions, lib, module, moduleResolution, noEmit, skipLibCheck, strict, target (+2 more)

### Community 23 - "Actor & District Wiring"
Cohesion: 0.20
Nodes (8): makeShuttleLayer(), applyDistricts(), applyStructuralLayers(), computeActorDistricts(), districtBoundaryKey(), rebuildShuttleEntry(), scheduleRebuilds(), shuttlesActive()

### Community 24 - "Debug Palettes & State"
Cohesion: 0.24
Nodes (7): State, Toggle, LIGHT_PALETTES, PALETTES, SkyStop, THEMES, main.ts entry point

### Community 25 - "District Taper Geometry"
Cohesion: 0.40
Nodes (9): applyShape(), DEFAULT_TAPER, districtMass(), lerp(), normalizedDist(), proportionalTaperParams(), sliceTaperParams(), TaperConfig (+1 more)

### Community 26 - "Screen Debug Overlays"
Cohesion: 0.28
Nodes (4): makeHGradient(), makeVGradient(), SliceLineOverlay, YGridOverlay

### Community 27 - "Closed-Loop Shuttle Tests"
Cohesion: 0.22
Nodes (9): closed-loop.test.ts (closed-loop & open-loop regression tests), SLOWDOWN_DEG constant, SURFACE_Y constant, explodeShuttle(), Open-loop vs Closed-loop control duality, tick(), tick.test.ts (unit tests for tickShuttle / explodeShuttle), tickDying() (+1 more)

### Community 28 - "Shuttle Flight Planning"
Cohesion: 0.39
Nodes (7): altitudeForRange(), cruiseSpeedFor(), distanceFlightPlan(), FlightPlan, lerp(), planFromDistance(), flight-plan.test.ts (unit tests for distanceFlightPlan)

### Community 29 - "Back Layer City Factories"
Cohesion: 0.32
Nodes (8): makeBackEmptySliceFactory, backSlicePlans(), makeBackCityLayer(), makeBackEmptyBuild(), resolveBackConfig(), updateBackCityLayer(), makeBackEmptySliceFactory(), rebuildBackEntry()

### Community 31 - "Pixi Transform Hotspots"
Cohesion: 0.50
Nodes (4): ActorLayer.update hotspot (526 samples, 0.83ms/frame), Pixi Container.x setter hotspot (372 samples, 0.59ms/frame), updateLocalTransform Pixi internal hotspot (423 samples, 0.67ms/frame), vDeg==0 skip layout() guard (highest-leverage fix)

### Community 32 - "Light Theme Application"
Cohesion: 0.67
Nodes (3): applyTint(), setLightColors(), applyLightPalette()

### Community 34 - "Blend District Concept"
Cohesion: 0.67
Nodes (3): Blend Zone — alternating single-slice districts between A and B, edgeTaper helper — flattens taper config so center==edge for blend slices, Plan: Blend District Layout (A | bridge | B)

### Community 35 - "District Design Docs"
Cohesion: 0.67
Nodes (3): District (contiguous arc around planet), Transition Zone (blend between adjacent districts), IDEAS.md (next session ideas backlog)

### Community 36 - "Layer Rebuild Queue"
Cohesion: 0.67
Nodes (3): drainBackRebuilds(), drainRebuildQueue(), rebuildFrontLayer()

## Knowledge Gaps
- **225 isolated node(s):** `allow`, `entry`, `project`, `name`, `version` (+220 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `UserPanel` connect `User Control Panel` to `Theme & Style System`, `Playground Regeneration`, `App Entry & Actor Orchestration`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Why does `Planet` connect `Planet World Orchestrator` to `Building Rendering Core`, `Engine & Bloom Debug`, `App Entry & Actor Orchestration`, `Building Registry & Collision`, `Input & Slice Factories`, `District Style Registry`, `District Taper Geometry`, `Zoom Input & Math`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `normalize180()` connect `Shuttle Physics & Tick` to `District Growth & Blend`, `Engine & Bloom Debug`, `Building Registry & Collision`, `Explosion & Shuttle Debug`, `Shuttle Visual Layer`, `Shuttle State & Camera`, `Planet World Orchestrator`, `Slice Rendering Pipeline`, `Screen Debug Overlays`, `Shuttle Flight Planning`, `Zoom Input & Math`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `DebugPanel` (e.g. with `Debug Panel System` and `EngineTesterPanel`) actually correct?**
  _`DebugPanel` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `Planet` (e.g. with `ActorLayer` and `ShuttleLayer`) actually correct?**
  _`Planet` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `allow`, `entry`, `project` to the rest of the system?**
  _246 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Building Rendering Core` be split into smaller, more focused modules?**
  _Cohesion score 0.050628610261637785 - nodes in this community are weakly interconnected._