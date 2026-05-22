import type { LightPalette, Palette, Theme } from '../debug/palettes.js';

const IDLE_SHADOW   = '0 0 0 2px rgba(255,255,255,0.15)';
const ACTIVE_SHADOW = '0 0 0 2px rgba(255,255,255,0.90)';
const FONT          = 'monospace';

function applyStyles(el: HTMLElement, s: Partial<CSSStyleDeclaration>): void {
  Object.assign(el.style, s);
}

function makeDiv(s: Partial<CSSStyleDeclaration> = {}): HTMLDivElement {
  const el = document.createElement('div');
  applyStyles(el, s);
  return el;
}

function makeButton(s: Partial<CSSStyleDeclaration> = {}): HTMLButtonElement {
  const el = document.createElement('button');
  applyStyles(el, s);
  return el;
}

type SwatchItem = { bg: string; label: string };

function makeSwatch({ bg, label }: SwatchItem): HTMLElement {
  const el = makeDiv({
    width: '28px', height: '20px', borderRadius: '4px',
    background: bg, cursor: 'pointer',
    boxShadow: IDLE_SHADOW, boxSizing: 'border-box', flexShrink: '0',
  });
  el.title = label;
  return el;
}

function toHex(n: number): string { return `#${n.toString(16).padStart(6, '0')}`; }

function paletteBg(p: Palette): string {
  return `linear-gradient(to bottom, ${toHex(p.backgroundColor)}, ${toHex(p.hazeColor)})`;
}

function lightBg(l: LightPalette): string {
  return `linear-gradient(to right, ${toHex(l.warmColor)} 50%, ${toHex(l.coolColor)} 50%)`;
}

function themeBg(t: Theme, palettes: Palette[], lights: LightPalette[]): string {
  const bg   = toHex(palettes[t.paletteIdx]?.backgroundColor ?? 0x111111);
  const warm = toHex(lights[t.lightPaletteIdx]?.warmColor    ?? 0x888888);
  return `linear-gradient(135deg, ${bg} 55%, ${warm} 55%)`;
}

function bindCollapse(header: HTMLElement, body: HTMLElement, arrow: HTMLElement): void {
  header.addEventListener('click', () => {
    const collapsed = body.style.display === 'none';
    body.style.display = collapsed ? 'flex' : 'none';
    arrow.textContent = collapsed ? '▾' : '▸';
  });
}

function injectSliderStyles(): void {
  if (document.getElementById('up-styles')) return;
  const el = document.createElement('style');
  el.id = 'up-styles';
  el.textContent = [
    '.up-range{-webkit-appearance:none;appearance:none;height:4px;border-radius:2px;outline:none;border:none;cursor:pointer;width:100%}',
    '.up-range::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;background:rgba(200,200,255,0.9);cursor:pointer;border:none;margin-top:-4px}',
    '.up-range::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:rgba(200,200,255,0.9);cursor:pointer;border:none}',
    '.up-range::-webkit-slider-runnable-track{height:4px;border-radius:2px}',
    '.up-range2{position:relative;height:20px}',
    '.up-range2>input[type=range]{position:absolute;left:0;width:100%;height:100%;margin:0;padding:0;pointer-events:none;-webkit-appearance:none;appearance:none;background:transparent;outline:none;border:none}',
    '.up-range2>input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;background:rgba(200,200,255,0.9);cursor:pointer;pointer-events:all;border:none;margin-top:-4px}',
    '.up-range2>input[type=range]::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:rgba(200,200,255,0.9);cursor:pointer;pointer-events:all;border:none}',
    '.up-range2>input[type=range]::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:transparent}',
    '.up-range2>input[type=range]::-moz-range-track{height:4px;border-radius:2px;background:transparent;border:none}',
    '.up-range2-track{position:absolute;left:0;right:0;top:50%;height:4px;transform:translateY(-50%);border-radius:2px;background:rgba(255,255,255,0.12);pointer-events:none;overflow:hidden}',
    '.up-range2-fill{position:absolute;top:0;height:100%;background:rgba(140,140,255,0.6)}',
  ].join('');
  document.head.appendChild(el);
}

function makeThemeChip(t: Theme, palettes: Palette[], lights: LightPalette[]): HTMLElement {
  const chip = makeDiv({
    width: '100%', height: '20px', borderRadius: '4px', cursor: 'pointer',
    background: themeBg(t, palettes, lights),
    boxShadow: IDLE_SHADOW, boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  });
  const label = document.createElement('span');
  label.textContent = t.name;
  const outline = 'rgba(0,0,0,0.95)';
  applyStyles(label, {
    fontSize: '9px', color: '#fff',
    textShadow: `-1px -1px 0 ${outline}, 1px -1px 0 ${outline}, -1px 1px 0 ${outline}, 1px 1px 0 ${outline}`,
    letterSpacing: '0.05em', pointerEvents: 'none',
    userSelect: 'none', fontFamily: FONT,
  });
  chip.appendChild(label);
  chip.title = t.name;
  return chip;
}

export type PanelConfig = {
  initialPaletteIdx?: number;
  initialLightsIdx?:  number;
  layerCount?:        number;
};

export class UserPanel {
  onPaletteChange:    ((index: number) => void) | undefined;
  onLightsChange:     ((index: number) => void) | undefined;
  onAnnihilate:       (() => void) | undefined;
  onAutopanChange:    ((speed: number) => void) | undefined;
  onLayerRangeChange: ((back: number, front: number) => void) | undefined;

  private activePalette = 0;
  private activeLights  = 0;
  private activeThemeEl: HTMLElement | null = null;
  private autopanSpeed  = 0;
  private readonly paletteSwatches: HTMLElement[] = [];
  private readonly lightSwatches:   HTMLElement[] = [];
  private isOpen = false;
  private sliderEl:   HTMLInputElement | null = null;
  private speedLabel: HTMLElement      | null = null;
  private readonly panel: HTMLElement;
  private readonly layerMax: number;
  private layerBack  = 0;
  private layerFront: number;
  private layerFillEl: HTMLElement | null = null;

  constructor(
    private readonly palettes: Palette[],
    private readonly lights:   LightPalette[],
    private readonly themes:   Theme[],
    config: PanelConfig = {},
  ) {
    this.activePalette = config.initialPaletteIdx ?? 0;
    this.activeLights  = config.initialLightsIdx  ?? 0;
    this.layerMax      = (config.layerCount ?? 1) - 1;
    this.layerFront    = this.layerMax;
    this.panel = this.buildPanel();
    document.body.appendChild(this.panel);
    document.body.appendChild(this.buildToggle());
    this.setPalette(this.activePalette);
    this.setLights(this.activeLights);
  }

  setPalette(index: number): void {
    this.activateSwatch(this.paletteSwatches[this.activePalette], this.paletteSwatches[index]);
    this.activePalette = index;
  }

  setLights(index: number): void {
    this.activateSwatch(this.lightSwatches[this.activeLights], this.lightSwatches[index]);
    this.activeLights = index;
  }

  setAutopan(speed: number): void {
    this.autopanSpeed = speed;
    if (this.sliderEl) {
      this.sliderEl.value = String(speed);
      this.sliderEl.style.background = this.trackBg();
    }
    if (this.speedLabel) this.speedLabel.textContent = this.speedText();
  }

  private trackBg(): string {
    const pct = Math.round(this.autopanSpeed * 100);
    return `linear-gradient(to right, rgba(160,160,255,0.75) ${pct}%, rgba(255,255,255,0.15) ${pct}%)`;
  }

  private speedText(): string {
    return this.autopanSpeed === 0 ? 'off' : this.autopanSpeed.toFixed(2);
  }

  private activateSwatch(from: HTMLElement | undefined, to: HTMLElement | undefined): void {
    from?.style.setProperty('box-shadow', IDLE_SHADOW);
    to?.style.setProperty('box-shadow', ACTIVE_SHADOW);
  }

  private clearTheme(): void {
    this.activeThemeEl?.style.setProperty('box-shadow', IDLE_SHADOW);
    this.activeThemeEl = null;
  }

  private selectThemeEl(chip: HTMLElement): void {
    this.clearTheme();
    this.activeThemeEl = chip;
    chip.style.setProperty('box-shadow', ACTIVE_SHADOW);
  }

  private syncUrl(): void {
    const params = new URLSearchParams();
    const palette = this.palettes[this.activePalette];
    if (palette) params.set('palette', palette.name);
    const lights = this.lights[this.activeLights];
    if (lights) params.set('lights', lights.name);
    if (this.autopanSpeed > 0) params.set('autopan', this.autopanSpeed.toFixed(2));
    if (new URLSearchParams(location.search).has('debug')) params.set('debug', '');
    history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
  }

  private togglePanel(): void {
    this.isOpen = !this.isOpen;
    this.panel.style.display = this.isOpen ? 'block' : 'none';
  }

  private buildToggle(): HTMLElement {
    const btn = makeButton({
      position: 'fixed', top: '12px', right: '12px',
      width: '36px', height: '36px',
      background: 'rgba(0,0,0,0.72)',
      border: '1px solid rgba(255,255,255,0.18)',
      borderRadius: '8px', color: 'rgba(255,255,255,0.80)',
      fontSize: '16px', cursor: 'pointer',
      zIndex: '9999', lineHeight: '1', padding: '0',
      fontFamily: FONT,
    });
    btn.textContent = '◎';
    btn.title = 'Customise';
    btn.addEventListener('click', () => this.togglePanel());
    return btn;
  }

  private buildPanel(): HTMLElement {
    const panel = makeDiv({
      position: 'fixed', top: '56px', right: '12px',
      background: 'rgba(0,0,0,0.82)',
      border: '1px solid rgba(255,255,255,0.13)',
      borderRadius: '8px', color: '#e8e8e8',
      fontFamily: FONT, fontSize: '11px',
      padding: '12px', width: '188px',
      zIndex: '9998', display: 'none',
      boxSizing: 'border-box',
    });
    panel.appendChild(this.buildPaletteSection());
    panel.appendChild(this.buildLightsSection());
    panel.appendChild(this.buildThemeSection());
    panel.appendChild(this.buildAutopanSection());
    panel.appendChild(this.buildLayerRangeSection());
    panel.appendChild(this.buildAnnihilateButton());
    return panel;
  }

  private buildSwatchGrid(): HTMLElement {
    return makeDiv({ display: 'flex', flexWrap: 'wrap', gap: '4px' });
  }

  private buildSection(title: string, body: HTMLElement): HTMLElement {
    const arrow  = document.createElement('span');
    arrow.textContent = '▾';
    const titleEl = document.createElement('span');
    titleEl.textContent = title;
    const header = makeDiv({
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      cursor: 'pointer', marginBottom: '6px', userSelect: 'none',
      color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', fontSize: '9px',
    });
    header.appendChild(titleEl);
    header.appendChild(arrow);
    bindCollapse(header, body, arrow);
    const wrap = makeDiv({ marginBottom: '12px' });
    wrap.appendChild(header);
    wrap.appendChild(body);
    return wrap;
  }

  private buildGrid<T>(
    items: T[], swatches: HTMLElement[],
    makeEl: (item: T) => HTMLElement,
    onClick: (i: number, item: T, el: HTMLElement) => void,
  ): HTMLElement {
    const grid = this.buildSwatchGrid();
    for (const [i, item] of items.entries()) {
      const el = makeEl(item);
      el.addEventListener('click', () => onClick(i, item, el));
      swatches.push(el);
      grid.appendChild(el);
    }
    return grid;
  }

  private buildPaletteSection(): HTMLElement {
    const grid = this.buildGrid(this.palettes, this.paletteSwatches,
      p => makeSwatch({ bg: paletteBg(p), label: p.name }),
      (i) => { this.clearTheme(); this.setPalette(i); this.onPaletteChange?.(i); this.syncUrl(); },
    );
    return this.buildSection('PALETTE', grid);
  }

  private buildLightsSection(): HTMLElement {
    const grid = this.buildGrid(this.lights, this.lightSwatches,
      l => makeSwatch({ bg: lightBg(l), label: l.name }),
      (i) => { this.clearTheme(); this.setLights(i); this.onLightsChange?.(i); this.syncUrl(); },
    );
    return this.buildSection('LIGHTS', grid);
  }

  private buildThemeSection(): HTMLElement {
    const chips: HTMLElement[] = [];
    const grid = this.buildGrid(this.themes, chips,
      t => makeThemeChip(t, this.palettes, this.lights),
      (_, t, chip) => {
        this.selectThemeEl(chip);
        this.setPalette(t.paletteIdx);
        this.setLights(t.lightPaletteIdx);
        this.onPaletteChange?.(t.paletteIdx);
        this.onLightsChange?.(t.lightPaletteIdx);
        this.syncUrl();
      },
    );
    return this.buildSection('THEMES', grid);
  }

  private makeSliderInput(): HTMLInputElement {
    injectSliderStyles();
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.01';
    slider.value = String(this.autopanSpeed);
    slider.className = 'up-range';
    slider.style.background = this.trackBg();
    return slider;
  }

  private buildAutopanSection(): HTMLElement {
    const slider = this.makeSliderInput();
    const label  = makeDiv({
      color: 'rgba(255,255,255,0.55)', fontSize: '9px',
      fontFamily: FONT, minWidth: '22px', textAlign: 'right',
    });
    label.textContent = this.speedText();
    slider.addEventListener('input', () => {
      this.setAutopan(parseFloat(slider.value));
      this.onAutopanChange?.(this.autopanSpeed);
      this.syncUrl();
    });
    this.sliderEl   = slider;
    this.speedLabel = label;
    const row = makeDiv({ display: 'flex', alignItems: 'center', gap: '8px' });
    row.appendChild(slider);
    row.appendChild(label);
    return this.buildSection('AUTOPAN', row);
  }

  private makeDualRangeInput(value: number): HTMLInputElement {
    const el = document.createElement('input');
    el.type  = 'range';
    el.min   = '0';
    el.max   = String(this.layerMax);
    el.step  = '1';
    el.value = String(value);
    return el;
  }

  private syncLayerFill(back: HTMLInputElement, front: HTMLInputElement): void {
    const leftPct  = (this.layerBack  / this.layerMax) * 100;
    const rightPct = (this.layerFront / this.layerMax) * 100;
    if (this.layerFillEl) {
      this.layerFillEl.style.left  = `${leftPct}%`;
      this.layerFillEl.style.width = `${rightPct - leftPct}%`;
    }
    back.style.zIndex  = this.layerBack >= this.layerMax ? '4' : '3';
    front.style.zIndex = this.layerBack >= this.layerMax ? '3' : '4';
  }

  private buildLayerRangeSection(): HTMLElement {
    injectSliderStyles();
    const track = makeDiv({});
    track.className = 'up-range2-track';
    const fill = makeDiv({});
    fill.className  = 'up-range2-fill';
    track.appendChild(fill);
    this.layerFillEl = fill;

    const wrap = makeDiv({});
    wrap.className = 'up-range2';
    wrap.appendChild(track);

    const back  = this.makeDualRangeInput(this.layerBack);
    const front = this.makeDualRangeInput(this.layerFront);
    const sync  = () => this.syncLayerFill(back, front);

    back.addEventListener('input', () => {
      this.layerBack = Math.min(parseInt(back.value), this.layerFront);
      back.value = String(this.layerBack);
      sync();
      this.onLayerRangeChange?.(this.layerBack, this.layerFront);
    });
    front.addEventListener('input', () => {
      this.layerFront = Math.max(parseInt(front.value), this.layerBack);
      front.value = String(this.layerFront);
      sync();
      this.onLayerRangeChange?.(this.layerBack, this.layerFront);
    });

    wrap.appendChild(back);
    wrap.appendChild(front);
    sync();

    const labelRow = makeDiv({ display: 'flex', justifyContent: 'space-between', marginTop: '2px' });
    const lBack = document.createElement('span');
    lBack.textContent = 'back';
    const lFront = document.createElement('span');
    lFront.textContent = 'front';
    applyStyles(lBack,  { color: 'rgba(255,255,255,0.3)', fontSize: '9px' });
    applyStyles(lFront, { color: 'rgba(255,255,255,0.3)', fontSize: '9px' });
    labelRow.appendChild(lBack);
    labelRow.appendChild(lFront);

    const body = makeDiv({ display: 'flex', flexDirection: 'column', gap: '2px' });
    body.appendChild(wrap);
    body.appendChild(labelRow);
    return this.buildSection('LAYERS', body);
  }

  private buildAnnihilateButton(): HTMLElement {
    const btn = makeButton({
      width: '100%', padding: '5px 8px',
      background: 'rgba(255,60,60,0.12)',
      border: '1px solid rgba(255,60,60,0.4)',
      borderRadius: '4px', color: '#ff5555',
      fontFamily: FONT, fontSize: '11px',
      cursor: 'pointer', boxSizing: 'border-box',
    });
    btn.textContent = 'Annihilate';
    btn.addEventListener('click', () => this.onAnnihilate?.());
    return btn;
  }
}
