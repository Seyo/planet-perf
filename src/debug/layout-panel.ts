import type { District, TaperConfig } from '../planet/planet';

type SliderSpec     = { label: string; value: number; min: number; max: number; step: number };
type SingleState    = { startSlice: number; sliceCount: number; taperConfig: TaperConfig };
type LayoutDef      = { id: string; label: string; build(): District[]; renderControls(el: HTMLElement, emit: () => void): void };
type TaperNumericKey = keyof Omit<TaperConfig, 'shape'>;

const TOTAL_SLICES = 72;
const DISTRICT_GAP = 1;
const SHAPES: TaperConfig['shape'][] = ['linear', 'smooth', 'quad'];

const TAPER_SLIDERS: [string, TaperNumericKey, number, number, number][] = [
  ['centerDensity', 'centerDensity', 0, 1,   0.01],
  ['edgeDensity',   'edgeDensity',   0, 1,   0.01],
  ['centerMaxH',    'centerMaxH',    0, 600, 10  ],
  ['edgeMaxH',      'edgeMaxH',      0, 300, 10  ],
];

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

function makeShapeButtons(state: SingleState, emit: () => void): HTMLElement {
  const wrap = document.createElement('div');
  Object.assign(wrap.style, { display: 'flex', gap: '3px', alignItems: 'center', marginTop: '2px' });
  const lbl = document.createElement('span');
  lbl.textContent = 'shape';
  Object.assign(lbl.style, {
    color: 'rgba(255,255,255,0.5)', fontSize: '10px', minWidth: '100px',
  });
  wrap.appendChild(lbl);
  const btns: HTMLButtonElement[] = [];
  for (const shape of SHAPES) {
    const btn = document.createElement('button');
    btn.textContent = shape;
    const active = () => state.taperConfig.shape === shape;
    Object.assign(btn.style, {
      cursor: 'pointer', fontFamily: 'monospace', fontSize: '9px',
      padding: '1px 5px', borderRadius: '2px', transition: 'none',
      color: '#fff', border: '1px solid rgba(255,255,255,0.3)',
    });
    const refresh = () => {
      for (const b of btns) b.style.background = 'rgba(255,255,255,0.05)';
      if (active()) btn.style.background = 'rgba(255,255,255,0.2)';
    };
    btn.addEventListener('click', () => {
      state.taperConfig.shape = shape;
      refresh();
      emit();
    });
    btns.push(btn);
    wrap.appendChild(btn);
  }
  btns[SHAPES.indexOf(state.taperConfig.shape)]?.style.setProperty('background', 'rgba(255,255,255,0.2)');
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

function appendTaperSliders(el: HTMLElement, state: SingleState, emit: () => void): void {
  el.appendChild(makeSectionLabel('TAPER'));
  const tc = state.taperConfig;
  for (const [label, key, min, max, step] of TAPER_SLIDERS) {
    el.appendChild(makeSliderRow(
      { label, value: tc[key], min, max, step },
      v => { (tc as Record<TaperNumericKey, number>)[key] = v; },
      emit,
    ));
  }
  el.appendChild(makeShapeButtons(state, emit));
}

function renderSingleControls(el: HTMLElement, state: SingleState, emit: () => void): void {
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

export class LayoutPanel {
  onLayoutChange?: (districts: District[]) => void;
  private readonly el: HTMLDivElement;
  private readonly controlsEl: HTMLDivElement;
  private readonly tabBtns = new Map<string, HTMLButtonElement>();
  private readonly layouts: LayoutDef[];
  private districts: District[] = [];

  constructor() {
    const singleState: SingleState = {
      startSlice: 0, sliceCount: 72,
      taperConfig: { centerDensity: 0.85, edgeDensity: 0.50, centerMaxH: 400, edgeMaxH: 80, shape: 'linear' },
    };
    this.layouts = [
      {
        id: 'single', label: 'Single district',
        build: () => [{ startSlice: singleState.startSlice, sliceCount: singleState.sliceCount, taperConfig: { ...singleState.taperConfig } }],
        renderControls: (el, emit) => renderSingleControls(el, singleState, emit),
      },
      { id: 'ascending', label: 'Ascending 1-10', build: generateAscendingDistricts, renderControls: () => {} },
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
      btn.addEventListener('click', () => this.activateLayout(layout.id));
      this.tabBtns.set(layout.id, btn);
      row.appendChild(btn);
    }
    return row;
  }

  private activateLayout(id: string): void {
    const layout = this.layouts.find(l => l.id === id)!;
    this.districts = layout.build();
    for (const [lid, btn] of this.tabBtns) {
      btn.style.background = lid === id ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)';
    }
    while (this.controlsEl.firstChild) this.controlsEl.removeChild(this.controlsEl.firstChild);
    const emit = () => { this.districts = layout.build(); this.onLayoutChange?.(this.districts); };
    layout.renderControls(this.controlsEl, emit);
    this.onLayoutChange?.(this.districts);
  }
}
