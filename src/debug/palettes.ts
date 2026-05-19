export type SkyStop = { offset: number; color: number };

export type Palette = {
  name: string;
  backgroundColor: number;
  hazeColor: number;
  caveHazeColor: number;
  skyGradient: SkyStop[];
};

export const PALETTES: Palette[] = [
  {
    name: "Void",
    backgroundColor: 0x3a1255,
    hazeColor: 0x7a6090,
    caveHazeColor: 0x2c3f5a,
    skyGradient: [
      { offset: 0, color: 0x000005 },
      { offset: 0.87, color: 0x000005 },
      { offset: 0.95, color: 0x12082a },
      { offset: 1, color: 0x3a1255 },
    ],
  },
  {
    name: "Sunset",
    backgroundColor: 0x4a1800,
    hazeColor: 0xb04020,
    caveHazeColor: 0x3a1808,
    skyGradient: [
      { offset: 0, color: 0x000005 },
      { offset: 0.78, color: 0x060100 },
      { offset: 0.92, color: 0x250c02 },
      { offset: 1, color: 0x4a1800 },
    ],
  },
  {
    name: "Dawn",
    backgroundColor: 0x3e152a,
    hazeColor: 0xa04470,
    caveHazeColor: 0x2c1040,
    skyGradient: [
      { offset: 0, color: 0x000005 },
      { offset: 0.82, color: 0x060005 },
      { offset: 0.93, color: 0x1e0815 },
      { offset: 1, color: 0x3e152a },
    ],
  },
  {
    name: "Storm",
    backgroundColor: 0x121e2e,
    hazeColor: 0x304a60,
    caveHazeColor: 0x0a1218,
    skyGradient: [
      { offset: 0, color: 0x000005 },
      { offset: 0.82, color: 0x000208 },
      { offset: 0.93, color: 0x080e1a },
      { offset: 1, color: 0x121e2e },
    ],
  },
  {
    name: "Midnight",
    backgroundColor: 0x0c1035,
    hazeColor: 0x182060,
    caveHazeColor: 0x060810,
    skyGradient: [
      { offset: 0, color: 0x000002 },
      { offset: 0.85, color: 0x000006 },
      { offset: 0.93, color: 0x050818 },
      { offset: 1, color: 0x0c1035 },
    ],
  },
  {
    name: "Ember",
    backgroundColor: 0x2e0808,
    hazeColor: 0x8a1818,
    caveHazeColor: 0x1a0808,
    skyGradient: [
      { offset: 0, color: 0x000002 },
      { offset: 0.82, color: 0x060001 },
      { offset: 0.92, color: 0x180404 },
      { offset: 1, color: 0x2e0808 },
    ],
  },
  {
    name: "Teal Fog",
    backgroundColor: 0x041e1e,
    hazeColor: 0x106868,
    caveHazeColor: 0x020e10,
    skyGradient: [
      { offset: 0, color: 0x000002 },
      { offset: 0.84, color: 0x000505 },
      { offset: 0.93, color: 0x020e0e },
      { offset: 1, color: 0x041e1e },
    ],
  },
  {
    name: "Toxic",
    backgroundColor: 0x071207,
    hazeColor: 0x285028,
    caveHazeColor: 0x020802,
    skyGradient: [
      { offset: 0, color: 0x000002 },
      { offset: 0.85, color: 0x000300 },
      { offset: 0.93, color: 0x030803 },
      { offset: 1, color: 0x071207 },
    ],
  },
  {
    name: "Dusk Gold",
    backgroundColor: 0x321800,
    hazeColor: 0x906020,
    caveHazeColor: 0x1a1004,
    skyGradient: [
      { offset: 0, color: 0x000002 },
      { offset: 0.82, color: 0x040200 },
      { offset: 0.92, color: 0x190e02 },
      { offset: 1, color: 0x321800 },
    ],
  },
  {
    name: "Arctic",
    backgroundColor: 0x0a1020,
    hazeColor: 0x405878,
    caveHazeColor: 0x040810,
    skyGradient: [
      { offset: 0, color: 0x010310 },
      { offset: 0.84, color: 0x010310 },
      { offset: 0.93, color: 0x040c18 },
      { offset: 1, color: 0x0a1020 },
    ],
  },
  {
    name: "Sunrise",
    backgroundColor: 0xd05820,
    hazeColor: 0xd06030,
    caveHazeColor: 0x3a1808,
    skyGradient: [
      { offset: 0, color: 0x010810 }, // dark space
      { offset: 0.8, color: 0x0c1830 }, // dark navy (entering visible sky)
      { offset: 0.86, color: 0x1858a0 }, // deep blue
      { offset: 0.9, color: 0x4890c0 }, // bright blue
      { offset: 0.93, color: 0x88b0c8 }, // light blue
      { offset: 0.95, color: 0xb0a890 }, // warm cream band
      { offset: 0.97, color: 0xd08050 }, // peach
      { offset: 1, color: 0xd05820 }, // orange horizon
    ],
  },
];
