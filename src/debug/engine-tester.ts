import type { TestBlockConfig } from '../planet/actors/engine';
import { DEFAULT_TEST_BLOCK_CONFIG } from '../planet/actors/engine';
import type { EngineConfig } from '../planet/actors/engine';

type SliderKey = Exclude<keyof EngineConfig, 'warmColor' | 'coolColor'> | 'speedDeg' | 'cruiseY';

type SliderSpec = {
  key:   SliderKey;
  label: string;
  min:   number;
  max:   number;
  step:  number;
};

const SECTIONS: [string, SliderSpec[]][] = [
  ['MOTION', [
    { key: 'speedDeg', label: 'speed (deg/t)',     min: -2,  max: 2,   step: 0.01 },
    { key: 'cruiseY',  label: 'altitude',          min: -800, max: -20, step: 10  },
  ]],
  ['TRAIL', [
    { key: 'maxTrailPoints',   label: 'trail points',  min: 20,  max: 300, step: 10  },
    { key: 'trailSpeedFactor', label: 'trail length',  min: 5,   max: 80,  step: 1   },
    { key: 'trailWidth',       label: 'trail width',   min: 0.5, max: 4,   step: 0.5 },
  ]],
  ['ENGINE', [
    { key: 'engineIntensity', label: 'engine intensity', min: 0,  max: 4,  step: 0.1 },
    { key: 'bloomLayers',     label: 'bloom layers',     min: 1,  max: 12, step: 1   },
  ]],
];

function decimalsForStep(step: number): number {
  if (step >= 1)     return 0;
  if (step >= 0.1)   return 1;
  if (step >= 0.01)  return 2;
  if (step >= 0.001) return 3;
  return 4;
}

function numToHex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

function hexToNum(s: string): number {
  return parseInt(s.slice(1), 16);
}

export class EngineTesterPanel {
  private readonly el:        HTMLDivElement;
  private readonly config:    TestBlockConfig;
  private readonly valueEls  = new Map<SliderKey, HTMLSpanElement>();
  private readonly sliderEls = new Map<SliderKey, HTMLInputElement>();
  private warmPickerEl!: HTMLInputElement;
  private coolPickerEl!: HTMLInputElement;
  private lockActive = false;

  onBlockUpdate?: (patch: Partial<TestBlockConfig>) => void;
  onCameraLock?:  (locked: boolean) => void;

  constructor() {
    this.config = {
      ...DEFAULT_TEST_BLOCK_CONFIG,
      engine: { ...DEFAULT_TEST_BLOCK_CONFIG.engine },
    };
    this.el = this.build();
    this.el.style.display = 'none';
    document.body.appendChild(this.el);
  }

  get isVisible(): boolean { return this.el.style.display !== 'none'; }

  toggle(): void {
    this.el.style.display = this.isVisible ? 'none' : 'block';
    if (!this.isVisible && this.lockActive) this.setLock(false);
  }

  private setLock(locked: boolean): void {
    this.lockActive = locked;
    this.onCameraLock?.(locked);
  }

  private build(): HTMLDivElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed', top: '12px', right: '12px',
      width: '290px', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto',
      background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.14)',
      borderRadius: '6px', padding: '8px 12px 12px',
      color: '#e8e8e8', fontFamily: 'monospace', fontSize: '11px',
      lineHeight: '1.6', userSelect: 'none', zIndex: '9998', boxSizing: 'border-box',
    });

    el.appendChild(this.makeLabel('ENGINE TESTER', true));
    for (const [name, specs] of SECTIONS) {
      el.appendChild(this.makeLabel(name));
      for (const spec of specs) el.appendChild(this.makeSliderRow(spec));
    }
    el.appendChild(this.makeLabel('COLORS'));
    el.appendChild(this.makeColorRow('warm color', 'warm'));
    el.appendChild(this.makeColorRow('cool color', 'cool'));
    el.appendChild(this.makeLabel('CAMERA'));
    el.appendChild(this.makeLockRow());
    el.appendChild(this.makeResetButton());
    return el;
  }

  private makeLabel(text: string, isHeader = false): HTMLElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      color: isHeader ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.35)',
      fontSize: '9px', letterSpacing: '0.1em',
      marginTop: isHeader ? '2px' : '8px', marginBottom: isHeader ? '6px' : '2px',
    });
    el.textContent = text;
    return el;
  }

  private makeSliderRow(spec: SliderSpec): HTMLElement {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'grid', gridTemplateColumns: '110px 1fr 44px',
      alignItems: 'center', gap: '6px', marginBottom: '1px',
    });

    const d    = decimalsForStep(spec.step);
    const init = this.readValue(spec.key).toFixed(d);

    const lbl = document.createElement('span');
    lbl.textContent = spec.label;
    Object.assign(lbl.style, { color: 'rgba(255,255,255,0.5)', fontSize: '10px' });

    const slider = document.createElement('input');
    slider.type  = 'range';
    slider.min   = String(spec.min);
    slider.max   = String(spec.max);
    slider.step  = String(spec.step);
    slider.value = String(this.readValue(spec.key));
    Object.assign(slider.style, { width: '100%', margin: '0' });
    this.sliderEls.set(spec.key, slider);

    const valEl = document.createElement('span');
    valEl.textContent = init;
    Object.assign(valEl.style, { color: '#fff', textAlign: 'right', fontSize: '10px' });
    this.valueEls.set(spec.key, valEl);

    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      this.writeValue(spec.key, v);
      valEl.textContent = v.toFixed(d);
      this.emitBlockUpdate();
    });

    row.appendChild(lbl);
    row.appendChild(slider);
    row.appendChild(valEl);
    return row;
  }

  private makeColorRow(label: string, which: 'warm' | 'cool'): HTMLElement {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px',
    });

    const lbl = document.createElement('span');
    lbl.textContent = label;
    Object.assign(lbl.style, {
      color: 'rgba(255,255,255,0.5)', fontSize: '10px', flex: '1',
    });

    const picker = document.createElement('input');
    picker.type  = 'color';
    picker.value = numToHex(
      which === 'warm' ? this.config.engine.warmColor : this.config.engine.coolColor,
    );
    Object.assign(picker.style, { width: '40px', height: '22px', cursor: 'pointer', padding: '0', border: 'none' });

    picker.addEventListener('input', () => {
      const n = hexToNum(picker.value);
      if (which === 'warm') this.config.engine.warmColor = n;
      else                  this.config.engine.coolColor = n;
      this.emitBlockUpdate();
    });

    if (which === 'warm') this.warmPickerEl = picker;
    else                  this.coolPickerEl = picker;

    row.appendChild(lbl);
    row.appendChild(picker);
    return row;
  }

  private makeLockRow(): HTMLElement {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex', alignItems: 'center', gap: '8px',
      cursor: 'pointer', marginBottom: '2px', padding: '2px 0',
    });

    const dot = document.createElement('span');
    dot.textContent = '●';
    Object.assign(dot.style, { fontSize: '8px', lineHeight: '1', color: 'rgba(255,255,255,0.2)' });

    const lbl = document.createElement('span');
    lbl.textContent = 'lock camera to block';
    Object.assign(lbl.style, { color: 'rgba(255,255,255,0.7)', fontSize: '10px' });

    row.appendChild(dot);
    row.appendChild(lbl);

    row.addEventListener('click', () => {
      this.setLock(!this.lockActive);
      dot.style.color = this.lockActive ? '#fff' : 'rgba(255,255,255,0.2)';
    });

    return row;
  }

  private makeResetButton(): HTMLElement {
    const btn = document.createElement('button');
    btn.textContent = 'reset to defaults';
    Object.assign(btn.style, {
      cursor: 'pointer', fontFamily: 'monospace', fontSize: '10px',
      padding: '2px 8px', borderRadius: '3px', transition: 'none',
      display: 'block', marginTop: '10px',
      color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.2)',
    });
    btn.addEventListener('click', () => this.resetToDefaults());
    return btn;
  }

  private readValue(key: SliderKey): number {
    if (key === 'speedDeg') return this.config.speedDeg;
    if (key === 'cruiseY')  return this.config.cruiseY;
    return this.config.engine[key as keyof EngineConfig] as number;
  }

  private writeValue(key: SliderKey, v: number): void {
    if (key === 'speedDeg') { this.config.speedDeg = v; return; }
    if (key === 'cruiseY')  { this.config.cruiseY  = v; return; }
    (this.config.engine as Record<string, number>)[key] = v;
  }

  private emitBlockUpdate(): void {
    this.onBlockUpdate?.({
      speedDeg: this.config.speedDeg,
      cruiseY:  this.config.cruiseY,
      engine:   { ...this.config.engine },
    });
  }

  private resetToDefaults(): void {
    const def = DEFAULT_TEST_BLOCK_CONFIG;
    this.config.speedDeg = def.speedDeg;
    this.config.cruiseY  = def.cruiseY;
    Object.assign(this.config.engine, def.engine);

    for (const [, specs] of SECTIONS) {
      for (const spec of specs) {
        const v = this.readValue(spec.key);
        const d = decimalsForStep(spec.step);
        this.valueEls.get(spec.key)!.textContent  = v.toFixed(d);
        this.sliderEls.get(spec.key)!.value = String(v);
      }
    }
    this.warmPickerEl.value = numToHex(this.config.engine.warmColor);
    this.coolPickerEl.value = numToHex(this.config.engine.coolColor);
    this.emitBlockUpdate();
  }
}
