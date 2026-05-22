import type { FlightConfig } from '../planet/render/actors/shuttle/physics';
import { DEFAULT_FLIGHT_CONFIG } from '../planet/render/actors/shuttle/physics';

type SliderSpec = {
  key:   keyof FlightConfig;
  label: string;
  min:   number;
  max:   number;
  step:  number;
};

const SECTIONS: [string, SliderSpec[]][] = [
  ['FLIGHT', [
    { key: 'maxHorizSpeed',    label: 'max speed',       min: 0.02, max: 1.5,  step: 0.01  },
    { key: 'trailSpeedFactor', label: 'trail length',    min: 5,    max: 80,   step: 1     },
  ]],
  ['ALTITUDE', [
    { key: 'cruiseYMin', label: 'cruise y min', min: -800, max: -20, step: 10 },
    { key: 'cruiseYMax', label: 'cruise y max', min: -600, max: -10, step: 10 },
  ]],
  ['RANGE', [
    { key: 'cruiseDegMin', label: 'travel deg min', min: 5,  max: 300, step: 5 },
    { key: 'cruiseDegMax', label: 'travel deg max', min: 10, max: 400, step: 5 },
  ]],
  ['PHYSICS', [
    { key: 'maxClimbRate',   label: 'climb rate',   min: 0.1,    max: 5.0,  step: 0.05   },
    { key: 'maxDescentRate', label: 'descent rate', min: 0.1,    max: 5.0,  step: 0.05   },
    { key: 'maxVertAccel',   label: 'vert accel',   min: 0.001,  max: 0.2,  step: 0.001  },
    { key: 'maxTurnAccel',   label: 'turn accel',   min: 0.0001, max: 0.02, step: 0.0001 },
  ]],
  ['APPEARANCE', [
    { key: 'bodyHalfLenMin',  label: 'body len min',     min: 1, max: 12, step: 0.5 },
    { key: 'bodyHalfLenMax',  label: 'body len max',     min: 1, max: 12, step: 0.5 },
    { key: 'engineIntensity', label: 'engine intensity', min: 0, max: 4,  step: 0.1 },
  ]],
  ['BEHAVIOUR', [
    { key: 'explodeChance',      label: 'explode chance', min: 0,    max: 1,    step: 0.05 },
    { key: 'explodeAfterFrames', label: 'explode after',  min: 0,    max: 1200, step: 10   },
    { key: 'waitTicksMin',       label: 'wait min',       min: 0,    max: 600,  step: 10   },
    { key: 'waitTicksMax',       label: 'wait max',       min: 0,    max: 1200, step: 10   },
  ]],
  ['THRESHOLDS', [
    { key: 'maxTrailPoints',  label: 'trail points',    min: 20, max: 300, step: 10 },
    { key: 'levelThreshold',  label: 'level threshold', min: 1,  max: 80,  step: 1  },
    { key: 'landThreshold',   label: 'land threshold',  min: 1,  max: 30,  step: 1  },
  ]],
];

function decimalsForStep(step: number): number {
  if (step >= 1)      return 0;
  if (step >= 0.1)    return 1;
  if (step >= 0.01)   return 2;
  if (step >= 0.001)  return 3;
  return 4;
}

export class ShuttleTesterPanel {
  private readonly el:        HTMLDivElement;
  private readonly config:    FlightConfig;
  private readonly valueEls  = new Map<keyof FlightConfig, HTMLSpanElement>();
  private readonly sliderEls = new Map<keyof FlightConfig, HTMLInputElement>();

  onSpawn?: (deg: number, cfg: Readonly<FlightConfig>) => void;
  onClear?: () => void;

  constructor() {
    this.config = { ...DEFAULT_FLIGHT_CONFIG, waitTicksMin: 0, waitTicksMax: 0 };
    this.el = this.build();
    this.el.style.display = 'none';
    document.body.appendChild(this.el);
  }

  get isVisible(): boolean { return this.el.style.display !== 'none'; }

  toggle(): void {
    this.el.style.display = this.isVisible ? 'none' : 'block';
  }

  spawnAt(deg: number, _y: number): void {
    this.onSpawn?.(deg, { ...this.config });
  }

  private build(): HTMLDivElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position:     'fixed',
      top:          '12px',
      left:         '12px',
      width:        '290px',
      maxHeight:    'calc(100vh - 120px)',
      overflowY:    'auto',
      background:   'rgba(0,0,0,0.85)',
      border:       '1px solid rgba(255,255,255,0.14)',
      borderRadius: '6px',
      padding:      '8px 12px 12px',
      color:        '#e8e8e8',
      fontFamily:   'monospace',
      fontSize:     '11px',
      lineHeight:   '1.6',
      userSelect:   'none',
      zIndex:       '9998',
      boxSizing:    'border-box',
    });

    el.appendChild(this.makeLabel('SHUTTLE TESTER — click canvas to spawn', true));
    for (const [name, specs] of SECTIONS) {
      el.appendChild(this.makeLabel(name));
      for (const spec of specs) el.appendChild(this.makeSliderRow(spec));
    }
    el.appendChild(this.makeResetButton());
    el.appendChild(this.makeClearButton());
    return el;
  }

  private makeLabel(text: string, isHeader = false): HTMLElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      color:         isHeader ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.35)',
      fontSize:      '9px',
      letterSpacing: '0.1em',
      marginTop:     isHeader ? '2px'  : '8px',
      marginBottom:  isHeader ? '6px'  : '2px',
    });
    el.textContent = text;
    return el;
  }

  private makeSliderRow(spec: SliderSpec): HTMLElement {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display:             'grid',
      gridTemplateColumns: '110px 1fr 44px',
      alignItems:          'center',
      gap:                 '6px',
      marginBottom:        '1px',
    });

    const d    = decimalsForStep(spec.step);
    const init = (this.config[spec.key]).toFixed(d);

    const lbl = document.createElement('span');
    lbl.textContent = spec.label;
    Object.assign(lbl.style, { color: 'rgba(255,255,255,0.5)', fontSize: '10px' });

    const slider = document.createElement('input');
    slider.type  = 'range';
    slider.min   = String(spec.min);
    slider.max   = String(spec.max);
    slider.step  = String(spec.step);
    slider.value = String(this.config[spec.key]);
    Object.assign(slider.style, { width: '100%', margin: '0' });
    this.sliderEls.set(spec.key, slider);

    const valEl = document.createElement('span');
    valEl.textContent = init;
    Object.assign(valEl.style, { color: '#fff', textAlign: 'right', fontSize: '10px' });
    this.valueEls.set(spec.key, valEl);

    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      (this.config as Record<string, number>)[spec.key] = v;
      valEl.textContent = v.toFixed(d);
    });

    row.appendChild(lbl);
    row.appendChild(slider);
    row.appendChild(valEl);
    return row;
  }

  private makeActionButton(
    text: string, marginTop: string,
    accent: { color: string; background: string; border: string },
    onClick: () => void,
  ): HTMLElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    Object.assign(btn.style, {
      cursor: 'pointer', fontFamily: 'monospace', fontSize: '10px',
      padding: '2px 8px', borderRadius: '3px', transition: 'none',
      display: 'block', marginTop, ...accent,
    });
    btn.addEventListener('click', onClick);
    return btn;
  }

  private makeResetButton(): HTMLElement {
    return this.makeActionButton(
      'reset to defaults', '10px',
      { color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)' },
      () => { this.resetToDefaults(); },
    );
  }

  private makeClearButton(): HTMLElement {
    return this.makeActionButton(
      'Clear all shuttles', '4px',
      { color: '#ff5555', background: 'rgba(255,60,60,0.12)', border: '1px solid rgba(255,60,60,0.4)' },
      () => this.onClear?.(),
    );
  }

  private resetToDefaults(): void {
    const defaults = DEFAULT_FLIGHT_CONFIG;
    for (const [, specs] of SECTIONS) {
      for (const spec of specs) {
        const v = defaults[spec.key];
        const d = decimalsForStep(spec.step);
        (this.config as Record<string, number>)[spec.key] = v;
        (this.valueEls.get(spec.key) as HTMLSpanElement).textContent  = v.toFixed(d);
        (this.sliderEls.get(spec.key) as HTMLInputElement).value = String(v);
      }
    }
  }
}
