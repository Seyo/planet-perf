import type { ExplosionConfig } from '../planet/shuttle-sim';
import { DEFAULT_EXPLOSION_CONFIG } from '../planet/shuttle-sim';

type SliderSpec = {
  key:   keyof ExplosionConfig;
  label: string;
  min:   number;
  max:   number;
  step:  number;
};

const SECTIONS: [string, SliderSpec[]][] = [
  ['EXPLOSION', [
    { key: 'maxFrames',        label: 'ring duration',   min: 10, max: 300, step: 1    },
    { key: 'airRingRadius',    label: 'air ring radius', min: 10, max: 300, step: 1    },
    { key: 'groundRingRadius', label: 'ground ring r',   min: 5,  max: 150, step: 1    },
  ]],
  ['PHYSICS', [
    { key: 'debrisGravity',      label: 'gravity',       min: 0,  max: 0.3, step: 0.001 },
    { key: 'debrisTrailPoints',  label: 'trail length',  min: 10, max: 300, step: 1     },
    { key: 'debrisLingerFrames', label: 'linger frames', min: 10, max: 300, step: 1     },
  ]],
  ['COUNT', [
    { key: 'debrisCountMin', label: 'count min', min: 1, max: 30, step: 1 },
    { key: 'debrisCountMax', label: 'count max', min: 1, max: 30, step: 1 },
  ]],
  ['FIZZLE', [
    { key: 'debrisFizzleChance',    label: 'chance',     min: 0, max: 1,   step: 0.01 },
    { key: 'debrisFizzleFramesMin', label: 'min frames', min: 5, max: 300, step: 1    },
    { key: 'debrisFizzleFramesMax', label: 'max frames', min: 5, max: 300, step: 1    },
  ]],
  ['VISUAL', [
    { key: 'debrisIntensityMin',  label: 'intensity min', min: 0,   max: 3, step: 0.05 },
    { key: 'debrisIntensityMax',  label: 'intensity max', min: 0,   max: 3, step: 0.05 },
    { key: 'debrisTrailWidthMin', label: 'width min',     min: 0.1, max: 8, step: 0.1  },
    { key: 'debrisTrailWidthMax', label: 'width max',     min: 0.1, max: 8, step: 0.1  },
  ]],
];

function decimalsForStep(step: number): number {
  if (step >= 1)    return 0;
  if (step >= 0.1)  return 1;
  if (step >= 0.01) return 2;
  return 3;
}

export class ExplosionTesterPanel {
  private readonly el:        HTMLDivElement;
  private readonly config:    ExplosionConfig;
  private readonly valueEls  = new Map<keyof ExplosionConfig, HTMLSpanElement>();
  private readonly sliderEls = new Map<keyof ExplosionConfig, HTMLInputElement>();

  onSpawn?: (deg: number, y: number, cfg: Readonly<ExplosionConfig>) => void;

  constructor() {
    this.config = { ...DEFAULT_EXPLOSION_CONFIG };
    this.el = this.build();
    this.el.style.display = 'none';
    document.body.appendChild(this.el);
  }

  get isVisible(): boolean { return this.el.style.display !== 'none'; }

  toggle(): void {
    this.el.style.display = this.isVisible ? 'none' : 'block';
  }

  spawnAt(deg: number, y: number): void {
    this.onSpawn?.(deg, y, { ...this.config });
  }

  private build(): HTMLDivElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position:     'fixed',
      top:          '12px',
      right:        '12px',
      width:        '290px',
      maxHeight:    'calc(100vh - 24px)',
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

    el.appendChild(this.makeLabel('EXPLOSION TESTER — click canvas to spawn', true));
    for (const [name, specs] of SECTIONS) {
      el.appendChild(this.makeLabel(name));
      for (const spec of specs) el.appendChild(this.makeSliderRow(spec));
    }
    el.appendChild(this.makeResetButton());
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

  private makeResetButton(): HTMLElement {
    const btn = document.createElement('button');
    btn.textContent = 'reset to defaults';
    Object.assign(btn.style, {
      cursor:       'pointer',
      fontFamily:   'monospace',
      fontSize:     '10px',
      padding:      '2px 8px',
      borderRadius: '3px',
      color:        'rgba(255,255,255,0.7)',
      background:   'rgba(255,255,255,0.08)',
      border:       '1px solid rgba(255,255,255,0.2)',
      marginTop:    '10px',
      transition:   'none',
      display:      'block',
    });
    btn.addEventListener('click', () => { this.resetToDefaults(); });
    return btn;
  }

  private resetToDefaults(): void {
    const defaults = DEFAULT_EXPLOSION_CONFIG;
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
