const TERRA = [
  {
    name: 'earth',
    center_km: -6350,
    radius_km: 6350,
    stroke: null,
    strokeWidth_km: 0,
    // Authored as [hue, saturation, brightness] — hsb, what design tools speak.
    // Hot rock at the core cooling to a crust that sits close to the background,
    // so the eye stays on the habitable line rather than the bulk of the planet.
    // Stops are relative to the shape, so this reads the same whether the earth
    // is 12px across or 12,000.
    wash: [
      // { offset: 0,    hsb: [26, 85, 58] },
      { offset: 0,    hsb: [26, 65, 38] },
      // { offset: 0.55, hsb: [20, 55, 26] },
      { offset: 0.55, hsb: [20, 35, 16] },
      // { offset: 1,    hsb: [18, 32, 15] },
      { offset: 1,    hsb: [18, 17, 9] },
    ],
    grain: 0.14,
    opacity: 0.9,
    minScale: 0,
    maxScale: Infinity,
  },
  {
    name: 'habitable zone',
    center_km: -6350,
    radius_km: 6356,
    stroke: '#419E13',
    strokeWidth_km: 10,
    fill: null,
    roughness: 0,
    minScale: 0,
    maxScale: Infinity,
  },
  {
    name: 'ocean',
    center_km: -6350,
    radius_km: 6344,
    stroke: '#185FA5',
    stroke: '#1167BD',
    stroke: '#1476D9',
    strokeWidth_km: 10,
    fill: null,
    roughness: 0,
    minScale: 0,
    maxScale: Infinity,
  },
  {
    name: 'moon',
    center_km: -396700,
    radius_km: 1079.5,
    stroke: null,
    strokeWidth_km: 0,
    // Bright and warm. The moon never draws larger than ~43px across, so it
    // needs to carry at a glance rather than reward inspection — and it can
    // take more grain than the earth for the same reason.
    wash: [
      { offset: 0, hsb: [45, 50, 95] },
      { offset: 1, hsb: [37, 73, 66] },
    ],
    grain: 0.18,
    opacity: 0.8,
    minScale: 24,
    maxScale: Infinity,
  },
];
