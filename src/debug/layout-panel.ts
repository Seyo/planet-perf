import type { District, DistrictKind, TaperConfig } from '../planet/planet';
import { tick, seedDistricts, toDistricts } from '../planet/growth';
import type { GrowthSimState, GrowthConfig } from '../planet/growth';
import { ALL_STYLES } from '../planet/render/districts';

type SliderSpec     = { label: string; value: number; min: number; max: number; step: number };
type SingleState    = { startSlice: number; sliceCount: number; taperConfig: TaperConfig; kind: DistrictKind };
type LayoutDef      = { id: string; label: string; build(): District[]; renderControls(el: HTMLElement, emit: () => void): void; teardown?(): void };
type TaperNumericKey = keyof Omit<TaperConfig, 'shape'>;
type Choice<T extends string> = { value: T; label: string };
type DistrictSide = { sliceCount: number; kind: DistrictKind; taperConfig: TaperConfig };
type BlendState   = { startSlice: number; districtA: DistrictSide; districtB: DistrictSide };

const TOTAL_SLICES = 72;
const DISTRICT_GAP = 1;
const SHAPES: TaperConfig['shape'][] = ['linear', 'smooth', 'quad'];
const SHAPE_CHOICES: Choice<TaperConfig['shape']>[] = SHAPES.map(s => ({ value: s, label: s }));
const KIND_CHOICES: Choice<DistrictKind>[] = ALL_STYLES.map(s => ({ value: s.key, label: s.label }));

const TAPER_SLIDERS: [string, TaperNumericKey, number, number, number][] = [
  ['centerDensity', 'centerDensity', 0, 1,   0.01],
  ['edgeDensity',   'edgeDensity',   0, 1,   0.01],
  ['centerMaxH',    'centerMaxH',    0, 600, 10  ],
  ['edgeMaxH',      'edgeMaxH',      0, 300, 10  ],
];

// Cap the blend at MAX_BLEND_SLICES so two large districts don't get an
// arbitrarily wide transition zone. 5 slices = 25° at the 5°/slice front
// ring, the widest blend that still reads as a transition rather than a
// third district.
const MAX_BLEND_SLICES = 5;

function blendWidth(sizeA: number, sizeB: number): number {
  return Math.min(MAX_BLEND_SLICES, Math.floor(Math.min(sizeA, sizeB) / 4));
}

// Returns a flat taper where center == edge == src's edge values so that
// sliceTaperParams(0, 1, edgeTaper(src)) always yields the exact edge value.
// Invariant: relies on normalizedDist short-circuiting to 0 when sliceCount===1.
function edgeTaper(src: TaperConfig): TaperConfig {
  return {
    centerDensity: src.edgeDensity,
    edgeDensity:   src.edgeDensity,
    centerMaxH:    src.edgeMaxH,
    edgeMaxH:      src.edgeMaxH,
    shape:         'linear',
  };
}

function buildBlendDistricts(s: BlendState): District[] {
  const bw  = blendWidth(s.districtA.sliceCount, s.districtB.sliceCount);
  const out: District[] = [];

  out.push({
    startSlice:  s.startSlice % TOTAL_SLICES,
    sliceCount:  s.districtA.sliceCount,
    taperConfig: { ...s.districtA.taperConfig },
    kind:        s.districtA.kind,
  });

  for (let k = 0; k < bw; k++) {
    const fromA = k % 2 === 0;
    const src   = fromA ? s.districtA : s.districtB;
    out.push({
      startSlice:  (s.startSlice + s.districtA.sliceCount + k) % TOTAL_SLICES,
      sliceCount:  1,
      taperConfig: edgeTaper(src.taperConfig),
      kind:        src.kind,
    });
  }

  out.push({
    startSlice:  (s.startSlice + s.districtA.sliceCount + bw) % TOTAL_SLICES,
    sliceCount:  s.districtB.sliceCount,
    taperConfig: { ...s.districtB.taperConfig },
    kind:        s.districtB.kind,
  });

  return out;
}

function generateAscendingDistricts(): District[] {
  const districts: District[] = [];
  let cursor = 0;
  let size = 1;
  while (cursor + size <= TOTAL_SLICES) {
    districts.push({
      startSlice: cursor,
      sliceCount: size,
      taperConfig: {
        centerDensity: 0.3  + Math.random() * 0.6,
        edgeDensity:   0.05 + Math.random() * 0.55,
        centerMaxH:    Math.round(80  + Math.random() * 520),
        edgeMaxH:      Math.round(30  + Math.random() * 120),
        shape:         SHAPES[Math.floor(Math.random() * SHAPES.length)],
      },
    });
    cursor += size + DISTRICT_GAP;
    size++;
  }
  return districts;
}

function makeSliderRow(
  spec: SliderSpec,
  onInput: (v: number) => void,
  onChangeEnd: () => void,
): HTMLElement {
  const dec = spec.step < 1 ? 2 : 0;
  const row = document.createElement('div');
  Object.assign(row.style, {
    display: 'grid', gridTemplateColumns: '100px 1fr 38px', alignItems: 'center', gap: '4px',
  });
  const lbl = document.createElement('span');
  lbl.textContent = spec.label;
  Object.assign(lbl.style, { color: 'rgba(255,255,255,0.5)', fontSize: '10px' });
  const valEl = document.createElement('span');
  valEl.textContent = spec.value.toFixed(dec);
  Object.assign(valEl.style, { color: '#fff', textAlign: 'right', fontSize: '10px' });
  const slider = document.createElement('input');
  slider.type  = 'range';
  slider.min   = String(spec.min);
  slider.max   = String(spec.max);
  slider.step  = String(spec.step);
  slider.value = String(spec.value);
  Object.assign(slider.style, { width: '100%', margin: '0' });
  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    valEl.textContent = v.toFixed(dec);
    onInput(v);
  });
  slider.addEventListener('change', onChangeEnd);
  row.appendChild(lbl);
  row.appendChild(slider);
  row.appendChild(valEl);
  return row;
}

function makeChoiceButtons<T extends string>(
  rowLabel: string,
  choices: Choice<T>[],
  getValue: () => T,
  setValue: (v: T) => void,
  emit: () => void,
): HTMLElement {
  const wrap = document.createElement('div');
  Object.assign(wrap.style, { display: 'flex', gap: '3px', alignItems: 'center', marginTop: '2px' });
  const lbl = document.createElement('span');
  lbl.textContent = rowLabel;
  Object.assign(lbl.style, {
    color: 'rgba(255,255,255,0.5)', fontSize: '10px', minWidth: '100px',
  });
  wrap.appendChild(lbl);
  const btns: HTMLButtonElement[] = [];
  const refresh = () => {
    const cur = getValue();
    for (let i = 0; i < btns.length; i++) {
      btns[i].style.background = choices[i].value === cur
        ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)';
    }
  };
  for (const choice of choices) {
    const btn = document.createElement('button');
    btn.textContent = choice.label;
    Object.assign(btn.style, {
      cursor: 'pointer', fontFamily: 'monospace', fontSize: '9px',
      padding: '1px 5px', borderRadius: '2px', transition: 'none',
      color: '#fff', border: '1px solid rgba(255,255,255,0.3)',
    });
    btn.addEventListener('click', () => { setValue(choice.value); refresh(); emit(); });
    btns.push(btn);
    wrap.appendChild(btn);
  }
  refresh();
  return wrap;
}

function makeSectionLabel(text: string): HTMLElement {
  const el = document.createElement('div');
  Object.assign(el.style, {
    color: 'rgba(255,255,255,0.35)', fontSize: '9px', letterSpacing: '0.1em',
    marginTop: '8px', marginBottom: '2px',
  });
  el.textContent = text;
  return el;
}

function appendTaperSliders(el: HTMLElement, state: { taperConfig: TaperConfig }, emit: () => void): void {
  el.appendChild(makeSectionLabel('TAPER'));
  const tc = state.taperConfig;
  for (const [label, key, min, max, step] of TAPER_SLIDERS) {
    el.appendChild(makeSliderRow(
      { label, value: tc[key], min, max, step },
      v => { (tc as Record<TaperNumericKey, number>)[key] = v; },
      emit,
    ));
  }
  el.appendChild(makeChoiceButtons(
    'shape', SHAPE_CHOICES,
    () => state.taperConfig.shape,
    v  => { state.taperConfig.shape = v; },
    emit,
  ));
}

function renderSingleControls(el: HTMLElement, state: SingleState, emit: () => void): void {
  el.appendChild(makeSectionLabel('TYPE'));
  el.appendChild(makeChoiceButtons(
    'kind', KIND_CHOICES,
    () => state.kind,
    v  => { state.kind = v; },
    emit,
  ));
  el.appendChild(makeSectionLabel('POSITION'));
  el.appendChild(makeSliderRow(
    { label: 'startSlice', value: state.startSlice, min: 0, max: 71, step: 1 },
    v => { state.startSlice = Math.round(v); }, emit,
  ));
  el.appendChild(makeSliderRow(
    { label: 'sliceCount', value: state.sliceCount, min: 1, max: 72, step: 1 },
    v => { state.sliceCount = Math.round(v); }, emit,
  ));
  appendTaperSliders(el, state, emit);
}

function renderSideControls(el: HTMLElement, side: DistrictSide, emit: () => void): void {
  el.appendChild(makeChoiceButtons(
    'kind', KIND_CHOICES, () => side.kind, v => { side.kind = v; }, emit,
  ));
  el.appendChild(makeSliderRow(
    // Max 33 per side so A + MAX_BLEND_SLICES + B <= 71 and stays within the 72-slice ring.
    { label: 'sliceCount', value: side.sliceCount, min: 1, max: 33, step: 1 },
    v => { side.sliceCount = Math.round(v); }, emit,
  ));
  appendTaperSliders(el, side, emit);
}

function renderBlendControls(el: HTMLElement, state: BlendState, emit: () => void): void {
  el.appendChild(makeSectionLabel('POSITION'));
  el.appendChild(makeSliderRow(
    { label: 'startSlice', value: state.startSlice, min: 0, max: 71, step: 1 },
    v => { state.startSlice = Math.round(v); }, emit,
  ));
  el.appendChild(makeSectionLabel('DISTRICT A'));
  renderSideControls(el, state.districtA, emit);
  el.appendChild(makeSectionLabel('DISTRICT B'));
  renderSideControls(el, state.districtB, emit);
}

const DEFAULT_GROWTH_CONFIG: GrowthConfig = {
  growthRate: 0.05, expansionThreshold: 1.0, maxSlicesPerDistrict: 71, densificationCap: 1.0,
};

function makeResetButton(onClick: () => void): HTMLElement {
  const btn = document.createElement('button');
  btn.textContent = 'Reset';
  Object.assign(btn.style, {
    marginTop: '6px', cursor: 'pointer', fontFamily: 'monospace', fontSize: '9px',
    padding: '2px 8px', borderRadius: '2px', color: '#fff',
    border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.05)',
  });
  btn.addEventListener('click', onClick);
  return btn;
}

function makeGrowthLayout(): LayoutDef {
  const cfg: GrowthConfig = { ...DEFAULT_GROWTH_CONFIG };
  let districtCount = 3;
  let seed = 0;
  let tickMs = 1000;
  let state: GrowthSimState = { districts: seedDistricts(3, 0) };
  let tickerId: ReturnType<typeof setInterval> | null = null;

  function renderControls(el: HTMLElement, emit: () => void): void {
    function reset(): void { state = { districts: seedDistricts(districtCount, seed) }; emit(); }
    function restartTicker(): void {
      if (tickerId !== null) clearInterval(tickerId);
      tickerId = setInterval(() => { state = tick(state, cfg); emit(); }, tickMs);
    }

    el.appendChild(makeSectionLabel('SIMULATION'));
    el.appendChild(makeSliderRow({ label: 'districts', value: districtCount, min: 1, max: 8, step: 1 }, v => { districtCount = Math.round(v); reset(); }, () => {}));
    el.appendChild(makeSliderRow({ label: 'seed', value: seed, min: 0, max: 99, step: 1 }, v => { seed = Math.round(v); reset(); }, () => {}));
    el.appendChild(makeSliderRow({ label: 'tick ms', value: tickMs, min: 100, max: 5000, step: 100 }, v => { tickMs = Math.round(v); restartTicker(); }, () => {}));
    el.appendChild(makeSliderRow({ label: 'growthRate', value: cfg.growthRate, min: 0.001, max: 0.2, step: 0.001 }, v => { cfg.growthRate = v; }, () => {}));
    el.appendChild(makeSliderRow({ label: 'expandAt', value: cfg.expansionThreshold, min: 0.1, max: 5, step: 0.1 }, v => { cfg.expansionThreshold = v; }, () => {}));
    el.appendChild(makeSliderRow({ label: 'maxSlices', value: cfg.maxSlicesPerDistrict, min: 1, max: 71, step: 2 }, v => { cfg.maxSlicesPerDistrict = Math.round(v); }, () => {}));
    el.appendChild(makeSliderRow({ label: 'devCap', value: cfg.densificationCap, min: 0.1, max: 1, step: 0.05 }, v => { cfg.densificationCap = v; }, () => {}));
    el.appendChild(makeResetButton(reset));
    restartTicker();
  }

  function teardown(): void {
    if (tickerId !== null) { clearInterval(tickerId); tickerId = null; }
  }

  return { id: 'growth', label: 'Growth sim', build: () => toDistricts(state, cfg), renderControls, teardown };
}

export class LayoutPanel {
  onLayoutChange?: (districts: District[]) => void;
  private readonly el: HTMLDivElement;
  private readonly controlsEl: HTMLDivElement;
  private readonly tabBtns = new Map<string, HTMLButtonElement>();
  private readonly layouts: LayoutDef[];
  private activeLayout: LayoutDef | null = null;
  private districts: District[] = [];

  constructor() {
    const singleState: SingleState = {
      startSlice: 0, sliceCount: 72,
      taperConfig: { centerDensity: 0.85, edgeDensity: 0.50, centerMaxH: 400, edgeMaxH: 80, shape: 'linear' },
      kind: 'metropolis',
    };
    const blendState: BlendState = {
      startSlice: 0,
      districtA: {
        sliceCount: 12,
        kind: 'metropolis',
        taperConfig: { centerDensity: 0.85, edgeDensity: 0.30, centerMaxH: 400, edgeMaxH: 80, shape: 'smooth' },
      },
      districtB: {
        sliceCount: 12,
        kind: 'industrial-heavy',
        taperConfig: { centerDensity: 0.70, edgeDensity: 0.25, centerMaxH: 200, edgeMaxH: 60, shape: 'smooth' },
      },
    };
    this.layouts = [
      {
        id: 'single', label: 'Single district',
        build: () => [{
          startSlice:  singleState.startSlice,
          sliceCount:  singleState.sliceCount,
          taperConfig: { ...singleState.taperConfig },
          kind:        singleState.kind,
        }],
        renderControls: (el, emit) => { renderSingleControls(el, singleState, emit); },
      },
      { id: 'ascending', label: 'Ascending 1-10', build: generateAscendingDistricts, renderControls: () => {} },
      {
        id: 'blend', label: 'Blend (A | bridge | B)',
        build: () => buildBlendDistricts(blendState),
        renderControls: (el, emit) => { renderBlendControls(el, blendState, emit); },
      },
      makeGrowthLayout(),
    ];
    this.el = this.buildShell();
    this.el.appendChild(this.makeTabRow());
    this.controlsEl = document.createElement('div');
    Object.assign(this.controlsEl.style, { marginTop: '8px' });
    this.el.appendChild(this.controlsEl);
    this.el.style.display = 'none';
    document.body.appendChild(this.el);
    this.activateLayout(this.layouts[0].id);
  }

  get isVisible(): boolean { return this.el.style.display !== 'none'; }
  toggle(): void           { this.el.style.display = this.isVisible ? 'none' : 'block'; }
  getDistricts(): District[] { return this.districts; }

  private buildShell(): HTMLDivElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed', top: '12px', left: '12px',
      width: '310px', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto',
      background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.14)',
      borderRadius: '6px', padding: '8px 12px 12px',
      color: '#e8e8e8', fontFamily: 'monospace', fontSize: '11px',
      lineHeight: '1.6', userSelect: 'none', zIndex: '9998', boxSizing: 'border-box',
    });
    const title = document.createElement('div');
    Object.assign(title.style, {
      color: 'rgba(255,255,255,0.4)', fontSize: '9px',
      letterSpacing: '0.1em', marginBottom: '6px',
    });
    title.textContent = 'LAYOUT';
    el.appendChild(title);
    return el;
  }

  private makeTabRow(): HTMLElement {
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '4px', flexWrap: 'wrap' });
    for (const layout of this.layouts) {
      const btn = document.createElement('button');
      btn.textContent = layout.label;
      Object.assign(btn.style, {
        cursor: 'pointer', fontFamily: 'monospace', fontSize: '9px',
        padding: '2px 6px', borderRadius: '2px', transition: 'none',
        color: '#fff', border: '1px solid rgba(255,255,255,0.3)',
        background: 'rgba(255,255,255,0.05)',
      });
      btn.addEventListener('click', () => { this.activateLayout(layout.id); });
      this.tabBtns.set(layout.id, btn);
      row.appendChild(btn);
    }
    return row;
  }

  private highlightTab(id: string): void {
    for (const [lid, btn] of this.tabBtns) {
      btn.style.background = lid === id ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)';
    }
  }

  private activateLayout(id: string): void {
    this.activeLayout?.teardown?.();
    const layout = this.layouts.find(l => l.id === id);
    if (!layout) return;
    this.activeLayout = layout;
    this.districts = layout.build();
    this.highlightTab(id);
    while (this.controlsEl.firstChild) this.controlsEl.removeChild(this.controlsEl.firstChild);
    const emit = () => { this.districts = layout.build(); this.onLayoutChange?.(this.districts); };
    layout.renderControls(this.controlsEl, emit);
    this.onLayoutChange?.(this.districts);
  }
}
